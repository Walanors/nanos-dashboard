'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useSocket } from '@/hooks/useSocket';
import { useUser } from '@/hooks/useUser';
import NanosOnboarding from '@/components/NanosOnboarding';
import SocketDebugger from '@/components/SocketDebugger';
import { toast } from 'react-hot-toast';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const socketContext = useSocket();
  const { metrics, isConnected, isConnecting, connectionError, reconnect, executeCommand, connectionState } = socketContext;
  const [activeMenu, setActiveMenu] = useState<string>('');
  const { userData, loading: userLoading } = useUser();
  const [isUpdating, setIsUpdating] = useState(false);
  const [connectionAttempts, setConnectionAttempts] = useState(0);
  const [showRetryButton, setShowRetryButton] = useState(false);

  // Set up a timer to show retry button after multiple connection attempts
  useEffect(() => {
    if (isConnecting && !isConnected) {
      setConnectionAttempts(prev => prev + 1);
      
      // After 3 attempts, show the retry button
      if (connectionAttempts >= 3) {
        setShowRetryButton(true);
      }
    } else if (isConnected) {
      // Reset when connected
      setConnectionAttempts(0);
      setShowRetryButton(false);
    }
  }, [isConnecting, isConnected, connectionAttempts]);

  // Format bytes to human-readable size
  const formatBytes = (bytes: number): string => {
    if (!bytes || bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return `${Number.parseFloat((bytes / (k ** i)).toFixed(1))} ${sizes[i]}`;
  };

  useEffect(() => {
    // Extract the active menu from pathname
    const path = pathname.split('/')[2] || '';
    setActiveMenu(path || 'overview');
  }, [pathname]);

  const handleLogout = () => {
    sessionStorage.removeItem('credentials');
    router.push('/');
  };

  // Calculate RAM percentage
  const ramPercentage = metrics ? 
    Math.round((metrics.memory.used / metrics.memory.total) * 100) : 0;

  // Use the actual CPU usage instead of load average
  const cpuPercentage = metrics ? Math.round(metrics.cpu.usage) : 0;

  // Handle update function
  const handleUpdate = async () => {
    if (!executeCommand) return;
    
    setIsUpdating(true);
    try {
      // Execute git pull to update the codebase
      const result = await executeCommand('sudo git pull');
      if (result.error) {
        throw new Error(result.error);
      }

      // Install all dependencies including dev dependencies with sudo
      const installPackages = await executeCommand('sudo npm install --include=dev');
      if (installPackages.error) {
        throw new Error(installPackages.error);
      }
      
      // Rebuild the application after update with sudo
      const buildResult = await executeCommand('sudo npm run build');
      if (buildResult.error) {
        throw new Error(buildResult.error);
      }
      toast.success('Update installed successfully. The service will restart momentarily. You will be able to refresh the page to see the changes.');
      // Restart the service
      const restartResult = await executeCommand('sudo systemctl restart nanos-dashboard.service');
      if (restartResult.error) {
        throw new Error(restartResult.error);
      }
      
    } catch (error) {
      console.error('Update failed:', error);
      toast.error(`Update failed: ${(error as Error).message}`);
    } finally {
      setIsUpdating(false);
    }
  };

  // Show loading state for either user loading or waiting for socket connection
  if (userLoading || (!isConnected && (isConnecting || connectionAttempts < 3))) {
    return (
      <div className="flex flex-col min-h-screen items-center justify-center bg-gradient-to-br from-black to-zinc-900">
        <div className="animate-pulse text-amber-400 text-lg font-mono mb-4">
          <span className="mr-2">$</span>
          {userLoading ? 'Loading user data...' : 'Establishing server connection...'}
        </div>
        {!userLoading && isConnecting && (
          <div className="text-xs text-amber-400/70 font-mono mt-2">
            Attempt {connectionState.reconnectCount || connectionAttempts + 1} of 10
          </div>
        )}
        {!userLoading && connectionError && (
          <div className="text-xs text-red-400 font-mono mt-2 max-w-md text-center">
            {connectionError}
          </div>
        )}
        {showRetryButton && (
          <button
            type="button"
            onClick={() => {
              reconnect();
              setConnectionAttempts(0);
            }}
            className="mt-6 px-4 py-2 bg-amber-500/20 text-amber-300 rounded-md hover:bg-amber-500/30 transition-colors font-mono text-sm"
          >
            Retry Connection
          </button>
        )}
      </div>
    );
  }

  // Show connection error state if we've tried multiple times and still failed
  if (!isConnected && connectionAttempts >= 3) {
    return (
      <div className="flex flex-col min-h-screen items-center justify-center bg-gradient-to-br from-black to-zinc-900">
        <div className="text-red-400 text-lg font-mono mb-4">
          <span className="mr-2">!</span>
          Unable to establish server connection
        </div>
        <div className="text-xs text-amber-400/70 font-mono mt-2 mb-6 max-w-md text-center">
          {connectionError || "The dashboard couldn't connect to the server after multiple attempts."}
        </div>
        <button
          type="button"
          onClick={() => {
            reconnect();
            setConnectionAttempts(0);
            setShowRetryButton(false);
          }}
          className="px-4 py-2 bg-amber-500/20 text-amber-300 rounded-md hover:bg-amber-500/30 transition-colors font-mono text-sm"
        >
          Retry Connection
        </button>
        <button
          type="button"
          onClick={handleLogout}
          className="mt-4 px-4 py-2 bg-zinc-900/80 border border-red-500/30 text-red-400/90 hover:bg-zinc-800 rounded-md transition-colors font-mono text-sm"
        >
          Return to Login
        </button>
      </div>
    );
  }

  // If user hasn't completed onboarding, render the onboarding component
  if (userData && !userData.onboardingCompleted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-black to-zinc-900 flex items-center justify-center p-6">
        <div className="w-full max-w-4xl">
          <NanosOnboarding />
        </div>
      </div>
    );
  }

  // Regular dashboard layout
  return (
    <div className="flex min-h-screen bg-gradient-to-br from-black to-zinc-900 text-amber-50">
      {/* Sidebar */}
      <div className="w-64 border-r border-amber-500/20 backdrop-blur-sm backdrop-filter bg-black/60 flex flex-col">
        {/* Logo area */}
        <div className="p-4 border-b border-amber-500/20">
          <div className="flex items-center">
            <div className="text-xl font-bold text-amber-400">
              nanos_
            </div>
            <div className="ml-2 text-xs text-amber-400/50 font-mono self-end">
              DASHBOARD
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-grow py-6 px-4 font-mono">
          <ul className="space-y-1">
            {[
              { path: '', label: 'Overview', defaultActive: true },
              { path: 'configuration', label: 'Configuration' },
              { path: 'console', label: 'Console' },
              { path: 'modules', label: 'Modules' },
              { path: 'settings', label: 'Settings' }
            ].map(item => {
              const isActive = activeMenu === (item.path || 'overview');
              return (
                <li key={item.path || 'overview'}>
                  <Link 
                    href={`/dashboard${item.path ? `/${item.path}` : ''}`}
                    className={`flex items-center px-3 py-2 rounded-md transition-all ${
                      isActive 
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' 
                        : 'text-amber-400/70 hover:bg-zinc-800 hover:text-amber-300'
                    }`}
                  >
                    <span className="text-amber-400/90 mr-2">$</span>
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Update Indicator */}
        {metrics?.version.updateAvailable && (
          <div className="px-4 py-3 border-y border-amber-500/20 bg-amber-500/5">
            <div className="flex items-center justify-between">
              <div className="text-xs text-amber-400/90">
                <span className="font-mono">Update Available</span>
                <div className="text-[10px] text-amber-400/60 mt-0.5">
                  v{metrics.version.current} → v{metrics.version.latest}
                </div>
              </div>
              <button
                type="button"
                onClick={handleUpdate}
                disabled={isUpdating}
                className="px-2 py-1 bg-amber-500/20 text-amber-300 rounded text-xs hover:bg-amber-500/30 transition-colors flex items-center gap-1 disabled:opacity-50"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className={`h-3 w-3 ${isUpdating ? 'animate-spin' : ''}`} viewBox="0 0 20 20" fill="currentColor" aria-labelledby="update-icon-title">
                  <title id="update-icon-title">Update icon</title>
                  <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                </svg>
                {isUpdating ? 'Updating...' : 'Update'}
              </button>
            </div>
            {metrics.version.updateInfo?.required && (
              <div className="mt-2 text-[10px] text-red-400 bg-red-500/10 px-2 py-1 rounded">
                ⚠️ Required Update
              </div>
            )}
          </div>
        )}

        {/* System Metrics */}
        <div className="px-4 pt-4 pb-2">
          <h3 className="text-amber-400/70 text-xs mb-3 border-b border-amber-500/20 pb-1">SYSTEM METRICS</h3>
          
          {/* RAM Usage */}
          <div className="mb-3">
            <div className="flex justify-between text-xs text-amber-400/90 mb-1">
              <span>RAM</span>
              <span>{ramPercentage}%</span>
            </div>
            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div 
                className={`h-full ${
                  ramPercentage > 90 ? 'bg-red-500' : 
                  ramPercentage > 70 ? 'bg-amber-500' : 'bg-green-500'
                }`}
                style={{ width: `${ramPercentage}%` }}
              />
            </div>
            {metrics && (
              <div className="text-[10px] text-amber-400/60 mt-1 text-right">
                {formatBytes(metrics.memory.used)} / {formatBytes(metrics.memory.total)}
              </div>
            )}
          </div>
          
          {/* CPU Usage */}
          <div className="mb-3">
            <div className="flex justify-between text-xs text-amber-400/90 mb-1">
              <span>CPU</span>
              <span>{cpuPercentage}%</span>
            </div>
            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div 
                className={`h-full ${
                  cpuPercentage > 90 ? 'bg-red-500' : 
                  cpuPercentage > 70 ? 'bg-amber-500' : 'bg-green-500'
                }`}
                style={{ width: `${cpuPercentage}%` }}
              />
            </div>
            {metrics && (
              <div className="text-[10px] text-amber-400/60 mt-1 text-right">
                Load: {metrics.cpu.loadAvg[0].toFixed(2)} | Cores: {metrics.cpu.cores}
              </div>
            )}
          </div>
        </div>

        {/* Logout button */}
        <div className="p-4 border-t border-amber-500/20 mt-auto">
          <button
            type="button"
            onClick={handleLogout}
            className="w-full py-2 px-4 bg-zinc-900/80 border border-red-500/30 text-red-400/90 hover:bg-zinc-800 rounded focus:outline-none focus:ring-2 focus:ring-red-500/40 focus:ring-offset-2 focus:ring-offset-black transition-all duration-200 font-mono text-sm flex items-center justify-center"
          >
            <span className="mr-2">⬢</span>
            <span>Logout</span>
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-hidden">
        {children}
      </div>
      
      {/* Debug components */}
      <SocketDebugger />
    </div>
  );
} 