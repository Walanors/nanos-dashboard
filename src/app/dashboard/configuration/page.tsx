'use client';

import { useState, useEffect } from 'react';
import { useSocket } from '@/hooks/useSocket';
import ServerConfiguration from '@/components/ServerConfiguration';
import { useRouter } from 'next/navigation';

export default function ConfigurationPage() {
  const router = useRouter();
  const { isConnected, connectionError, metrics, connectionState, reconnect } = useSocket();
  const [activeSection, setActiveSection] = useState('server');

  // Connection Status Component (inline implementation)
  const ConnectionStatus = () => {
    return (
      <div className="bg-black/50 border border-amber-500/30 rounded-lg p-4 mb-6">
        <h3 className="text-lg font-mono text-amber-400 mb-3">Connection Status</h3>
        <div className="space-y-3">
          <div className="flex items-center">
            <div className={`w-3 h-3 rounded-full mr-2 ${
              isConnected 
                ? 'bg-green-500' 
                : connectionState.connecting 
                  ? 'bg-yellow-500 animate-pulse' 
                  : 'bg-red-500'
            }`} />
            <span className="text-sm text-amber-300/90 font-mono">
              {isConnected 
                ? 'Connected' 
                : connectionState.connecting 
                  ? 'Connecting...' 
                  : 'Disconnected'}
            </span>
          </div>
          
          {connectionState.reconnectCount > 0 && (
            <div className="text-xs text-amber-300/70 font-mono ml-5">
              Reconnection attempts: {connectionState.reconnectCount}
            </div>
          )}
          
          {connectionState.lastConnectAttempt && (
            <div className="text-xs text-amber-300/70 font-mono ml-5">
              Last attempt: {new Date(connectionState.lastConnectAttempt).toLocaleTimeString()}
            </div>
          )}
          
          {connectionError && (
            <div className="mt-2 text-sm text-red-400/90 font-mono p-2 bg-red-900/20 border border-red-500/30 rounded">
              {connectionError}
            </div>
          )}
          
          <div className="mt-2">
            <button
              type="button"
              onClick={() => reconnect()}
              className="px-3 py-1 bg-amber-500/20 text-amber-300 rounded hover:bg-amber-500/30 transition-colors font-mono text-xs"
            >
              Reconnect
            </button>
          </div>
        </div>
      </div>
    );
  };

  // System Metrics Component (inline implementation)
  const SystemMetrics = () => {
    if (!metrics) {
      return (
        <div className="bg-black/50 border border-amber-500/30 rounded-lg p-4 mb-6">
          <h3 className="text-lg font-mono text-amber-400 mb-3">System Metrics</h3>
          <p className="text-sm text-amber-300/70 font-mono">No metrics available</p>
        </div>
      );
    }

    // Format bytes to human-readable size
    const formatBytes = (bytes: number): string => {
      if (!bytes || bytes === 0) return '0 Bytes';
      
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      
      return `${Number.parseFloat((bytes / (k ** i)).toFixed(1))} ${sizes[i]}`;
    };

    return (
      <div className="bg-black/50 border border-amber-500/30 rounded-lg p-4 mb-6">
        <h3 className="text-lg font-mono text-amber-400 mb-3">System Metrics</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h4 className="text-sm font-mono text-amber-300/80 mb-2">System</h4>
            <div className="space-y-1 text-sm font-mono">
              <p className="text-amber-300/70">Uptime: {Math.floor(metrics.uptime / 60 / 60)} hours</p>
              <p className="text-amber-300/70">Version: {metrics.version.current}</p>
              {metrics.version.updateAvailable && (
                <p className="text-green-400/90">
                  Update available: {metrics.version.latest}
                </p>
              )}
            </div>
          </div>
          
          <div>
            <h4 className="text-sm font-mono text-amber-300/80 mb-2">Resources</h4>
            <div className="space-y-1 text-sm font-mono">
              <p className="text-amber-300/70">
                Memory: {formatBytes(metrics.memory.used)} / {formatBytes(metrics.memory.total)} 
                ({metrics.memory.usedPercent.toFixed(1)}%)
              </p>
              <p className="text-amber-300/70">
                CPU: {metrics.cpu.usage.toFixed(1)}% (Cores: {metrics.cpu.cores})
              </p>
              <p className="text-amber-300/70">
                Load: {metrics.cpu.loadAvg.map(load => load.toFixed(2)).join(' - ')}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Navigation between sections
  const renderNavigation = () => {
    return (
      <div className="flex space-x-4 mb-6 border-b border-amber-500/20">
        <button
          type="button"
          onClick={() => setActiveSection('server')}
          className={`px-4 py-2 font-mono text-sm transition-colors ${
            activeSection === 'server'
              ? 'text-amber-300 border-b-2 border-amber-500'
              : 'text-gray-400 hover:text-amber-300'
          }`}
        >
          Server Configuration
        </button>
        <button
          type="button"
          onClick={() => setActiveSection('connection')}
          className={`px-4 py-2 font-mono text-sm transition-colors ${
            activeSection === 'connection'
              ? 'text-amber-300 border-b-2 border-amber-500'
              : 'text-gray-400 hover:text-amber-300'
          }`}
        >
          Connection Status
        </button>
      </div>
    );
  };

  // Render the active section
  const renderContent = () => {
    switch (activeSection) {
      case 'server':
        return <ServerConfiguration />;
      case 'connection':
        return (
          <div className="p-6">
            <ConnectionStatus />
            <SystemMetrics />
          </div>
        );
      default:
        return <ServerConfiguration />;
    }
  };

  return (
    <div className="min-h-screen bg-black/95">
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-amber-300 mb-8 font-mono">Configuration Manager</h1>
        
        {/* Connection warning if there are errors */}
        {connectionError && !isConnected && (
          <div className="mb-6 bg-red-900/20 border border-red-500/30 p-3 rounded">
            <p className="text-red-400 text-sm">
              Connection warning: {connectionError}
            </p>
          </div>
        )}
        
        {/* Navigation */}
        {renderNavigation()}
        
        {/* Content Area */}
        <div className="bg-black/40 rounded-lg border border-amber-500/20">
          {renderContent()}
        </div>
      </div>
    </div>
  );
} 