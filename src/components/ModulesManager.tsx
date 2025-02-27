'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSocket } from '@/hooks/useSocket';
import { NANOS_INSTALL_DIR } from './NanosOnboarding';
import { toast } from 'react-hot-toast';
import { FiDownload, FiTrash2, FiRefreshCw, FiInfo, FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import Select from 'react-select';
import type { SingleValue } from 'react-select';

// Define content types
type ContentType = 'assets' | 'packages' | 'custom';

// Define module type
interface Module {
  id: string;
  name: string;
  title: string;
  description: string;
  author: string;
  authorImage?: string;
  version: string;
  type: 'package' | 'asset' | 'combo';
  thumbnailUrl: string;
  thumbnailSmallUrl: string;
  downloadUrl: string;
  size: string; // Human readable size (e.g., "2.3 MB")
  sizeBytes: number; // Size in bytes
  tags: string[];
  dependencies?: Array<{ 
    resource: { type: string; name: string }; 
    type: string; 
    version: string 
  }>; // Properly typed dependencies
  lastUpdated: string;
  downloads: number;
  category: string;
}

// Define API response types
interface ApiItem {
  id: string;
  name: string;
  title: string;
  team: {
    id: string;
    title: string;
    image: string;
    imageSmall: string;
  };
  headerImage: string;
  headerImageSmall: string;
  shortDescription: string;
  category: string;
  rating: number;
  ratingCount: number;
  downloads: number;
  views: number;
  latestRelease: {
    version: string;
    size: number;
    sizeUnpacked: number;
    metaFile: string;
    hash: string;
    date: string;
    dependencies: Array<{ 
      resource: { type: string; name: string }; 
      type: string; 
      version: string 
    }>;
  };
  tags: string[];
  languages: string[];
  publishedAt: string;
}

interface ApiResponse {
  items: ApiItem[];
  totalItems: number;
  totalPages: number;
  currentPage: number;
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

// Helper function to format file size
const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

export default function ModulesManager() {
  const { executeCommand } = useSocket();
  const [activeTab, setActiveTab] = useState<ContentType>('assets');
  const [availableModules, setAvailableModules] = useState<Module[]>([]);
  const [installedModules, setInstalledModules] = useState<InstalledModule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isInstalling, setIsInstalling] = useState<{[key: string]: boolean}>({});
  const [isUninstalling, setIsUninstalling] = useState<{[key: string]: boolean}>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'installed' | 'not-installed'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [apiError, setApiError] = useState<string | null>(null);
  const pageSize = 12;

  // Reset pagination when changing tabs
  useEffect(() => {
    setCurrentPage(1);
    setSelectedTag(null);
    setSearchQuery('');
  }, [/* activeTab is used in the effect body */]);

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

  // Function to get API endpoint based on active tab
  const getApiEndpoint = useCallback((tab: ContentType, page: number): string => {
    switch (tab) {
      case 'assets':
        return `https://api.nanos.world/store/v1/assets?page=${page}&pageSize=${pageSize}`;
      case 'packages':
        return `https://api.nanos.world/store/v1/packages?page=${page}&pageSize=${pageSize}`;
      case 'custom':
        // This would be replaced with an actual endpoint in the future
        return '';
      default:
        return `https://api.nanos.world/store/v1/assets?page=${page}&pageSize=${pageSize}`;
    }
  }, [/* pageSize is used in the callback body */]);

  // Load modules from Nanos World API
  const fetchModules = useCallback(async (tab: ContentType, page: number) => {
    setIsLoading(true);
    setApiError(null);
    
    // Don't fetch for custom tab yet
    if (tab === 'custom') {
      setAvailableModules([]);
      setIsLoading(false);
      return;
    }
    
    try {
      const endpoint = getApiEndpoint(tab, page);
      const response = await fetch(endpoint);
      
      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }
      
      const data = await response.json();
      const apiResponse = data as unknown as ApiResponse;
      
      // Map API data to our Module interface
      const modules: Module[] = apiResponse.items.map(item => {
        // Determine module type based on category and active tab
        let moduleType: 'package' | 'asset' | 'combo' = 'asset';
        if (tab === 'packages') {
          moduleType = item.category.includes('game-mode') ? 'combo' : 'package';
        } else {
          moduleType = item.category.includes('map') ? 'asset' : 
                      (item.category.includes('pack') ? 'combo' : 'package');
        }
        
        return {
          id: item.id,
          name: item.name,
          title: item.title,
          description: item.shortDescription,
          author: item.team.title,
          authorImage: item.team.imageSmall,
          version: item.latestRelease.version,
          type: moduleType,
          thumbnailUrl: item.headerImage,
          thumbnailSmallUrl: item.headerImageSmall,
          downloadUrl: item.latestRelease.metaFile.replace('.toml', '.zip'),
          size: formatFileSize(item.latestRelease.size),
          sizeBytes: item.latestRelease.size,
          tags: item.tags,
          dependencies: item.latestRelease.dependencies,
          lastUpdated: new Date(item.latestRelease.date).toLocaleDateString(),
          downloads: item.downloads,
          category: item.category
        };
      });
      
      setAvailableModules(modules);
      setTotalPages(apiResponse.totalPages);
      setCurrentPage(apiResponse.currentPage);
    } catch (error) {
      console.error("Error fetching modules:", error);
      setApiError((error as Error).message);
      setAvailableModules([]);
    } finally {
      setIsLoading(false);
    }
  }, [getApiEndpoint]);

  // Load modules and installation status
  useEffect(() => {
    const loadData = async () => {
      await Promise.all([
        fetchModules(activeTab, currentPage),
        loadInstalledModules()
      ]);
    };
    
    loadData();
  }, [fetchModules, loadInstalledModules, currentPage, activeTab]);

  // Function to install a module
  const installModule = async (module: Module) => {
    setIsInstalling(prev => ({ ...prev, [module.id]: true }));
    
    try {
      toast.loading(`Installing ${module.title}...`, { id: `install-${module.id}` });
      
      // Create a temp directory
      await executeCommand(`mkdir -p ${NANOS_INSTALL_DIR}/temp`);
      
      // Download the zip file
      toast.loading(`Downloading ${module.title}...`, { id: `install-${module.id}` });
      await executeCommand(`cd ${NANOS_INSTALL_DIR}/temp && curl -L -o module.zip "${module.downloadUrl}"`);
      
      // Extract the zip file
      toast.loading(`Extracting ${module.title}...`, { id: `install-${module.id}` });
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
      
      toast.success(`${module.title} installed successfully!`, { id: `install-${module.id}` });
    } catch (error) {
      console.error(`Error installing module ${module.id}:`, error);
      toast.error(`Failed to install ${module.title}. ${(error as Error).message}`, { id: `install-${module.id}` });
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
      
      toast.loading(`Uninstalling ${moduleInfo?.title || moduleId}...`, { id: `uninstall-${moduleId}` });
      
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
      
      toast.success(`${moduleInfo?.title || moduleId} uninstalled successfully!`, { id: `uninstall-${moduleId}` });
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
      module.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
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

  // Handle page change
  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };
  
  // Get content type display name
  const getTabDisplayName = (tab: ContentType): string => {
    switch (tab) {
      case 'assets': return 'Assets';
      case 'packages': return 'Packages';
      case 'custom': return 'Custom';
      default: return 'Assets';
    }
  };
  
  return (
    <div className="p-6 space-y-6">
      <h2 className="text-2xl font-mono text-amber-400 mb-4">Modules Manager</h2>
      
      {/* Tabs */}
      <div className="flex border-b border-amber-500/20 mb-4">
        {(['assets', 'packages', 'custom'] as ContentType[]).map((tab) => (
          <button
            key={tab}
            type="button"
            className={`px-4 py-2 font-mono text-sm border-b-2 transition-colors ${
              activeTab === tab 
                ? 'border-amber-500 text-amber-400' 
                : 'border-transparent text-gray-400 hover:text-amber-300 hover:border-amber-500/30'
            }`}
            onClick={() => setActiveTab(tab)}
          >
            {getTabDisplayName(tab)}
          </button>
        ))}
      </div>
      
      {/* Search and filters */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-grow">
          <input
            type="text"
            placeholder={`Search ${getTabDisplayName(activeTab).toLowerCase()}...`}
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
      
      {/* Custom tab message */}
      {activeTab === 'custom' && (
        <div className="p-6 bg-gray-800/30 border border-amber-500/20 rounded-lg text-center">
          <h3 className="text-amber-400 font-mono mb-2">Coming Soon!</h3>
          <p className="text-gray-300">
            Custom modules support will be available in a future update. This tab will allow you to manage locally created modules.
          </p>
        </div>
      )}
      
      {/* API Error */}
      {apiError && activeTab !== 'custom' && (
        <div className="p-4 bg-red-900/30 border border-red-500/30 rounded-lg">
          <h3 className="text-red-400 font-mono font-semibold flex items-center">
            <FiInfo className="mr-2" size={18} />
            Error Loading {getTabDisplayName(activeTab)}
          </h3>
          <p className="text-gray-300 mt-1">{apiError}</p>
          <button
            type="button"
            onClick={() => fetchModules(activeTab, currentPage)}
            className="mt-3 text-amber-400 hover:text-amber-300 font-mono text-sm flex items-center"
          >
            <FiRefreshCw className="mr-1" size={14} /> Retry
          </button>
        </div>
      )}
      
      {/* Loading state */}
      {isLoading && activeTab !== 'custom' && (
        <div className="flex justify-center items-center h-40">
          <div className="flex items-center space-x-2">
            <svg className="animate-spin h-5 w-5 text-amber-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="text-amber-300 font-mono">Loading {getTabDisplayName(activeTab).toLowerCase()}...</span>
          </div>
        </div>
      )}
      
      {/* No results */}
      {!isLoading && !apiError && activeTab !== 'custom' && filteredModules.length === 0 && (
        <div className="flex flex-col items-center justify-center h-40 text-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="mt-2 text-gray-400 font-mono">No {getTabDisplayName(activeTab).toLowerCase()} found matching your filters</p>
          <button 
            type="button"
            onClick={() => { setSearchQuery(''); setSelectedTag(null); setFilter('all'); }}
            className="mt-2 text-amber-400 hover:text-amber-300 font-mono text-sm"
          >
            Clear all filters
          </button>
        </div>
      )}
      
      {/* Module cards */}
      {activeTab !== 'custom' && (
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
                    alt={`Thumbnail for ${module.title}`} 
                    className="w-full h-full object-cover"
                  />
                  
                  {/* Type badge */}
                  <div className="absolute top-2 right-2">
                    <span className={`text-xs font-mono px-2 py-1 rounded-md ${
                      module.type === 'package' ? 'bg-blue-600/70 text-blue-100' :
                      module.type === 'asset' ? 'bg-purple-600/70 text-purple-100' :
                      'bg-green-600/70 text-green-100'
                    }`}>
                      {module.category}
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

                  {/* Download count badge */}
                  <div className="absolute bottom-2 right-2">
                    <span className="text-xs font-mono px-2 py-1 rounded-md bg-gray-800/80 text-gray-200">
                      {module.downloads} downloads
                    </span>
                  </div>
                </div>
                
                {/* Module info */}
                <div className="p-4 flex-grow flex flex-col">
                  <div className="flex items-start">
                    {module.authorImage && (
                      <img 
                        src={module.authorImage} 
                        alt={`${module.author} logo`}
                        className="w-6 h-6 mr-2 rounded-full"
                      />
                    )}
                    <div>
                      <h3 className="text-lg font-semibold text-amber-300 font-mono">{module.title}</h3>
                      <p className="text-gray-400 text-sm mb-2">by {module.author} • v{module.version}</p>
                    </div>
                  </div>
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
      )}
      
      {/* Pagination */}
      {!isLoading && !apiError && activeTab !== 'custom' && availableModules.length > 0 && (
        <div className="flex justify-center mt-6">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="p-2 rounded bg-gray-800/50 text-gray-300 hover:bg-gray-800/70 disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Previous page"
            >
              <FiChevronLeft size={18} />
            </button>
            
            <span className="text-gray-300 font-mono">
              Page {currentPage} of {totalPages}
            </span>
            
            <button
              type="button"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="p-2 rounded bg-gray-800/50 text-gray-300 hover:bg-gray-800/70 disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Next page"
            >
              <FiChevronRight size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
} 