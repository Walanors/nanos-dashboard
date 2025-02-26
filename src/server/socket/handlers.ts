import type { Server, Socket } from 'socket.io';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import * as osUtils from 'node-os-utils';
import fetch from 'node-fetch';
import { getSystemMetrics } from '../utils/metrics';
import { getServerConfig, saveServerConfig, initializeDefaultConfig } from '../database';

// Promisify exec
const execPromise = promisify(exec);

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

// Store metrics intervals for cleanup
const metricsIntervals = new Map<string, NodeJS.Timeout>();

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



// Callback type for socket operations
type SocketCallback<T> = (response: T) => void;

/**
 * Configure all Socket.io event handlers
 */
export function configureSocketHandlers(io: Server): void {
  // Start system-wide metrics broadcast
  const METRICS_INTERVAL = 1000; // 1 second
  
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
    const metricsInterval = setInterval(() => {
      const metrics = getSystemMetrics();
      userSocket.emit('system_metrics', metrics);
    }, METRICS_INTERVAL);
    
    // Store the interval reference
    metricsIntervals.set(userSocket.id, metricsInterval);

    // Handle command execution
    userSocket.on('execute_command', async (command: string | { command: string; config?: string }, callback: (response: CommandResponse) => void) => {
      try {
        // Handle both string commands and command objects
        let cmd: string;
        let configData: string | undefined;

        if (typeof command === 'string') {
          cmd = command;
        } else {
          cmd = command.command;
          configData = command.config;
        }

        console.log(`Executing command: ${cmd} by ${userSocket.data.user.username}`);
        
        // Handle special commands
        if (cmd === 'get_server_config') {
          let config = getServerConfig();
          if (!config) {
            // Initialize default config if none exists
            const initialized = initializeDefaultConfig();
            if (!initialized) {
              throw new Error('Failed to initialize default configuration');
            }
            config = getServerConfig();
            if (!config) {
              throw new Error('Failed to load configuration after initialization');
            }
          }
          callback({
            success: true,
            output: JSON.stringify(config)
          });
          return;
        }

        if (cmd.startsWith('save_server_config ')) {
          const configJson = cmd.slice('save_server_config '.length);
          try {
            const config = JSON.parse(configJson);
            const success = saveServerConfig(config);
            if (!success) {
              throw new Error('Failed to save configuration');
            }
            callback({
              success: true,
              output: 'Configuration saved successfully'
            });
          } catch (parseError) {
            throw new Error(`Invalid configuration data: ${(parseError as Error).message}`);
          }
          return;
        }

        // Security check - prevent dangerous commands
        if (cmd.includes('rm -rf') || cmd.includes('format') || cmd.includes(';') || cmd.includes('&&')) {
          throw new Error('Potentially dangerous command denied');
        }

        // Set the correct working directory and shell options
        const options = {
          cwd: process.cwd(),
          shell: process.platform === 'win32' ? 'powershell.exe' : '/bin/bash'
        };

        const { stdout, stderr } = await execPromise(cmd, options);
        
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
      
      // Clear the metrics interval
      const interval = metricsIntervals.get(userSocket.id);
      if (interval) {
        clearInterval(interval);
        metricsIntervals.delete(userSocket.id);
      }
    });
  });
} 