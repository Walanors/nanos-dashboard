'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSocket } from '@/hooks/useSocket';

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

export default function DashboardPage() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [commandOutput, setCommandOutput] = useState<string>('');
  const [command, setCommand] = useState<string>('');
  const [isExecuting, setIsExecuting] = useState(false);
  
  // Get socket connection with metrics
  const { isConnected, error: socketError, executeCommand, metrics } = useSocket();
  
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
      setCommandOutput(prev => `${prev}\n\n$ ${command}\n${result.output || 'Command executed successfully'}`);
      setCommand('');
    } catch (error) {
      setCommandOutput(prev => `${prev}\n\n$ ${command}\nError: ${(error as Error).message}`);
    } finally {
      setIsExecuting(false);
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

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen bg-gradient-to-br from-gray-900 to-black">
        <div className="animate-pulse text-amber-400 text-lg">Loading...</div>
      </div>
    );
  }
  
  if (!isAuthenticated) {
    return null; // Don't render anything while redirecting
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-black p-8 text-gray-200">
      {/* Header */}
      <div className="flex justify-between items-center mb-8 backdrop-blur-sm backdrop-filter bg-black/30 p-4 rounded-xl shadow-xl border border-gray-800">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-amber-200 to-amber-400 text-transparent bg-clip-text">
          Nanos Dashboard
        </h1>
        <div className="flex items-center">
          {socketError && (
            <div className="text-sm text-red-400 mr-4">
              Socket error: {socketError}
            </div>
          )}
          {isConnected ? (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-800/70 text-green-400 mr-4 border border-green-900">
              <span className="w-2 h-2 mr-1 bg-green-400 rounded-full animate-pulse" />
              Connected
            </span>
          ) : (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-800/70 text-red-400 mr-4 border border-red-900">
              <span className="w-2 h-2 mr-1 bg-red-400 rounded-full" />
              Disconnected
            </span>
          )}
          <button 
            type="button"
            onClick={handleLogout}
            className="px-4 py-2 bg-red-900/80 text-white rounded-md hover:bg-red-800 transition-all duration-200 border border-red-700"
          >
            Logout
          </button>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* System Information Panel */}
        <div className="backdrop-blur-md backdrop-filter bg-gray-800/30 p-6 rounded-xl shadow-xl border border-gray-700 transition-all duration-300 hover:bg-gray-800/40">
          <h2 className="text-xl font-semibold mb-4 border-b border-gray-700 pb-2 text-amber-300">System Information</h2>
          {systemInfo ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="backdrop-blur-sm bg-black/20 p-3 rounded-lg border border-gray-700">
                <span className="text-gray-400 text-sm">Hostname</span>
                <p className="text-gray-200">{systemInfo.hostname}</p>
              </div>
              <div className="backdrop-blur-sm bg-black/20 p-3 rounded-lg border border-gray-700">
                <span className="text-gray-400 text-sm">Platform</span>
                <p className="text-gray-200">{systemInfo.platform}</p>
              </div>
              <div className="backdrop-blur-sm bg-black/20 p-3 rounded-lg border border-gray-700">
                <span className="text-gray-400 text-sm">Architecture</span>
                <p className="text-gray-200">{systemInfo.arch}</p>
              </div>
              <div className="backdrop-blur-sm bg-black/20 p-3 rounded-lg border border-gray-700">
                <span className="text-gray-400 text-sm">CPU Cores</span>
                <p className="text-gray-200">{systemInfo.cpus}</p>
              </div>
            </div>
          ) : (
            <p className="text-amber-400">Unable to load system information</p>
          )}
          
          {/* Real-time metrics */}
          {metrics && (
            <div className="mt-6 border-t border-gray-700 pt-4">
              <h3 className="text-lg font-medium mb-3 text-amber-300">Real-time Metrics</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="backdrop-blur-sm bg-black/20 p-3 rounded-lg border border-gray-700">
                  <span className="text-gray-400 text-sm">Uptime</span>
                  <p className="text-amber-200">{formatUptime(metrics.uptime)}</p>
                </div>
                <div className="backdrop-blur-sm bg-black/20 p-3 rounded-lg border border-gray-700">
                  <span className="text-gray-400 text-sm">Load Average</span>
                  <p className="text-amber-200">{metrics.cpu.loadAvg[0].toFixed(2)}</p>
                </div>
                <div className="backdrop-blur-sm bg-black/20 p-3 rounded-lg border border-gray-700 col-span-2">
                  <span className="text-gray-400 text-sm">Memory Usage</span>
                  <div className="relative pt-1">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-semibold inline-block text-amber-200">
                          {metrics.memory.usedPercent.toFixed(1)}%
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-semibold inline-block text-amber-200">
                          {formatBytes(metrics.memory.used)} / {formatBytes(metrics.memory.total)}
                        </span>
                      </div>
                    </div>
                    <div className="overflow-hidden h-2 mb-1 text-xs flex rounded bg-gray-700 mt-1 border border-gray-600">
                      <div 
                        style={{ width: `${metrics.memory.usedPercent}%` }} 
                        className={`shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center ${
                          metrics.memory.usedPercent > 90 ? 'bg-red-500' : 
                          metrics.memory.usedPercent > 70 ? 'bg-amber-500' : 'bg-green-500'
                        }`}
                      />
                    </div>
                  </div>
                </div>
                <div className="backdrop-blur-sm bg-black/20 p-3 rounded-lg border border-gray-700">
                  <span className="text-gray-400 text-sm">Last Update</span>
                  <p className="text-amber-200">{new Date(metrics.timestamp).toLocaleTimeString()}</p>
                </div>
              </div>
            </div>
          )}
        </div>
        
        {/* Terminal Panel */}
        <div className="backdrop-blur-md backdrop-filter bg-gray-800/30 p-6 rounded-xl shadow-xl border border-gray-700 transition-all duration-300 hover:bg-gray-800/40">
          <h2 className="text-xl font-semibold mb-4 border-b border-gray-700 pb-2 text-amber-300">Terminal</h2>
          <div className="mb-4 bg-black border border-gray-700 p-4 rounded-lg h-72 overflow-y-auto font-mono text-sm text-amber-300 shadow-[inset_0_0_10px_rgba(0,0,0,0.6)]">
            <pre className="whitespace-pre-wrap">
              {commandOutput || 'Welcome to Nanos Terminal. Type a command to begin.'}
            </pre>
          </div>
          <form onSubmit={handleExecuteCommand} className="flex">
            <input
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="Enter command..."
              disabled={!isConnected || isExecuting}
              className="flex-grow px-4 py-2 border border-gray-700 bg-gray-900 text-amber-300 rounded-l-md focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent placeholder-gray-500"
            />
            <button
              type="submit"
              disabled={!isConnected || isExecuting || !command.trim()}
              className="px-4 py-2 bg-amber-700 text-gray-200 rounded-r-md hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent disabled:opacity-50 transition-colors duration-200"
            >
              {isExecuting ? 'Running...' : 'Run'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
} 