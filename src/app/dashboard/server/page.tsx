'use client';

import { useState, useEffect, useRef } from 'react';
import { useSocket } from '@/contexts/SocketContext';
import { toast } from 'react-hot-toast';



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
  const terminalRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of terminal when new entries are added
  useEffect(() => {
    if (terminalRef.current && activeTab === 'terminal') {
      terminalRef.current.scrollIntoView({ behavior: 'smooth' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]); // We only need to depend on activeTab, the ref will scroll when logs update

  // Subscribe to logs when component mounts or when tab changes to terminal
  useEffect(() => {
    if (activeTab === 'terminal' && !isSubscribedToLogs) {
      subscribeToLogs({ initialLines: 100 })
        .catch((error: unknown) => {
          console.error('Failed to subscribe to logs:', error);
          const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
          toast.error(`Error subscribing to logs: ${errorMessage}`);
        });
    }
    
    // Clean up subscription when component unmounts
    return () => {
      if (isSubscribedToLogs) {
        unsubscribeFromLogs();
      }
    };
  }, [activeTab, isSubscribedToLogs, subscribeToLogs, unsubscribeFromLogs]);

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
    } catch (error: unknown) {
      console.error('Failed to start server:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      toast.error(`Failed to start server: ${errorMessage}`);
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
    } catch (error: unknown) {
      console.error('Failed to stop server:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      toast.error(`Failed to stop server: ${errorMessage}`);
    } finally {
      setIsStoppingServer(false);
    }
  };

  const handleSendCommand = async () => {
    if (!command.trim()) return;
    
    setIsSendingCommand(true);
    try {
      await sendServerCommand(command);
      setCommand('');
    } catch (error: unknown) {
      console.error('Failed to send command:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      toast.error(`Failed to send command: ${errorMessage}`);
    } finally {
      setIsSendingCommand(false);
    }
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
      
      {/* Terminal Tab (Combined Logs and Console) */}
      {activeTab === 'terminal' && (
        <div className="bg-black/30 border border-amber-500/20 rounded-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-amber-300 font-mono">Terminal</h2>
            
            <div className="flex gap-2">
              <button
                type="button"
                className="px-3 py-1 bg-amber-500/20 text-amber-300 rounded-md hover:bg-amber-500/30 transition-colors font-mono text-xs flex items-center"
                onClick={() => {
                  unsubscribeFromLogs();
                  subscribeToLogs({ initialLines: 100 });
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
                onClick={clearLogs}
                disabled={isLoadingLogs}
              >
                Clear
              </button>
            </div>
          </div>
          
          {/* Terminal Display */}
          <div className="mb-4">
            {isLoadingLogs ? (
              <div className="flex justify-center items-center h-60">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-400 border-r-amber-400/30" />
              </div>
            ) : (
              <div className="relative">
                <div className="w-full h-60 bg-black/60 border border-amber-500/20 rounded p-3 font-mono text-xs text-amber-300 overflow-auto whitespace-pre">
                  {logs.length === 0 ? (
                    <div className="text-center py-10 text-amber-400/50">
                      No logs available
                    </div>
                  ) : (
                    <div>
                      {logs.map((log, index) => (
                        <div key={`log-${index}-${log.substring(0, 10)}`} className="leading-5">{log}</div>
                      ))}
                      <div ref={terminalRef} />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          
          {/* Command Input */}
          <div className="flex items-center gap-2">
            {!serverStatus?.running && (
              <div className="absolute -mt-12 ml-3 p-2 bg-red-900/80 border border-red-500/30 rounded text-red-400 text-xs z-10">
                <div className="flex items-start">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor" aria-labelledby="alert-icon">
                    <title id="alert-icon">Alert Icon</title>
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  Server not running
                </div>
              </div>
            )}
            
            <div className="flex-grow flex items-center bg-black/60 border border-amber-500/20 rounded px-2 py-1">
              <span className="text-amber-500 mr-2 font-mono text-sm">$</span>
              <input
                type="text"
                placeholder="Enter command..."
                value={command}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCommand(e.target.value)}
                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendCommand();
                  }
                }}
                disabled={isSendingCommand || !(serverStatus?.running ?? false)}
                className="flex-1 w-full bg-transparent border-none px-1 py-1 text-amber-300 placeholder-amber-400/30 focus:outline-none font-mono text-sm disabled:opacity-50"
              />
            </div>
            
            <button
              type="button"
              onClick={handleSendCommand}
              disabled={isSendingCommand || !command.trim() || !(serverStatus?.running ?? false)}
              className="px-4 py-2 bg-amber-500/20 text-amber-300 rounded hover:bg-amber-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSendingCommand ? (
                <div className="h-4 w-4 animate-spin rounded-full border-t-2 border-amber-400 border-r-2 border-amber-400/30" />
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-labelledby="send-icon">
                  <title id="send-icon">Send Icon</title>
                  <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                </svg>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
} 