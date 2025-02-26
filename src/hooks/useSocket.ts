'use client';

import { useEffect, useState, useCallback } from 'react';
import { io, type Socket } from 'socket.io-client';

interface Credentials {
  username: string;
  password: string;
}

// Command response types
interface CommandResult {
  output: string;
  error?: string;
}

// File operation result types
interface FileReadResult {
  content: string;
}

interface FileListResult {
  name: string;
  isDirectory: boolean;
  size: number;
  modified: Date;
}

// System metrics type
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
    updateInfo: {
      latest_version: string;
      repository_url: string;
      changelog: string;
      required: boolean;
    } | null;
  };
  timestamp: number;
}

// Socket response types
interface SocketResponse<T> {
  success: boolean;
  result?: T;
  error?: string;
}

export function useSocket() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  
  useEffect(() => {
    // Get credentials from sessionStorage
    const credentialsBase64 = sessionStorage.getItem('credentials');
    if (!credentialsBase64) {
      setError('No credentials found');
      return;
    }
    
    try {
      // Decode credentials - directly use base64 string
      const newSocket = io({
        auth: { credentials: credentialsBase64 },
        reconnection: true,
        reconnectionAttempts: Number.POSITIVE_INFINITY,
        reconnectionDelay: 1000,
        timeout: 20000
      });
      
      newSocket.on('connect', () => {
        console.log('Socket connected with ID:', newSocket.id);
        setIsConnected(true);
        setError(null);
      });
      
      newSocket.on('connect_error', (err) => {
        console.error('Socket connection error:', err.message);
        setIsConnected(false);
        setError(err.message);
      });
      
      newSocket.on('disconnect', (reason) => {
        console.log('Socket disconnected:', reason);
        setIsConnected(false);
      });
      
      // Listen for system metrics updates
      newSocket.on('system_metrics', (rawData: SystemMetrics | string) => {
        let parsedData: SystemMetrics;
        if (typeof rawData === 'string') {
          try {
            parsedData = JSON.parse(rawData);
          } catch (e) {
            console.error('Failed to parse system metrics:', e);
            return;
          }
        } else {
          parsedData = rawData;
        }
        setMetrics(parsedData);
      });
      
      setSocket(newSocket);
      
      // Clean up on unmount
      return () => {
        newSocket.disconnect();
      };
      
    } catch (err) {
      console.error('Error connecting to socket:', err);
      setError('Failed to establish socket connection');
    }
  }, []);
  
  // Execute command via socket
  const executeCommand = useCallback((command: string): Promise<CommandResult> => {
    return new Promise((resolve, reject) => {
      if (!socket || !isConnected) {
        reject(new Error('Socket not connected'));
        return;
      }
      
      socket.emit('execute_command', command, (response: string | SocketResponse<CommandResult>) => {
        try {
          // Handle string response
          if (typeof response === 'string') {
            return resolve({ output: response });
          }
          
          // Handle object response
          if (response.success) {
            resolve(response.result || { output: 'Command executed successfully' });
          } else {
            reject(new Error(response.error || 'Unknown error'));
          }
        } catch (err) {
          reject(new Error('Failed to parse server response'));
        }
      });
    });
  }, [socket, isConnected]);
  
  // File operations
  const readFile = useCallback((path: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (!socket || !isConnected) {
        reject(new Error('Socket not connected'));
        return;
      }
      
      socket.emit('read_file', path, (response: { success: boolean, data?: string, error?: string }) => {
        if (response.success && response.data) {
          resolve(response.data);
        } else {
          reject(new Error(response.error || 'Unknown error'));
        }
      });
    });
  }, [socket, isConnected]);
  
  const writeFile = useCallback((path: string, content: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (!socket || !isConnected) {
        reject(new Error('Socket not connected'));
        return;
      }
      
      socket.emit('write_file', path, content, (response: { success: boolean, error?: string }) => {
        if (response.success) {
          resolve();
        } else {
          reject(new Error(response.error || 'Unknown error'));
        }
      });
    });
  }, [socket, isConnected]);
  
  const listFiles = useCallback((dirPath: string): Promise<FileListResult[]> => {
    return new Promise((resolve, reject) => {
      if (!socket || !isConnected) {
        reject(new Error('Socket not connected'));
        return;
      }
      
      socket.emit('list_files', dirPath, (response: { success: boolean, data?: unknown[], error?: string }) => {
        if (response.success && response.data) {
          resolve(response.data as FileListResult[]);
        } else {
          reject(new Error(response.error || 'Unknown error'));
        }
      });
    });
  }, [socket, isConnected]);
  
  return {
    socket,
    isConnected,
    error,
    metrics,
    executeCommand,
    readFile,
    writeFile,
    listFiles
  };
} 