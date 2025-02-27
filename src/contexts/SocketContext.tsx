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

interface ServerStatus {
  running: boolean;
  pid?: number;
  uptime?: number;
  configPath?: string;
}

interface ServerCommandResult {
  success: boolean;
  message: string;
  error?: string;
}

interface LogData {
  type: 'initial' | 'update';
  logs: string[];
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
  // Server management
  serverStatus: ServerStatus | null;
  isLoadingServerStatus: boolean;
  fetchServerStatus: () => Promise<ServerStatus>;
  startServer: () => Promise<ServerCommandResult>;
  stopServer: () => Promise<ServerCommandResult>;
  sendServerCommand: (command: string) => Promise<ServerCommandResult>;
  // Logs
  logs: string[];
  isSubscribedToLogs: boolean;
  isLoadingLogs: boolean;
  subscribeToLogs: (options?: { initialLines?: number; fullHistory?: boolean; realtime?: boolean }) => Promise<void>;
  unsubscribeFromLogs: () => void;
  clearLogs: () => void;
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
  },
  // Server management
  serverStatus: null,
  isLoadingServerStatus: false,
  fetchServerStatus: () => Promise.reject(new Error('Socket not initialized')),
  startServer: () => Promise.reject(new Error('Socket not initialized')),
  stopServer: () => Promise.reject(new Error('Socket not initialized')),
  sendServerCommand: () => Promise.reject(new Error('Socket not initialized')),
  // Logs
  logs: [],
  isSubscribedToLogs: false,
  isLoadingLogs: false,
  subscribeToLogs: () => Promise.reject(new Error('Socket not initialized')),
  unsubscribeFromLogs: () => {},
  clearLogs: () => {}
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
  
  // Server management state
  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null);
  const [isLoadingServerStatus, setIsLoadingServerStatus] = useState<boolean>(false);
  
  // Log state
  const [logs, setLogs] = useState<string[]>([]);
  const [isSubscribedToLogs, setIsSubscribedToLogs] = useState<boolean>(false);
  const [isLoadingLogs, setIsLoadingLogs] = useState<boolean>(false);
  const maxLogLines = 1000; // Prevent memory issues by limiting stored logs

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

  // Server management functions
  const fetchServerStatus = useCallback((): Promise<ServerStatus> => {
    return new Promise((resolve, reject) => {
      if (!socket || !connectionState.connected) {
        console.error('Cannot fetch server status: Socket not connected');
        reject(new Error('Socket not connected'));
        return;
      }
      
      setIsLoadingServerStatus(true);
      console.log('Fetching server status...');
      
      // Set a timeout for the server status request
      const timeoutId = setTimeout(() => {
        setIsLoadingServerStatus(false);
        console.error('Server status request timed out');
        reject(new Error('Server status request timed out'));
      }, 10000);
      
      // Add retry mechanism for more reliability
      let retryCount = 0;
      const maxRetries = 2;
      
      const attemptFetchStatus = () => {
        socket.emit('server_status', (response: { 
          success: boolean;
          running?: boolean;
          pid?: number;
          uptime?: number;
          configPath?: string;
          error?: string;
        }) => {
          console.log('Server status response:', response);
          
          if (response.success) {
            clearTimeout(timeoutId);
            setIsLoadingServerStatus(false);
            
            const status: ServerStatus = {
              running: !!response.running,
              pid: response.pid,
              uptime: response.uptime,
              configPath: response.configPath
            };
            
            console.log('Setting server status:', status);
            setServerStatus(status);
            resolve(status);
          } else if (retryCount < maxRetries) {
            // Retry on failure
            retryCount++;
            console.log(`Server status request failed, retrying (${retryCount}/${maxRetries})...`);
            setTimeout(attemptFetchStatus, 1000);
          } else {
            // Give up after max retries
            clearTimeout(timeoutId);
            setIsLoadingServerStatus(false);
            console.error('Failed to get server status after retries:', response.error);
            reject(new Error(response.error || 'Failed to get server status'));
          }
        });
      };
      
      // Start the first attempt
      attemptFetchStatus();
    });
  }, [socket, connectionState.connected]);
  
  const startServer = useCallback((): Promise<ServerCommandResult> => {
    return new Promise((resolve, reject) => {
      if (!socket || !connectionState.connected) {
        reject(new Error('Socket not connected'));
        return;
      }
      
      const timeoutId = setTimeout(() => {
        reject(new Error('Server start request timed out'));
      }, 30000);
      
      socket.emit('server_start', (response: {
        success: boolean;
        message?: string;
        running?: boolean;
        pid?: number;
        error?: string;
      }) => {
        clearTimeout(timeoutId);
        
        if (response.success) {
          // Update server status if available
          if (response.running !== undefined) {
            setServerStatus(prev => {
              if (!prev) return {
                running: !!response.running,
                pid: response.pid
              };
              return {
                ...prev,
                running: !!response.running,
                pid: response.pid
              };
            });
          }
          
          resolve({
            success: true,
            message: response.message || 'Server started successfully'
          });
        } else {
          reject(new Error(response.error || response.message || 'Failed to start server'));
        }
      });
    });
  }, [socket, connectionState.connected]);
  
  const stopServer = useCallback((): Promise<ServerCommandResult> => {
    return new Promise((resolve, reject) => {
      if (!socket || !connectionState.connected) {
        reject(new Error('Socket not connected'));
        return;
      }
      
      const timeoutId = setTimeout(() => {
        reject(new Error('Server stop request timed out'));
      }, 30000);
      
      socket.emit('server_stop', (response: {
        success: boolean;
        message?: string;
        running?: boolean;
        error?: string;
      }) => {
        clearTimeout(timeoutId);
        
        if (response.success) {
          // Update server status if available
          if (response.running !== undefined) {
            setServerStatus(prev => {
              if (!prev) return {
                running: !!response.running
              };
              return {
                ...prev,
                running: !!response.running,
                pid: undefined,
                uptime: undefined
              };
            });
          }
          
          resolve({
            success: true,
            message: response.message || 'Server stopped successfully'
          });
        } else {
          reject(new Error(response.error || response.message || 'Failed to stop server'));
        }
      });
    });
  }, [socket, connectionState.connected]);
  
  const sendServerCommand = useCallback((command: string): Promise<ServerCommandResult> => {
    return new Promise((resolve, reject) => {
      if (!socket || !connectionState.connected) {
        console.error('Cannot send command: Socket not connected');
        reject(new Error('Socket not connected'));
        return;
      }
      
      if (!command || typeof command !== 'string') {
        console.error('Cannot send command: Invalid command format');
        reject(new Error('Invalid command'));
        return;
      }
      
      // Check server status before sending command
      if (!serverStatus?.running) {
        console.warn('Attempting to send command but serverStatus.running is false:', serverStatus);
        
        // Force refresh server status before rejecting
        fetchServerStatus()
          .then(updatedStatus => {
            console.log('Updated server status before command:', updatedStatus);
            
            if (!updatedStatus.running) {
              reject(new Error('Server is not running'));
              return;
            }
            
            // If server is actually running after refresh, continue with command
            sendCommandToServer(command, resolve, reject);
          })
          .catch(error => {
            console.error('Failed to refresh server status:', error);
            reject(new Error('Failed to verify server status'));
          });
        return;
      }
      
      // If server status is already confirmed as running, send command directly
      sendCommandToServer(command, resolve, reject);
    });
  }, [socket, connectionState.connected, serverStatus, fetchServerStatus]);
  
  // Helper function to actually send the command to the server
  const sendCommandToServer = useCallback((command: string, resolve: (result: ServerCommandResult) => void, reject: (error: Error) => void) => {
    if (!socket) {
      reject(new Error('Socket not available'));
      return;
    }
    
    console.log('Sending server command:', command); // Debug log
    
    const timeoutId = setTimeout(() => {
      reject(new Error('Server command request timed out'));
    }, 10000);
    
    socket.emit('server_command', command, (response: {
      success: boolean;
      message?: string;
      error?: string;
    }) => {
      clearTimeout(timeoutId);
      
      console.log('Server command response:', response); // Debug log
      
      if (response.success) {
        resolve({
          success: true,
          message: response.message || 'Command sent successfully'
        });
      } else {
        reject(new Error(response.error || response.message || 'Failed to send command'));
      }
    });
  }, [socket]);

  // Log functions
  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);
  
  const handleLogData = useCallback((data: LogData) => {
    if (!data || !data.logs) return;
    
    // Process log data to ensure complete lines and filter out command execution messages
    const processedLogs = data.logs
      .filter(Boolean)
      .filter(log => {
        // Filter out command execution messages
        const lowerLog = log.toLowerCase();
        return !(
          lowerLog.includes('executing:') || 
          lowerLog.includes('command sent to server') ||
          lowerLog.includes('command executed successfully')
        );
      })
      .map(log => {
        // Clean up log entries to ensure consistent formatting
        const trimmedLog = log.trim();
        return trimmedLog;
      });
    
    // Only update if we have logs to add
    if (processedLogs.length === 0) return;
    
    setLogs(prevLogs => {
      if (data.type === 'initial') {
        // Replace logs with initial data
        console.log(`Replacing logs with ${processedLogs.length} initial entries`);
        return processedLogs;
      }
      
      // For incremental updates, only add new logs
      console.log(`Adding ${processedLogs.length} new log entries`);
      
      // Add new logs while respecting the max limit
      const newLogs = [...prevLogs, ...processedLogs];
      return newLogs.slice(-maxLogLines);
    });
  }, []);
  
  const subscribeToLogs = useCallback((options: { initialLines?: number; fullHistory?: boolean; realtime?: boolean } = {}): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (!socket || !connectionState.connected) {
        reject(new Error('Socket not connected'));
        return;
      }
      
      // Clean up any existing subscription first
      if (isSubscribedToLogs && socket) {
        socket.off('log_data');
        socket.emit('unsubscribe_logs');
        setIsSubscribedToLogs(false);
      }
      
      setIsLoadingLogs(true);
      
      // Set up event listener for log data
      socket.on('log_data', handleLogData);
      
      // Set a shorter timeout for more responsive feedback
      const timeoutId = setTimeout(() => {
        setIsLoadingLogs(false);
        socket.off('log_data');
        reject(new Error('Log subscription request timed out'));
      }, 5000); // 5 seconds timeout instead of default
      
      // Always enable realtime option for better responsiveness
      const subscribeOptions = {
        initialLines: options.initialLines || 50,
        fullHistory: options.fullHistory || false,
        realtime: true // Always use realtime mode
      };
      
      // Subscribe to logs with real-time option
      socket.emit('subscribe_logs', subscribeOptions, (response: {
        success: boolean;
        message?: string;
        error?: string;
      }) => {
        clearTimeout(timeoutId);
        setIsLoadingLogs(false);
        
        if (response.success) {
          setIsSubscribedToLogs(true);
          resolve();
        } else {
          socket.off('log_data');
          setIsSubscribedToLogs(false);
          reject(new Error(response.error || response.message || 'Failed to subscribe to logs'));
        }
      });
    });
  }, [socket, connectionState.connected, handleLogData, isSubscribedToLogs]);
  
  // Restore the unsubscribeFromLogs function
  const unsubscribeFromLogs = useCallback(() => {
    if (socket) {
      socket.off('log_data');
      socket.emit('unsubscribe_logs');
      setIsSubscribedToLogs(false);
    }
  }, [socket]);
  
  // Effect to check server status when socket connects
  useEffect(() => {
    if (socket && connectionState.connected) {
      console.log('Socket connected, fetching server status');
      fetchServerStatus()
        .then(status => {
          console.log('Initial server status:', status);
        })
        .catch(error => {
          console.error('Error fetching server status:', error);
        });
    }
  }, [socket, connectionState.connected, fetchServerStatus]);

  // Clean up logs subscription on unmount
  useEffect(() => {
    return () => {
      unsubscribeFromLogs();
    };
  }, [unsubscribeFromLogs]);

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
    connectionState,
    // Server management
    serverStatus,
    isLoadingServerStatus,
    fetchServerStatus,
    startServer,
    stopServer,
    sendServerCommand,
    // Logs
    logs,
    isSubscribedToLogs,
    isLoadingLogs,
    subscribeToLogs,
    unsubscribeFromLogs,
    clearLogs
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
}

// Custom hook to use the socket context
export const useSocket = () => useContext(SocketContext); 