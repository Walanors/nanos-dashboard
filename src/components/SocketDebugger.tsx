'use client';

import { useSocket } from '@/hooks/useSocket';
import { useEffect, useState } from 'react';

// This component helps debug socket connection issues by providing
// detailed information about connection attempts and status
export default function SocketDebugger() {
  const { socket, isConnected, connectionError } = useSocket();
  const [logs, setLogs] = useState<string[]>([]);
  const [showDebugger, setShowDebugger] = useState(false);
  
  useEffect(() => {
    // Add initial log
    setLogs(prev => [...prev, `[${new Date().toISOString()}] Socket debugger initialized`]);
    
    if (!socket) {
      setLogs(prev => [...prev, `[${new Date().toISOString()}] No socket instance available. Check credentials.`]);
      return;
    }
    
    // Log connection state
    setLogs(prev => [...prev, `[${new Date().toISOString()}] Current connection state: ${isConnected ? 'Connected' : 'Disconnected'}`]);
    
    // Set up listeners for all relevant socket events
    const onConnect = () => {
      setLogs(prev => [...prev, `[${new Date().toISOString()}] Connection established (ID: ${socket.id})`]);
    };
    
    const onConnectError = (err: Error) => {
      setLogs(prev => [...prev, `[${new Date().toISOString()}] Connection error: ${err.message}`]);
    };
    
    const onReconnectAttempt = (attempt: number) => {
      setLogs(prev => [...prev, `[${new Date().toISOString()}] Reconnection attempt #${attempt}`]);
    };
    
    const onDisconnect = (reason: string) => {
      setLogs(prev => [...prev, `[${new Date().toISOString()}] Disconnected: ${reason}`]);
    };
    
    const onReconnectFailed = () => {
      setLogs(prev => [...prev, `[${new Date().toISOString()}] Reconnection failed after all attempts`]);
    };
    
    const onError = (err: Error) => {
      setLogs(prev => [...prev, `[${new Date().toISOString()}] Socket error: ${err.message}`]);
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
      setLogs(prev => [...prev, `[${new Date().toISOString()}] Current error: ${connectionError}`]);
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
  }, [socket, isConnected, connectionError]);
  
  return (
    <div className="fixed bottom-4 right-4 z-50">
      <button
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
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <span className="text-xs text-amber-300/80">{isConnected ? 'Connected' : 'Disconnected'}</span>
            </div>
          </div>
          
          <div className="text-xs font-mono text-amber-400/80 whitespace-pre-wrap break-words">
            {logs.map((log, index) => (
              <div key={index} className="mb-1 border-b border-amber-500/10 pb-1">{log}</div>
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