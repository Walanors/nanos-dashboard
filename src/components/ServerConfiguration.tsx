'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSocket } from '@/hooks/useSocket';
import { NANOS_INSTALL_DIR } from './NanosOnboarding';
import { toast } from 'react-hot-toast';
import Select from 'react-select';
import type { MultiValue, StylesConfig } from 'react-select';

// Define types for file listing
interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modified: Date;
}

// Define option type for select components
interface SelectOption {
  value: string;
  label: string;
}

// Define the custom styles for React Select to match our design
const selectStyles: StylesConfig<SelectOption, true> = {
  control: (styles) => ({
    ...styles,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderColor: 'rgba(245, 158, 11, 0.2)',
    '&:hover': {
      borderColor: 'rgba(245, 158, 11, 0.4)'
    },
    boxShadow: 'none',
    padding: '2px',
    minHeight: '38px',
    fontFamily: 'monospace'
  }),
  option: (styles, { isSelected, isFocused }) => ({
    ...styles,
    backgroundColor: isSelected 
      ? 'rgba(245, 158, 11, 0.3)' 
      : isFocused 
        ? 'rgba(245, 158, 11, 0.1)' 
        : 'rgba(0, 0, 0, 0.7)',
    color: isSelected ? '#f5d0a9' : '#c9c9c9',
    '&:hover': {
      backgroundColor: 'rgba(245, 158, 11, 0.2)'
    },
    cursor: 'pointer',
    fontFamily: 'monospace',
    padding: '8px 12px'
  }),
  multiValue: (styles) => ({
    ...styles,
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    borderRadius: '3px'
  }),
  multiValueLabel: (styles) => ({
    ...styles,
    color: '#f5d0a9',
    fontFamily: 'monospace'
  }),
  multiValueRemove: (styles) => ({
    ...styles,
    color: '#f5d0a9',
    '&:hover': {
      backgroundColor: 'rgba(245, 158, 11, 0.4)',
      color: '#fff'
    }
  }),
  menu: (styles) => ({
    ...styles,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    border: '1px solid rgba(245, 158, 11, 0.2)',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
    zIndex: 10
  }),
  menuPortal: (styles) => ({
    ...styles,
    zIndex: 9999
  }),
  input: (styles) => ({
    ...styles,
    color: '#c9c9c9',
    fontFamily: 'monospace'
  }),
  placeholder: (styles) => ({
    ...styles,
    color: 'rgba(201, 201, 201, 0.5)',
    fontFamily: 'monospace'
  }),
  singleValue: (styles) => ({
    ...styles,
    color: '#c9c9c9',
    fontFamily: 'monospace'
  }),
  indicatorSeparator: (styles) => ({
    ...styles,
    backgroundColor: 'rgba(245, 158, 11, 0.2)'
  }),
  dropdownIndicator: (styles) => ({
    ...styles,
    color: 'rgba(245, 158, 11, 0.5)',
    '&:hover': {
      color: 'rgba(245, 158, 11, 0.8)'
    }
  }),
  clearIndicator: (styles) => ({
    ...styles,
    color: 'rgba(245, 158, 11, 0.5)',
    '&:hover': {
      color: 'rgba(245, 158, 11, 0.8)'
    }
  }),
  noOptionsMessage: (styles) => ({
    ...styles,
    color: 'rgba(201, 201, 201, 0.7)',
    fontFamily: 'monospace'
  }),
  valueContainer: (styles) => ({
    ...styles,
    padding: '2px 8px'
  })
};

