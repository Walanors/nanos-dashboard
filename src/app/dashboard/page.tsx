'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSocket } from '@/hooks/useSocket';

export default function DashboardPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  
  // Get socket connection with metrics
  const { isConnected, connectionError: socketError, metrics } = useSocket();
  
  useEffect(() => {
    // Check if user is authenticated
    const credentials = sessionStorage.getItem('credentials');
    
    if (!credentials) {
      console.log('No credentials found, redirecting to login');
      router.push('/');
    } else {
      setIsLoading(false);
    }
  }, [router]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-pulse text-amber-400 text-lg font-mono">
          <span className="mr-2">$</span>
          Loading system data...
        </div>
      </div>
    );
  }
  
  // Show connection error if socket isn't connected after loading
  if (!isConnected && socketError && !isLoading) {
    return (
      <div className="min-h-screen bg-black/95 flex items-center justify-center">
        <div className="bg-black/70 border border-red-500/30 p-4 rounded-lg max-w-md text-center">
          <h3 className="text-red-400 text-lg mb-2">Connection Error</h3>
          <p className="text-amber-300/80 mb-4">{socketError}</p>
          <p className="text-amber-400/60 text-sm">
            The dashboard is unable to connect to the server. 
            Please check your connection and reload the page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black/95 p-8">
      <h1 className="text-2xl font-bold text-amber-300 mb-6 font-mono">Dashboard Overview</h1>
      
      {/* System Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-black/40 border border-amber-500/20 rounded-lg p-4">
          <h3 className="text-amber-400/80 text-sm font-mono mb-2">System Uptime</h3>
          <div className="text-amber-300 text-xl font-mono">
            {metrics ? formatTime(metrics.uptime) : 'N/A'}
          </div>
        </div>
        
        <div className="bg-black/40 border border-amber-500/20 rounded-lg p-4">
          <h3 className="text-amber-400/80 text-sm font-mono mb-2">Memory Usage</h3>
          <div className="text-amber-300 text-xl font-mono">
            {metrics ? `${Math.round(metrics.memory.usedPercent)}%` : 'N/A'}
          </div>
        </div>
        
        <div className="bg-black/40 border border-amber-500/20 rounded-lg p-4">
          <h3 className="text-amber-400/80 text-sm font-mono mb-2">CPU Load</h3>
          <div className="text-amber-300 text-xl font-mono">
            {metrics ? `${Math.round(metrics.cpu.usage)}%` : 'N/A'}
          </div>
        </div>
        
        <div className="bg-black/40 border border-amber-500/20 rounded-lg p-4">
          <h3 className="text-amber-400/80 text-sm font-mono mb-2">Version</h3>
          <div className="text-amber-300 text-xl font-mono">
            {metrics ? metrics.version.current : 'N/A'}
          </div>
        </div>
      </div>
      
      {/* Quick Actions */}
      <h2 className="text-xl font-mono text-amber-400 mb-4">Quick Actions</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <button
          type="button"
          onClick={() => router.push('/dashboard/configuration')}
          className="bg-black/40 border border-amber-500/20 rounded-lg p-6 text-left hover:bg-black/60 transition-colors"
        >
          <h3 className="text-amber-300 font-mono mb-2">Edit Configuration</h3>
          <p className="text-amber-400/60 text-sm">
            Modify server settings and game options
          </p>
        </button>
        
        <button
          type="button" 
          onClick={() => router.push('/dashboard/console')}
          className="bg-black/40 border border-amber-500/20 rounded-lg p-6 text-left hover:bg-black/60 transition-colors"
        >
          <h3 className="text-amber-300 font-mono mb-2">Server Console</h3>
          <p className="text-amber-400/60 text-sm">
            View logs and run server commands
          </p>
        </button>
        
        <button
          type="button"
          onClick={() => router.push('/dashboard/modules')}
          className="bg-black/40 border border-amber-500/20 rounded-lg p-6 text-left hover:bg-black/60 transition-colors"
        >
          <h3 className="text-amber-300 font-mono mb-2">Manage Modules</h3>
          <p className="text-amber-400/60 text-sm">
            Install, update, and configure modules
          </p>
        </button>
      </div>
      
      {/* Version Info */}
      {metrics?.version.updateAvailable && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 mb-8">
          <h3 className="text-amber-300 font-mono mb-2">Update Available</h3>
          <p className="text-amber-400/80 mb-4">
            A new version ({metrics.version.latest}) is available. You are currently running version {metrics.version.current}.
          </p>
          {metrics.version.updateInfo?.changelog && (
            <div className="bg-black/40 p-3 rounded mb-4">
              <h4 className="text-amber-300/80 font-mono text-sm mb-2">Changelog:</h4>
              <p className="text-amber-400/70 text-sm whitespace-pre-line">{metrics.version.updateInfo.changelog}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Helper function to format time
function formatTime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  
  return `${minutes}m`;
} 