'use client';

import { useSocket } from '@/hooks/useSocket';
import { useEffect, useState, useCallback } from 'react';

// This component helps debug socket connection issues by providing
// detailed information about connection attempts and status
export default function SocketDebugger() {
  const { socket, connectionState, isConnected, connectionError } = useSocket();
  const [logs, setLogs] = useState<string[]>([]);
  const [showDebugger, setShowDebugger] = useState(false);
  
  // Helper to format time
  const formatTime = useCallback(() => {
    return new Date().toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      fractionalSecondDigits: 3
    });
  }, []);
  
  // Add a log entry
  const addLog = useCallback((message: string) => {
    setLogs(prev => {
      // Keep only the last 100 logs to prevent excessive memory usage
      const newLogs = [...prev, `[${formatTime()}] ${message}`];
      if (newLogs.length > 100) {
        return newLogs.slice(-100);
      }
      return newLogs;
    });
  }, [formatTime]);
  
  // Listen for socket events from the context
  useEffect(() => {
    const handleSocketEvent = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail) {
        const { type, details, timestamp } = customEvent.detail;
        const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
        addLog(`${type}${detailsStr}`);
      }
    };
    
    window.addEventListener('socket-event', handleSocketEvent);
    
    return () => {
      window.removeEventListener('socket-event', handleSocketEvent);
    };
  }, [addLog]);
  
  useEffect(() => {
    // Add initial log
    addLog('Socket debugger initialized');
    
    if (!socket) {
      addLog('No socket instance available. Check credentials.');
      return;
    }
    
    // Log connection state
    addLog(`Current connection state: ${isConnected ? 'Connected' : 'Disconnected'}`);
    
    // Set up listeners for all relevant socket events
    const onConnect = () => {
      addLog(`Connection established (ID: ${socket.id})`);
    };
    
    const onConnectError = (err: Error) => {
      addLog(`Connection error: ${err.message}`);
    };
    
    const onReconnectAttempt = (attempt: number) => {
      addLog(`Reconnection attempt #${attempt}`);
    };
    
    const onDisconnect = (reason: string) => {
      addLog(`Disconnected: ${reason}`);
    };
    
    const onReconnectFailed = () => {
      addLog(`Reconnection failed after all attempts`);
    };
    
    const onError = (err: Error) => {
      addLog(`Socket error: ${err.message}`);
    };
    
    // Add all listeners
    socket.on('connect', onConnect);
    socket.on('connect_error', onConnectError);
    socket.on('reconnect_attempt', onReconnectAttempt);
    socket.on('disconnect', onDisconnect);
    socket.on('reconnect_failed', onReconnectFailed);
    socket.on('error', onError);
    
    // Add additional debug info
    if (connectionError) {
      addLog(`Current error: ${connectionError}`);
    }
    
    if (connectionState.reconnectCount > 0) {
      addLog(`Reconnect count: ${connectionState.reconnectCount}`);
    }
    
    if (connectionState.lastConnectAttempt) {
      const timeAgo = Math.round((Date.now() - connectionState.lastConnectAttempt) / 1000);
      addLog(`Last connection attempt: ${timeAgo} seconds ago`);
    }
    
    return () => {
      // Clean up all listeners
      if (socket) {
        socket.off('connect', onConnect);
        socket.off('connect_error', onConnectError);
        socket.off('reconnect_attempt', onReconnectAttempt);
        socket.off('disconnect', onDisconnect);
        socket.off('reconnect_failed', onReconnectFailed);
        socket.off('error', onError);
      }
    };
  }, [socket, isConnected, connectionError, connectionState, addLog]);
  
  return (
    <div className="fixed bottom-4 right-4 z-50">
      <button
        type="button"
        onClick={() => setShowDebugger(!showDebugger)}
        className="bg-amber-600 text-black px-3 py-1 rounded text-xs hover:bg-amber-500"
      >
        {showDebugger ? 'Hide' : 'Debug'} Socket
      </button>
      
      {showDebugger && (
        <div className="mt-2 p-3 bg-black/90 border border-amber-500/30 rounded shadow-lg w-96 max-h-96 overflow-auto">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-amber-400 text-sm font-mono">Socket Debugger</h3>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${
                isConnected 
                  ? 'bg-green-500' 
                  : connectionState.connecting 
                    ? 'bg-yellow-500 animate-pulse' 
                    : 'bg-red-500'
              }`} />
              <span className="text-xs text-amber-300/80">
                {isConnected 
                  ? 'Connected' 
                  : connectionState.connecting 
                    ? 'Connecting...' 
                    : 'Disconnected'}
              </span>
              {connectionState.reconnectCount > 0 && (
                <span className="text-xs text-amber-300/60 ml-1">
                  (Attempts: {connectionState.reconnectCount})
                </span>
              )}
            </div>
          </div>
          
          <div className="text-xs font-mono text-amber-400/80 whitespace-pre-wrap break-words">
            {logs.map((log, i) => (
              <div key={`log-${i}`} className="mb-1 border-b border-amber-500/10 pb-1">{log}</div>
            ))}
            
            {logs.length === 0 && (
              <div className="text-amber-400/50">No logs yet</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
} 