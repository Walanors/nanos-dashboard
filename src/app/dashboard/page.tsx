'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSocket } from '@/hooks/useSocket';
import OnboardingStatus from '@/components/OnboardingStatus';
import { useUser } from '@/hooks/useUser';

// System Info interface
interface SystemInfo {
  hostname: string;
  platform: string;
  arch: string;
  cpus: number;
  memory: {
    total: number;
    free: number;
  };
  uptime: number;
  load: number[];
}

// Command result interface
interface CommandResult {
  success: boolean;
  output: string;
  error?: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [commandOutput, setCommandOutput] = useState<string>('');
  const [command, setCommand] = useState<string>('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  
  // Get socket connection with metrics
  const { isConnected, error: socketError, executeCommand, metrics } = useSocket();
  
  // Get user data including onboarding status
  const { userData, loading: userLoading } = useUser();
  
  useEffect(() => {
    // Check if user is authenticated
    const credentials = sessionStorage.getItem('credentials');
    
    if (!credentials) {
      console.log('No credentials found, redirecting to login');
      router.push('/');
    } else {
      // Verify the credentials still work
      const verifyCredentials = async () => {
        try {
          const response = await fetch('/api/system/info', {
            headers: {
              'Authorization': `Basic ${credentials}`
            }
          });
          
          if (response.ok) {
            console.log('Credentials verified successfully');
            setIsAuthenticated(true);
            
            // Get system info
            const data = await response.json();
            setSystemInfo(data.info);
          } else {
            console.log('Invalid credentials, redirecting to login');
            sessionStorage.removeItem('credentials');
            router.push('/');
          }
        } catch (error) {
          console.error('Error verifying credentials:', error);
        } finally {
          setIsLoading(false);
        }
      };
      
      verifyCredentials();
    }
  }, [router]);
  
  const handleLogout = () => {
    sessionStorage.removeItem('credentials');
    router.push('/');
  };

  const handleExecuteCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim() || !isConnected) return;
    
