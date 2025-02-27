'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';

// Types
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

interface CommandResult {
  output: string;
  error?: string;
}

interface FileListResult {
  name: string;
  isDirectory: boolean;
  size: number;
  modified: Date;
}

interface SocketResponse<T> {
  success: boolean;
  result?: T;
  error?: string;
}

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  connectionError: string | null;
  metrics: SystemMetrics | null;
  reconnect: () => void;
  executeCommand: (command: string) => Promise<CommandResult>;
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, content: string) => Promise<void>;
  listFiles: (dirPath: string) => Promise<FileListResult[]>;
}

// Create context with default values
const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
  connectionError: null,
  metrics: null,
  reconnect: () => {},
  executeCommand: () => Promise.reject(new Error('Socket not initialized')),
  readFile: () => Promise.reject(new Error('Socket not initialized')),
  writeFile: () => Promise.reject(new Error('Socket not initialized')),
  listFiles: () => Promise.reject(new Error('Socket not initialized')),
});

// Provider component
export function SocketProvider({ children }: { children: ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [credentialsBase64, setCredentialsBase64] = useState<string | null>(null);

  // Initialize socket connection
  const initializeSocket = useCallback(() => {
    // Get credentials from session storage
    const storedCredentials = sessionStorage.getItem('credentials');
    if (!storedCredentials) {
      setConnectionError('No credentials found');
      return null;
    }

    try {
      // Decode credentials
      const credentialsString = atob(storedCredentials);
      const [username, password] = credentialsString.split(':');
      
      if (!username || !password) {
        console.error('Invalid credentials format', { username: !!username, password: !!password });
        setConnectionError('Invalid credentials format');
        return null;
      }
      
      console.log('Creating socket connection with credentials');

      // We'll check server availability separately without awaiting
      fetch('/api/server-check')
        .then(response => {
          console.log('Server check result:', response.ok ? 'Available' : `Error: ${response.status}`);
        })
        .catch(error => {
          console.warn('Server check failed:', error.message);
        });

      // Create socket instance with better reconnection settings
      const serverUrl = window.location.hostname === 'localhost' 
        ? 'http://localhost:3000' 
        : window.location.origin;

      console.log('Attempting socket connection to:', serverUrl);

      // Keep the robust connection approach but without async/await
      let newSocket: Socket;

      try {
        // First attempt - standard connection with websocket first
        newSocket = io(serverUrl, {
          auth: { username, password },
          reconnection: true,
          reconnectionAttempts: 5,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          timeout: 10000,
          path: '/socket.io/',
          transports: ['websocket', 'polling'],
          autoConnect: true
        });
        
        console.log('Primary socket connection attempt made');
        
        // Set up direct error logging for the IO manager
        newSocket.io.on("error", (error) => {
          console.error('Socket manager error:', error);
        });
        
      } catch (initialError) {
        console.error('Initial socket connection attempt failed:', initialError);
        
        // Fallback - try with only polling transport which is more reliable but slower
        try {
          console.log('Trying fallback connection method...');
          newSocket = io(serverUrl, {
            auth: { username, password },
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            timeout: 20000,
            path: '/socket.io/',
            transports: ['polling'],
            autoConnect: true
          });
          
          console.log('Fallback socket connection attempt made');
        } catch (fallbackError) {
          console.error('Fallback socket connection also failed:', fallbackError);
          setConnectionError(`Failed to initialize socket connection: ${(fallbackError as Error).message}`);
          return null;
        }
      }

      // Log the connection status
      console.log('Socket instance created:', { 
        id: newSocket.id,
        connected: newSocket.connected,
        disconnected: newSocket.disconnected
      });
      
      // Add a direct connection error listener
      newSocket.on('connect_error', (err: Error) => {
        console.error('Socket connect_error event:', err.message);
      });
      
      return newSocket;
    } catch (err) {
      console.error('Error creating socket:', err);
      setConnectionError(`Failed to initialize socket connection: ${(err as Error).message}`);
      return null;
    }
  }, []);

  // Reconnect function to manually reconnect the socket
  const reconnect = useCallback(() => {
    if (socket) {
      console.log('Manually reconnecting socket...');
      
      // Try a series of reconnection strategies
      try {
        // First try a simple reconnect
        socket.connect();
        console.log('Socket reconnection initiated');
        
        // Set a timeout to check if connection was established
        setTimeout(() => {
          if (!socket.connected) {
            console.log('Reconnection seemingly failed, trying force restart');
            // Try force disconnect and reconnect
            socket.disconnect().connect();
            
            // Set another timeout for the final check
            setTimeout(() => {
              if (!socket.connected) {
                console.log('Force reconnect failed, creating new socket instance');
                // If still not connected, try creating a completely new socket
                const newSocket = initializeSocket();
                if (newSocket) {
                  console.log('New socket instance created during reconnect');
                  setSocket(newSocket);
                }
              }
            }, 2000);
          }
        }, 3000);
      } catch (error) {
        console.error('Error during reconnect attempts:', error);
        const newSocket = initializeSocket();
        if (newSocket) {
          setSocket(newSocket);
        }
      }
      
      setReconnectAttempts(prev => prev + 1);
    } else {
      console.log('No existing socket, creating new one');
      const newSocket = initializeSocket();
      if (newSocket) {
        setSocket(newSocket);
      }
    }
  }, [socket, initializeSocket]);

  // Effect to setup and manage socket connection
  useEffect(() => {
    // Check if credentials are in sessionStorage
    const storedCredentials = sessionStorage.getItem('credentials');
    if (storedCredentials !== credentialsBase64) {
      // Credentials changed, update and reinitialize socket
      setCredentialsBase64(storedCredentials);
      
      // Clean up existing socket if any
      if (socket) {
        socket.disconnect();
        socket.removeAllListeners();
      }
      
      if (!storedCredentials) {
        setConnectionError('No credentials found');
        setSocket(null);
        return;
      }
      
      // Initialize new socket
      const newSocket = initializeSocket();
      if (!newSocket) return;
      
      setSocket(newSocket);
      
      // Set up event listeners
      newSocket.on('connect', () => {
        console.log('Socket connected with ID:', newSocket.id);
        console.log('Socket connection details:', {
          id: newSocket.id,
          connected: newSocket.connected,
          disconnected: newSocket.disconnected,
        });
        setIsConnected(true);
        setConnectionError(null);
        setReconnectAttempts(0);
      });
      
      newSocket.on('connect_error', (err) => {
        console.error('Socket connection error:', err.message);
        console.error('Connection error details:', {
          message: err.message,
        });
        setIsConnected(false);
        setConnectionError(`Connection error: ${err.message}`);
      });
      
      newSocket.on('disconnect', (reason) => {
        console.log('Socket disconnected:', reason);
        console.log('Disconnect details:', {
          wasConnected: newSocket.connected,
          reason
        });
        setIsConnected(false);
        
        // Handle various disconnect reasons
        if (reason === 'io server disconnect') {
          // Server disconnected, need to reconnect manually
          console.log('Server disconnected the socket, attempting to reconnect...');
          newSocket.connect();
        } else if (reason === 'transport close' || reason === 'ping timeout') {
          // These are typically network issues that socket.io will try to reconnect automatically
          console.log('Network issue detected, socket.io will attempt automatic reconnection');
          setConnectionError(`Network issue: ${reason}`);
        } else {
          setConnectionError(`Disconnected: ${reason}`);
        }
      });
      
      // Listen for system metrics updates
      newSocket.on('system_metrics', (data: SystemMetrics) => {
        setMetrics(data);
      });
      
      // Error event
      newSocket.on('error', (err) => {
        console.error('Socket error:', err);
        setConnectionError(`Socket error: ${err.message || 'Unknown error'}`);
      });
      
      // Set up a heartbeat mechanism to detect dead connections
      const pingInterval = setInterval(() => {
        if (newSocket && isConnected) {
          newSocket.emit('ping', null, (response: { success: boolean, timestamp: number } | undefined) => {
            // If we get a response, connection is alive
            if (!response) {
              console.warn('No heartbeat response, connection may be dead');
              // If no response and socket thinks it's connected, try to reconnect
              if (newSocket.connected) {
                console.log('Force reconnecting socket due to no heartbeat');
                newSocket.disconnect().connect();
              }
            }
          });
        }
      }, 30000); // Check every 30 seconds
      
      return () => {
        clearInterval(pingInterval);
        newSocket.disconnect();
        newSocket.removeAllListeners();
      };
    }
  }, [credentialsBase64, initializeSocket, socket, isConnected]);

  // Execute command via socket
  const executeCommand = useCallback((command: string): Promise<CommandResult> => {
    return new Promise((resolve, reject) => {
      if (!socket || !isConnected) {
        reject(new Error('Socket not connected'));
        return;
      }
      
      // Set a timeout for the command execution
      const timeoutId = setTimeout(() => {
        reject(new Error('Command execution timed out'));
      }, 30000); // 30 second timeout
      
      socket.emit('execute_command', command, (response: SocketResponse<CommandResult>) => {
        clearTimeout(timeoutId);
        if (response.success) {
          resolve(response.result || { output: 'Command executed successfully' });
        } else {
          reject(new Error(response.error || 'Unknown error'));
        }
      });
    });
  }, [socket, isConnected]);
  
  // File operations with timeout handling
  const readFile = useCallback((path: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (!socket || !isConnected) {
        reject(new Error('Socket not connected'));
        return;
      }
      
      const timeoutId = setTimeout(() => {
        reject(new Error('Read file operation timed out'));
      }, 10000);
      
      socket.emit('read_file', path, (response: { success: boolean, data?: string, error?: string }) => {
        clearTimeout(timeoutId);
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
      
      const timeoutId = setTimeout(() => {
        reject(new Error('Write file operation timed out'));
      }, 10000);
      
      socket.emit('write_file', path, content, (response: { success: boolean, error?: string }) => {
        clearTimeout(timeoutId);
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
      
      const timeoutId = setTimeout(() => {
        reject(new Error('List files operation timed out'));
      }, 10000);
      
      socket.emit('list_files', dirPath, (response: { success: boolean, data?: unknown[], error?: string }) => {
        clearTimeout(timeoutId);
        if (response.success && response.data) {
          resolve(response.data as FileListResult[]);
        } else {
          reject(new Error(response.error || 'Unknown error'));
        }
      });
    });
  }, [socket, isConnected]);

  // Context value
  const value = {
    socket,
    isConnected,
    connectionError,
    metrics,
    reconnect,
    executeCommand,
    readFile,
    writeFile,
    listFiles,
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
}

// Custom hook to use the socket context
export const useSocket = () => useContext(SocketContext); 