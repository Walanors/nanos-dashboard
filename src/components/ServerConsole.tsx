'use client';

import { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { toast } from 'react-hot-toast';

// Helper function to get the authentication header from ServerStatus.tsx
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

export default function ServerConsole() {
  const [logs, setLogs] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [command, setCommand] = useState('');
  const [isServerRunning, setIsServerRunning] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(5000); // 5 seconds default
  const [logLines, setLogLines] = useState(100); // Default to 100 lines
  
  const logContainerRef = useRef<HTMLDivElement>(null);
  const logsRef = useRef(logs);
  
  // Update logs ref when logs state changes
  useEffect(() => {
    logsRef.current = logs;
  }, [logs]);
  
  // Auto-scroll to bottom of logs - using useLayoutEffect to ensure it runs before browser paint
  useLayoutEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);
  
  // Fetch server logs - using useCallback to use in useEffect dependencies
  const fetchLogs = useCallback(async () => {
    try {
      const response = await fetch(`/api/server/logs?lines=${logLines}`, {
        headers: {
          ...getAuthHeader()
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to fetch server logs');
      }
      
      const data = await response.json();
      if (data.success && data.logs) {
        setLogs(data.logs);
      }
    } catch (err) {
      const errorMessage = (err as Error).message;
      setError(errorMessage);
      toast.error(`Error: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  }, [logLines]);
  
  // Fetch server status to check if it's running - using useCallback
  const fetchStatus = useCallback(async () => {
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
      setIsServerRunning(data.running || false);
    } catch (err) {
      console.error('Error fetching server status:', err);
      setIsServerRunning(false);
    }
  }, []);
  
  // Send a command to the server
  const sendCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!command.trim()) {
      toast.error('Please enter a command');
      return;
    }
    
    try {
      const response = await fetch('/api/server/command', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader()
        },
        body: JSON.stringify({ command: command.trim() })
      });
      
      const data = await response.json();
      
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to send command');
      }
      
      toast.success(data.message || 'Command sent');
      setCommand('');
      
      // Fetch logs after a short delay to show command result
      setTimeout(fetchLogs, 1000);
    } catch (err) {
      const errorMessage = (err as Error).message;
      toast.error(`Error: ${errorMessage}`);
    }
  };
  
  // Initial fetch and set up auto-refresh
  useEffect(() => {
    fetchStatus();
    fetchLogs();
    
    // Set up auto-refresh interval if enabled
    let intervalId: NodeJS.Timeout | null = null;
    
    if (autoRefresh) {
      intervalId = setInterval(() => {
        fetchLogs();
        fetchStatus();
      }, refreshInterval);
    }
    
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [autoRefresh, refreshInterval, fetchLogs, fetchStatus]);
  
  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-amber-300 font-mono">Server Console</h2>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <input 
              type="checkbox" 
              id="auto-refresh" 
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded bg-black/50 border-amber-500/40 text-amber-500 focus:ring-amber-500"
            />
            <label htmlFor="auto-refresh" className="text-sm text-amber-300">Auto-refresh</label>
          </div>
          <select
            value={refreshInterval}
            onChange={(e) => setRefreshInterval(Number(e.target.value))}
            className="bg-black/50 border-amber-500/40 text-amber-300 rounded px-2 py-1 text-sm"
          >
            <option value="2000">2 seconds</option>
            <option value="5000">5 seconds</option>
            <option value="10000">10 seconds</option>
            <option value="30000">30 seconds</option>
          </select>
          <button
            type="button"
            onClick={fetchLogs}
            disabled={isLoading}
            className="px-3 py-1 bg-amber-500/30 text-amber-300 rounded hover:bg-amber-500/40 transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>
      
      <div className="flex items-center space-x-4 text-sm">
        <label htmlFor="log-lines" className="text-amber-300">Lines:</label>
        <select
          id="log-lines"
          value={logLines}
          onChange={(e) => setLogLines(Number(e.target.value))}
          className="bg-black/50 border-amber-500/40 text-amber-300 rounded px-2 py-1"
        >
          <option value="50">50</option>
          <option value="100">100</option>
          <option value="200">200</option>
          <option value="500">500</option>
          <option value="1000">1000</option>
        </select>
        <div className={`px-2 py-1 rounded-full text-xs font-medium ${
          isServerRunning 
            ? 'bg-green-500/20 text-green-300 border border-green-500/40' 
            : 'bg-red-500/20 text-red-300 border border-red-500/40'
        }`}>
          Server: {isServerRunning ? 'Running' : 'Stopped'}
        </div>
      </div>
      
      {error && (
        <div className="p-4 bg-red-500/20 border border-red-500/40 rounded text-red-200">
          {error}
        </div>
      )}
      
      <div className="bg-black/30 border border-amber-500/20 rounded-lg overflow-hidden">
        <div 
          ref={logContainerRef}
          className="h-[400px] overflow-y-auto p-4 font-mono text-sm text-green-300"
        >
          {isLoading ? (
            <div className="animate-pulse">Loading logs...</div>
          ) : logs.length > 0 ? (
            logs.map((line, index) => (
              <div key={`log-${index}-${line.substring(0, 10)}`} className="whitespace-pre-wrap break-all">
                {line || ' '}
              </div>
            ))
          ) : (
            <div className="text-amber-500">No logs available</div>
          )}
        </div>
        
        <div className="p-2 border-t border-amber-500/20">
          <form onSubmit={sendCommand} className="flex">
            <input
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              disabled={!isServerRunning}
              placeholder={isServerRunning ? "Enter command..." : "Server is not running"}
              className="flex-1 bg-black/50 border border-amber-500/40 text-amber-300 rounded-l px-3 py-2 focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!isServerRunning || !command.trim()}
              className="bg-amber-500/30 text-amber-300 px-4 py-2 rounded-r hover:bg-amber-500/40 transition-colors disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </div>
      </div>
      
      <div className="text-xs text-gray-400">
        Note: The console may not display real-time updates if the server wasn't started in an interactive mode.
      </div>
    </div>
  );
} 