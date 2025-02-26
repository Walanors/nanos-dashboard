'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSocket } from '@/hooks/useSocket';
import OnboardingStatus from '@/components/OnboardingStatus';
import { useUser } from '@/hooks/useUser';
import ServerConfiguration from '@/components/ServerConfiguration';

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
  const [activeTab, setActiveTab] = useState('configuration');
  
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
  
  if (!isAuthenticated) {
    return null; // Don't render anything while redirecting
  }

  return (
    <div className="min-h-screen bg-black/95">
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-amber-300 mb-8 font-mono">Server Dashboard</h1>
        
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