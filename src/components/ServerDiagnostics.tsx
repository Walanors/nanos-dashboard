'use client';

import { useState, useEffect } from 'react';
import { useSocket } from '@/hooks/useSocket';

export default function ServerDiagnostics() {
  const { connectionState, connectionError } = useSocket();
  const [apiStatus, setApiStatus] = useState<string>('Checking...');
  const [apiDetails, setApiDetails] = useState<string | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  
  // Test the basic API connection
  useEffect(() => {
    async function checkEndpoints() {
      // Check the unauthenticated Next.js endpoint first
      try {
        const nextResponse = await fetch('/api/server-check');
        const nextData = await nextResponse.json();
        
        if (nextResponse.ok) {
          setApiStatus('Next.js API: Connected ✅');
          setApiDetails(JSON.stringify(nextData, null, 2));
        } else {
          setApiStatus(`Next.js API Error: ${nextResponse.status}`);
        }
      } catch (error) {
        setApiStatus(`Next.js API Error: ${(error as Error).message}`);
        setApiDetails('This may indicate that the Next.js server is not running or has an error.');
        return; // If this fails, no need to check the authenticated endpoint
      }
      
      // Now check the authenticated endpoint
      try {
        // Get credentials for authentication
        const credentials = sessionStorage.getItem('credentials');
        if (!credentials) {
          setApiDetails(prev => `${prev}\n\nNo credentials found for authenticated API check.`);
          return;
        }
        
        const headers = new Headers();
        headers.set('Authorization', `Basic ${credentials}`);
        
        // Try to connect to the API endpoint
        const response = await fetch('/api/system/ping', {
          method: 'GET',
          headers,
          credentials: 'include'
        });
        
        if (response.ok) {
          const data = await response.json();
          setApiStatus(prev => `${prev} | Auth API: Connected ✅`);
          setApiDetails(prev => `${prev}\n\nAuthenticated API: ${JSON.stringify(data, null, 2)}`);
        } else {
          setApiStatus(prev => `${prev} | Auth API Error: ${response.status}`);
          setApiDetails(prev => `${prev}\n\nThis may indicate authentication issues.`);
        }
      } catch (error) {
        setApiStatus(prev => `${prev} | Auth API Error: ${(error as Error).message}`);
        setApiDetails(prev => `${prev}\n\nThis may indicate that the Express server is not running correctly.`);
      }
    }
    
    checkEndpoints();
  }, []);
  
  return (
    <div className="fixed bottom-4 left-4 z-50">
      <button
        type="button"
        onClick={() => setShowDiagnostics(!showDiagnostics)}
        className="bg-purple-600 text-white px-3 py-1 rounded text-xs hover:bg-purple-500"
      >
        {showDiagnostics ? 'Hide' : 'Server'} Diagnostics
      </button>
      
      {showDiagnostics && (
        <div className="mt-2 p-3 bg-black/90 border border-purple-500/30 rounded shadow-lg w-96 max-h-96 overflow-auto">
          <div className="text-purple-400 text-sm font-mono mb-2">Server Diagnostics</div>
          
          <div className="mb-2">
            <div className="text-xs text-white mb-1">API Connection:</div>
            <div className="text-xs font-mono text-purple-300 bg-purple-900/20 p-2 rounded">
              {apiStatus}
            </div>
            {apiDetails && (
              <div className="text-xs font-mono text-purple-300/70 bg-purple-900/10 p-2 rounded mt-1 max-h-24 overflow-auto">
                <pre>{apiDetails}</pre>
              </div>
            )}
          </div>
          
          <div className="mb-2">
            <div className="text-xs text-white mb-1">Connection State:</div>
            <div className="text-xs font-mono bg-purple-900/20 p-2 rounded">
              <div className={connectionState.connected ? 'text-green-300' : 'text-red-300'}>
                Connected: {connectionState.connected ? 'Yes' : 'No'}
              </div>
              <div className={connectionState.connecting ? 'text-yellow-300' : 'text-purple-300'}>
                Connecting: {connectionState.connecting ? 'Yes' : 'No'}
              </div>
              {connectionState.reconnectCount > 0 && (
                <div className="text-amber-300">
                  Reconnect Attempts: {connectionState.reconnectCount}
                </div>
              )}
              {connectionState.lastConnectAttempt && (
                <div className="text-purple-300">
                  Last Attempt: {new Date(connectionState.lastConnectAttempt).toLocaleTimeString()}
                </div>
              )}
            </div>
          </div>
          
          <div className="mb-2">
            <div className="text-xs text-white mb-1">Socket Error:</div>
            <div className="text-xs font-mono text-red-300 bg-red-900/20 p-2 rounded">
              {connectionError || 'No socket error'}
            </div>
          </div>
          
          <div className="text-xs text-purple-300/80 mt-2">
            <p>Troubleshooting:</p>
            <ul className="list-disc pl-4 mt-1 space-y-1">
              <li>Check server is running</li>
              <li>Verify credentials are correct</li>
              <li>Confirm server has socket.io enabled</li>
              <li>Check for CORS issues</li>
              <li>Inspect network tab for WebSocket connections</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
} 