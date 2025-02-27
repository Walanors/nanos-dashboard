'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSocket } from '@/hooks/useSocket';
import { useUser } from '@/hooks/useUser';
import ServerConfiguration from '@/components/ServerConfiguration';

export default function DashboardPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('configuration');
  
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
  
  const renderContent = () => {
    switch (activeTab) {
      case 'configuration':
        return <ServerConfiguration />;
      // Add other tabs here
      default:
        return null;
    }
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
        
        {/* Navigation Tabs */}
        <div className="flex space-x-4 mb-6 border-b border-amber-500/20">
          <button
            type="button"
            onClick={() => setActiveTab('configuration')}
            className={`px-4 py-2 font-mono text-sm transition-colors ${
              activeTab === 'configuration'
                ? 'text-amber-300 border-b-2 border-amber-500'
                : 'text-gray-400 hover:text-amber-300'
            }`}
          >
            Configuration
          </button>
          {/* Add other tabs here */}
        </div>

        {/* Content Area */}
        <div className="bg-black/40 rounded-lg border border-amber-500/20">
          {renderContent()}
        </div>
      </div>
    </div>
  );
} 