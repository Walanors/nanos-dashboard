'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSocket } from '@/hooks/useSocket';
import { useUser } from '@/hooks/useUser';
import Link from 'next/link';

export default function DashboardPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  
  // Get socket connection with metrics
  const { isConnected, connectionError: socketError, metrics } = useSocket();
  
  // Get user data including onboarding status
  const { userData, loading: userLoading } = useUser();
  
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

  if (isLoading || userLoading) {
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

  // Show the dashboard overview
  return (
    <div className="min-h-screen bg-black/95">
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-amber-300 mb-8 font-mono">Server Dashboard</h1>
        
        {/* Connection status indicator */}
        <div className="mb-6">
          {socketError && !isConnected && (
            <div className="bg-red-900/20 border border-red-500/30 p-3 rounded">
              <p className="text-red-400 text-sm">
                Connection warning: {socketError}
              </p>
            </div>
          )}
        </div>
        
        {/* Dashboard Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {/* Server Status Card */}
          <div className="bg-black/50 border border-amber-500/30 rounded-lg p-4">
            <h3 className="text-lg font-mono text-amber-400 mb-3">Server Status</h3>
            <div className="flex items-center mb-2">
              <div className={`w-3 h-3 rounded-full mr-2 ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-sm text-amber-300/90 font-mono">
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            {metrics && (
              <div className="text-xs text-amber-300/70 font-mono mt-3 space-y-1">
                <p>Uptime: {Math.floor(metrics.uptime / 60 / 60)} hours</p>
                <p>Version: {metrics.version.current}</p>
                {metrics.version.updateAvailable && (
                  <p className="text-green-400/90">
                    Update available: {metrics.version.latest}
                  </p>
                )}
              </div>
            )}
            <div className="mt-4">
              <Link href="/dashboard/configuration" className="px-3 py-1 bg-amber-500/20 text-amber-300 rounded hover:bg-amber-500/30 transition-colors font-mono text-xs">
                View Configuration
              </Link>
            </div>
          </div>
          
          {/* System Resources Card */}
          {metrics && (
            <div className="bg-black/50 border border-amber-500/30 rounded-lg p-4">
              <h3 className="text-lg font-mono text-amber-400 mb-3">System Resources</h3>
              <div className="space-y-3">
                {/* Memory Usage */}
                <div>
                  <p className="text-xs text-amber-300/70 font-mono mb-1">Memory Usage: {metrics.memory.usedPercent.toFixed(1)}%</p>
                  <div className="w-full bg-black/30 rounded-full h-2">
                    <div 
                      className={`h-2 rounded-full ${
                        metrics.memory.usedPercent > 90 ? 'bg-red-500' : 
                        metrics.memory.usedPercent > 70 ? 'bg-yellow-500' : 
                        'bg-green-500'
                      }`} 
                      style={{ width: `${metrics.memory.usedPercent}%` }}
                    />
                  </div>
                </div>
                
                {/* CPU Usage */}
                <div>
                  <p className="text-xs text-amber-300/70 font-mono mb-1">CPU Usage: {metrics.cpu.usage.toFixed(1)}%</p>
                  <div className="w-full bg-black/30 rounded-full h-2">
                    <div 
                      className={`h-2 rounded-full ${
                        metrics.cpu.usage > 90 ? 'bg-red-500' : 
                        metrics.cpu.usage > 70 ? 'bg-yellow-500' : 
                        'bg-green-500'
                      }`} 
                      style={{ width: `${metrics.cpu.usage}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {/* Quick Actions Card */}
          <div className="bg-black/50 border border-amber-500/30 rounded-lg p-4">
            <h3 className="text-lg font-mono text-amber-400 mb-3">Quick Actions</h3>
            <div className="space-y-2">
              <Link 
                href="/dashboard/configuration" 
                className="block w-full px-3 py-2 bg-amber-500/20 text-amber-300 rounded hover:bg-amber-500/30 transition-colors font-mono text-sm text-center"
              >
                Server Configuration
              </Link>
              {/* Add more action buttons here */}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 