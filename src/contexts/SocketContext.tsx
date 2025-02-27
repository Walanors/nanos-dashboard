'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { StableSocket, type Socket as StableSocketInstance } from '@github/stable-socket';
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

// StableSocket delegate type
interface StableSocketDelegate {
  socketDidOpen: (socket: StableSocketInstance) => void;
  socketDidClose: (socket: StableSocketInstance, code?: number, reason?: string) => void;
  socketDidFinish: (socket: StableSocketInstance) => void;
  socketDidReceiveMessage: (socket: StableSocketInstance, message: string) => void;
  socketShouldRetry: (socket: StableSocketInstance, code: number) => boolean;
}

// Provider component
export function SocketProvider({ children }: { children: ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [stableSocket, setStableSocket] = useState<StableSocket | null>(null);
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

      // Create a StableSocket instance
      const wsUrl = new URL('/socket.io/', serverUrl);
      wsUrl.protocol = wsUrl.protocol.replace('http', 'ws');
      
      // Create the StableSocket delegate for handling events
      const socketDelegate: StableSocketDelegate = {
        socketDidOpen: (socket) => {
          logConnectionEvent('StableSocket opened');
        },
        socketDidClose: (socket, code, reason) => {
          logConnectionEvent('StableSocket closed', { code, reason });
          setConnectionState(prev => ({
            ...prev,
            connected: false,
            connecting: true
          }));
        },
        socketDidFinish: (socket) => {
          logConnectionEvent('StableSocket finished (no more retries)');
          setConnectionState(prev => ({
            ...prev,
            connected: false,
            connecting: false
          }));
        },
        socketDidReceiveMessage: (socket, message) => {
          logConnectionEvent('StableSocket message', { message });
        },
        socketShouldRetry: (socket, code) => {
          // Retry unless it's a policy violation (1008)
          const shouldRetry = code !== 1008;
          logConnectionEvent('StableSocket checking retry', { code, shouldRetry });
          return shouldRetry;
        }
      };
      
      // Connection policy
      const policy = {
        timeout: 10000,      // 10s connection timeout
        attempts: 10,        // Max 10 reconnect attempts
        maxDelay: 30000      // Max 30s between reconnect attempts
      };
      
      // Create the stable socket with the delegate and policy
      const stable = new StableSocket(wsUrl.toString(), socketDelegate, policy);
      stable.open();  // Explicitly open the connection
      
      // Create socket.io instance
      const socketInstance = io(serverUrl, {
        auth: { username, password },
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 10000,
        path: '/socket.io/',
        autoConnect: true
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
          error: reason === 'io server disconnect' ? 'Server disconnected' : `Disconnected: ${reason}`
        }));
        
        // For certain disconnect reasons, attempt immediate reconnection
        if (reason === 'io server disconnect') {
          socketInstance.connect();
        }
      });
      
      // Listen for system metrics updates
      socketInstance.on('system_metrics', (data: SystemMetrics) => {
        setMetrics(data);
      });
      
      // Set up heartbeat mechanism
      const pingInterval = setInterval(() => {
        if (socketInstance?.connected) {
          socketInstance.emit('ping', null, (response: { success: boolean, timestamp: number } | undefined) => {
            if (!response) {
              logConnectionEvent('No heartbeat response', { connected: socketInstance.connected });
              if (socketInstance.connected) {
                socketInstance.disconnect().connect();
              }
            }
          });
        }
      }, 30000); // 30s heartbeat interval
      
      // Store references
      setStableSocket(stable);
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
      socket.disconnect();
      socket.removeAllListeners();
    }
    
    if (stableSocket) {
      try {
        stableSocket.open(); // Use open() instead of reconnect()
      } catch (error) {
        logConnectionEvent('StableSocket open error', { error: (error as Error).message });
      }
    }
    
    // Create a new socket instance
    const newSocket = initializeSocket();
    if (newSocket) {
      setSocket(newSocket);
    }
  }, [socket, stableSocket, initializeSocket, logConnectionEvent]);

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
      
      if (stableSocket) {
        try {
          stableSocket.close(); // Use close() method 
        } catch (error) {
          logConnectionEvent('Error closing StableSocket', { error: (error as Error).message });
        }
      }
      
      if (!storedCredentials) {
        setConnectionState(prev => ({
          ...prev,
          error: 'No credentials found',
          connected: false,
          connecting: false
        }));
        setSocket(null);
        setStableSocket(null);
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
      
      if (stableSocket) {
        try {
          stableSocket.close(); // Use close() method
        } catch (error) {
          logConnectionEvent('Error closing StableSocket during cleanup', { 
            error: (error as Error).message 
          });
        }
      }
    };
  }, [credentialsBase64, initializeSocket, socket, stableSocket, logConnectionEvent]);

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