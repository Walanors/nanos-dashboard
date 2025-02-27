'use client';

import dynamic from 'next/dynamic';

// Dynamically import the components to prevent server-side rendering issues
const ServerStatusControl = dynamic(() => import('@/components/ServerStatus'), {
  ssr: false,
  loading: () => <div className="p-6 animate-pulse">Loading server status...</div>
});

const ServerConsole = dynamic(() => import('@/components/ServerConsole'), {
  ssr: false,
  loading: () => <div className="p-6 animate-pulse">Loading server console...</div>
});

export default function ServerPage() {
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold text-amber-300 mb-6">Nanos World Server Management</h1>
      
      <div className="grid grid-cols-1 gap-8">
        <div className="bg-gray-900/60 rounded-lg shadow-lg overflow-hidden">
          <ServerStatusControl />
        </div>
        
        <div className="bg-gray-900/60 rounded-lg shadow-lg overflow-hidden">
          <ServerConsole />
        </div>
      </div>
    </div>
  );
} 