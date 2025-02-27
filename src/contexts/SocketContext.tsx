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

interface ConnectionState {
  connected: boolean;
  connecting: boolean;
  error: string | null;
  reconnectCount: number;
  lastConnectAttempt: number | null;
}

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  isConnecting: boolean;
  connectionError: string | null;
  metrics: SystemMetrics | null;
  reconnect: () => void;
  executeCommand: (command: string) => Promise<CommandResult>;
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, content: string) => Promise<void>;
  listFiles: (dirPath: string) => Promise<FileListResult[]>;
  connectionState: ConnectionState;
}

// Create context with default values
const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
  isConnecting: false,
  connectionError: null,
  metrics: null,
  reconnect: () => {},
  executeCommand: () => Promise.reject(new Error('Socket not initialized')),
  readFile: () => Promise.reject(new Error('Socket not initialized')),
  writeFile: () => Promise.reject(new Error('Socket not initialized')),
  listFiles: () => Promise.reject(new Error('Socket not initialized')),
  connectionState: {
    connected: false,
    connecting: false,
    error: null,
    reconnectCount: 0,
    lastConnectAttempt: null
  }
});

// Provider component
export function SocketProvider({ children }: { children: ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>({
    connected: false,
    connecting: false,
    error: null,
    reconnectCount: 0,
    lastConnectAttempt: null
  });
  const [credentialsBase64, setCredentialsBase64] = useState<string | null>(null);

  // Helper function to log connection state changes
  const logConnectionEvent = useCallback((event: string, details?: Record<string, unknown>) => {
    console.log(`[Socket] ${event}`, details || '');
    
    // For debugging purposes, we can dispatch a custom event
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('socket-event', { 
        detail: { type: event, details, timestamp: Date.now() } 
      }));
    }
  }, []);

  // Socket connection initialization
  const initializeSocket = useCallback(() => {
    // Check for existing credentials
    const storedCredentials = sessionStorage.getItem('credentials');
    if (!storedCredentials) {
      setConnectionState(prev => ({
        ...prev,
        error: 'No credentials found',
        connecting: false
      }));
      return null;
    }

    try {
      // Decode credentials
      const credentialsString = atob(storedCredentials);
      const [username, password] = credentialsString.split(':');
      
      if (!username || !password) {
        logConnectionEvent('Invalid credentials format', { username: !!username, password: !!password });
        setConnectionState(prev => ({
          ...prev,
          error: 'Invalid credentials format',
          connecting: false
        }));
        return null;
      }
      
      // Set connection state to connecting
      setConnectionState(prev => ({
        ...prev,
        connecting: true,
        lastConnectAttempt: Date.now(),
        error: null
      }));
      
      logConnectionEvent('Creating socket connection');

      // Determine server URL based on environment
      const serverUrl = window.location.hostname === 'localhost' 
        ? 'http://localhost:3000' 
        : window.location.origin;
      
      // Check server availability without waiting
      fetch('/api/server-check')
        .then(response => {
          logConnectionEvent('Server check result', { available: response.ok, status: response.status });
        })
        .catch(error => {
          logConnectionEvent('Server check failed', { error: error.message });
        });
      
      // Create socket.io instance with enhanced reliability settings
      const socketInstance = io(serverUrl, {
        auth: { username, password },
        reconnection: true,
        reconnectionAttempts: 10,     // Increased from 5
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10000,  // Increased from 5000
        timeout: 20000,               // Increased from 10000
        path: '/socket.io/',
        autoConnect: true,
        transports: ['websocket', 'polling']  // Explicitly define transports
      });
      
      // Set up Socket.io event listeners
      socketInstance.on('connect', () => {
        logConnectionEvent('Socket.io connected', { id: socketInstance.id });
        setConnectionState(prev => ({
          ...prev,
          connected: true,
          connecting: false,
          error: null,
          reconnectCount: 0
        }));
      });
      
      socketInstance.on('connect_error', (err) => {
        logConnectionEvent('Socket.io connect_error', { message: err.message });
        setConnectionState(prev => ({
          ...prev,
          connected: false,
          connecting: false,
          error: `Connection error: ${err.message}`,
          reconnectCount: prev.reconnectCount + 1
        }));
      });
      
      socketInstance.on('disconnect', (reason) => {
        logConnectionEvent('Socket.io disconnected', { reason });
        setConnectionState(prev => ({
          ...prev,
          connected: false,
          connecting: false,
          error: reason === 'io server disconnect' ? 'Server disconnected' : `Disconnected: ${reason}`
        }));
        
        // For certain disconnect reasons, attempt immediate reconnection
        if (reason === 'io server disconnect' || reason === 'transport close') {
          // Server forced disconnect, try to reconnect
          socketInstance.connect();
        }
      });
      
      // Handle reconnection attempts
      socketInstance.io.on('reconnect_attempt', (attempt) => {
        logConnectionEvent('Socket.io reconnect attempt', { attempt });
        setConnectionState(prev => ({
          ...prev,
          connecting: true,
          reconnectCount: attempt,
          lastConnectAttempt: Date.now()
        }));
      });
      
      socketInstance.io.on('reconnect', (attempt) => {
        logConnectionEvent('Socket.io reconnected', { attempt });
        setConnectionState(prev => ({
          ...prev,
          connected: true,
          connecting: false,
          error: null
        }));
      });
      
      socketInstance.io.on('reconnect_error', (error) => {
        logConnectionEvent('Socket.io reconnect error', { error: error.message });
      });
      
      socketInstance.io.on('reconnect_failed', () => {
        logConnectionEvent('Socket.io reconnect failed');
        setConnectionState(prev => ({
          ...prev,
          connecting: false,
          error: 'Reconnection failed after all attempts'
        }));
      });
      
      // Listen for system metrics updates
      socketInstance.on('system_metrics', (data: SystemMetrics) => {
        setMetrics(data);
      });
      
      // Set up heartbeat mechanism
      const pingInterval = setInterval(() => {
        if (socketInstance?.connected) {
          const pingStartTime = Date.now();
          socketInstance.emit('ping', null, (response: { success: boolean, timestamp: number } | undefined) => {
            const pingTime = Date.now() - pingStartTime;
            
            if (!response) {
              logConnectionEvent('No heartbeat response', { 
                connected: socketInstance.connected,
                latency: 'timeout'
              });
              
              // If no response but we think we're connected, force reconnect
              if (socketInstance.connected) {
                socketInstance.disconnect().connect();
              }
            } else {
              // Only log slow pings (> 1000ms)
              if (pingTime > 1000) {
                logConnectionEvent('Slow heartbeat response', { 
                  latency: `${pingTime}ms`
                });
              }
            }
          });
        }
      }, 30000); // 30s heartbeat interval
      
      // Store references
      setSocket(socketInstance);
      
      // Return socket to be stored
      return socketInstance;
    } catch (err) {
      logConnectionEvent('Error creating socket', { error: (err as Error).message });
      setConnectionState(prev => ({
        ...prev,
        error: `Failed to initialize socket: ${(err as Error).message}`,
        connecting: false
      }));
      return null;
    }
  }, [logConnectionEvent]);

  // Reconnect function
  const reconnect = useCallback(() => {
    logConnectionEvent('Manual reconnect initiated');
    
    setConnectionState(prev => ({
      ...prev,
      connecting: true,
      reconnectCount: prev.reconnectCount + 1,
      lastConnectAttempt: Date.now()
    }));
    
    // Clean up existing socket if needed
    if (socket) {
      // First try to reconnect the existing socket
      try {
        if (socket.connected) {
          socket.disconnect().connect();
        } else {
          socket.connect();
        }
        
        logConnectionEvent('Attempting to reconnect existing socket');
        
        // Set a timeout to check if reconnection was successful
        setTimeout(() => {
          if (!socket.connected) {
            logConnectionEvent('Reconnect timed out, creating new socket');
            
            // If not connected after 5 seconds, clean up and create a new socket
            socket.disconnect();
            socket.removeAllListeners();
            
            // Create a new socket instance
            const newSocket = initializeSocket();
            if (newSocket) {
              setSocket(newSocket);
            }
          }
        }, 5000);
      } catch (error) {
        logConnectionEvent('Error during reconnect', { error: (error as Error).message });
        
        // If error occurred, clean up and create a new socket
        socket.disconnect();
        socket.removeAllListeners();
        
        // Create a new socket instance
        const newSocket = initializeSocket();
        if (newSocket) {
          setSocket(newSocket);
        }
      }
    } else {
      // No existing socket, create a new one
      const newSocket = initializeSocket();
      if (newSocket) {
        setSocket(newSocket);
      }
    }
  }, [socket, initializeSocket, logConnectionEvent]);

  // Effect to setup and manage socket connection based on credentials
  useEffect(() => {
    // Check if credentials are in sessionStorage
    const storedCredentials = sessionStorage.getItem('credentials');
    if (storedCredentials !== credentialsBase64) {
      logConnectionEvent('Credentials changed', { 
        hadPrevious: !!credentialsBase64, 
        hasNew: !!storedCredentials 
      });
      
      // Update stored credentials
      setCredentialsBase64(storedCredentials);
      
      // Clean up existing socket if any
      if (socket) {
        socket.disconnect();
        socket.removeAllListeners();
      }
      
      if (!storedCredentials) {
        setConnectionState(prev => ({
          ...prev,
          error: 'No credentials found',
          connected: false,
          connecting: false
        }));
        setSocket(null);
        return;
      }
      
      // Initialize new socket
      const newSocket = initializeSocket();
      if (newSocket) {
        setSocket(newSocket);
      }
    }
    
    // Cleanup when component unmounts
    return () => {
      logConnectionEvent('Socket provider unmounting');
      
      if (socket) {
        socket.disconnect();
        socket.removeAllListeners();
      }
    };
  }, [credentialsBase64, initializeSocket, socket, logConnectionEvent]);

  // Execute command via socket
  const executeCommand = useCallback((command: string): Promise<CommandResult> => {
    return new Promise((resolve, reject) => {
      if (!socket || !connectionState.connected) {
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
  }, [socket, connectionState.connected]);
  
  // File operations with timeout handling
  const readFile = useCallback((path: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (!socket || !connectionState.connected) {
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
  }, [socket, connectionState.connected]);
  
  const writeFile = useCallback((path: string, content: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (!socket || !connectionState.connected) {
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
  }, [socket, connectionState.connected]);
  
  const listFiles = useCallback((dirPath: string): Promise<FileListResult[]> => {
    return new Promise((resolve, reject) => {
      if (!socket || !connectionState.connected) {
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
  }, [socket, connectionState.connected]);

  // Context value
  const value = {
    socket,
    isConnected: connectionState.connected,
    isConnecting: connectionState.connecting,
    connectionError: connectionState.error,
    metrics,
    reconnect,
    executeCommand,
    readFile,
    writeFile,
    listFiles,
    connectionState
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
}

// Custom hook to use the socket context
export const useSocket = () => useContext(SocketContext); 