    setIsExecuting(true);
    try {
      const result = await executeCommand(command);
      setCommandOutput(prev => 
        `${prev}\n\n$ ${command}${
          result.error 
            ? `\nError: ${result.error}` 
            : `\n${result.output}`
        }`
      );
      setCommand('');
    } catch (error) {
      setCommandOutput(prev => 
        `${prev}\n\n$ ${command}\nError: ${(error as Error).message}`
      );
    } finally {
      setIsExecuting(false);
    }
  };

  const handleUpdate = async () => {
    if (!isConnected || !metrics?.version.updateAvailable) return;
    
    setIsUpdating(true);
    try {
      // Execute git pull to update the codebase
      const result = await executeCommand('git pull');
      if (result.error) {
        throw new Error(result.error);
      }

      const installPackages = await executeCommand('npm install');
      if (installPackages.error) {
        throw new Error(installPackages.error);
      }
      // Rebuild the application after update
      const buildResult = await executeCommand('npm run build');
      if (buildResult.error) {
        throw new Error(buildResult.error);
      }
      
      // Restart the service
      const restartResult = await executeCommand('sudo systemctl restart nanos-dashboard.service');
      if (restartResult.error) {
        throw new Error(restartResult.error);
      }
      
      setCommandOutput(prev => `${prev}\n\nUpdate installed successfully. The service will restart momentarily.`);
    } catch (error) {
      setCommandOutput(prev => `${prev}\n\nUpdate failed: ${(error as Error).message}`);
    } finally {
      setIsUpdating(false);
    }
  };

  // Format uptime from seconds to days, hours, minutes
  const formatUptime = (seconds: number): string => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    return `${days}d ${hours}h ${minutes}m`;
  };
  
  // Format bytes to human-readable size
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return `${Number.parseFloat((bytes / (k ** i)).toFixed(2))} ${sizes[i]}`;
  };

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
  
  if (!isAuthenticated) {
    return null; // Don't render anything while redirecting
  }

  return (
    <div className="h-screen p-6 overflow-auto">
      {/* Connection status indicator */}
      <div className="flex justify-end items-center mb-4">
        {socketError && (
          <div className="text-sm text-red-400 mr-4 font-mono">
            <span className="text-red-500 mr-1">!</span>
            Socket error: {socketError}
          </div>
        )}
        {isConnected ? (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-zinc-900/70 text-green-400 border border-green-900/50">
            <span className="w-2 h-2 mr-1 bg-green-400 rounded-full animate-pulse" />
            Connected
          </span>
        ) : (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-zinc-900/70 text-red-400 border border-red-900/50">
            <span className="w-2 h-2 mr-1 bg-red-400 rounded-full" />
            Disconnected
          </span>
        )}
      </div>
      
      {/* Page heading */}
      <h1 className="text-2xl font-bold text-amber-300 mb-6 font-mono border-b border-amber-500/20 pb-2">
        Overview
      </h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* System Information Panel */}
        <div className="backdrop-blur-sm backdrop-filter bg-black/40 p-6 rounded-xl shadow-xl border border-amber-500/20 transition-all duration-300 hover:bg-black/50">
          <h2 className="text-xl font-semibold mb-4 border-b border-amber-500/20 pb-2 text-amber-300 font-mono">
            <span className="mr-2">$</span>
            System Information
          </h2>
          {systemInfo ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="backdrop-blur-sm bg-black/20 p-3 rounded-lg border border-amber-500/10">
                <span className="text-amber-400/70 text-sm font-mono">Hostname</span>
                <p className="text-amber-100 font-mono">{systemInfo.hostname}</p>
              </div>
              <div className="backdrop-blur-sm bg-black/20 p-3 rounded-lg border border-amber-500/10">
                <span className="text-amber-400/70 text-sm font-mono">Platform</span>
                <p className="text-amber-100 font-mono">{systemInfo.platform}</p>
              </div>
              <div className="backdrop-blur-sm bg-black/20 p-3 rounded-lg border border-amber-500/10">
                <span className="text-amber-400/70 text-sm font-mono">Architecture</span>
                <p className="text-amber-100 font-mono">{systemInfo.arch}</p>
              </div>
              <div className="backdrop-blur-sm bg-black/20 p-3 rounded-lg border border-amber-500/10">
                <span className="text-amber-400/70 text-sm font-mono">CPU Cores</span>
                <p className="text-amber-100 font-mono">{systemInfo.cpus}</p>
              </div>
            </div>
          ) : (
            <p className="text-amber-400 font-mono">Unable to load system information</p>
          )}
          
          {/* Uptime information */}
          {systemInfo && (
            <div className="mt-6">
              <div className="backdrop-blur-sm bg-black/20 p-3 rounded-lg border border-amber-500/10">
                <span className="text-amber-400/70 text-sm font-mono">System Uptime</span>
                <p className="text-amber-100 font-mono">{formatUptime(systemInfo.uptime)}</p>
              </div>
            </div>
          )}
          
          {/* Version Information */}
          {metrics && (
            <div className="mt-6">
              <div className="backdrop-blur-sm bg-black/20 p-3 rounded-lg border border-amber-500/10">
                <span className="text-amber-400/70 text-sm font-mono">Version</span>
                <div className="flex items-center justify-between">
                  <p className="text-amber-100 font-mono">
                    {metrics.version.current}
                    {metrics.version.updateAvailable && (
                      <span className="ml-2 text-xs text-amber-400">
                        (Latest: {metrics.version.latest})
                      </span>
                    )}
                  </p>
                  {metrics.version.updateAvailable && (
                    <button
                      type="button"
                      onClick={handleUpdate}
                      disabled={isUpdating || !isConnected}
                      className="px-3 py-1 bg-amber-500/20 text-amber-300 rounded hover:bg-amber-500/30 focus:outline-none focus:ring-2 focus:ring-amber-500/50 disabled:opacity-50 transition-all duration-200 border-y border-r border-amber-500/20 font-mono"
                    >
                      {isUpdating ? (
                        <>
                          <span className="w-2 h-2 mr-2 bg-amber-400 rounded-full animate-pulse" />
                          Updating...
                        </>
                      ) : (
                        <>
                          <span className="mr-2">⟳</span>
                          Update
                        </>
                      )}
                    </button>
                  )}
                </div>
                {metrics.version.updateInfo?.changelog && (
                  <div className="mt-2 text-xs text-amber-400/70 font-mono">
                    <div className="border-t border-amber-500/10 pt-2 mt-2">
                      <strong>Changelog:</strong>
                      <pre className="mt-1 whitespace-pre-wrap">
                        {metrics.version.updateInfo.changelog}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        
        {/* Terminal Panel */}
        <div className="backdrop-blur-sm backdrop-filter bg-black/40 p-6 rounded-xl shadow-xl border border-amber-500/20 transition-all duration-300 hover:bg-black/50">
          <h2 className="text-xl font-semibold mb-4 border-b border-amber-500/20 pb-2 text-amber-300 font-mono">
            <span className="mr-2">$</span>
            Quick Command
          </h2>
          <div className="mb-4 bg-zinc-900/50 border border-amber-500/20 p-4 rounded-lg h-60 overflow-y-auto font-mono text-sm text-amber-300 shadow-[inset_0_0_10px_rgba(0,0,0,0.6)]">
            <pre className="whitespace-pre-wrap">
              {commandOutput || 'Welcome to Nanos Terminal. Type a command to begin.'}
            </pre>
          </div>
          <form onSubmit={handleExecuteCommand} className="flex">
            <div className="flex-grow flex items-center bg-zinc-900/50 border border-amber-500/20 rounded-l-md px-2">
              <span className="text-amber-400 mr-2">$</span>
              <input
                type="text"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="Enter command..."
                disabled={!isConnected || isExecuting}
                className="flex-grow py-2 bg-transparent text-amber-100 focus:outline-none placeholder-amber-400/30 font-mono"
              />
            </div>
            <button
              type="submit"
              disabled={!isConnected || isExecuting || !command.trim()}
              className="px-4 py-2 bg-amber-500/20 text-amber-300 rounded-r-md hover:bg-amber-500/30 focus:outline-none focus:ring-2 focus:ring-amber-500/50 disabled:opacity-50 transition-all duration-200 border-y border-r border-amber-500/20 font-mono"
            >
              {isExecuting ? 'Running...' : 'Run'}
            </button>
          </form>
        </div>
        
        {/* Server Status Panel */}
        <div className="backdrop-blur-sm backdrop-filter bg-black/40 p-6 rounded-xl shadow-xl border border-amber-500/20 transition-all duration-300 hover:bg-black/50 lg:col-span-2">
          <h2 className="text-xl font-semibold mb-4 border-b border-amber-500/20 pb-2 text-amber-300 font-mono">
            <span className="mr-2">$</span>
            Nanos Server Status
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="backdrop-blur-sm bg-black/20 p-4 rounded-lg border border-amber-500/10 flex flex-col items-center justify-center">
              <div className="text-amber-400/70 text-sm font-mono mb-2">Server Status</div>
              <div className="text-green-400 font-bold font-mono flex items-center">
                <span className="w-2 h-2 mr-2 bg-green-400 rounded-full animate-pulse" />
                ONLINE
              </div>
            </div>
            <div className="backdrop-blur-sm bg-black/20 p-4 rounded-lg border border-amber-500/10 flex flex-col items-center justify-center">
              <div className="text-amber-400/70 text-sm font-mono mb-2">Players</div>
              <div className="text-amber-300 font-bold font-mono">0 / 32</div>
            </div>
            <div className="backdrop-blur-sm bg-black/20 p-4 rounded-lg border border-amber-500/10 flex flex-col items-center justify-center">
              <div className="text-amber-400/70 text-sm font-mono mb-2">Game Mode</div>
              <div className="text-amber-300 font-bold font-mono">Sandbox</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 