'use client';

import { useState, useEffect, useRef } from 'react';
import { useSocket } from '@/contexts/SocketContext';
import { toast } from 'react-hot-toast';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import 'xterm/css/xterm.css';

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
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const commandHistoryRef = useRef<string[]>([]);
  const commandIndexRef = useRef(-1);
  const [terminalReady, setTerminalReady] = useState(false);
  const logsLengthRef = useRef(logs.length);

  // Initialize xterm.js terminal
  useEffect(() => {
    if (!terminalRef.current || xtermRef.current) return;

    // Create terminal instance
    const terminal = new Terminal({
      cursorBlink: true,
      theme: {
        background: '#000000',
        foreground: '#f0c674',
        cursor: '#f0c674',
        selectionBackground: '#f0c67444',
        black: '#1d1f21',
        red: '#cc6666',
        green: '#b5bd68',
        yellow: '#f0c674',
        blue: '#81a2be',
        magenta: '#b294bb',
        cyan: '#8abeb7',
        white: '#c5c8c6',
      },
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      fontSize: 14,
      lineHeight: 1.2,
      convertEol: true,
      scrollback: 1000,
    });

    // Create fit addon to resize terminal to container
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    
    // Add web links addon to make URLs clickable
    terminal.loadAddon(new WebLinksAddon());

    // Open terminal in the container
    terminal.open(terminalRef.current);
    fitAddon.fit();

    // Store references
    xtermRef.current = terminal;
    fitAddonRef.current = fitAddon;
    
    // Write welcome message
    terminal.writeln('\x1b[33m=== Nanos World Server Terminal ===\x1b[0m');
    terminal.writeln('Type commands and press Enter to send them to the server.');
    terminal.writeln('');
    
    // Set up command input handling
    let currentCommand = '';
    
    terminal.onKey(({ key, domEvent }) => {
      const printable = !domEvent.altKey && !domEvent.ctrlKey && !domEvent.metaKey;
      
      // Handle Enter key
      if (domEvent.key === 'Enter') {
        if (currentCommand.trim()) {
          // Add command to history
          commandHistoryRef.current.push(currentCommand);
          commandIndexRef.current = commandHistoryRef.current.length;
          
          // Execute command
          terminal.writeln('');
          handleTerminalCommand(currentCommand);
          currentCommand = '';
        } else {
          // Just add a new line for empty command
          terminal.writeln('');
          terminal.write('\x1b[33m$ \x1b[0m');
        }
      }
      // Handle Backspace
      else if (domEvent.key === 'Backspace') {
        if (currentCommand.length > 0) {
          currentCommand = currentCommand.slice(0, -1);
          terminal.write('\b \b');
        }
      }
      // Handle arrow up (command history)
      else if (domEvent.key === 'ArrowUp') {
        if (commandHistoryRef.current.length > 0 && commandIndexRef.current > 0) {
          commandIndexRef.current--;
          // Clear current line
          terminal.write('\x1b[2K\r\x1b[33m$ \x1b[0m');
          currentCommand = commandHistoryRef.current[commandIndexRef.current];
          terminal.write(currentCommand);
        }
      }
      // Handle arrow down (command history)
      else if (domEvent.key === 'ArrowDown') {
        if (commandIndexRef.current < commandHistoryRef.current.length - 1) {
          commandIndexRef.current++;
          // Clear current line
          terminal.write('\x1b[2K\r\x1b[33m$ \x1b[0m');
          currentCommand = commandHistoryRef.current[commandIndexRef.current];
          terminal.write(currentCommand);
        } else if (commandIndexRef.current === commandHistoryRef.current.length - 1) {
          commandIndexRef.current++;
          // Clear current line
          terminal.write('\x1b[2K\r\x1b[33m$ \x1b[0m');
          currentCommand = '';
        }
      }
      // Handle printable characters
      else if (printable) {
        currentCommand += key;
        terminal.write(key);
      }
    });
    
    // Show initial prompt
    terminal.write('\x1b[33m$ \x1b[0m');
    
    setTerminalReady(true);
    
    // Clean up on unmount
    return () => {
      terminal.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);
  
  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit();
      }
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Handle terminal command execution
  const handleTerminalCommand = async (cmd: string) => {
    if (!cmd.trim() || !serverStatus?.running) return;
    
    try {
      if (xtermRef.current) {
        xtermRef.current.writeln(`\x1b[90mExecuting: ${cmd}\x1b[0m`);
      }
      
      await sendServerCommand(cmd);
      
      // Show prompt after command execution
      if (xtermRef.current) {
        xtermRef.current.write('\x1b[33m$ \x1b[0m');
      }
    } catch (error: unknown) {
      console.error('Failed to send command:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      
      if (xtermRef.current) {
        xtermRef.current.writeln(`\x1b[31mError: ${errorMessage}\x1b[0m`);
        xtermRef.current.write('\x1b[33m$ \x1b[0m');
      }
      
      toast.error(`Failed to send command: ${errorMessage}`);
    }
  };

  // Subscribe to logs when component mounts
  useEffect(() => {
    if (!isSubscribedToLogs) {
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
  }, [isSubscribedToLogs, subscribeToLogs, unsubscribeFromLogs]);

  // Update terminal with new logs
  useEffect(() => {
    if (xtermRef.current && terminalReady && logs.length > 0) {
      // Get only new logs since last update
      const lastLogIndex = logsLengthRef.current;
      const newLogs = logs.slice(lastLogIndex);
      
      if (newLogs.length > 0) {
        // Save current line content
        const currentLine = xtermRef.current.buffer.active.getLine(xtermRef.current.buffer.active.cursorY)?.translateToString() || '';
        const cursorX = xtermRef.current.buffer.active.cursorX;
        
        // Clear current line
        xtermRef.current.write('\x1b[2K\r');
        
        // Write new logs
        for (const log of newLogs) {
          xtermRef.current.writeln(`\x1b[90m${log}\x1b[0m`);
        }
        
        // Restore prompt and current command
        xtermRef.current.write('\x1b[33m$ \x1b[0m');
        if (currentLine.length > 2) {
          const command = currentLine.substring(2);
          xtermRef.current.write(command);
        }
      }
    }
    
    // Update logs length reference
    logsLengthRef.current = logs.length;
  }, [logs, terminalReady]);

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
      
      if (xtermRef.current) {
        xtermRef.current.writeln('\x1b[32mServer started successfully\x1b[0m');
        xtermRef.current.write('\x1b[33m$ \x1b[0m');
      }
    } catch (error: unknown) {
      console.error('Failed to start server:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      toast.error(`Failed to start server: ${errorMessage}`);
      
      if (xtermRef.current) {
        xtermRef.current.writeln(`\x1b[31mFailed to start server: ${errorMessage}\x1b[0m`);
        xtermRef.current.write('\x1b[33m$ \x1b[0m');
      }
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
      
      if (xtermRef.current) {
        xtermRef.current.writeln('\x1b[33mServer stopped successfully\x1b[0m');
        xtermRef.current.write('\x1b[33m$ \x1b[0m');
      }
    } catch (error: unknown) {
      console.error('Failed to stop server:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      toast.error(`Failed to stop server: ${errorMessage}`);
      
      if (xtermRef.current) {
        xtermRef.current.writeln(`\x1b[31mFailed to stop server: ${errorMessage}\x1b[0m`);
        xtermRef.current.write('\x1b[33m$ \x1b[0m');
      }
    } finally {
      setIsStoppingServer(false);
    }
  };

  const handleClearTerminal = () => {
    if (xtermRef.current) {
      xtermRef.current.clear();
      xtermRef.current.write('\x1b[33m$ \x1b[0m');
    }
    clearLogs();
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
      
      {/* Server Status Card */}
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
            <p className="text-sm font-mono text-amber-400/70 mb-1">Uptime</p>
            <p className="text-lg font-bold text-amber-300">
              {serverStatus?.running ? formatUptime(serverStatus.uptime) : 'N/A'}
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
      
      {/* Terminal Section */}
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
                
                if (xtermRef.current) {
                  xtermRef.current.writeln('\x1b[33mRefreshing logs...\x1b[0m');
                  xtermRef.current.write('\x1b[33m$ \x1b[0m');
                }
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
        
        {/* xterm.js Terminal */}
        <div className="relative">
          {isLoadingLogs && !terminalReady ? (
            <div className="flex justify-center items-center h-80">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-400 border-r-amber-400/30" />
            </div>
          ) : (
            <div 
              ref={terminalRef} 
              className="w-full h-80 bg-black rounded border border-amber-500/20 overflow-hidden"
            />
          )}
          
          {!serverStatus?.running && (
            <div className="absolute top-3 left-3 p-2 bg-red-900/80 border border-red-500/30 rounded text-red-400 text-xs z-10">
              <div className="flex items-start">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor" aria-labelledby="alert-icon">
                  <title id="alert-icon">Alert Icon</title>
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                Server not running
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 