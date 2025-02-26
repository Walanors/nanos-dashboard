'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSocket } from '@/hooks/useSocket';
import { NANOS_INSTALL_DIR } from './NanosOnboarding';
import * as TOML from '@iarna/toml';
import { toast } from 'react-hot-toast';

// Define the type for the TOML parser output
interface TomlTable {
  discover?: {
    name?: unknown;
    description?: unknown;
    ip?: unknown;
    port?: unknown;
    query_port?: unknown;
    announce?: unknown;
    dedicated_server?: unknown;
  };
  general?: {
    max_players?: unknown;
    password?: unknown;
    token?: unknown;
    banned_ids?: unknown;
  };
  game?: {
    map?: unknown;
    game_mode?: unknown;
    packages?: unknown;
    assets?: unknown;
    loading_screen?: unknown;
  };
  custom_settings?: Record<string, unknown>;
  debug?: {
    log_level?: unknown;
    async_log?: unknown;
    profiling?: unknown;
  };
  optimization?: {
    tick_rate?: unknown;
    compression?: unknown;
  };
}

type ServerConfigSection<T> = {
  [K in keyof T]: T[K];
};

interface ServerConfig {
  discover: ServerConfigSection<{
    name: string;
    description: string;
    ip: string;
    port: number;
    query_port: number;
    announce: boolean;
    dedicated_server: boolean;
  }>;
  general: ServerConfigSection<{
    max_players: number;
    password: string;
    token: string;
    banned_ids: string[];
  }>;
  game: ServerConfigSection<{
    map: string;
    game_mode: string;
    packages: string[];
    assets: string[];
    loading_screen: string;
  }>;
  custom_settings: Record<string, unknown>;
  debug: ServerConfigSection<{
    log_level: number;
    async_log: boolean;
    profiling: boolean;
  }>;
  optimization: ServerConfigSection<{
    tick_rate: number;
    compression: number;
  }>;
}

type ParsedTomlConfig = {
  [K in keyof ServerConfig]?: K extends 'custom_settings' 
    ? Record<string, unknown>
    : ServerConfig[K];
};

