import type { Server, Socket } from 'socket.io';
import { exec } from 'node:child_process';
import * as fsPromises from 'node:fs/promises';
import { createReadStream, watch, type FSWatcher } from 'node:fs';
import * as path from 'node:path';
import * as util from 'node:util';
import * as os from 'node:os';
import * as osUtils from 'node-os-utils';
import fetch from 'node-fetch';
import { readFile, access } from 'node:fs/promises';

// Hardcoded paths as per server.ts
const NANOS_SERVER_PATH = '/opt/nanos-world-server/NanosWorldServer.sh';
const NANOS_CONFIG_PATH = '/opt/nanos-world-server/Config.toml';
const NANOS_LOG_PATH = '/tmp/nanos-server.log';

// Add an interface for the custom watcher object
interface CustomWatcher {
  close: () => void;
}

// Track active log watchers by socket ID
const logWatchers: Map<string, { 
  watcher: FSWatcher | CustomWatcher, 
  tail: NodeJS.ReadStream | NodeJS.ReadableStream | null,
  lastPosition?: number
}> = new Map();

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
  configPath?: string;
}

// Function to ensure the log file exists and is accessible
async function ensureLogFile(): Promise<boolean> {
  try {
    await fsPromises.access(NANOS_LOG_PATH);
    return true;
  } catch {
    try {
      // Create an empty log file if it doesn't exist
      await fsPromises.writeFile(NANOS_LOG_PATH, '', 'utf-8');
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
    const content = await fsPromises.readFile(LOCAL_UPDATE_FILE, 'utf-8');
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

        const content = await fsPromises.readFile(filePath, 'utf-8');
        
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
        await fsPromises.mkdir(dir, { recursive: true });
        
        await fsPromises.writeFile(filePath, content, 'utf-8');
        
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

        const files = await fsPromises.readdir(dirPath);
        
        // Get file stats to distinguish between files and directories
        const fileStats = await Promise.all(files.map(async (file) => {
          const filePath = path.join(dirPath, file);
          const stats = await fsPromises.stat(filePath);
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
        // Validate command
        if (!command || typeof command !== 'string') {
          return callback({
            success: false,
            error: 'Invalid command format'
          });
        }
        
        // Check if server is running
        const serverStatus = await checkServerStatus();
        if (!serverStatus.running) {
          return callback({
            success: false,
            error: 'Server is not running'
          });
        }

        console.log(`[${userSocket.id}] Executing server command: ${command}`);
        
        // Get current log file size before sending command
        let beforeSize = 0;
        try {
          const beforeStats = await fsPromises.stat(NANOS_LOG_PATH);
          beforeSize = beforeStats.size;
          console.log(`Log file size before command: ${beforeSize} bytes`);
        } catch (statError) {
          console.error('Error getting log file size before command:', statError);
          // Continue even if we can't get the file size
        }

        // Send command via screen - prioritize this method for reliability
        let commandSent = false;
        try {
          const { stdout } = await execPromise('screen -ls');
          if (stdout.includes('nanos-server')) {
            // Ensure the command is properly escaped and has a newline
            const escapedCommand = command.replace(/"/g, '\\"');
            await execPromise(`screen -S nanos-server -X stuff "${escapedCommand}\\n"`);
            commandSent = true;
            
            // Send immediate callback to client
            callback({ 
              success: true, 
              message: 'Command sent to server via screen'
            });
          }
        } catch (screenError) {
          console.error('Screen command error:', screenError);
          // Fall back to direct process input
        }

        // Fall back method if screen is not available
        if (!commandSent && serverStatus.pid) {
          await execPromise(`echo "${command.replace(/"/g, '\\"')}" > /proc/${serverStatus.pid}/fd/0`);
          commandSent = true;
          
          // Send immediate callback to client
          callback({ 
            success: true, 
            message: 'Command sent to server'
          });
        } else if (!commandSent) {
          callback({ 
            success: false, 
            message: 'Could not determine server PID'
          });
          return;
        }

        // Wait for log file to change after sending command
        // This ensures we capture the command output
        let retries = 0;
        const maxRetries = 20; // Try for up to 2 seconds (20 * 100ms)
        
        const waitForLogs = async () => {
          try {
            const afterStats = await fsPromises.stat(NANOS_LOG_PATH);
            console.log(`Log file size after command (attempt ${retries+1}): ${afterStats.size}`);
            
            // If log file has grown, read the new content
            if (afterStats.size > beforeSize) {
              // Read only the new content
              const fileHandle = await fsPromises.open(NANOS_LOG_PATH, 'r');
              const buffer = Buffer.alloc(afterStats.size - beforeSize);
              
              await fileHandle.read(buffer, 0, buffer.length, beforeSize);
              await fileHandle.close();
              
              // Convert buffer to string and split into lines
              const content = buffer.toString();
              if (content.trim()) {
                const lines = content.split('\n').filter(Boolean);
                if (lines.length > 0) {
                  console.log(`Sending ${lines.length} new log lines after command`);
                  userSocket.emit('log_data', {
                    type: 'update',
                    logs: lines
                  });
                  return; // Successfully sent logs
                }
              }
            }
            
            // If we haven't found new logs yet and haven't exceeded max retries
            if (retries < maxRetries) {
              retries++;
              // Wait 100ms before checking again
              setTimeout(waitForLogs, 100);
            } else {
              console.log('No new logs detected after command execution');
              // Even if no new logs, send a final check with tail
              try {
                const { stdout: logOutput } = await execPromise(`tail -n 10 ${NANOS_LOG_PATH}`);
                userSocket.emit('log_data', {
                  type: 'update',
                  logs: logOutput.split('\n')
                });
              } catch (logError) {
                console.error('Error fetching logs after command:', logError);
              }
            }
          } catch (error) {
            console.error('Error checking for new logs:', error);
          }
        };
        
        // Start waiting for logs
        waitForLogs();
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
        console.log(`Log subscription from ${userSocket.data.user.username}`, options);
        
        // Close any existing watcher for this socket
        const existingWatcher = logWatchers.get(userSocket.id);
        if (existingWatcher) {
          existingWatcher.watcher.close();
          if (existingWatcher.tail) {
            // Use type guard to check if destroy method exists
            if ('destroy' in existingWatcher.tail) {
              existingWatcher.tail.destroy();
            }
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

        // Setup real-time log streaming using tail -f
        console.log('Setting up real-time log streaming for socket', userSocket.id);
        
        try {
          // Use tail -f for true streaming with line buffering (-n 0 to avoid repeating lines)
          const tailProcess = exec(`tail -f -n 0 ${NANOS_LOG_PATH}`);
          
          if (!tailProcess.stdout) {
            throw new Error('Failed to create tail process stdout');
          }
          
          // Process log lines one by one in real-time
          let buffer = '';
          tailProcess.stdout.on('data', (data) => {
            // Append new data to buffer
            buffer += data.toString();
            
            // Process complete lines
            if (buffer.includes('\n')) {
              const lines = buffer.split('\n');
              // Keep the last incomplete line in the buffer
              buffer = lines.pop() || '';
              
              // Only emit if we have complete lines
              if (lines.length > 0) {
                userSocket.emit('log_data', {
                  type: 'update',
                  logs: lines
                });
              }
            }
          });
          
          // Handle errors
          tailProcess.on('error', (error) => {
            console.error('Tail process error:', error);
          });
          
          // Store references for cleanup
          logWatchers.set(userSocket.id, { 
            watcher: { 
              close: () => {
                tailProcess.kill();
              } 
            } as CustomWatcher, 
            tail: tailProcess.stdout
          });
          
          if (callback) {
            callback({
              success: true,
              message: 'Subscribed to real-time log updates'
            });
          }
        } catch (error) {
          console.error('Error setting up log streaming:', error);
          
          // If tail process fails, use Node.js readline interface with a file stream
          // This is a fallback that's still efficient for real-time monitoring
          try {
            console.log('Falling back to file stream reading for socket', userSocket.id);
            
            const { createInterface } = require('node:readline');
            
            // Get current file size to start watching from the end
            const stats = await fsPromises.stat(NANOS_LOG_PATH);
            let lastPosition = stats.size;
            
            // Create a watcher to detect file changes
            const watcher = watch(NANOS_LOG_PATH, { persistent: true });
            
            // Function to read new content when file changes
            const readNewContent = async () => {
              try {
                const newStats = await fsPromises.stat(NANOS_LOG_PATH);
                
                // Only read if file has grown
                if (newStats.size > lastPosition) {
                  // Open file handle and read only new content
                  const fileHandle = await fsPromises.open(NANOS_LOG_PATH, 'r');
                  const buffer = Buffer.alloc(newStats.size - lastPosition);
                  
                  await fileHandle.read(buffer, 0, buffer.length, lastPosition);
                  await fileHandle.close();
                  
                  // Update last position
                  lastPosition = newStats.size;
                  
                  // Send new lines immediately
                  const content = buffer.toString();
                  if (content.trim()) {
                    const lines = content.split('\n').filter(line => line.length > 0);
                    if (lines.length > 0) {
                      userSocket.emit('log_data', {
                        type: 'update',
                        logs: lines
                      });
                    }
                  }
                }
              } catch (readError) {
                console.error('Error reading file changes:', readError);
              }
            };
            
            // Watch for file changes
            watcher.on('change', readNewContent);
            
            // Store watcher reference for cleanup
            logWatchers.set(userSocket.id, { 
              watcher, 
              tail: null
            });
            
            if (callback) {
              callback({
                success: true,
                message: 'Subscribed to log updates (file watch mode)'
              });
            }
          } catch (watchError) {
            console.error('Error setting up file watcher:', watchError);
            
            if (callback) {
              callback({
                success: false,
                message: `Could not setup log streaming: ${watchError instanceof Error ? watchError.message : 'Unknown error'}`
              });
            }
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
      const watcher = logWatchers.get(userSocket.id);
      if (watcher) {
        watcher.watcher.close();
        if (watcher.tail) {
          // Use type guard to check if destroy method exists
          if ('destroy' in watcher.tail) {
            watcher.tail.destroy();
          }
        }
        logWatchers.delete(userSocket.id);
        console.log(`Unsubscribed ${userSocket.id} from log updates`);
      }
    });

    // Handle disconnection - clean up any log watchers
    userSocket.on('disconnect', () => {
      console.log(`User disconnected: ${userSocket.data.user.username}`);
      
      // Clean up any active log watchers
      const watcher = logWatchers.get(userSocket.id);
      if (watcher) {
        watcher.watcher.close();
        if (watcher.tail) {
          // Use type guard to check if destroy method exists
          if ('destroy' in watcher.tail) {
            watcher.tail.destroy();
          }
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