const getAuthHeader = (): Record<string, string> => {
  const storedCredentials = sessionStorage.getItem('credentials');
  if (storedCredentials) {
    console.log('Using credentials from sessionStorage');
    return {
      Authorization: `Basic ${storedCredentials}`
    };
  }
  
  // 2. Try localStorage
  const username = localStorage.getItem('username');
  const password = localStorage.getItem('password');
  if (username && password) {
    console.log('Using credentials from localStorage');
    const base64Credentials = btoa(`${username}:${password}`);
    // Also save to sessionStorage for future use
    sessionStorage.setItem('credentials', base64Credentials);
    return {
      Authorization: `Basic ${base64Credentials}`
    };
  }
  

  
  // 4. Last resort - try to use 'admin:admin' (common default)
  console.warn('No credentials found, using fallback admin:admin');
  const fallbackCredentials = btoa('admin:admin');
  return {
    Authorization: `Basic ${fallbackCredentials}`
  };
};

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
  const { executeCommand, isConnected } = useSocket();
  const [config, setConfig] = useState<ServerConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Add states for package and asset listings
  const [availablePackages, setAvailablePackages] = useState<FileEntry[]>([]);
  const [availableAssets, setAvailableAssets] = useState<FileEntry[]>([]);
  const [isLoadingPackages, setIsLoadingPackages] = useState(false);
  const [isLoadingAssets, setIsLoadingAssets] = useState(false);
  
  // Check credentials on component mount
  useEffect(() => {
    // Log credential sources for debugging
    const hasSessionCreds = !!sessionStorage.getItem('credentials');
    const hasLocalCreds = !!(localStorage.getItem('username') && localStorage.getItem('password'));
    
    console.log('Auth credentials check:', {
      sessionStorage: hasSessionCreds,
      localStorage: hasLocalCreds,
      socketConnected: isConnected
    });
    
    // If no credentials are found and we're using development mode,
    // try using default credentials for convenience
    if (!hasSessionCreds && !hasLocalCreds) {
      console.log('No credentials found, checking for environment defaults');
      const defaultUsername = process.env.NEXT_PUBLIC_DEFAULT_USERNAME;
      const defaultPassword = process.env.NEXT_PUBLIC_DEFAULT_PASSWORD;
      
      if (defaultUsername && defaultPassword) {
        console.log('Using default credentials from environment');
        const base64Credentials = btoa(`${defaultUsername}:${defaultPassword}`);
        sessionStorage.setItem('credentials', base64Credentials);
      }
    }
  }, [isConnected]);

  // Function to load directories
  const loadDirectoryContents = useCallback(async (type: 'packages' | 'assets') => {
    const isPackages = type === 'packages';
    if (isPackages) {
      setIsLoadingPackages(true);
    } else {
      setIsLoadingAssets(true);
    }
    
    try {
      const dirPath = `${NANOS_INSTALL_DIR}/${type.charAt(0).toUpperCase() + type.slice(1)}`;
      const response = await fetch(`/api/files/list?path=${encodeURIComponent(dirPath)}`, {
        method: 'GET',
        headers: {
          ...getAuthHeader(),
        },
      });
      
      if (!response.ok) {
        throw new Error(`Failed to load ${type} directory contents: ${response.statusText}`);
      }
      
      const data = await response.json() as { success: boolean, files: FileEntry[] };
      
      if (data.success) {
        if (isPackages) {
          setAvailablePackages(data.files.filter(file => file.isDirectory));
        } else {
          setAvailableAssets(data.files.filter(file => file.isDirectory));
        }
      } else {
        throw new Error(`Failed to load ${type} directory contents`);
      }
    } catch (error) {
      toast.error((error as Error).message);
      console.error(`Error loading ${type} directory contents:`, error);
    } finally {
      if (isPackages) {
        setIsLoadingPackages(false);
      } else {
        setIsLoadingAssets(false);
      }
    }
  }, []);

  // Load packages and assets when component mounts
  useEffect(() => {
    if (config) {
      loadDirectoryContents('packages');
      loadDirectoryContents('assets');
    }
  }, [config, loadDirectoryContents]);

  // Convert file entries to select options
  const getPackageOptions = useCallback((): SelectOption[] => {
    return availablePackages.map(pkg => ({
      value: pkg.name,
      label: pkg.name
    }));
  }, [availablePackages]);

  const getAssetOptions = useCallback((): SelectOption[] => {
    return availableAssets.map(asset => ({
      value: asset.name,
      label: asset.name
    }));
  }, [availableAssets]);

  // Get currently selected packages and assets as options
  const getSelectedPackageOptions = useCallback((): SelectOption[] => {
    if (!config) return [];
    return config.game.packages.map(pkg => ({
      value: pkg,
      label: pkg
    }));
  }, [config]);

  const getSelectedAssetOptions = useCallback((): SelectOption[] => {
    if (!config) return [];
    return config.game.assets.map(asset => ({
      value: asset,
      label: asset
    }));
  }, [config]);

  // Handle select change for packages and assets
  const handlePackagesChange = (newValue: MultiValue<SelectOption>) => {
    if (!config) return;
    
    const newPackages = newValue.map(option => option.value);
    setConfig(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        game: {
          ...prev.game,
          packages: newPackages
        }
      };
    });
    
    toast.success('Package list updated');
  };

  const handleAssetsChange = (newValue: MultiValue<SelectOption>) => {
    if (!config) return;
    
    const newAssets = newValue.map(option => option.value);
    setConfig(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        game: {
          ...prev.game,
          assets: newAssets
        }
      };
    });
    
    toast.success('Asset list updated');
  };

  // Load configuration from file
  const loadConfig = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Add delay and retry mechanism for socket connection
      const maxRetries = 3;
      const delayMs = 1500; // 1.5 seconds delay
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          // First check if we can connect to the socket
          const testConnection = await executeCommand('echo "test connection"');
          if (!testConnection.error) {
            break; // Connection successful, proceed with config loading
          }
          
          if (attempt === maxRetries) {
            throw new Error('Socket not connected after multiple attempts. Please ensure the service is running.');
          }
          
          // Wait before next attempt
          await new Promise(resolve => setTimeout(resolve, delayMs));
          console.log(`Retrying connection attempt ${attempt + 1}/${maxRetries}...`);
          
        } catch (connError) {
          if (attempt === maxRetries) {
            throw connError;
          }
          await new Promise(resolve => setTimeout(resolve, delayMs));
          console.log(`Retrying connection attempt ${attempt + 1}/${maxRetries}...`);
        }
      }

      // Check if we can access a protected API route to verify authentication works
      try {
        console.log('Testing authentication with /api/system/ping');
        const authHeaders = getAuthHeader();
        const pingResponse = await fetch('/api/system/ping', {
          headers: {
            ...authHeaders
          }
        });
        console.log('Ping response:', pingResponse.status, pingResponse.statusText);
        if (pingResponse.ok) {
          console.log('Authentication successful on /api/system/ping');
        } else {
          console.warn('Authentication failed on /api/system/ping');
        }
      } catch (authError) {
        console.error('Error testing authentication:', authError);
      }

      try {
        // Get the auth headers and log them for debugging
        const authHeaders = getAuthHeader();
        console.log('Using auth headers for TOML request:', 
                   authHeaders.Authorization ? 
                   `Basic ${authHeaders.Authorization.substring(6, 15)}...` : 
                   'No auth header available');
        
        // Use the new TOML file reading endpoint instead of cat command
        const response = await fetch(`/api/files/toml?path=${encodeURIComponent(`${NANOS_INSTALL_DIR}/Config.toml`)}`, {
          headers: {
            ...authHeaders
          }
        });
        
        console.log('TOML API response status:', response.status, response.statusText);
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to load configuration');
        }
        
        const result = await response.json();
        const rawParsedConfig = result.content as TomlTable;
        
        console.log('Raw parsed config from server:', rawParsedConfig);

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
      // Get the auth headers and log them for debugging
      const authHeaders = getAuthHeader();
      console.log('Using auth headers for save TOML request:', 
                 authHeaders.Authorization ? 
                 `Basic ${authHeaders.Authorization.substring(6, 15)}...` : 
                 'No auth header available');
                 
      // Use the new TOML file saving endpoint instead of echo command
      const response = await fetch('/api/files/toml', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders
        },
        body: JSON.stringify({
          path: `${NANOS_INSTALL_DIR}/Config.toml`,
          content: {
            discover: {
              name: config.discover.name,
              description: config.discover.description,
              ip: config.discover.ip,
              port: config.discover.port,
              query_port: config.discover.query_port,
              announce: config.discover.announce,
              dedicated_server: config.discover.dedicated_server,
            },
            general: {
              max_players: config.general.max_players,
              password: config.general.password,
              token: config.general.token,
              banned_ids: config.general.banned_ids,
            },
            game: {
              map: config.game.map,
              game_mode: config.game.game_mode,
              packages: config.game.packages,
              assets: config.game.assets,
              loading_screen: config.game.loading_screen,
            },
            custom_settings: config.custom_settings,
            debug: {
              log_level: config.debug.log_level,
              async_log: config.debug.async_log,
              profiling: config.debug.profiling,
            },
            optimization: {
              tick_rate: config.optimization.tick_rate,
              compression: config.optimization.compression,
            }
          }
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save configuration');
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

        {/* Packages Section */}
        <div className="mt-4">
          <label htmlFor="package-select" className="block text-sm font-mono text-gray-300 mb-2">Packages</label>
          
          {/* Package Selection */}
          <div className="flex flex-col space-y-2">
            <div className="flex items-center">
              <div className="flex-grow">
                <Select
                  inputId="package-select"
                  value={getSelectedPackageOptions()}
                  onChange={handlePackagesChange}
                  options={getPackageOptions()}
                  isMulti={true}
                  styles={selectStyles}
                  placeholder="Select packages..."
                  noOptionsMessage={({ inputValue }) => 
                    inputValue 
                      ? `No packages matching "${inputValue}"` 
                      : isLoadingPackages 
                        ? "Loading packages..." 
                        : "No packages found"
                  }
                  className="react-select-container"
                  classNamePrefix="react-select"
                  isSearchable={true}
                  menuPortalTarget={typeof document !== 'undefined' ? document.body : null}
                  menuPosition="fixed"
                  isClearable={true}
                  isLoading={isLoadingPackages}
                  loadingMessage={() => "Loading packages..."}
                  filterOption={(option, inputValue) => 
                    option.label.toLowerCase().includes(inputValue.toLowerCase())
                  }
                />
              </div>
              <button
                type="button"
                onClick={() => loadDirectoryContents('packages')}
                disabled={isLoadingPackages}
                className="ml-2 px-3 py-2 bg-amber-500/20 text-amber-300 rounded hover:bg-amber-500/30 transition-colors disabled:opacity-50 font-mono text-xs flex items-center"
                aria-label="Refresh packages list"
              >
                {isLoadingPackages ? 
                  <span className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-amber-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>Loading</span>
                  </span> : 
                  <span className="flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span>Refresh</span>
                  </span>
                }
              </button>
            </div>
            
            {/* Help text */}
            <p className="text-xs text-amber-500/50 italic">
              Select multiple packages from the dropdown or search by typing
            </p>
          </div>
        </div>

        {/* Assets Section */}
        <div className="mt-4">
          <label htmlFor="asset-select" className="block text-sm font-mono text-gray-300 mb-2">Assets</label>
          
          {/* Asset Selection */}
          <div className="flex flex-col space-y-2">
            <div className="flex items-center">
              <div className="flex-grow">
                <Select
                  inputId="asset-select"
                  value={getSelectedAssetOptions()}
                  onChange={handleAssetsChange}
                  options={getAssetOptions()}
                  isMulti={true}
                  styles={selectStyles}
                  placeholder="Select assets..."
                  noOptionsMessage={({ inputValue }) => 
                    inputValue 
                      ? `No assets matching "${inputValue}"` 
                      : isLoadingAssets 
                        ? "Loading assets..." 
                        : "No assets found"
                  }
                  className="react-select-container"
                  classNamePrefix="react-select"
                  isSearchable={true}
                  menuPortalTarget={typeof document !== 'undefined' ? document.body : null}
                  menuPosition="fixed"
                  isClearable={true}
                  isLoading={isLoadingAssets}
                  loadingMessage={() => "Loading assets..."}
                  filterOption={(option, inputValue) => 
                    option.label.toLowerCase().includes(inputValue.toLowerCase())
                  }
                />
              </div>
              <button
                type="button"
                onClick={() => loadDirectoryContents('assets')}
                disabled={isLoadingAssets}
                className="ml-2 px-3 py-2 bg-amber-500/20 text-amber-300 rounded hover:bg-amber-500/30 transition-colors disabled:opacity-50 font-mono text-xs flex items-center"
                aria-label="Refresh assets list"
              >
                {isLoadingAssets ? 
                  <span className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-amber-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>Loading</span>
                  </span> : 
                  <span className="flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span>Refresh</span>
                  </span>
                }
              </button>
            </div>
            
            {/* Help text */}
            <p className="text-xs text-amber-500/50 italic">
              Select multiple assets from the dropdown or search by typing
            </p>
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