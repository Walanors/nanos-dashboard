import type { Server, Socket } from 'socket.io';
import { exec } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as util from 'node:util';
import * as os from 'node:os';
import * as osUtils from 'node-os-utils';
import fetch from 'node-fetch';

// Convert exec to use promises
const execPromise = util.promisify(exec);

// Constants for version checking
const CURRENT_VERSION = '1.0.0';
const UPDATE_CHECK_INTERVAL = 30000; // 30 seconds
const UPDATE_MANIFEST_URL = 'https://raw.githubusercontent.com/Walanors/nanos-dashboard/main/update.json';

// Interface for update info from manifest
interface UpdateManifest {
  latest_version: string;
  repository_url: string;
  changelog: string;
  required: boolean;
}

// Track update check interval
let updateCheckInterval: NodeJS.Timeout | null = null;

// Function to check for updates
async function checkForUpdates(): Promise<{
  current: string;
  latest: string | null;
  updateAvailable: boolean;
  updateInfo: UpdateManifest | null;
}> {
  try {
    const response = await fetch(UPDATE_MANIFEST_URL);
    if (!response.ok) {
      throw new Error('Failed to fetch update manifest');
    }

    const manifest: UpdateManifest = await response.json();
    const updateAvailable = manifest.latest_version !== CURRENT_VERSION;

    return {
      current: CURRENT_VERSION,
      latest: manifest.latest_version,
      updateAvailable,
      updateInfo: updateAvailable ? manifest : null
    };
  } catch (error) {
    console.error('Error checking for updates:', error);
    return {
      current: CURRENT_VERSION,
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

    // Handle disconnection
    userSocket.on('disconnect', () => {
      console.log(`Socket disconnected: ${userSocket.id}`);
      
      // Clean up the metrics interval
      const interval = metricsIntervals.get(userSocket.id);
      if (interval) {
        clearInterval(interval);
        metricsIntervals.delete(userSocket.id);
      }
    });
  });
} 