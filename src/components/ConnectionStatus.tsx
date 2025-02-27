'use client';

import { useSocket } from '@/hooks/useSocket';
import { useEffect, useState } from 'react';

export default function ConnectionStatus() {
  const { isConnected, isConnecting, connectionError, reconnect, connectionState } = useSocket();
  const [manualReconnecting, setManualReconnecting] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  // Handle reconnect button click
  const handleReconnect = () => {
    setManualReconnecting(true);
    reconnect();
    
    // Reset the reconnecting state after a delay
    setTimeout(() => {
      setManualReconnecting(false);
    }, 2000);
  };

  // Reset showDetails when connection state changes
  useEffect(() => {
    if (isConnected) {
      setShowDetails(false);
    }
  }, [isConnected]);
  
  // Determine status message and color based on connection state
  let statusColor = 'red';
  let statusMessage = 'Disconnected';
  let statusIcon = <span className="inline-block w-2 h-2 rounded-full bg-red-500" />;
  
  if (isConnected) {
    statusColor = 'green';
    statusMessage = 'Connected';
    statusIcon = <span className="inline-block w-2 h-2 rounded-full bg-green-500" />;
  } else if (isConnecting || connectionState.connecting) {
    statusColor = 'yellow';
    statusMessage = 'Connecting...';
    statusIcon = <span className="inline-block w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />;
  }

  if (isConnected) {
    return (
      <div className="flex items-center gap-2 text-xs">
        {statusIcon}
        <span className="text-green-400">{statusMessage}</span>
      </div>
    );
  }

  return (
    <div className="text-xs">
      <div className="flex items-center gap-2 mb-1">
        {statusIcon}
        <span className={`text-${statusColor}-400`}>{statusMessage}</span>
        <button
          type="button"
          onClick={() => setShowDetails(!showDetails)}
          className="ml-2 text-amber-400 hover:text-amber-300 transition-colors"
        >
          {showDetails ? 'Hide Details' : 'Show Details'}
        </button>
      </div>
      
      {showDetails && (
        <div className="mb-2 p-2 bg-black/50 border border-red-500/20 rounded text-red-400/80">
          {connectionError || 'No specific error message available'}
          
          {connectionState.reconnectCount > 0 && (
            <div className="mt-1 text-amber-400/70 text-[10px]">
              Reconnection attempts: {connectionState.reconnectCount}
            </div>
          )}
          
          {connectionState.lastConnectAttempt && (
            <div className="mt-1 text-amber-400/70 text-[10px]">
              Last attempt: {new Date(connectionState.lastConnectAttempt).toLocaleTimeString()}
            </div>
          )}
        </div>
      )}
      
      <button
        type="button"
        onClick={handleReconnect}
        disabled={manualReconnecting || isConnecting}
        className="px-3 py-1 bg-amber-600/30 border border-amber-500/30 text-amber-300 rounded hover:bg-amber-600/40 transition-colors disabled:opacity-50 flex items-center gap-1"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`h-3 w-3 ${manualReconnecting || isConnecting ? 'animate-spin' : ''}`}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-labelledby="reconnect-icon-title"
        >
          <title id="reconnect-icon-title">Reconnect</title>
          <path
            fillRule="evenodd"
            d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"
            clipRule="evenodd"
          />
        </svg>
        {manualReconnecting || isConnecting ? 'Reconnecting...' : 'Reconnect'}
      </button>
    </div>
  );
} 