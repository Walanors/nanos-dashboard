'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSocket } from '@/contexts/SocketContext';
import { toast } from 'react-hot-toast';
import {
  Terminal,
  TerminalInputBox,
  TerminalOutput,
  TerminalTitleBar,
  TerminalLoader
} from '@envoy1084/react-terminal';
import type { ReactNode } from 'react';

// Define error type to replace 'any'
interface ErrorWithMessage {
  message?: string;
}

export default function ServerPage() {
  const { 
    serverStatus,
    isLoadingServerStatus,
    fetchServerStatus,
    startServer,
    stopServer,
    sendServerCommand,
    logs,
    isSubscribedToLogs,
    isLoadingLogs,
    subscribeToLogs,
    unsubscribeFromLogs,
    clearLogs
  } = useSocket();
  
  const [command, setCommand] = useState('');
  const [isStartingServer, setIsStartingServer] = useState(false);
  const [isStoppingServer, setIsStoppingServer] = useState(false);
  const [isSendingCommand, setIsSendingCommand] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [terminalLogs, setTerminalLogs] = useState<ReactNode[]>([]);
  const terminalRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of terminal when new entries are added
  useEffect(() => {
    if (terminalRef.current && activeTab === 'terminal') {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [activeTab]); // Only depend on activeTab change

  // Subscribe to logs when component mounts or when tab changes to terminal
  useEffect(() => {
    if (activeTab === 'terminal' && !isSubscribedToLogs) {
      subscribeToLogs({ initialLines: 100 })
        .catch((error: unknown) => {
          console.error('Failed to subscribe to logs:', error);
          const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
          toast.error(`Error subscribing to logs: ${errorMessage}`);
          
          // Add error to terminal logs
          addToTerminalLogs(`Error subscribing to logs: ${errorMessage}`, 'error');
        });
    }
    
    // Clean up subscription when component unmounts
    return () => {
      if (isSubscribedToLogs) {
        unsubscribeFromLogs();
      }
    };
  }, [activeTab, isSubscribedToLogs, subscribeToLogs, unsubscribeFromLogs]);

  // Update terminal logs when server logs change
  useEffect(() => {
    const newTerminalLogs = logs.map((log) => (
      <TerminalOutput key={`log-${log.substring(0, 10)}-${Math.random().toString(36).substring(2, 7)}`}>
        <span className="text-amber-300">{log}</span>
      </TerminalOutput>
    ));
    
    setTerminalLogs(newTerminalLogs);
  }, [logs]);

  // Refresh server status periodically
  useEffect(() => {
    const fetchStatus = () => {
      fetchServerStatus().catch((error: unknown) => {
        console.error('Error fetching server status:', error);
      });
    };

    // Initial fetch
    fetchStatus();
    
    // Set up interval for periodic updates
    const intervalId = setInterval(fetchStatus, 10000);
    
    // Clean up interval on unmount
    return () => clearInterval(intervalId);
  }, [fetchServerStatus]);

  const handleStartServer = async () => {
    setIsStartingServer(true);
    try {
      await startServer();
      toast.success('Server started successfully');
      await fetchServerStatus();
      
      // Add to terminal logs
      addToTerminalLogs('Server started successfully', 'success');
    } catch (error: unknown) {
      console.error('Failed to start server:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      toast.error(`Failed to start server: ${errorMessage}`);
      
      // Add to terminal logs
      addToTerminalLogs(`Failed to start server: ${errorMessage}`, 'error');
    } finally {
      setIsStartingServer(false);
    }
  };

  const handleStopServer = async () => {
    setIsStoppingServer(true);
    try {
      await stopServer();
      toast.success('Server stopped successfully');
      await fetchServerStatus();
      
      // Add to terminal logs
      addToTerminalLogs('Server stopped successfully', 'success');
    } catch (error: unknown) {
      console.error('Failed to stop server:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      toast.error(`Failed to stop server: ${errorMessage}`);
      
      // Add to terminal logs
      addToTerminalLogs(`Failed to stop server: ${errorMessage}`, 'error');
    } finally {
      setIsStoppingServer(false);
    }
  };

  // Modified to handle form events from the terminal
  const handleTerminalInput = useCallback((event: React.FormEvent<HTMLDivElement>) => {
    // Extract the command from the input element
    const inputElement = event.currentTarget.querySelector('textarea');
    if (!inputElement) return;
    
    const cmd = inputElement.value.trim();
    if (!cmd) return;
    
    // Clear the input
    inputElement.value = '';
    
    // Process the command
    handleSendCommand(cmd);
  }, []);

  const handleSendCommand = async (cmd: string) => {
    if (!cmd.trim()) return;
    
    // Add command to history
    setCommandHistory(prev => [...prev, cmd]);
    
    // Add command to terminal logs
    addToTerminalLogs(`> ${cmd}`, 'command');
    
    setIsSendingCommand(true);
    try {
      await sendServerCommand(cmd);
      setCommand('');
    } catch (error: unknown) {
      console.error('Failed to send command:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      toast.error(`Failed to send command: ${errorMessage}`);
      
      // Add error to terminal logs
      addToTerminalLogs(`Failed to send command: ${errorMessage}`, 'error');
    } finally {
      setIsSendingCommand(false);
    }
  };

  const addToTerminalLogs = (message: string, type: 'info' | 'error' | 'success' | 'command') => {
    const timestamp = new Date().toLocaleTimeString();
    let className = 'text-amber-300'; // default
    
    if (type === 'error') className = 'text-red-400';
    if (type === 'success') className = 'text-green-400';
    if (type === 'command') className = 'text-amber-500 font-bold';
    
    setTerminalLogs(prev => [
      ...prev,
      <TerminalOutput key={`terminal-${timestamp}-${Math.random().toString(36).substring(2, 7)}`}>
        <span className="text-gray-500">[{timestamp}]</span> <span className={className}>{message}</span>
      </TerminalOutput>
    ]);
  };

  const handleClearTerminal = () => {
    clearLogs();
    setTerminalLogs([]);
  };

  const formatUptime = (seconds?: number): string => {
    if (seconds === undefined) return 'N/A';
    
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (remainingSeconds > 0 || parts.length === 0) parts.push(`${remainingSeconds}s`);
    
    return parts.join(' ');
  };

  return (
    <div className="container p-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-amber-300 font-mono">Server Management</h1>
        
        <div className="flex items-center gap-2">
          {isLoadingServerStatus ? (
            <div className="px-2 py-1 bg-zinc-800/80 border border-amber-500/20 rounded-md text-xs text-amber-300 flex items-center gap-1">
              <div className="h-3 w-3 animate-spin rounded-full border-t-2 border-amber-400 border-r-2 border-amber-400/30" />
              <span>Checking status...</span>
            </div>
          ) : serverStatus?.running ? (
            <div className="px-2 py-1 bg-green-900/20 border border-green-500/30 rounded-md text-xs text-green-400">Running</div>
          ) : (
            <div className="px-2 py-1 bg-red-900/20 border border-red-500/30 rounded-md text-xs text-red-400">Stopped</div>
          )}
          
          <button
            type="button"
            className="px-3 py-1 bg-amber-500/20 text-amber-300 rounded-md hover:bg-amber-500/30 transition-colors font-mono text-xs flex items-center"
            onClick={() => fetchServerStatus()}
            disabled={isLoadingServerStatus}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" viewBox="0 0 20 20" fill="currentColor" aria-labelledby="refresh-icon">
              <title id="refresh-icon">Refresh Icon</title>
              <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
            </svg>
            Refresh
          </button>
        </div>
      </div>
      
      {/* Tabs */}
      <div className="border-b border-amber-500/20 mb-6">
        <div className="flex space-x-4">
          {['overview', 'terminal'].map((tab) => (
            <button
              type="button"
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-2 px-4 font-mono text-sm transition-colors ${
                activeTab === tab 
                  ? 'text-amber-300 border-b-2 border-amber-500' 
                  : 'text-amber-400/70 hover:text-amber-300'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>
      
      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="bg-black/30 border border-amber-500/20 rounded-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-amber-300 font-mono">Server Status</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <p className="text-sm font-mono text-amber-400/70 mb-1">Status</p>
              <p className="text-lg font-bold">
                {isLoadingServerStatus ? (
                  <span className="flex items-center text-amber-300">
                    <div className="h-4 w-4 animate-spin rounded-full border-t-2 border-amber-400 border-r-2 border-amber-400/30 mr-2" />
                    Checking...
                  </span>
                ) : serverStatus?.running ? (
                  <span className="text-green-500">Running</span>
                ) : (
                  <span className="text-red-500">Stopped</span>
                )}
              </p>
            </div>
            
            <div>
              <p className="text-sm font-mono text-amber-400/70 mb-1">Process ID</p>
              <p className="text-lg font-bold text-amber-300">
                {serverStatus?.pid || 'N/A'}
              </p>
            </div>
            
            <div>
              <p className="text-sm font-mono text-amber-400/70 mb-1">Uptime</p>
              <p className="text-lg font-bold text-amber-300">
                {serverStatus?.running ? formatUptime(serverStatus.uptime) : 'N/A'}
              </p>
            </div>
            
            <div>
              <p className="text-sm font-mono text-amber-400/70 mb-1">Config Path</p>
              <p className="text-lg font-bold truncate max-w-xs text-amber-300" title={serverStatus?.configPath}>
                {serverStatus?.configPath || 'N/A'}
              </p>
            </div>
          </div>
          
          <div className="flex gap-4 pt-4 border-t border-amber-500/10">
            <button
              type="button"
              onClick={handleStartServer}
              disabled={isStartingServer || isStoppingServer || (serverStatus?.running ?? false)}
              className="flex-1 py-2 px-4 bg-amber-500/20 text-amber-300 rounded hover:bg-amber-500/30 transition-colors font-mono text-sm flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isStartingServer && (
                <div className="h-4 w-4 animate-spin rounded-full border-t-2 border-amber-400 border-r-2 border-amber-400/30 mr-2" />
              )}
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" viewBox="0 0 20 20" fill="currentColor" aria-labelledby="play-icon">
                <title id="play-icon">Play Icon</title>
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
              </svg>
              Start Server
            </button>
            
            <button
              type="button"
              onClick={handleStopServer}
              disabled={isStartingServer || isStoppingServer || !(serverStatus?.running ?? false)}
              className="flex-1 py-2 px-4 bg-red-900/20 text-red-400 border border-red-500/20 rounded hover:bg-red-900/30 transition-colors font-mono text-sm flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isStoppingServer && (
                <div className="h-4 w-4 animate-spin rounded-full border-t-2 border-red-400 border-r-2 border-red-400/30 mr-2" />
              )}
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" viewBox="0 0 20 20" fill="currentColor" aria-labelledby="stop-icon">
                <title id="stop-icon">Stop Icon</title>
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
              </svg>
              Stop Server
            </button>
          </div>
        </div>
      )}
      
      {/* Terminal Tab (Combined Console and Logs) */}
      {activeTab === 'terminal' && (
        <div className="bg-black/30 border border-amber-500/20 rounded-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-amber-300 font-mono">Server Terminal</h2>
            
            <div className="flex gap-2">
              <button
                type="button"
                className="px-3 py-1 bg-amber-500/20 text-amber-300 rounded-md hover:bg-amber-500/30 transition-colors font-mono text-xs flex items-center"
                onClick={() => {
                  unsubscribeFromLogs();
                  subscribeToLogs({ initialLines: 100 });
                  addToTerminalLogs('Refreshed logs', 'info');
                }}
                disabled={isLoadingLogs}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" viewBox="0 0 20 20" fill="currentColor" aria-labelledby="refresh-icon">
                  <title id="refresh-icon">Refresh Icon</title>
                  <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                </svg>
                Refresh
              </button>
              
              <button
                type="button"
                className="px-3 py-1 bg-zinc-800/80 text-amber-300 rounded-md hover:bg-zinc-800 transition-colors font-mono text-xs"
                onClick={handleClearTerminal}
                disabled={isLoadingLogs}
              >
                Clear
              </button>
            </div>
          </div>
          
          {isLoadingLogs && terminalLogs.length === 0 ? (
            <div className="flex justify-center items-center h-60">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-400 border-r-amber-400/30" />
            </div>
          ) : (
            <div className="relative" ref={terminalRef}>
              <Terminal className="bg-black/60 border border-amber-500/20 rounded p-3 font-mono text-xs text-amber-300 h-[400px] overflow-auto">
                <TerminalTitleBar>
                  <TerminalTitleBar.ActionGroup />
                  <TerminalTitleBar.Title>Nanos Server Terminal</TerminalTitleBar.Title>
                </TerminalTitleBar>
                
                {terminalLogs.length === 0 ? (
                  <TerminalOutput>
                    <span className="text-amber-400/50">No logs available</span>
                  </TerminalOutput>
                ) : (
                  terminalLogs
                )}
                
                {isSendingCommand && <TerminalLoader />}
                
                {serverStatus?.running ? (
                  <TerminalInputBox onSubmit={handleTerminalInput}>
                    <TerminalInputBox.Prompt>server&gt;</TerminalInputBox.Prompt>
                    <TerminalInputBox.TextArea disabled={!serverStatus?.running} />
                  </TerminalInputBox>
                ) : (
                  <div className="text-red-400 text-xs mt-2 p-2 border border-red-500/20 bg-red-900/10 rounded">
                    Server is not running. Start the server to send commands.
                  </div>
                )}
              </Terminal>
            </div>
          )}
          
          {!serverStatus?.running && (
            <div className="mt-4 p-3 bg-red-900/20 border border-red-500/30 rounded text-red-400 text-sm">
              <div className="flex items-start">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 mt-0.5" viewBox="0 0 20 20" fill="currentColor" aria-labelledby="alert-icon">
                  <title id="alert-icon">Alert Icon</title>
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <div>
                  <div className="font-semibold">Server not running</div>
                  <p className="text-xs mt-1">Start the server to send commands</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
} 