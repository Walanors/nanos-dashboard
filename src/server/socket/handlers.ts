import type { Server, Socket } from 'socket.io';
import { exec } from 'node:child_process';
import * as fs from 'node:fs/promises';
import { createReadStream, watch } from 'node:fs';
import * as path from 'node:path';
import * as util from 'node:util';
import * as os from 'node:os';
import * as osUtils from 'node-os-utils';
import fetch from 'node-fetch';

// Hardcoded paths as per server.ts
const NANOS_SERVER_PATH = '/opt/nanos-world-server/NanosWorldServer.sh';
const NANOS_CONFIG_PATH = '/opt/nanos-world-server/Config.toml';
const NANOS_LOG_PATH = '/tmp/nanos-server.log';

// Track active log watchers by socket ID
const logWatchers: Map<string, { watcher: fs.FSWatcher, tail: any }> = new Map();

// Function to check server status (simplified version)
async function checkServerStatus(): Promise<{running: boolean, pid?: number, uptime?: number}> {
  try {
    // First check if we have a screen session for the server
    try {
      const { stdout: screenList } = await execPromise('screen -ls');
      if (screenList.includes('nanos-server')) {
        // Get PID of the screen session
        const pidMatch = screenList.match(/(\d+)\.nanos-server/);
        const pid = pidMatch ? Number.parseInt(pidMatch[1], 10) : undefined;
        
        // Try to get process uptime if we have a valid PID
        let uptime = undefined;
        if (pid && !Number.isNaN(pid)) {
          try {
            const { stdout: procStats } = await execPromise(`ps -o etimes= -p ${pid}`);
            uptime = Number.parseInt(procStats.trim(), 10);
          } catch (e) {
            console.log('Error getting process uptime:', e);
          }
        }
        
        return { running: true, pid, uptime };
      }
    } catch (screenError) {
      // Continue to try the ps method if screen check fails
    }
    
    // Fallback: Use ps command to find the NanosWorldServer process
    try {
      const { stdout } = await execPromise("ps aux | grep -E '(NanosWorldServer|nanos-world-server)' | grep -v grep");
      
      if (stdout.trim()) {
        // Extract PID from ps output (second column)
        const pid = Number.parseInt(stdout.trim().split(/\s+/)[1], 10);
        
        // Try to get process uptime if we have a valid PID
        let uptime = undefined;
        if (pid && !Number.isNaN(pid)) {
          try {
            const { stdout: procStats } = await execPromise(`ps -o etimes= -p ${pid}`);
            uptime = Number.parseInt(procStats.trim(), 10);
          } catch (e) {
            console.log('Error getting process uptime:', e);
          }
        }
        
        return { running: true, pid, uptime };
      }
    } catch (psError) {
      // Ignore error
    }
    
    return { running: false };
  } catch (error) {
    console.error('Error checking server status:', error);
    return { running: false };
  }
}

// Response type for server operations
interface ServerResponse {
  success: boolean;
  running?: boolean;
  pid?: number;
  uptime?: number;
  logs?: string[];
  message?: string;
  error?: string;
}

// Function to ensure the log file exists and is accessible
async function ensureLogFile(): Promise<boolean> {
  try {
    await fs.access(NANOS_LOG_PATH);
    return true;
  } catch {
    try {
      // Create an empty log file if it doesn't exist
      await fs.writeFile(NANOS_LOG_PATH, '', 'utf-8');
      return true;
    } catch (error) {
      console.error(`Error creating log file: ${error}`);
      return false;
    }
  }
}

// Convert exec to use promises
const execPromise = util.promisify(exec);

// Constants for version checking
const UPDATE_CHECK_INTERVAL = 30000; // 30 seconds
const LOCAL_UPDATE_FILE = path.join(process.cwd(), 'update.json');

// Interface for update info from manifest
interface UpdateManifest {
  latest_version: string;
  repository_url: string;
  changelog: string;
  required: boolean;
}

// Track update check interval
let updateCheckInterval: NodeJS.Timeout | null = null;
let currentVersion: string | null = null;

