'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSocket } from '@/hooks/useSocket';
import { NANOS_INSTALL_DIR } from './NanosOnboarding';
import { toast } from 'react-hot-toast';
import { FiDownload, FiTrash2, FiRefreshCw, FiInfo } from 'react-icons/fi';
import Select from 'react-select';
import type { SingleValue } from 'react-select';

// Define module type
interface Module {
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  type: 'package' | 'asset' | 'combo';
  thumbnailUrl: string;
  downloadUrl: string;
  size: string; // Human readable size (e.g., "2.3 MB")
  tags: string[];
  dependencies?: string[]; // IDs of modules this depends on
  lastUpdated: string;
}

// Define installed module tracking type
interface InstalledModule {
  id: string;
  installedAt: string;
  version: string;
  files: {
    packages: string[]; // Package directories installed
    assets: string[];   // Asset directories installed
  };
}

// Define types for socket commands
interface CommandResult {
  stdout: string;
  stderr: string;
  error?: string;
}

export default function ModulesManager() {
  const { executeCommand } = useSocket();
  const [availableModules, setAvailableModules] = useState<Module[]>([]);
  const [installedModules, setInstalledModules] = useState<InstalledModule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isInstalling, setIsInstalling] = useState<{[key: string]: boolean}>({});
  const [isUninstalling, setIsUninstalling] = useState<{[key: string]: boolean}>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'installed' | 'not-installed'>('all');

  // Sample modules for development - replace with API call later
  const sampleModules: Module[] = [
    {
      id: 'fps-shooter',
      name: 'FPS Shooter Framework',
      description: 'A complete first-person shooter game mode with weapons, maps, and scoring system.',
      author: 'NanosTeam',
      version: '1.2.0',
      type: 'combo',
      thumbnailUrl: 'https://via.placeholder.com/300x150?text=FPS+Shooter',
      downloadUrl: 'https://example.com/fps-shooter.zip',
      size: '15.2 MB',
      tags: ['gamemode', 'fps', 'weapons'],
      lastUpdated: '2023-06-15'
    },
    {
      id: 'racing-essentials',
      name: 'Racing Essentials',
      description: 'Everything you need to create racing servers with tracks, vehicles, and a timing system.',
      author: 'RacingMaster',
      version: '2.0.1',
      type: 'package',
      thumbnailUrl: 'https://via.placeholder.com/300x150?text=Racing+Pack',
      downloadUrl: 'https://example.com/racing-pack.zip',
      size: '22.7 MB',
      tags: ['racing', 'vehicles', 'scripts'],
      lastUpdated: '2023-08-20'
    },
    {
      id: 'modern-weapons',
      name: 'Modern Weapons Pack',
      description: 'A collection of high-quality modern weapons and accessories.',
      author: 'WeaponCreator',
      version: '3.1.2',
      type: 'asset',
      thumbnailUrl: 'https://via.placeholder.com/300x150?text=Weapons+Pack',
      downloadUrl: 'https://example.com/modern-weapons.zip',
      size: '45.3 MB',
      tags: ['weapons', 'military', 'fps'],
      lastUpdated: '2023-09-05'
    },
    {
      id: 'city-roleplay',
      name: 'City Roleplay',
      description: 'A complete city roleplay setup with jobs, economy, and police system.',
      author: 'RPCreations',
      version: '2.3.0',
      type: 'combo',
      thumbnailUrl: 'https://via.placeholder.com/300x150?text=City+Roleplay',
      downloadUrl: 'https://example.com/city-roleplay.zip',
      size: '67.8 MB',
      tags: ['roleplay', 'economy', 'city'],
      lastUpdated: '2023-10-10'
    },
    {
      id: 'zombie-survival',
      name: 'Zombie Survival',
      description: 'Survive against hordes of zombies in this complete game mode.',
      author: 'ZCreator',
      version: '1.0.5',
      type: 'package',
      thumbnailUrl: 'https://via.placeholder.com/300x150?text=Zombie+Survival',
      downloadUrl: 'https://example.com/zombie-survival.zip',
      size: '18.9 MB',
      tags: ['zombies', 'survival', 'horror'],
      lastUpdated: '2023-11-01'
    }
  ];

  // Function to load installed modules data
  const loadInstalledModules = useCallback(async () => {
    try {
      // In a real implementation, this would be an API call or read from a tracking file
      const installedModulesPath = `${NANOS_INSTALL_DIR}/installed_modules.json`;
      
      // Check if the tracking file exists
      const result = await executeCommand(`test -f ${installedModulesPath} && echo "exists" || echo "not found"`);
      const fileExists = result as unknown as CommandResult;
      
      if (fileExists.stdout.trim() === "exists") {
        // Read the file if it exists
        const result = await executeCommand(`cat ${installedModulesPath}`);
        const readFile = result as unknown as CommandResult;
        
        if (!readFile.error) {
          const installedData = JSON.parse(readFile.stdout);
          setInstalledModules(installedData);
        } else {
          console.error("Error reading installed modules:", readFile.error);
          setInstalledModules([]);
        }
      } else {
        // Create an empty tracking file if it doesn't exist
        await executeCommand(`echo '[]' > ${installedModulesPath}`);
        setInstalledModules([]);
      }
    } catch (error) {
      console.error("Error loading installed modules:", error);
      setInstalledModules([]);
    }
  }, [executeCommand]);

  // Load modules and installation status
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      
      // In a real implementation, fetch available modules from an API
      // For now, use the sample data
      setAvailableModules(sampleModules);
      
      await loadInstalledModules();
      
      setIsLoading(false);
    };
    
    loadData();
  }, [loadInstalledModules]);

  // Function to install a module
  const installModule = async (module: Module) => {
    setIsInstalling(prev => ({ ...prev, [module.id]: true }));
    
    try {
      toast.loading(`Installing ${module.name}...`, { id: `install-${module.id}` });
      
      // Create a temp directory
      await executeCommand(`mkdir -p ${NANOS_INSTALL_DIR}/temp`);
      
      // Download the zip file
      toast.loading(`Downloading ${module.name}...`, { id: `install-${module.id}` });
      await executeCommand(`cd ${NANOS_INSTALL_DIR}/temp && curl -L -o module.zip "${module.downloadUrl}"`);
      
      // Extract the zip file
      toast.loading(`Extracting ${module.name}...`, { id: `install-${module.id}` });
      await executeCommand(`cd ${NANOS_INSTALL_DIR}/temp && unzip -o module.zip`);
      
      // Get list of extracted packages and assets
      const result1 = await executeCommand(`find ${NANOS_INSTALL_DIR}/temp/Packages -maxdepth 1 -mindepth 1 -type d -exec basename {} \\; 2>/dev/null || echo ""`);
      const packagesResult = result1 as unknown as CommandResult;
      const extractedPackages = packagesResult.stdout.split('\n').filter(Boolean);
      
      const result2 = await executeCommand(`find ${NANOS_INSTALL_DIR}/temp/Assets -maxdepth 1 -mindepth 1 -type d -exec basename {} \\; 2>/dev/null || echo ""`);
      const assetsResult = result2 as unknown as CommandResult;
      const extractedAssets = assetsResult.stdout.split('\n').filter(Boolean);
      
      // Create directories if they don't exist
      await executeCommand(`mkdir -p ${NANOS_INSTALL_DIR}/Packages`);
      await executeCommand(`mkdir -p ${NANOS_INSTALL_DIR}/Assets`);
      
      // Move packages
      for (const pkg of extractedPackages) {
        await executeCommand(`cp -r "${NANOS_INSTALL_DIR}/temp/Packages/${pkg}" "${NANOS_INSTALL_DIR}/Packages/"`);
      }
      
      // Move assets
      for (const asset of extractedAssets) {
        await executeCommand(`cp -r "${NANOS_INSTALL_DIR}/temp/Assets/${asset}" "${NANOS_INSTALL_DIR}/Assets/"`);
      }
      
      // Clean up
      await executeCommand(`rm -rf ${NANOS_INSTALL_DIR}/temp`);
      
      // Update installed modules tracking
      const newInstalledModule: InstalledModule = {
        id: module.id,
        installedAt: new Date().toISOString(),
        version: module.version,
        files: {
          packages: extractedPackages,
          assets: extractedAssets
        }
      };
      
      const updatedInstalledModules = [...installedModules, newInstalledModule];
      setInstalledModules(updatedInstalledModules);
      
      // Save to tracking file
      await executeCommand(`echo '${JSON.stringify(updatedInstalledModules)}' > ${NANOS_INSTALL_DIR}/installed_modules.json`);
      
      toast.success(`${module.name} installed successfully!`, { id: `install-${module.id}` });
    } catch (error) {
      console.error(`Error installing module ${module.id}:`, error);
      toast.error(`Failed to install ${module.name}. ${(error as Error).message}`, { id: `install-${module.id}` });
    } finally {
      setIsInstalling(prev => ({ ...prev, [module.id]: false }));
    }
  };
  
  // Function to uninstall a module
  const uninstallModule = async (moduleId: string) => {
    setIsUninstalling(prev => ({ ...prev, [moduleId]: true }));
    
    try {
      const moduleToUninstall = installedModules.find(m => m.id === moduleId);
      const moduleInfo = availableModules.find(m => m.id === moduleId);
      
      if (!moduleToUninstall) {
        throw new Error("Module not found in installed modules");
      }
      
      toast.loading(`Uninstalling ${moduleInfo?.name || moduleId}...`, { id: `uninstall-${moduleId}` });
      
      // Remove packages
      for (const pkg of moduleToUninstall.files.packages) {
        await executeCommand(`rm -rf "${NANOS_INSTALL_DIR}/Packages/${pkg}"`);
      }
      
      // Remove assets
      for (const asset of moduleToUninstall.files.assets) {
        await executeCommand(`rm -rf "${NANOS_INSTALL_DIR}/Assets/${asset}"`);
      }
      
      // Update installed modules tracking
      const updatedInstalledModules = installedModules.filter(m => m.id !== moduleId);
      setInstalledModules(updatedInstalledModules);
      
      // Save to tracking file
      await executeCommand(`echo '${JSON.stringify(updatedInstalledModules)}' > ${NANOS_INSTALL_DIR}/installed_modules.json`);
      
      toast.success(`${moduleInfo?.name || moduleId} uninstalled successfully!`, { id: `uninstall-${moduleId}` });
    } catch (error) {
      console.error(`Error uninstalling module ${moduleId}:`, error);
      toast.error(`Failed to uninstall module. ${(error as Error).message}`, { id: `uninstall-${moduleId}` });
    } finally {
      setIsUninstalling(prev => ({ ...prev, [moduleId]: false }));
    }
  };
  
  // Filter and search modules
  const filteredModules = availableModules.filter(module => {
    // Search filter
    const matchesSearch = searchQuery === '' || 
      module.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      module.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      module.author.toLowerCase().includes(searchQuery.toLowerCase()) ||
      module.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    
    // Tag filter
    const matchesTag = selectedTag === null || module.tags.includes(selectedTag);
    
    // Installation status filter
    const isModuleInstalled = installedModules.some(m => m.id === module.id);
    const matchesInstallStatus = 
      filter === 'all' || 
      (filter === 'installed' && isModuleInstalled) || 
      (filter === 'not-installed' && !isModuleInstalled);
    
    return matchesSearch && matchesTag && matchesInstallStatus;
  });
  
  // Get all unique tags from the modules
  const allTags = Array.from(new Set(availableModules.flatMap(module => module.tags))).sort();
  
  // Format tags for react-select
  const tagOptions = [
    { value: '', label: 'All Tags' },
    ...allTags.map(tag => ({ value: tag, label: tag }))
  ];

  // Get current tag option
  const getCurrentTagOption = () => {
    return tagOptions.find(option => option.value === (selectedTag || '')) || tagOptions[0];
  };

  // Handle tag change
  const handleTagChange = (newValue: SingleValue<{ value: string; label: string }>) => {
    setSelectedTag(newValue?.value || null);
  };
  
  // Check if a module is installed
  const isModuleInstalled = (moduleId: string) => {
    return installedModules.some(m => m.id === moduleId);
  };
  
  // Get installed version of a module
  const getInstalledVersion = (moduleId: string) => {
    const installedModule = installedModules.find(m => m.id === moduleId);
    return installedModule?.version;
  };
  
  // Check if a module needs update
  const moduleNeedsUpdate = (moduleId: string) => {
    const installedModule = installedModules.find(m => m.id === moduleId);
    const availableModule = availableModules.find(m => m.id === moduleId);
    
    if (!installedModule || !availableModule) return false;
    
    // Simple version comparison (this should be enhanced for semantic versioning)
    return installedModule.version !== availableModule.version;
  };
  
  return (
    <div className="p-6 space-y-6">
      <h2 className="text-2xl font-mono text-amber-400 mb-4">Modules Manager</h2>
      
      {/* Search and filters */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-grow">
          <input
            type="text"
            placeholder="Search modules..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3 py-2 bg-gray-800/50 border border-amber-500/20 rounded text-gray-300 focus:border-amber-500/50 focus:outline-none"
          />
        </div>
        
        <div className="flex gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as 'all' | 'installed' | 'not-installed')}
            className="px-3 py-2 bg-gray-800/50 border border-amber-500/20 rounded text-gray-300 focus:border-amber-500/50 focus:outline-none"
          >
            <option value="all">All Modules</option>
            <option value="installed">Installed</option>
            <option value="not-installed">Not Installed</option>
          </select>
          
          <div className="w-48">
            <Select
              value={getCurrentTagOption()}
              onChange={handleTagChange}
              options={tagOptions}
              isMulti={false}
              placeholder="Filter by tag..."
              className="react-select-container"
              classNamePrefix="react-select"
              isSearchable={true}
              isClearable={false}
              aria-label="Filter by tag"
            />
          </div>
        </div>
      </div>
      
      {/* Loading state */}
      {isLoading && (
        <div className="flex justify-center items-center h-40">
          <div className="flex items-center space-x-2">
            <svg className="animate-spin h-5 w-5 text-amber-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="text-amber-300 font-mono">Loading modules...</span>
          </div>
        </div>
      )}
      
      {/* No results */}
      {!isLoading && filteredModules.length === 0 && (
        <div className="flex flex-col items-center justify-center h-40 text-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="mt-2 text-gray-400 font-mono">No modules found matching your filters</p>
          <button 
            type="button"
            onClick={() => { setSearchQuery(''); setSelectedTag(null); setFilter('all'); }}
            onKeyUp={() => { setSearchQuery(''); setSelectedTag(null); setFilter('all'); }}
            className="mt-2 text-amber-400 hover:text-amber-300 font-mono text-sm"
          >
            Clear all filters
          </button>
        </div>
      )}
      
      {/* Module cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredModules.map(module => {
          const installed = isModuleInstalled(module.id);
          const needsUpdate = moduleNeedsUpdate(module.id);
          
          return (
            <div 
              key={module.id} 
              className="border border-amber-500/20 rounded-lg overflow-hidden bg-black/30 flex flex-col h-full transition-all hover:border-amber-500/40"
            >
              {/* Module image */}
              <div className="h-36 overflow-hidden bg-gray-800 relative">
                <img 
                  src={module.thumbnailUrl} 
                  alt={`Thumbnail for ${module.name}`} 
                  className="w-full h-full object-cover"
                />
                
                {/* Type badge */}
                <div className="absolute top-2 right-2">
                  <span className={`text-xs font-mono px-2 py-1 rounded-md ${
                    module.type === 'package' ? 'bg-blue-600/70 text-blue-100' :
                    module.type === 'asset' ? 'bg-purple-600/70 text-purple-100' :
                    'bg-green-600/70 text-green-100'
                  }`}>
                    {module.type === 'package' ? 'Package' :
                     module.type === 'asset' ? 'Asset' :
                     'Combo'}
                  </span>
                </div>
                
                {/* Status badges */}
                {installed && (
                  <div className="absolute top-2 left-2">
                    <span className="text-xs font-mono px-2 py-1 rounded-md bg-green-600/70 text-green-100">
                      Installed
                    </span>
                  </div>
                )}
                
                {needsUpdate && (
                  <div className="absolute bottom-2 left-2">
                    <span className="text-xs font-mono px-2 py-1 rounded-md bg-amber-600/70 text-amber-100">
                      Update Available
                    </span>
                  </div>
                )}
              </div>
              
              {/* Module info */}
              <div className="p-4 flex-grow flex flex-col">
                <h3 className="text-lg font-semibold text-amber-300 font-mono">{module.name}</h3>
                <p className="text-gray-400 text-sm mb-2">by {module.author} • v{module.version}</p>
                <p className="text-gray-300 text-sm mb-4 flex-grow">{module.description}</p>
                
                {/* Tags */}
                <div className="flex flex-wrap gap-1 mb-4">
                  {module.tags.map(tag => (
                    <button 
                      key={tag}
                      className="react-select__multi-value"
                      style={{ cursor: 'pointer', border: 'none', padding: 0, background: 'transparent', display: 'flex' }}
                      onClick={() => setSelectedTag(tag === selectedTag ? null : tag)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedTag(tag === selectedTag ? null : tag);
                        }
                      }}
                      aria-label={`Filter by tag: ${tag}`}
                      aria-pressed={selectedTag === tag}
                      type="button"
                    >
                      <div className="react-select__multi-value__label">{tag}</div>
                      {selectedTag === tag && (
                        <button 
                          className="react-select__multi-value__remove"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTag(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              e.stopPropagation();
                              setSelectedTag(null);
                            }
                          }}
                          aria-label="Clear tag filter"
                          type="button"
                          style={{ border: 'none', padding: 0, background: 'transparent' }}
                        >
                          ×
                        </button>
                      )}
                    </button>
                  ))}
                </div>
                
                {/* Module meta */}
                <div className="flex justify-between text-xs text-gray-400 font-mono mb-4">
                  <span>{module.size}</span>
                  <span>Updated: {module.lastUpdated}</span>
                </div>
                
                {/* Action buttons */}
                <div className="mt-auto">
                  {installed ? (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => uninstallModule(module.id)}
                        disabled={isUninstalling[module.id]}
                        className="flex-1 px-4 py-2 bg-red-600/30 text-red-300 rounded hover:bg-red-600/40 disabled:opacity-50 transition-colors font-mono text-sm"
                      >
                        {isUninstalling[module.id] ? (
                          <span className="flex items-center justify-center">
                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            Uninstalling
                          </span>
                        ) : "Uninstall"}
                      </button>
                      
                      {needsUpdate && (
                        <button
                          type="button"
                          onClick={() => installModule(module)}
                          disabled={isInstalling[module.id]}
                          className="flex-1 px-4 py-2 bg-amber-600/30 text-amber-300 rounded hover:bg-amber-600/40 disabled:opacity-50 transition-colors font-mono text-sm"
                        >
                          {isInstalling[module.id] ? (
                            <span className="flex items-center justify-center">
                              <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                              </svg>
                              Updating
                            </span>
                          ) : "Update"}
                        </button>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => installModule(module)}
                      disabled={isInstalling[module.id]}
                      className="w-full px-4 py-2 bg-amber-500/30 text-amber-300 rounded hover:bg-amber-500/40 disabled:opacity-50 transition-colors font-mono"
                    >
                      {isInstalling[module.id] ? (
                        <span className="flex items-center justify-center">
                          <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Installing
                        </span>
                      ) : "Install"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
} 