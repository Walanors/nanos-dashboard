'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSocket } from '@/hooks/useSocket';

// Module type definition
interface Module {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  isEnabled: boolean;
  hasConfig: boolean;
}

export default function ModulesPage() {
  const router = useRouter();
  const [modules, setModules] = useState<Module[]>([]);
  const [selectedModule, setSelectedModule] = useState<Module | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);
  const [installUrl, setInstallUrl] = useState('');
  
  // Get socket connection
  const { socket, isConnected, connectionError: socketError } = useSocket();
  
  useEffect(() => {
    // Fetch modules when socket is connected
    if (socket && isConnected) {
      socket.emit('modules:getAll', (response: { success: boolean, modules?: Module[] }) => {
        if (response.success && response.modules) {
          setModules(response.modules);
        }
      });
    }
  }, [socket, isConnected]);

  const toggleModuleState = (moduleId: string, currentState: boolean) => {
    if (!socket || !isConnected) return;
    
    const action = currentState ? 'disable' : 'enable';
    
    socket.emit(`modules:${action}`, moduleId, (response: { success: boolean, message?: string }) => {
      if (response.success) {
        // Update local state
        setModules(prev => 
          prev.map(mod => 
            mod.id === moduleId ? { ...mod, isEnabled: !currentState } : mod
          )
        );
      } else if (response.message) {
        console.error(`Failed to ${action} module:`, response.message);
        // Display error to user (could be improved with a toast notification)
        alert(`Failed to ${action} module: ${response.message}`);
      }
    });
  };

  const installModule = () => {
    if (!installUrl.trim() || !socket || !isConnected) return;
    
    setIsInstalling(true);
    
    socket.emit('modules:install', installUrl, (response: { success: boolean, module?: Module, message?: string }) => {
      setIsInstalling(false);
      
      if (response.success && response.module) {
        setModules(prev => [...prev, response.module as Module]);
        setInstallUrl('');
      } else if (response.message) {
        console.error('Failed to install module:', response.message);
        alert(`Failed to install module: ${response.message}`);
      }
    });
  };

  const openModuleConfig = (module: Module) => {
    setSelectedModule(module);
    // In a real implementation, you might want to fetch the module's configuration here
  };

  const closeModuleConfig = () => {
    setSelectedModule(null);
  };

  // Show connection error if socket isn't connected
  if (!isConnected && socketError) {
    return (
      <div className="min-h-screen bg-black/95 flex items-center justify-center">
        <div className="bg-black/70 border border-red-500/30 p-4 rounded-lg max-w-md text-center">
          <h3 className="text-red-400 text-lg mb-2">Connection Error</h3>
          <p className="text-amber-300/80 mb-4">{socketError}</p>
          <p className="text-amber-400/60 text-sm">
            Unable to connect to the server.
            Please check your connection and try again.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black/95 p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-amber-300 font-mono">Server Modules</h1>
        <button
          type="button"
          onClick={() => router.push('/dashboard')}
          className="px-4 py-2 bg-amber-500/20 text-amber-300 text-sm rounded hover:bg-amber-500/30 transition-colors"
        >
          Back to Dashboard
        </button>
      </div>
      
      {/* Install Module */}
      <div className="bg-black/40 border border-amber-500/20 rounded-lg p-4 mb-6">
        <h2 className="text-amber-400 font-mono mb-3 text-lg">Install New Module</h2>
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={installUrl}
            onChange={(e) => setInstallUrl(e.target.value)}
            placeholder="Enter module URL or file path..."
            className="flex-1 bg-black/60 border border-amber-500/20 rounded px-3 py-2 text-amber-300 focus:outline-none focus:border-amber-500/50"
            disabled={isInstalling}
          />
          <button
            type="button"
            onClick={installModule}
            disabled={!installUrl.trim() || isInstalling || !isConnected}
            className="px-4 py-2 bg-amber-500/20 text-amber-300 rounded hover:bg-amber-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isInstalling ? 'Installing...' : 'Install'}
          </button>
        </div>
      </div>
      
      {/* Modules List */}
      <div className="bg-black/40 border border-amber-500/20 rounded-lg mb-6">
        <h2 className="text-amber-400 font-mono p-4 border-b border-amber-500/20">Installed Modules</h2>
        
        {modules.length === 0 ? (
          <div className="p-6 text-center text-amber-300/60">
            No modules installed. Install your first module above.
          </div>
        ) : (
          <div className="divide-y divide-amber-500/10">
            {modules.map((module) => (
              <div 
                key={module.id} 
                className="p-4 hover:bg-black/60 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-amber-300 font-mono">{module.name}</h3>
                    <p className="text-amber-400/60 text-sm">v{module.version} • By {module.author}</p>
                    <p className="text-amber-300/70 text-sm mt-1">{module.description}</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    {module.hasConfig && (
                      <button
                        type="button"
                        onClick={() => openModuleConfig(module)}
                        className="px-3 py-1 bg-amber-500/10 text-amber-300 text-sm rounded hover:bg-amber-500/20 transition-colors"
                      >
                        Configure
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleModuleState(module.id, module.isEnabled)}
                      className={`px-3 py-1 text-sm rounded transition-colors ${
                        module.isEnabled 
                          ? 'bg-green-500/10 text-green-300 hover:bg-green-500/20' 
                          : 'bg-red-500/10 text-red-300 hover:bg-red-500/20'
                      }`}
                    >
                      {module.isEnabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* Module Configuration Modal */}
      {selectedModule && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-black/90 border border-amber-500/30 rounded-lg p-6 max-w-xl w-full">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-mono text-amber-300">{selectedModule.name} Configuration</h3>
              <button
                type="button"
                onClick={closeModuleConfig}
                className="text-amber-400/70 hover:text-amber-300"
              >
                ✕
              </button>
            </div>
            <div className="border-t border-amber-500/20 pt-4">
              <p className="text-amber-400/80 italic mb-4">
                Module configuration interface would go here. This is a placeholder.
              </p>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={closeModuleConfig}
                  className="px-4 py-2 bg-amber-500/20 text-amber-300 rounded hover:bg-amber-500/30 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 