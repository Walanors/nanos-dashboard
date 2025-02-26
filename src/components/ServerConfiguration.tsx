'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSocket } from '@/hooks/useSocket';
import { toast } from 'react-hot-toast';

interface ServerConfig {
  discover: {
    name: string;
    description: string;
    ip: string;
    port: number;
    query_port: number;
    announce: boolean;
    dedicated_server: boolean;
  };
  general: {
    max_players: number;
    password: string;
    token: string;
    banned_ids: string[];
  };
  game: {
    map: string;
    game_mode: string;
    packages: string[];
    assets: string[];
    loading_screen: string;
  };
  custom_settings: Record<string, unknown>;
  debug: {
    log_level: number;
    async_log: boolean;
    profiling: boolean;
  };
  optimization: {
    tick_rate: number;
    compression: number;
  };
}

export default function ServerConfiguration() {
  const { executeCommand } = useSocket();
  const [config, setConfig] = useState<ServerConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load configuration from database
  const loadConfig = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // First check if we can connect to the socket
      const testConnection = await executeCommand('echo "test connection"');
      if (testConnection.error) {
        throw new Error('Socket not connected. Please ensure the service is running.');
      }

      const result = await executeCommand('get_server_config');
      if (result.error) {
        throw new Error(result.error);
      }

      const parsedConfig = JSON.parse(result.output) as ServerConfig;
      setConfig(parsedConfig);
      toast.success('Configuration loaded successfully');
    } catch (err) {
      const errorMessage = (err as Error).message;
      setError(errorMessage);
      toast.error(`Failed to load configuration: ${errorMessage}`);
      console.error('Load config error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [executeCommand]);

  // Save configuration to database
  const saveConfig = async () => {
    if (!config) return;
    setIsSaving(true);
    setError(null);
    try {
      const result = await executeCommand(`save_server_config ${JSON.stringify(config)}`);
      if (result.error) {
        throw new Error(result.error);
      }
      
      toast.success('Configuration saved successfully');
    } catch (err) {
      const errorMessage = (err as Error).message;
      setError(errorMessage);
      toast.error(`Failed to save configuration: ${errorMessage}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle form field changes
  const handleChange = (section: keyof ServerConfig, field: string, value: string | number | boolean | string[]) => {
    if (!config) return;
    setConfig(prev => {
      if (!prev) return prev;
      const sectionData = prev[section] as Record<string, unknown>;
      return {
        ...prev,
        [section]: {
          ...sectionData,
          [field]: value
        }
      };
    });
  };

  // Load config on component mount
  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  if (isLoading) {
    return (
      <div className="p-4">
        <div className="animate-pulse text-amber-300">Loading configuration...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="text-red-500">Error: {error}</div>
        <button
          type="button"
          onClick={loadConfig}
          className="mt-2 px-4 py-2 bg-amber-500/30 text-amber-300 rounded hover:bg-amber-500/40 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-amber-300 font-mono">Server Configuration</h2>
        <button
          type="button"
          onClick={saveConfig}
          disabled={isSaving}
          className="px-4 py-2 bg-amber-500/30 text-amber-300 rounded hover:bg-amber-500/40 transition-colors disabled:opacity-50"
        >
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {/* Discovery Settings */}
      <section className="space-y-4">
        <h3 className="text-lg font-mono text-amber-400">Discovery Settings</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label htmlFor="server-name" className="block text-sm font-mono text-gray-300">Server Name</label>
            <input
              id="server-name"
              type="text"
              value={config?.discover.name || ''}
              onChange={(e) => handleChange('discover', 'name', e.target.value)}
              className="w-full bg-black/30 border border-amber-500/20 rounded px-3 py-2 text-gray-300 focus:outline-none focus:border-amber-500/50"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="server-description" className="block text-sm font-mono text-gray-300">Description</label>
            <input
              id="server-description"
              type="text"
              value={config?.discover.description || ''}
              onChange={(e) => handleChange('discover', 'description', e.target.value)}
              className="w-full bg-black/30 border border-amber-500/20 rounded px-3 py-2 text-gray-300 focus:outline-none focus:border-amber-500/50"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="server-ip" className="block text-sm font-mono text-gray-300">IP Address</label>
            <input
              id="server-ip"
              type="text"
              value={config?.discover.ip || ''}
              onChange={(e) => handleChange('discover', 'ip', e.target.value)}
              className="w-full bg-black/30 border border-amber-500/20 rounded px-3 py-2 text-gray-300 focus:outline-none focus:border-amber-500/50"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="server-port" className="block text-sm font-mono text-gray-300">Port</label>
            <input
              id="server-port"
              type="number"
              value={config?.discover.port || ''}
              onChange={(e) => handleChange('discover', 'port', Number.parseInt(e.target.value, 10))}
              className="w-full bg-black/30 border border-amber-500/20 rounded px-3 py-2 text-gray-300 focus:outline-none focus:border-amber-500/50"
            />
          </div>
        </div>
      </section>

      {/* General Settings */}
      <section className="space-y-4">
        <h3 className="text-lg font-mono text-amber-400">General Settings</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label htmlFor="max-players" className="block text-sm font-mono text-gray-300">Max Players</label>
            <input
              id="max-players"
              type="number"
              value={config?.general.max_players || ''}
              onChange={(e) => handleChange('general', 'max_players', Number.parseInt(e.target.value, 10))}
              className="w-full bg-black/30 border border-amber-500/20 rounded px-3 py-2 text-gray-300 focus:outline-none focus:border-amber-500/50"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="server-password" className="block text-sm font-mono text-gray-300">Password</label>
            <input
              id="server-password"
              type="password"
              value={config?.general.password || ''}
              onChange={(e) => handleChange('general', 'password', e.target.value)}
              className="w-full bg-black/30 border border-amber-500/20 rounded px-3 py-2 text-gray-300 focus:outline-none focus:border-amber-500/50"
            />
          </div>
        </div>
      </section>

      {/* Game Settings */}
      <section className="space-y-4">
        <h3 className="text-lg font-mono text-amber-400">Game Settings</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label htmlFor="game-map" className="block text-sm font-mono text-gray-300">Map</label>
            <input
              id="game-map"
              type="text"
              value={config?.game.map || ''}
              onChange={(e) => handleChange('game', 'map', e.target.value)}
              className="w-full bg-black/30 border border-amber-500/20 rounded px-3 py-2 text-gray-300 focus:outline-none focus:border-amber-500/50"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="game-mode" className="block text-sm font-mono text-gray-300">Game Mode</label>
            <input
              id="game-mode"
              type="text"
              value={config?.game.game_mode || ''}
              onChange={(e) => handleChange('game', 'game_mode', e.target.value)}
              className="w-full bg-black/30 border border-amber-500/20 rounded px-3 py-2 text-gray-300 focus:outline-none focus:border-amber-500/50"
            />
          </div>
        </div>
      </section>

      {/* Debug Settings */}
      <section className="space-y-4">
        <h3 className="text-lg font-mono text-amber-400">Debug Settings</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label htmlFor="log-level" className="block text-sm font-mono text-gray-300">Log Level</label>
            <select
              id="log-level"
              value={config?.debug.log_level || 1}
              onChange={(e) => handleChange('debug', 'log_level', Number.parseInt(e.target.value, 10))}
              className="w-full bg-black/30 border border-amber-500/20 rounded px-3 py-2 text-gray-300 focus:outline-none focus:border-amber-500/50"
            >
              <option value={0}>None</option>
              <option value={1}>Error</option>
              <option value={2}>Warning</option>
              <option value={3}>Info</option>
              <option value={4}>Debug</option>
            </select>
          </div>
          <div className="space-y-2">
            <label htmlFor="async-log" className="block text-sm font-mono text-gray-300">Async Log</label>
            <div className="flex items-center space-x-2">
              <input
                id="async-log"
                type="checkbox"
                checked={config?.debug.async_log || false}
                onChange={(e) => handleChange('debug', 'async_log', e.target.checked)}
                className="bg-black/30 border border-amber-500/20 rounded text-amber-500 focus:ring-amber-500"
              />
              <span className="text-gray-300">Enable async logging</span>
            </div>
          </div>
        </div>
      </section>

      {/* Optimization Settings */}
      <section className="space-y-4">
        <h3 className="text-lg font-mono text-amber-400">Optimization Settings</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label htmlFor="tick-rate" className="block text-sm font-mono text-gray-300">Tick Rate</label>
            <input
              id="tick-rate"
              type="number"
              value={config?.optimization.tick_rate || ''}
              onChange={(e) => handleChange('optimization', 'tick_rate', Number.parseInt(e.target.value, 10))}
              className="w-full bg-black/30 border border-amber-500/20 rounded px-3 py-2 text-gray-300 focus:outline-none focus:border-amber-500/50"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="compression-level" className="block text-sm font-mono text-gray-300">Compression Level</label>
            <input
              id="compression-level"
              type="number"
              min="0"
              max="9"
              value={config?.optimization.compression || ''}
              onChange={(e) => handleChange('optimization', 'compression', Number.parseInt(e.target.value, 10))}
              className="w-full bg-black/30 border border-amber-500/20 rounded px-3 py-2 text-gray-300 focus:outline-none focus:border-amber-500/50"
            />
          </div>
        </div>
      </section>
    </div>
  );
} 