// Function to read current version from local update.json
async function getCurrentVersion(): Promise<string> {
  if (currentVersion) return currentVersion;
  
  try {
    const content = await fs.readFile(LOCAL_UPDATE_FILE, 'utf-8');
    const localManifest: UpdateManifest = JSON.parse(content);
    currentVersion = localManifest.latest_version;
    return currentVersion;
  } catch (error) {
    console.error('Error reading current version:', error);
    return '0.0.0'; // Fallback version if file cannot be read
  }
}

// Function to check for updates
async function checkForUpdates(): Promise<{
  current: string;
  latest: string | null;
  updateAvailable: boolean;
  updateInfo: UpdateManifest | null;
}> {
  try {
    // Get current version from local file
    const currentVer = await getCurrentVersion();
    
    // Fetch remote update.json from GitHub
    const response = await fetch('https://raw.githubusercontent.com/Walanors/nanos-dashboard/main/update.json');
    if (!response.ok) {
      throw new Error('Failed to fetch remote update.json');
    }
    
    const remoteManifest: UpdateManifest = await response.json();
    const updateAvailable = remoteManifest.latest_version !== currentVer;

    return {
      current: currentVer,
      latest: remoteManifest.latest_version,
      updateAvailable,
      updateInfo: updateAvailable ? remoteManifest : null
    };
  } catch (error) {
    console.error('Error checking for updates:', error);
    const currentVer = await getCurrentVersion();
    return {
      current: currentVer,
      latest: null,
      updateAvailable: false,
      updateInfo: null
    };
  }
}

// Interface for socket with user data
interface SocketWithUser extends Socket {
  data: {
    user: {
      username: string;
    };
  };
}

// Response interfaces
interface CommandResponse {
  success: boolean;
  output: string;
  error?: string;
}

interface FileResponse {
  success: boolean;
  data?: string | unknown[];
  error?: string;
}

interface SystemMetrics {
  uptime: number;
  memory: {
    total: number;
    free: number;
    used: number;
    usedPercent: number;
  };
  cpu: {
    loadAvg: number[];
    cores: number;
    usage: number;
  };
  version: {
    current: string;
    latest: string | null;
    updateAvailable: boolean;
    updateInfo: UpdateManifest | null;
  };
  timestamp: number;
}

// Callback type for socket operations
type SocketCallback<T> = (response: T) => void;

// Track metrics intervals by socket ID
const metricsIntervals: Map<string, NodeJS.Timeout> = new Map();

async function getSystemMetrics(): Promise<SystemMetrics> {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  
  // Get CPU usage using node-os-utils
  const cpuUsage = await osUtils.cpu.usage();
  
  // Get version information
  const versionInfo = await checkForUpdates();
  
  return {
    uptime: os.uptime(),
    memory: {
      total: totalMem,
      free: freeMem,
      used: usedMem,
      usedPercent: (usedMem / totalMem) * 100
    },
    cpu: {
      loadAvg: os.loadavg(),
      cores: os.cpus().length,
      usage: cpuUsage
    },
    version: versionInfo,
    timestamp: Date.now()
  };
}

/**
 * Configure all Socket.io event handlers
 */
