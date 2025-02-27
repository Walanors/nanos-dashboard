'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ServerConfiguration from '@/components/ServerConfiguration';
import { useSocket } from '@/hooks/useSocket';

export default function ConfigurationPage() {
  const router = useRouter();
  // Layout already handles authentication, no need for duplicate loading state
  
  // Get socket connection
  const { isConnected, connectionError: socketError } = useSocket();
  
  // Show connection error if socket isn't connected
  if (!isConnected && socketError) {
    return (
      <div className="min-h-screen bg-black/95 flex items-center justify-center">
        <div className="bg-black/70 border border-red-500/30 p-4 rounded-lg max-w-md text-center">
          <h3 className="text-red-400 text-lg mb-2">Connection Error</h3>
          <p className="text-amber-300/80 mb-4">{socketError}</p>
          <p className="text-amber-400/60 text-sm">
            Unable to load server configuration. 
            Please check your connection and try again.
          </p>
          <button 
            type="button"
            onClick={() => router.push('/dashboard')}
            className="px-4 py-2 bg-amber-500/20 text-amber-300 rounded mt-4 hover:bg-amber-500/30 transition-colors"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black/95 p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-amber-300 font-mono">Server Configuration</h1>
        <button
          type="button"
          onClick={() => router.push('/dashboard')}
          className="px-4 py-2 bg-amber-500/20 text-amber-300 text-sm rounded hover:bg-amber-500/30 transition-colors"
        >
          Back to Dashboard
        </button>
      </div>
      
      <div className="bg-black/40 rounded-lg border border-amber-500/20">
        <ServerConfiguration />
      </div>
    </div>
  );
} 