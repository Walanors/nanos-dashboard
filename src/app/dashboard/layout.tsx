'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useSocket } from '@/hooks/useSocket';
import SocketDebugger from '@/components/SocketDebugger';
import Image from 'next/image';
import Link from 'next/link';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isLoading, setIsLoading] = useState(true);
  const [userData, setUserData] = useState<{ username: string } | null>(null);
  const [showDebugger, setShowDebugger] = useState(false);
  const [connectionAttempts, setConnectionAttempts] = useState(0);
  
  // Get socket connection status
  const { isConnected, isConnecting, connectionState, reconnect } = useSocket();

  // Effect for checking authentication and loading user data
  useEffect(() => {
    const credentials = sessionStorage.getItem('credentials');
    
    if (!credentials) {
      console.log('No credentials found in layout, redirecting to login');
      router.push('/');
      return;
    }
    
    try {
      const parsed = JSON.parse(credentials);
      setUserData({
        username: parsed.username || 'Admin',
      });
      setIsLoading(false);
    } catch (error) {
      console.error('Error parsing credentials:', error);
      sessionStorage.removeItem('credentials');
      router.push('/');
    }
  }, [router]);

  // Effect for tracking connection attempts
  useEffect(() => {
    if (connectionState.reconnectCount > connectionAttempts) {
      setConnectionAttempts(connectionState.reconnectCount);
    }
  }, [connectionAttempts, connectionState.reconnectCount]);

  const handleLogout = () => {
    sessionStorage.removeItem('credentials');
    router.push('/');
  };

  const isActivePath = (path: string) => {
    if (path === '/dashboard' && pathname === '/dashboard') {
      return true;
    }
    if (path !== '/dashboard' && pathname?.startsWith(path)) {
      return true;
    }
    return false;
  };

  // Show loading screen until we have both user data and socket connection
  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen bg-black">
        <div className="animate-pulse text-amber-400 text-lg font-mono">
          <span className="mr-2">$</span>
          Loading user data...
        </div>
      </div>
    );
  }

  // If we're not connected yet, show a loading screen with connection info
  if (isConnecting) {
    return (
      <div className="flex flex-col justify-center items-center h-screen bg-black">
        <div className="mb-8">
          <Image 
            src="/nanosLogo.png" 
            alt="Nanos Logo" 
            width={100} 
            height={100} 
            priority
          />
        </div>
        <div className="animate-pulse text-amber-400 text-lg font-mono mb-4">
          <span className="mr-2">$</span>
          Establishing connection to server...
        </div>
        
        {connectionAttempts > 0 && (
          <div className="text-amber-400/70 text-sm font-mono mb-4">
            Connection attempt {connectionAttempts}...
          </div>
        )}
        
        {connectionState.error && (
          <div className="bg-red-900/20 border border-red-500/30 p-3 rounded max-w-md text-center mb-4">
            <p className="text-red-400 text-sm mb-1">
              Connection error: {connectionState.error}
            </p>
            <p className="text-amber-400/60 text-xs">
              Trying to reconnect automatically...
            </p>
          </div>
        )}
        
        {connectionAttempts >= 3 && (
          <button
            type="button"
            onClick={reconnect}
            className="px-4 py-2 bg-amber-500/20 text-amber-300 rounded mt-2 hover:bg-amber-500/30 transition-colors"
          >
            Retry Connection
          </button>
        )}
      </div>
    );
  }

  // Show permanent error screen after several failed attempts
  if (!isConnected && connectionAttempts >= 5) {
    return (
      <div className="flex flex-col justify-center items-center h-screen bg-black">
        <div className="mb-8">
          <Image 
            src="/nanosLogo.png" 
            alt="Nanos Logo" 
            width={100} 
            height={100} 
            priority
          />
        </div>
        <div className="text-red-400 text-2xl font-mono mb-4">
          Connection Failed
        </div>
        
        <div className="bg-red-900/20 border border-red-500/30 p-4 rounded max-w-md text-center mb-6">
          <p className="text-amber-300 mb-2">
            Unable to establish a connection to the server after multiple attempts.
          </p>
          <p className="text-amber-400/60 text-sm mb-4">
            Error: {connectionState.error || 'Unknown connection error'}
          </p>
          <div className="text-amber-400/80 text-xs text-left bg-black/50 p-2 rounded mb-3">
            <p className="mb-1">Troubleshooting tips:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>Verify the server is running</li>
              <li>Check your network connection</li>
              <li>Make sure your credentials are correct</li>
              <li>Check if the server address is correct</li>
            </ul>
          </div>
        </div>
        
        <div className="flex space-x-4">
          <button
            type="button"
            onClick={reconnect}
            className="px-4 py-2 bg-amber-500/20 text-amber-300 rounded hover:bg-amber-500/30 transition-colors"
          >
            Try Again
          </button>
          <button 
            type="button"
            onClick={handleLogout}
            className="px-4 py-2 bg-red-500/20 text-red-300 rounded hover:bg-red-500/30 transition-colors"
          >
            Return to Login
          </button>
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex h-screen bg-black text-amber-300">
      {/* Sidebar */}
      <div className="w-64 bg-black border-r border-amber-500/20 flex flex-col">
        {/* Logo Area */}
        <div className="p-4 border-b border-amber-500/20 flex items-center space-x-3">
          <Image 
            src="/nanosLogo.png" 
            alt="Nanos Logo" 
            width={40} 
            height={40} 
            priority
          />
          <div className="font-mono text-lg text-amber-400">Nanos Admin</div>
        </div>
        
        {/* User Info */}
        <div className="p-4 border-b border-amber-500/20">
          <div className="font-mono text-sm text-amber-400/80">
            Logged in as:
          </div>
          <div className="font-mono font-bold">
            {userData?.username || 'Admin'}
          </div>
        </div>
        
        {/* Navigation */}
        <nav className="flex-grow p-4">
          <ul className="space-y-2">
            <li>
              <Link 
                href="/dashboard"
                className={`block py-2 px-4 rounded font-mono transition-colors ${
                  isActivePath('/dashboard') && !pathname?.includes('/dashboard/')
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'text-amber-400/70 hover:bg-black/40 hover:text-amber-300'
                }`}
              >
                Overview
              </Link>
            </li>
            <li>
              <Link
                href="/dashboard/configuration"
                className={`block py-2 px-4 rounded font-mono transition-colors ${
                  isActivePath('/dashboard/configuration')
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'text-amber-400/70 hover:bg-black/40 hover:text-amber-300'
                }`}
              >
                Configuration
              </Link>
            </li>
            <li>
              <Link
                href="/dashboard/console"
                className={`block py-2 px-4 rounded font-mono transition-colors ${
                  isActivePath('/dashboard/console')
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'text-amber-400/70 hover:bg-black/40 hover:text-amber-300'
                }`}
              >
                Console
              </Link>
            </li>
            <li>
              <Link
                href="/dashboard/modules"
                className={`block py-2 px-4 rounded font-mono transition-colors ${
                  isActivePath('/dashboard/modules')
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'text-amber-400/70 hover:bg-black/40 hover:text-amber-300'
                }`}
              >
                Modules
              </Link>
            </li>
            <li>
              <Link
                href="/dashboard/settings"
                className={`block py-2 px-4 rounded font-mono transition-colors ${
                  isActivePath('/dashboard/settings')
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'text-amber-400/70 hover:bg-black/40 hover:text-amber-300'
                }`}
              >
                Settings
              </Link>
            </li>
          </ul>
        </nav>
        
        {/* Footer */}
        <div className="p-4 border-t border-amber-500/20">
          <div className="flex justify-between mb-4">
            <button
              type="button"
              onClick={() => setShowDebugger(!showDebugger)}
              className="text-amber-400/50 text-xs hover:text-amber-400 transition-colors"
            >
              {showDebugger ? 'Hide Debugger' : 'Show Debugger'}
            </button>
            <div className={`h-2 w-2 rounded-full ${
              isConnected ? 'bg-green-500' : 'bg-red-500'
            }`} />
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full py-2 px-4 bg-red-500/10 text-red-300 rounded hover:bg-red-500/20 transition-colors font-mono text-sm"
          >
            Logout
          </button>
        </div>
      </div>
      
      {/* Main Content */}
      <div className="flex-grow overflow-auto">
        {/* Socket Debugger (conditionally rendered) */}
        {showDebugger && (
          <div className="border-b border-amber-500/20 bg-black/80">
            <SocketDebugger />
          </div>
        )}
        
        {/* Page Content */}
        {children}
      </div>
    </div>
  );
} 