export function configureSocketHandlers(io: Server): void {
  // Start system-wide metrics broadcast
  const METRICS_INTERVAL = 5000; // 5 seconds
  
  // Start update checker if not already running
  if (!updateCheckInterval) {
    updateCheckInterval = setInterval(async () => {
      const metrics = await getSystemMetrics();
      io.emit('system_metrics', metrics);
    }, UPDATE_CHECK_INTERVAL);
  }
  
  io.on('connection', (socket: Socket) => {
    const userSocket = socket as SocketWithUser;
    console.log(`Socket connected: ${userSocket.id} - User: ${userSocket.data.user.username}`);
    
    // Start sending metrics to this client
    const metricsInterval = setInterval(async () => {
      const metrics = await getSystemMetrics();
      userSocket.emit('system_metrics', metrics);
    }, METRICS_INTERVAL);
    
    // Store the interval reference
    metricsIntervals.set(userSocket.id, metricsInterval);

    // Handle command execution
    userSocket.on('execute_command', async (command: string, callback: SocketCallback<CommandResponse>) => {
      try {
        console.log(`Executing command: ${command} by ${userSocket.data.user.username}`);
        
        // Security check - prevent dangerous commands
        if (command.includes('rm -rf') || command.includes('format') || command.includes(';') || command.includes('&&')) {
          throw new Error('Potentially dangerous command denied');
        }

        // Set the correct working directory and shell options
        const options = {
          cwd: process.cwd(),
          shell: process.platform === 'win32' ? 'powershell.exe' : '/bin/bash'
        };

        const { stdout, stderr } = await execPromise(command, options);
        
        const response: CommandResponse = {
          success: true,
          output: stdout || stderr || 'Command executed with no output',
          error: stderr || undefined
        };
        
        callback(response);
      } catch (error) {
        console.error('Command execution error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        callback({
          success: false,
          output: errorMessage,
          error: errorMessage
        });
      }
    });

    // Handle ping for connection health checks
    userSocket.on('ping', (data, callback) => {
      // Simply respond to confirm connection is alive
      if (typeof callback === 'function') {
        callback({ success: true, timestamp: Date.now() });
      }
    });

    // Handle file reading
    userSocket.on('read_file', async (filePath: string, callback: SocketCallback<FileResponse>) => {
      try {
        console.log(`Reading file: ${filePath} by ${userSocket.data.user.username}`);
        
        // Security check - prevent accessing sensitive files
        const normalizedPath = path.normalize(filePath);
        if (normalizedPath.includes('..') || normalizedPath.startsWith('/etc') || normalizedPath.includes('.env')) {
          throw new Error('Access to this file is restricted');
        }

        const content = await fs.readFile(filePath, 'utf-8');
        
        callback({
          success: true,
          data: content
        });
      } catch (error) {
        console.error('File read error:', error);
        callback({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Handle file writing
    userSocket.on('write_file', async (
      filePath: string, 
      content: string, 
      callback: SocketCallback<FileResponse>
    ) => {
      try {
        console.log(`Writing file: ${filePath} by ${userSocket.data.user.username}`);
        
        // Security check
        const normalizedPath = path.normalize(filePath);
        if (normalizedPath.includes('..') || normalizedPath.startsWith('/etc') || normalizedPath.includes('.env')) {
          throw new Error('Access to this file is restricted');
        }

        // Ensure directory exists
        const dir = path.dirname(filePath);
        await fs.mkdir(dir, { recursive: true });
        
        await fs.writeFile(filePath, content, 'utf-8');
        
        callback({
          success: true
        });
      } catch (error) {
        console.error('File write error:', error);
        callback({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Handle directory listing
    userSocket.on('list_files', async (dirPath: string, callback: SocketCallback<FileResponse>) => {
      try {
        console.log(`Listing directory: ${dirPath} by ${userSocket.data.user.username}`);
        
        // Security check
        const normalizedPath = path.normalize(dirPath);
        if (normalizedPath.includes('..') || normalizedPath.startsWith('/etc')) {
          throw new Error('Access to this directory is restricted');
        }

        const files = await fs.readdir(dirPath);
        
        // Get file stats to distinguish between files and directories
        const fileStats = await Promise.all(files.map(async (file) => {
          const filePath = path.join(dirPath, file);
          const stats = await fs.stat(filePath);
          return {
            name: file,
            isDirectory: stats.isDirectory(),
            size: stats.size,
            modified: stats.mtime
          };
        }));
        
        callback({
          success: true,
          data: fileStats
        });
      } catch (error) {
        console.error('Directory listing error:', error);
        callback({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Handle server status check
    userSocket.on('server_status', async (callback: SocketCallback<ServerResponse>) => {
      try {
        const status = await checkServerStatus();
        
        callback({
          success: true,
          ...status,
          configPath: NANOS_CONFIG_PATH
        });
      } catch (error) {
        console.error('Server status error:', error);
        callback({
          success: false,
          running: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Handle server start
    userSocket.on('server_start', async (callback: SocketCallback<ServerResponse>) => {
      try {
        console.log(`Server start request from ${userSocket.data.user.username}`);
        
        // First check if server is already running
        const status = await checkServerStatus();
        if (status.running) {
          callback({ 
            success: false, 
            message: `Server already running with PID ${status.pid}`,
            running: true,
            pid: status.pid
          });
          return;
        }

        // Execute the start server command (simplified)
        await execPromise(`screen -dmS nanos-server ${NANOS_SERVER_PATH} 2>&1`);
        await execPromise(`screen -S nanos-server -X logfile ${NANOS_LOG_PATH}`);
        await execPromise('screen -S nanos-server -X log on');
        
        // Wait a moment for server to start
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Check status again
        const newStatus = await checkServerStatus();
        callback({
          success: true,
          message: 'Server starting in interactive mode...',
          running: newStatus.running,
          pid: newStatus.pid
        });
      } catch (error) {
        console.error('Server start error:', error);
        callback({
          success: false,
          message: `Failed to start server: ${error instanceof Error ? error.message : 'Unknown error'}`,
          running: false
        });
      }
    });

    // Handle server stop
    userSocket.on('server_stop', async (callback: SocketCallback<ServerResponse>) => {
      try {
        console.log(`Server stop request from ${userSocket.data.user.username}`);
        
        // Check if server is running
        const status = await checkServerStatus();
        if (!status.running) {
          callback({ 
            success: false, 
            message: 'Server is not running',
            running: false
          });
          return;
        }

        if (!status.pid) {
          callback({ 
            success: false, 
            message: 'Could not determine server PID',
            running: true
          });
          return;
        }

        // Try graceful termination first (SIGTERM)
        await execPromise(`kill -15 ${status.pid}`);
        
        // Wait 5 seconds and check if it's still running
        await new Promise(resolve => setTimeout(resolve, 5000));
        const checkStatus = await checkServerStatus();
        
        // If still running, force kill (SIGKILL)
        if (checkStatus.running && checkStatus.pid) {
          await execPromise(`kill -9 ${checkStatus.pid}`);
        }
        
        callback({ 
          success: true, 
          message: 'Server stopped',
          running: false
        });
      } catch (error) {
        console.error('Server stop error:', error);
        callback({
          success: false,
          message: `Failed to stop server: ${error instanceof Error ? error.message : 'Unknown error'}`,
          running: true
        });
      }
    });

    // Handle server command
    userSocket.on('server_command', async (command: string, callback: SocketCallback<ServerResponse>) => {
      try {
        if (!command || typeof command !== 'string') {
          callback({ 
            success: false, 
            message: 'Invalid command'
          });
          return;
        }
        
        console.log(`Server command request from ${userSocket.data.user.username}: ${command}`);
        
        // Check if server is running
        const status = await checkServerStatus();
        if (!status.running) {
          callback({ 
            success: false, 
            message: 'Server is not running'
          });
          return;
        }

        // Send command via screen
        try {
          const { stdout } = await execPromise('screen -ls');
          if (stdout.includes('nanos-server')) {
            await execPromise(`screen -S nanos-server -X stuff "${command.replace(/"/g, '\\"')}\\n"`);
            callback({ 
              success: true, 
              message: 'Command sent to server via screen'
            });
            return;
          }
        } catch (screenError) {
          // Fall back to direct process input
        }

        // Fall back method if screen is not available
        if (status.pid) {
          await execPromise(`echo "${command}" > /proc/${status.pid}/fd/0`);
          callback({ 
            success: true, 
            message: 'Command sent to server'
          });
        } else {
          callback({ 
            success: false, 
            message: 'Could not determine server PID'
          });
        }
      } catch (error) {
        console.error('Server command error:', error);
        callback({
          success: false,
          message: `Failed to send command: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
      }
    });

    // Subscribe to server logs
    userSocket.on('subscribe_logs', async (options: { 
      initialLines?: number, 
      fullHistory?: boolean 
    } = {}, callback?: SocketCallback<ServerResponse>) => {
      try {
        console.log(`Log subscription from ${userSocket.data.user.username}`);
        
        // Close any existing watcher for this socket
        const existingWatcher = logWatchers.get(userSocket.id);
        if (existingWatcher) {
          existingWatcher.watcher.close();
          if (existingWatcher.tail) {
            existingWatcher.tail.destroy();
          }
          logWatchers.delete(userSocket.id);
        }

        // Ensure log file exists
        const logFileExists = await ensureLogFile();
        if (!logFileExists) {
          if (callback) {
            callback({
              success: false,
              message: 'Could not access or create log file'
            });
          }
          return;
        }

        // Default options
        const initialLines = options.initialLines || 100;
        const fullHistory = options.fullHistory || false;

        // Send initial logs if requested
        if (initialLines > 0 || fullHistory) {
          try {
            // Use tail to get initial lines
            const lines = fullHistory ? null : initialLines;
            const tailCmd = lines 
              ? `tail -n ${lines} ${NANOS_LOG_PATH}` 
              : `cat ${NANOS_LOG_PATH}`;
              
            const { stdout } = await execPromise(tailCmd);
            userSocket.emit('log_data', {
              type: 'initial',
              logs: stdout.split('\n')
            });
          } catch (tailError) {
            console.error('Error getting initial logs:', tailError);
            // Continue even if initial logs fail
          }
        }

        // Set up file watcher for real-time updates
        try {
          const watcher = watch(NANOS_LOG_PATH, (eventType, filename) => {
            if (eventType === 'change') {
              // File has changed, read the new content
              // We'll use tail to just get the new lines since last read
              execPromise(`tail -n 20 ${NANOS_LOG_PATH}`)
                .then(({ stdout }) => {
                  userSocket.emit('log_data', {
                    type: 'update',
                    logs: stdout.split('\n')
                  });
                })
                .catch(error => {
                  console.error('Error reading updated log file:', error);
                });
            }
          });

          // Store watcher reference for cleanup
          logWatchers.set(userSocket.id, { watcher, tail: null });

          if (callback) {
            callback({
              success: true,
              message: 'Subscribed to log updates'
            });
          }
        } catch (watchError) {
          console.error('Error setting up log file watcher:', watchError);
          
          // Fall back to polling if watching fails
          console.log('Falling back to polling for log updates');
          
          let lastContent = '';
          const pollInterval = setInterval(async () => {
            try {
              const { stdout } = await execPromise(`tail -n 50 ${NANOS_LOG_PATH}`);
              if (stdout !== lastContent) {
                lastContent = stdout;
                userSocket.emit('log_data', {
                  type: 'update',
                  logs: stdout.split('\n')
                });
              }
            } catch (pollError) {
              console.error('Error polling log file:', pollError);
            }
          }, 2000); // Poll every 2 seconds
          
          // Store interval reference for cleanup
          logWatchers.set(userSocket.id, { 
            watcher: { close: () => clearInterval(pollInterval) } as any, 
            tail: null 
          });
          
          if (callback) {
            callback({
              success: true,
              message: 'Subscribed to log updates (polling mode)'
            });
          }
        }
      } catch (error) {
        console.error('Log subscription error:', error);
        if (callback) {
          callback({
            success: false,
            message: `Failed to subscribe to logs: ${error instanceof Error ? error.message : 'Unknown error'}`
          });
        }
      }
    });

    // Unsubscribe from logs
    userSocket.on('unsubscribe_logs', () => {
      const existingWatcher = logWatchers.get(userSocket.id);
      if (existingWatcher) {
        existingWatcher.watcher.close();
        if (existingWatcher.tail) {
          existingWatcher.tail.destroy();
        }
        logWatchers.delete(userSocket.id);
        console.log(`Unsubscribed ${userSocket.id} from log updates`);
      }
    });

    // Handle disconnection - clean up any log watchers
    userSocket.on('disconnect', () => {
      console.log(`Socket disconnected: ${userSocket.id}`);
      
      // Clean up log watchers
      const existingWatcher = logWatchers.get(userSocket.id);
      if (existingWatcher) {
        existingWatcher.watcher.close();
        if (existingWatcher.tail) {
          existingWatcher.tail.destroy();
        }
        logWatchers.delete(userSocket.id);
      }
      
      // Clean up the metrics interval
      const interval = metricsIntervals.get(userSocket.id);
      if (interval) {
        clearInterval(interval);
        metricsIntervals.delete(userSocket.id);
      }
    });
  });
} 