'use client';

import ModulesManager from '@/components/ModulesManager';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSocket } from '@/hooks/useSocket';
import { useUser } from '@/hooks/useUser';

export default function ModulesPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  
  // Get socket connection
  const { isConnected, connectionError: socketError } = useSocket();
  
  // Get user data
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

  // Show the modules manager
  return (
    <div className="min-h-screen bg-black/95">
      <div className="container mx-auto px-4 py-8">
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
        
        {/* Main Content */}
        <div className="bg-black/30 border border-amber-500/20 rounded-lg shadow">
          <ModulesManager />
        </div>
      </div>
    </div>
  );
} 