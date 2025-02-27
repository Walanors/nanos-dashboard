'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSocket } from '@/hooks/useSocket';

// Settings interface
interface SystemSettings {
  debugMode: boolean;
  autoRestart: boolean;
  maxPlayers: number;
  updateChannel: 'stable' | 'beta' | 'dev';
  backupInterval: number; // hours
  notificationsEnabled: boolean;
  theme: 'default' | 'dark' | 'light';
}

export default function SettingsPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [settings, setSettings] = useState<SystemSettings>({
    debugMode: false,
    autoRestart: true,
    maxPlayers: 32,
    updateChannel: 'stable',
    backupInterval: 24,
    notificationsEnabled: true,
    theme: 'default'
  });
  
  // Get socket connection
  const { socket, isConnected, connectionError: socketError } = useSocket();
  
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

  useEffect(() => {
    // Fetch current settings
    if (socket && isConnected) {
      socket.emit('settings:getAll', (response: { success: boolean, settings?: SystemSettings }) => {
        if (response.success && response.settings) {
          setSettings(response.settings);
        }
      });
    }
  }, [socket, isConnected]);

  const handleChange = (key: keyof SystemSettings, value: string | number | boolean) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const saveSettings = () => {
    if (!socket || !isConnected) return;
    
    setIsSaving(true);
    
    socket.emit('settings:update', settings, (response: { success: boolean, message?: string }) => {
      setIsSaving(false);
      
      if (response.success) {
        alert('Settings saved successfully!');
      } else if (response.message) {
        console.error('Failed to save settings:', response.message);
        alert(`Failed to save settings: ${response.message}`);
      }
    });
  };

  const resetSettings = () => {
    if (!socket || !isConnected) return;
    
    if (confirm('Are you sure you want to reset all settings to defaults?')) {
      socket.emit('settings:reset', (response: { success: boolean, settings?: SystemSettings, message?: string }) => {
        if (response.success && response.settings) {
          setSettings(response.settings);
          alert('Settings have been reset to defaults.');
        } else if (response.message) {
          console.error('Failed to reset settings:', response.message);
          alert(`Failed to reset settings: ${response.message}`);
        }
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-pulse text-amber-400 text-lg font-mono">
          <span className="mr-2">$</span>
          Loading settings...
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
            Unable to load system settings. 
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
        <h1 className="text-2xl font-bold text-amber-300 font-mono">System Settings</h1>
        <button
          type="button"
          onClick={() => router.push('/dashboard')}
          className="px-4 py-2 bg-amber-500/20 text-amber-300 text-sm rounded hover:bg-amber-500/30 transition-colors"
        >
          Back to Dashboard
        </button>
      </div>
      
      <div className="bg-black/40 border border-amber-500/20 rounded-lg p-6">
        <form onSubmit={(e) => { e.preventDefault(); saveSettings(); }}>
          {/* System Settings */}
          <div className="mb-8">
            <h2 className="text-amber-400 font-mono mb-4 pb-2 border-b border-amber-500/20">System Configuration</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Toggle Settings */}
              <div>
                <div className="mb-4">
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.debugMode}
                      onChange={(e) => handleChange('debugMode', e.target.checked)}
                      className="sr-only"
                    />
                    <div className={`relative w-10 h-5 rounded-full transition-colors ${settings.debugMode ? 'bg-amber-500/80' : 'bg-gray-500/30'}`}>
                      <div className={`absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-amber-100 transition-transform ${settings.debugMode ? 'translate-x-5' : ''}`} />
                    </div>
                    <span className="ml-3 text-amber-300 font-mono">Debug Mode</span>
                  </label>
                </div>
                
                <div className="mb-4">
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.autoRestart}
                      onChange={(e) => handleChange('autoRestart', e.target.checked)}
                      className="sr-only"
                    />
                    <div className={`relative w-10 h-5 rounded-full transition-colors ${settings.autoRestart ? 'bg-amber-500/80' : 'bg-gray-500/30'}`}>
                      <div className={`absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-amber-100 transition-transform ${settings.autoRestart ? 'translate-x-5' : ''}`} />
                    </div>
                    <span className="ml-3 text-amber-300 font-mono">Auto Restart on Crash</span>
                  </label>
                </div>
                
                <div className="mb-4">
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.notificationsEnabled}
                      onChange={(e) => handleChange('notificationsEnabled', e.target.checked)}
                      className="sr-only"
                    />
                    <div className={`relative w-10 h-5 rounded-full transition-colors ${settings.notificationsEnabled ? 'bg-amber-500/80' : 'bg-gray-500/30'}`}>
                      <div className={`absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-amber-100 transition-transform ${settings.notificationsEnabled ? 'translate-x-5' : ''}`} />
                    </div>
                    <span className="ml-3 text-amber-300 font-mono">Enable Notifications</span>
                  </label>
                </div>
              </div>
              
              {/* Numeric/Select Settings */}
              <div>
                <div className="mb-4">
                  <label htmlFor="maxPlayers" className="block mb-2 text-amber-300 font-mono">Max Players</label>
                  <input
                    id="maxPlayers"
                    type="number"
                    value={settings.maxPlayers}
                    onChange={(e) => handleChange('maxPlayers', Number.parseInt(e.target.value) || 1)}
                    min="1"
                    max="100"
                    className="w-full bg-black/60 border border-amber-500/20 rounded px-3 py-2 text-amber-300 focus:outline-none focus:border-amber-500/50"
                  />
                </div>
                
                <div className="mb-4">
                  <label htmlFor="updateChannel" className="block mb-2 text-amber-300 font-mono">Update Channel</label>
                  <select
                    id="updateChannel"
                    value={settings.updateChannel}
                    onChange={(e) => handleChange('updateChannel', e.target.value as 'stable' | 'beta' | 'dev')}
                    className="w-full bg-black/60 border border-amber-500/20 rounded px-3 py-2 text-amber-300 focus:outline-none focus:border-amber-500/50"
                  >
                    <option value="stable">Stable</option>
                    <option value="beta">Beta</option>
                    <option value="dev">Development</option>
                  </select>
                </div>
                
                <div className="mb-4">
                  <label htmlFor="backupInterval" className="block mb-2 text-amber-300 font-mono">Backup Interval (hours)</label>
                  <input
                    id="backupInterval"
                    type="number"
                    value={settings.backupInterval}
                    onChange={(e) => handleChange('backupInterval', Number.parseInt(e.target.value) || 1)}
                    min="1"
                    max="168"
                    className="w-full bg-black/60 border border-amber-500/20 rounded px-3 py-2 text-amber-300 focus:outline-none focus:border-amber-500/50"
                  />
                </div>
              </div>
            </div>
          </div>
          
          {/* User Interface Settings */}
          <div className="mb-8">
            <h2 className="text-amber-400 font-mono mb-4 pb-2 border-b border-amber-500/20">Interface Settings</h2>
            
            <div className="mb-4">
              <label htmlFor="theme" className="block mb-2 text-amber-300 font-mono">Theme</label>
              <select
                id="theme"
                value={settings.theme}
                onChange={(e) => handleChange('theme', e.target.value as 'default' | 'dark' | 'light')}
                className="w-full max-w-xs bg-black/60 border border-amber-500/20 rounded px-3 py-2 text-amber-300 focus:outline-none focus:border-amber-500/50"
              >
                <option value="default">Default (Amber)</option>
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
            </div>
          </div>
          
          {/* Action Buttons */}
          <div className="flex justify-between mt-8">
            <button
              type="button"
              onClick={resetSettings}
              className="px-4 py-2 bg-red-500/10 text-red-300 rounded hover:bg-red-500/20 transition-colors"
            >
              Reset to Defaults
            </button>
            
            <div className="flex space-x-4">
              <button
                type="button"
                onClick={() => router.push('/dashboard')}
                className="px-4 py-2 bg-black/40 text-amber-300 rounded hover:bg-black/60 transition-colors"
              >
                Cancel
              </button>
              
              <button
                type="submit"
                disabled={isSaving || !isConnected}
                className="px-6 py-2 bg-amber-500/20 text-amber-300 rounded hover:bg-amber-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
} 