import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import type { Socket } from 'socket.io-client';
import { io } from 'socket.io-client';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  error: string | null;
  executeCommand: (command: string) => Promise<{ output: string; error?: string }>;
}

const SocketContext = createContext<SocketContextType | null>(null);

export function SocketProvider({ children }: { children: ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Get credentials from sessionStorage
    const storedCredentials = sessionStorage.getItem('credentials');
    if (!storedCredentials) {
      setError('No credentials found');
      return;
    }

    try {
      const credentials = JSON.parse(storedCredentials);
      
      // Create socket connection with auth
      const newSocket = io({
        auth: credentials,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000
      });

      newSocket.on('connect', () => {
        console.log('Socket connection established');
        setIsConnected(true);
        setError(null);
      });

      newSocket.on('connect_error', (error) => {
        console.error('Socket connection error:', error.message);
        setIsConnected(false);
        setError(error.message);
      });

      newSocket.on('disconnect', () => {
        console.log('Socket disconnected');
        setIsConnected(false);
      });

      setSocket(newSocket);

      // Cleanup on unmount
      return () => {
        newSocket.disconnect();
      };
    } catch (err) {
      console.error('Error connecting to socket:', err);
      setError('Failed to establish socket connection');
    }
  }, []); // Empty dependency array means this only runs once on mount

  const executeCommand = useCallback((command: string): Promise<{ output: string; error?: string }> => {
    return new Promise((resolve, reject) => {
      if (!socket || !isConnected) {
        reject(new Error('Socket not connected'));
        return;
      }

      socket.emit('execute_command', command, (response: { success: boolean; output: string; error?: string }) => {
        if (response.success) {
          resolve({ output: response.output });
        } else {
          reject(new Error(response.error || 'Unknown error'));
        }
      });
    });
  }, [socket, isConnected]);

  const value: SocketContextType = {
    socket,
    isConnected,
    error,
    executeCommand
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
} 