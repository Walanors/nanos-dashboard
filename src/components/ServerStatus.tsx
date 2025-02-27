'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import { NANOS_INSTALL_DIR } from './NanosOnboarding';

// Helper function to get the authentication header, copied from ServerConfiguration
const getAuthHeader = (): Record<string, string> => {
  // Try multiple sources for authentication credentials
  
  // 1. First try sessionStorage (where socket connection stores them)
  const storedCredentials = sessionStorage.getItem('credentials');
  if (storedCredentials) {
    return {
      Authorization: `Basic ${storedCredentials}`
    };
  }
  
  // 2. Try localStorage
  const username = localStorage.getItem('username');
  const password = localStorage.getItem('password');
  if (username && password) {
    const base64Credentials = btoa(`${username}:${password}`);
    // Also save to sessionStorage for future use
    sessionStorage.setItem('credentials', base64Credentials);
    return {
      Authorization: `Basic ${base64Credentials}`
    };
  }
  
  // 3. Last resort - try to use 'admin:admin' (common default)
  console.warn('No credentials found, using fallback admin:admin');
  const fallbackCredentials = btoa('admin:admin');
  return {
    Authorization: `Basic ${fallbackCredentials}`
  };
};

// Server status interface
interface ServerStatus {
  running: boolean;
  pid?: number;
  uptime?: number;
  configPath?: string;
}

export default function ServerStatusControl() {
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Format uptime as readable string
  const formatUptime = (seconds?: number): string => {
    if (!seconds) return 'Unknown';
    
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (remainingSeconds > 0 || parts.length === 0) parts.push(`${remainingSeconds}s`);
    
    return parts.join(' ');
  };
  
  // Fetch server status
  const fetchStatus = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/server/status', {
        headers: {
          ...getAuthHeader()
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to fetch server status');
      }
      
      const data = await response.json();
      setStatus(data);
    } catch (err) {
      const errorMessage = (err as Error).message;
      setError(errorMessage);
      toast.error(`Error: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  }, []);
  
  // Start the server
  const startServer = async () => {
    setActionInProgress(true);
    setError(null);
    
    try {
      const response = await fetch('/api/server/start', {
        method: 'POST',
        headers: {
          ...getAuthHeader()
        }
      });
      
      const data = await response.json();
      
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to start server');
      }
      
      toast.success(data.message || 'Server starting...');
      
      // Fetch updated status after a brief delay to allow server to start
      setTimeout(fetchStatus, 2000);
    } catch (err) {
      const errorMessage = (err as Error).message;
      setError(errorMessage);
      toast.error(`Error: ${errorMessage}`);
    } finally {
      setActionInProgress(false);
    }
  };
  
  // Stop the server
  const stopServer = async () => {
    setActionInProgress(true);
    setError(null);
    
    try {
      const response = await fetch('/api/server/stop', {
        method: 'POST',
        headers: {
          ...getAuthHeader()
        }
      });
      
      const data = await response.json();
      
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to stop server');
      }
      
      toast.success(data.message || 'Server stopped');
      
      // Fetch updated status after a brief delay
      setTimeout(fetchStatus, 2000);
    } catch (err) {
      const errorMessage = (err as Error).message;
      setError(errorMessage);
      toast.error(`Error: ${errorMessage}`);
    } finally {
      setActionInProgress(false);
    }
  };
  
  // Fetch status on component mount and set up refresh interval
  useEffect(() => {
    fetchStatus();
    
    // Refresh status every 10 seconds
    const intervalId = setInterval(fetchStatus, 10000);
    
    return () => clearInterval(intervalId);
  }, [fetchStatus]);
  
  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-amber-300 font-mono">Server Status</h2>
        <button
          type="button"
          onClick={fetchStatus}
          disabled={isLoading}
          className="px-3 py-1 bg-amber-500/30 text-amber-300 rounded hover:bg-amber-500/40 transition-colors disabled:opacity-50"
        >
          {isLoading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>
      
      {error && (
        <div className="p-4 bg-red-500/20 border border-red-500/40 rounded text-red-200">
          {error}
        </div>
      )}
      
      <div className="bg-black/30 border border-amber-500/20 rounded-lg p-5">
        {isLoading ? (
          <div className="animate-pulse text-amber-300">Loading server status...</div>
        ) : status ? (
          <div className="space-y-4">
            <div className="flex items-center space-x-4">
              <div className="font-mono text-gray-300">Status:</div>
              <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                status.running 
                  ? 'bg-green-500/20 text-green-300 border border-green-500/40' 
                  : 'bg-red-500/20 text-red-300 border border-red-500/40'
              }`}>
                {status.running ? 'Running' : 'Stopped'}
              </div>
            </div>
            
            {status.running && status.pid && (
              <div className="flex items-center space-x-4">
                <div className="font-mono text-gray-300">PID:</div>
                <div className="text-amber-300">{status.pid}</div>
              </div>
            )}
            
            {status.running && status.uptime !== undefined && (
              <div className="flex items-center space-x-4">
                <div className="font-mono text-gray-300">Uptime:</div>
                <div className="text-amber-300">{formatUptime(status.uptime)}</div>
              </div>
            )}
            
            {status.configPath && (
              <div className="flex items-center space-x-4">
                <div className="font-mono text-gray-300">Config:</div>
                <div className="text-amber-300 text-sm">{status.configPath}</div>
              </div>
            )}
            
            <div className="flex space-x-4 pt-4">
              <button
                type="button"
                onClick={startServer}
                disabled={status.running || actionInProgress}
                className="px-4 py-2 bg-green-500/30 text-green-300 rounded hover:bg-green-500/40 transition-colors disabled:opacity-50"
              >
                Start Server
              </button>
              
              <button
                type="button"
                onClick={stopServer}
                disabled={!status.running || actionInProgress}
                className="px-4 py-2 bg-red-500/30 text-red-300 rounded hover:bg-red-500/40 transition-colors disabled:opacity-50"
              >
                Stop Server
              </button>
            </div>
          </div>
        ) : (
          <div className="text-red-300">Failed to load server status</div>
        )}
      </div>
    </div>
  );
} 