export default function ServerConfiguration() {
  const { executeCommand } = useSocket();
  const [config, setConfig] = useState<ServerConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load configuration from file
  const loadConfig = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // First check if we can connect to the socket
      const testConnection = await executeCommand('echo "test connection"');
      if (testConnection.error) {
        throw new Error('Socket not connected. Please ensure the service is running.');
      }

      const result = await executeCommand(`cat "${NANOS_INSTALL_DIR}/Config.toml"`);
      if (result.error) {
        throw new Error(result.error);
      }

      // Get the raw output and clean it
      const rawOutput = result.output;
      console.log('Raw command output:', rawOutput);

      // Clean the output by removing any potential shell prompts or command success messages
      const configLines = rawOutput.split('\n');
      const cleanedLines = configLines.filter(line => 
        !line.includes('Command executed successfully') &&
        !line.match(/^root@.*#/) && // Remove root shell prompts
        line.trim() !== '' // Remove empty lines
      );
      
      // Join lines and ensure proper line endings
      const configContent = cleanedLines.join('\n').trim();
      console.log('Cleaned config content:', configContent);

      try {
        // Parse TOML content with explicit type casting
        const rawParsedConfig = TOML.parse(configContent) as TomlTable;
        const parsedConfig: ParsedTomlConfig = {
          discover: rawParsedConfig.discover ? {
            name: String(rawParsedConfig.discover.name || ''),
            description: String(rawParsedConfig.discover.description || ''),
            ip: String(rawParsedConfig.discover.ip || '0.0.0.0'),
            port: Number(rawParsedConfig.discover.port || 7777),
            query_port: Number(rawParsedConfig.discover.query_port || 7778),
            announce: Boolean(rawParsedConfig.discover.announce),
            dedicated_server: Boolean(rawParsedConfig.discover.dedicated_server),
          } : undefined,
          general: rawParsedConfig.general ? {
            max_players: Number(rawParsedConfig.general.max_players || 64),
            password: String(rawParsedConfig.general.password || ''),
            token: String(rawParsedConfig.general.token || ''),
            banned_ids: Array.isArray(rawParsedConfig.general.banned_ids) 
              ? rawParsedConfig.general.banned_ids.map(String)
              : [],
          } : undefined,
          game: rawParsedConfig.game ? {
            map: String(rawParsedConfig.game.map || 'default-blank-map'),
            game_mode: String(rawParsedConfig.game.game_mode || ''),
            packages: Array.isArray(rawParsedConfig.game.packages)
              ? rawParsedConfig.game.packages.map(String)
              : [],
            assets: Array.isArray(rawParsedConfig.game.assets)
              ? rawParsedConfig.game.assets.map(String)
              : [],
            loading_screen: String(rawParsedConfig.game.loading_screen || ''),
          } : undefined,
          custom_settings: rawParsedConfig.custom_settings || {},
          debug: rawParsedConfig.debug ? {
            log_level: Number(rawParsedConfig.debug.log_level || 1),
            async_log: Boolean(rawParsedConfig.debug.async_log),
            profiling: Boolean(rawParsedConfig.debug.profiling),
          } : undefined,
          optimization: rawParsedConfig.optimization ? {
            tick_rate: Number(rawParsedConfig.optimization.tick_rate || 33),
            compression: Number(rawParsedConfig.optimization.compression || 0),
          } : undefined,
        };
        console.log('Raw parsed config:', parsedConfig);

        // Convert the parsed config to our expected format with defaults
        const typedConfig: ServerConfig = {
          discover: {
            name: parsedConfig.discover?.name ?? '',
            description: parsedConfig.discover?.description ?? '',
            ip: parsedConfig.discover?.ip ?? '0.0.0.0',
            port: parsedConfig.discover?.port ?? 7777,
            query_port: parsedConfig.discover?.query_port ?? 7778,
            announce: parsedConfig.discover?.announce ?? true,
            dedicated_server: parsedConfig.discover?.dedicated_server ?? true,
          },
          general: {
            max_players: parsedConfig.general?.max_players ?? 64,
            password: parsedConfig.general?.password ?? '',
            token: parsedConfig.general?.token ?? '',
            banned_ids: parsedConfig.general?.banned_ids ?? [],
          },
          game: {
            map: parsedConfig.game?.map ?? 'default-blank-map',
            game_mode: parsedConfig.game?.game_mode ?? '',
            packages: parsedConfig.game?.packages ?? [],
            assets: parsedConfig.game?.assets ?? [],
            loading_screen: parsedConfig.game?.loading_screen ?? '',
          },
          custom_settings: parsedConfig.custom_settings ?? {},
          debug: {
            log_level: parsedConfig.debug?.log_level ?? 1,
            async_log: parsedConfig.debug?.async_log ?? true,
            profiling: parsedConfig.debug?.profiling ?? false,
          },
          optimization: {
            tick_rate: parsedConfig.optimization?.tick_rate ?? 33,
            compression: parsedConfig.optimization?.compression ?? 0,
          },
        };

        console.log('Typed config:', typedConfig);

        // Validate the typed config
        const validationResult = validateConfig(typedConfig);
        console.log('Validation result:', validationResult);

        if (!validationResult) {
          // Type assertion since we know the structure at this point
          const config = typedConfig as ServerConfig;
          console.log('Validation details:');
          console.log('discover section:', config.discover);
          console.log('general section:', config.general);
          console.log('game section:', config.game);
          console.log('debug section:', config.debug);
          console.log('optimization section:', config.optimization);

          throw new Error('Invalid configuration structure after parsing');
        }

        toast.success('Config validation passed');
        setConfig(typedConfig);
      } catch (parseError) {
        console.error('TOML Parse error:', parseError);
        toast.error(`TOML Parse error: ${(parseError as Error).message}`);
        throw new Error(`Failed to parse TOML: ${(parseError as Error).message}`);
      }
    } catch (err) {
      const errorMessage = (err as Error).message;
      setError(errorMessage);
      toast.error(`Failed to load configuration: ${errorMessage}`);
      console.error('Load config error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [executeCommand]);

  // Validate configuration object
  const validateConfig = (config: unknown): config is ServerConfig => {
    try {
      const conf = config as ServerConfig;
      
      // Check if all required sections exist
      const requiredSections = ['discover', 'general', 'game', 'debug', 'optimization'] as const;
      for (const section of requiredSections) {
        if (!conf[section as keyof ServerConfig] || typeof conf[section as keyof ServerConfig] !== 'object') {
          return false;
        }
      }

      // Validate discover section
      const discover = conf.discover;
      if (
        typeof discover.name !== 'string' ||
        typeof discover.description !== 'string' ||
        typeof discover.ip !== 'string' ||
        typeof discover.port !== 'number' ||
        typeof discover.query_port !== 'number' ||
        typeof discover.announce !== 'boolean' ||
        typeof discover.dedicated_server !== 'boolean'
      ) {
        return false;
      }

      // Validate general section
      const general = conf.general;
      if (
        typeof general.max_players !== 'number' ||
        typeof general.password !== 'string' ||
        typeof general.token !== 'string' ||
        !Array.isArray(general.banned_ids)
      ) {
        return false;
      }

      // Validate game section
      const game = conf.game;
      if (
        typeof game.map !== 'string' ||
        typeof game.game_mode !== 'string' ||
        !Array.isArray(game.packages) ||
        !Array.isArray(game.assets) ||
        typeof game.loading_screen !== 'string'
      ) {
        return false;
      }

      // Validate debug section
      const debug = conf.debug;
      if (
        typeof debug.log_level !== 'number' ||
        typeof debug.async_log !== 'boolean' ||
        typeof debug.profiling !== 'boolean'
      ) {
        return false;
      }

      // Validate optimization section
      const optimization = conf.optimization;
      if (
        typeof optimization.tick_rate !== 'number' ||
        typeof optimization.compression !== 'number'
      ) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  };

  // Save configuration to file
  const saveConfig = async () => {
    if (!config) return;
    setIsSaving(true);
    setError(null);
    try {
      // Format the configuration with comments and proper spacing
      const configString = `# discover configurations
[discover]
    # server name
    name = "${config.discover.name}"
    # server description (max 127 characters)
    description = "${config.discover.description}"
    # server IP. we recommend leaving it 0.0.0.0 for default
    ip = "${config.discover.ip}"
    # server port (TCP and UDP)
    port = ${config.discover.port}
    # query port (UDP)
    query_port = ${config.discover.query_port}
    # announce server in the master server list
    announce = ${config.discover.announce}
    # true if should run as dedicated server or false to run as P2P
    dedicated_server = ${config.discover.dedicated_server}

# general configurations
[general]
    # max players
    max_players = ${config.general.max_players}
    # leave it blank for no password
    password = "${config.general.password}"
    # nanos world server authentication token
    token = "${config.general.token}"
    # banned nanos account IDs
    banned_ids = ${JSON.stringify(config.general.banned_ids)}

# game configurations
[game]
    # default startup map
    map = "${config.game.map}"
    # game-mode package to load
    game_mode = "${config.game.game_mode}"
    # packages list
    packages = ${JSON.stringify(config.game.packages)}
    # asset packs list
    assets = ${JSON.stringify(config.game.assets)}
    # loading-screen package to load
    loading_screen = "${config.game.loading_screen}"

# custom settings values
[custom_settings]
${Object.entries(config.custom_settings)
  .map(([key, value]) => `    ${key} = ${JSON.stringify(value)}`)
  .join('\n')}

# debug configurations
[debug]
    # log Level - (1) normal, (2) debug or (3) verbose
    log_level = ${config.debug.log_level}
    # if to use async or sync logs
    async_log = ${config.debug.async_log}
    # enables performance profiling logs
    profiling = ${config.debug.profiling}

# optimization configurations
[optimization]
    # server tick rate in milliseconds
    tick_rate = ${config.optimization.tick_rate}
    # compression level (0-9)
    compression = ${config.optimization.compression}`;
      
      // Save the file
      const result = await executeCommand(`echo '${configString}' > ${NANOS_INSTALL_DIR}/Config.toml`);
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
  const handleChange = (section: keyof ServerConfig, field: string, value: string | number | boolean) => {
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