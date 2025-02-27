'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { toast } from 'react-hot-toast';
import { NANOS_INSTALL_DIR } from './NanosOnboarding';

// Define types
interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modified: Date;
}

interface DirectoryContents {
  files: FileEntry[];
}

// Path utilities (browser compatible)
const pathUtils = {
  dirname: (path: string): string => {
    const lastSlashIndex = path.lastIndexOf('/');
    return lastSlashIndex === -1 ? path : path.substring(0, lastSlashIndex);
  },
  join: (...parts: string[]): string => {
    return parts.map(part => part.replace(/^\/+|\/+$/g, '')).join('/');
  }
};

export default function FileManager() {
  const [currentTab, setCurrentTab] = useState<'packages' | 'assets'>('packages');
  const [isLoading, setIsLoading] = useState(false);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [currentPath, setCurrentPath] = useState('');
  const [breadcrumbs, setBreadcrumbs] = useState<string[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [draggedFile, setDraggedFile] = useState<FileEntry | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Helper function to get the authentication header - memoized
  const getAuthHeader = useCallback((): Record<string, string> => {
    // Try multiple sources for authentication credentials
    
    // 1. First try sessionStorage (where socket connection stores them)
    const storedCredentials = sessionStorage.getItem('credentials');
    if (storedCredentials) {
      return {
        Authorization: `Basic ${storedCredentials}`
      };
    }
    
    // 2. Try localStorage
    const username = localStorage.getItem('username');
    const password = localStorage.getItem('password');
    if (username && password) {
      const base64Credentials = btoa(`${username}:${password}`);
      // Also save to sessionStorage for future use
      sessionStorage.setItem('credentials', base64Credentials);
      return {
        Authorization: `Basic ${base64Credentials}`
      };
    }
    
    // 3. Last resort - try to use 'admin:admin' (common default)
    console.warn('No credentials found, using fallback admin:admin');
    const fallbackCredentials = btoa('admin:admin');
    return {
      Authorization: `Basic ${fallbackCredentials}`
    };
  }, []);

  // Base directory paths based on the current tab - memoized
  const getBasePath = useCallback(() => {
    return `${NANOS_INSTALL_DIR}/${currentTab.charAt(0).toUpperCase() + currentTab.slice(1)}`;
  }, [currentTab]);
  
  // Load the contents of the current directory
  const loadDirectoryContents = useCallback(async (path?: string) => {
    setIsLoading(true);
    const dirPath = path || getBasePath();
    
    try {
      const response = await fetch(`/api/files/list?path=${encodeURIComponent(dirPath)}`, {
        method: 'GET',
        headers: {
          ...getAuthHeader(),
        },
      });
      
      if (!response.ok) {
        throw new Error(`Failed to load directory contents: ${response.statusText}`);
      }
      
      const data = await response.json() as { success: boolean, files: FileEntry[] };
      
      if (data.success) {
        setFiles(data.files);
        setCurrentPath(dirPath);
        
        // Update breadcrumbs
        const basePath = getBasePath();
        if (dirPath === basePath) {
          setBreadcrumbs([currentTab]);
        } else {
          const relativePath = dirPath.replace(basePath, '');
          const parts = relativePath.split('/').filter(Boolean);
          setBreadcrumbs([currentTab, ...parts]);
        }

        // Clear selections after directory change
        setSelectedFiles(new Set());
      } else {
        throw new Error('Failed to load directory contents');
      }
    } catch (error) {
      toast.error((error as Error).message);
      console.error('Error loading directory contents:', error);
    } finally {
      setIsLoading(false);
    }
  }, [currentTab, getBasePath, getAuthHeader]);
  
  // Handle directory change when clicking on a folder
  const handleDirectoryChange = (dirPath: string) => {
    loadDirectoryContents(dirPath);
  };
  
  // Handle breadcrumb navigation
  const handleBreadcrumbClick = (index: number) => {
    if (index === 0) {
      // Clicking on the root (packages or assets)
      loadDirectoryContents(getBasePath());
    } else {
      // Clicking on a subdirectory
      const basePath = getBasePath();
      const path = `${basePath}/${breadcrumbs.slice(1, index + 1).join('/')}`;
      loadDirectoryContents(path);
    }
  };
  
  // Create stable breadcrumb keys
  const breadcrumbKeys = useMemo(() => {
    return breadcrumbs.map((crumb, index) => {
      if (index === 0) return crumb;
      // Create a path-based key for non-root items
      return breadcrumbs.slice(0, index + 1).join('/');
    });
  }, [breadcrumbs]);
  
  // Delete a file or directory
  const handleDelete = async (filePath: string, isDirectory: boolean) => {
    if (!confirm(`Are you sure you want to delete this ${isDirectory ? 'directory' : 'file'}?`)) {
      return;
    }
    
    try {
      const response = await fetch(`/api/files/delete?path=${encodeURIComponent(filePath)}`, {
        method: 'DELETE',
        headers: {
          ...getAuthHeader(),
        },
      });
      
      if (!response.ok) {
        throw new Error(`Failed to delete: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        toast.success(`${isDirectory ? 'Directory' : 'File'} deleted successfully`);
        loadDirectoryContents(currentPath);
        
        // Remove from selection if selected
        if (selectedFiles.has(filePath)) {
          const newSelected = new Set(selectedFiles);
          newSelected.delete(filePath);
          setSelectedFiles(newSelected);
        }
      } else {
        throw new Error(data.error || 'Failed to delete');
      }
    } catch (error) {
      toast.error((error as Error).message);
      console.error('Error deleting:', error);
    }
  };
  
  // Extract an archive file
  const handleExtract = async (filePath: string) => {
    setIsExtracting(true);
    
    try {
      const response = await fetch('/api/files/extract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({ path: filePath }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to extract: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        toast.success('File extracted successfully');
        loadDirectoryContents(currentPath);
      } else {
        throw new Error(data.error || 'Failed to extract');
      }
    } catch (error) {
      toast.error((error as Error).message);
      console.error('Error extracting:', error);
    } finally {
      setIsExtracting(false);
    }
  };
  
  // Handle file upload
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || event.target.files.length === 0) {
      return;
    }
    
    setIsUploading(true);
    setUploadProgress(0);
    
    try {
      const file = event.target.files[0];
      const formData = new FormData();
      formData.append('file', file);
      
      const xhr = new XMLHttpRequest();
      
      // Set up progress tracking
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percentage = Math.round((e.loaded / e.total) * 100);
          setUploadProgress(percentage);
        }
      });
      
      // Set up promise to handle response
      const uploadPromise = new Promise<void>((resolve, reject) => {
        xhr.onreadystatechange = () => {
          if (xhr.readyState === 4) {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
            } else {
              reject(new Error(`Upload failed with status ${xhr.status}`));
            }
          }
        };
      });
      
      // Configure the request
      xhr.open('POST', `/api/files/upload?type=${currentTab}`);
      
      // Add auth header
      const authHeader = getAuthHeader();
      for (const key of Object.keys(authHeader)) {
        xhr.setRequestHeader(key, authHeader[key]);
      }
      
      // Send the request
      xhr.send(formData);
      
      // Wait for completion
      await uploadPromise;
      
      toast.success('File uploaded successfully');
      
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      
      // Reload the directory contents
      loadDirectoryContents(currentPath);
    } catch (error) {
      toast.error((error as Error).message);
      console.error('Error uploading file:', error);
    } finally {
      setIsUploading(false);
    }
  };

  // Handle file/folder selection
  const handleSelect = (filePath: string, event: React.MouseEvent) => {
    // Prevent directory change when selecting
    event.stopPropagation();

    const newSelectedFiles = new Set(selectedFiles);
    
    if (event.ctrlKey || event.metaKey) {
      // Add or remove from selection with Ctrl/Cmd key
      if (newSelectedFiles.has(filePath)) {
        newSelectedFiles.delete(filePath);
      } else {
        newSelectedFiles.add(filePath);
      }
    } else {
      // Single selection
      if (newSelectedFiles.size === 1 && newSelectedFiles.has(filePath)) {
        // Deselect if already selected
        newSelectedFiles.clear();
      } else {
        // New selection
        newSelectedFiles.clear();
        newSelectedFiles.add(filePath);
      }
    }
    
    setSelectedFiles(newSelectedFiles);
  };

  // Handle keyboard selection
  const handleKeyDown = (filePath: string, event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      handleSelect(filePath, event as unknown as React.MouseEvent);
    }
  };

  // Check if a file/folder is selected
  const isSelected = (filePath: string): boolean => {
    return selectedFiles.has(filePath);
  };

  // Handle move selected files to parent directory
  const handleMoveUp = async () => {
    if (selectedFiles.size === 0 || breadcrumbs.length <= 1) {
      // Cannot move up from root directory
      return;
    }

    setIsMoving(true);

    // Get parent directory path
    const parentPath = pathUtils.dirname(currentPath);

    try {
      // Create a new endpoint for moving files
      const promises = Array.from(selectedFiles).map(async (filePath) => {
        const fileName = filePath.split('/').pop();
        const newPath = `${parentPath}/${fileName}`;

        const response = await fetch('/api/files/move', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeader(),
          },
          body: JSON.stringify({ 
            sourcePath: filePath,
            destinationPath: newPath 
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed to move file: ${response.statusText}`);
        }

        return response.json();
      });

      await Promise.all(promises);
      toast.success('Files moved successfully');
      loadDirectoryContents(currentPath);
    } catch (error) {
      toast.error((error as Error).message);
      console.error('Error moving files:', error);
    } finally {
      setIsMoving(false);
    }
  };

  // Drag event handlers
  const handleDragStart = (file: FileEntry) => (event: React.DragEvent) => {
    setDraggedFile(file);
    
    // Set the file path as drag data
    event.dataTransfer.setData('text/plain', file.path);
    
    // Store information about whether we're dragging selected files
    if (selectedFiles.has(file.path) && selectedFiles.size > 1) {
      // We're dragging a file that's part of a multi-selection
      event.dataTransfer.setData('application/nanos-dashboard-files', JSON.stringify({
        isMultiDrag: true,
        count: selectedFiles.size
      }));
      
      // Create a custom drag image for multiple files
      try {
        const dragElement = document.createElement('div');
        dragElement.classList.add('bg-amber-500/30', 'text-amber-300', 'p-2', 'rounded', 'text-xs', 'font-mono');
        dragElement.textContent = `Moving ${selectedFiles.size} items`;
        document.body.appendChild(dragElement);
        event.dataTransfer.setDragImage(dragElement, 15, 15);
        
        // Clean up after a small delay
        setTimeout(() => {
          document.body.removeChild(dragElement);
        }, 100);
      } catch (error) {
        console.error('Error creating custom drag image:', error);
      }
    }
    
    event.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };

  const handleDragEnter = (event: React.DragEvent) => {
    event.preventDefault();
    if (event.currentTarget.classList.contains('drop-target')) {
      event.currentTarget.classList.add('bg-amber-500/20');
    }
  };

  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault();
    if (event.currentTarget.classList.contains('drop-target')) {
      event.currentTarget.classList.remove('bg-amber-500/20');
    }
  };

  const handleDrop = (targetDir: string) => async (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    
    if (event.currentTarget.classList.contains('drop-target')) {
      event.currentTarget.classList.remove('bg-amber-500/20');
    }
    
    if (!draggedFile) return;

    setIsMoving(true);
    
    try {
      // Check if this is a multi-file drag operation
      const multiDragData = event.dataTransfer.getData('application/nanos-dashboard-files');
      const isMultiDrag = multiDragData ? JSON.parse(multiDragData).isMultiDrag : false;
      
      if (isMultiDrag && selectedFiles.has(draggedFile.path)) {
        // Move all selected files
        const filesToMove = Array.from(selectedFiles);
        let successCount = 0;
        let errorCount = 0;
        
        // Create a progress toast that can be updated
        const toastId = toast.loading(`Moving ${filesToMove.length} items...`);
        
        for (let i = 0; i < filesToMove.length; i++) {
          const sourcePath = filesToMove[i];
          const fileName = sourcePath.split('/').pop() || '';
          const destinationPath = `${targetDir}/${fileName}`;
          
          try {
            const response = await fetch('/api/files/move', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...getAuthHeader(),
              },
              body: JSON.stringify({ 
                sourcePath,
                destinationPath 
              }),
            });
            
            if (response.ok) {
              successCount++;
              // Update progress
              toast.loading(`Moving items... ${successCount}/${filesToMove.length}`, { id: toastId });
            } else {
              errorCount++;
            }
          } catch (error) {
            errorCount++;
            console.error(`Error moving file ${fileName}:`, error);
          }
        }
        
        // Update final toast
        if (errorCount === 0) {
          toast.success(`Successfully moved ${successCount} items`, { id: toastId });
        } else {
          toast.error(`Moved ${successCount} items, ${errorCount} failed`, { id: toastId });
        }
        
      } else {
        // Just move the single dragged file
        const sourcePath = draggedFile.path;
        const fileName = sourcePath.split('/').pop() || '';
        const destinationPath = `${targetDir}/${fileName}`;
        
        const response = await fetch('/api/files/move', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeader(),
          },
          body: JSON.stringify({ 
            sourcePath,
            destinationPath 
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed to move file: ${response.statusText}`);
        }

        const data = await response.json();
        
        if (data.success) {
          toast.success('File moved successfully');
        } else {
          throw new Error(data.error || 'Failed to move file');
        }
      }
      
      // Reload current directory contents after all moves
      loadDirectoryContents(currentPath);
    } catch (error) {
      toast.error((error as Error).message);
      console.error('Error moving file(s):', error);
    } finally {
      setIsMoving(false);
      setDraggedFile(null);
    }
  };
  
  // Trigger file input click
  const handleUploadClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };
  
  // Format file size for display
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return `${Number.parseFloat((bytes / (k ** i)).toFixed(2))} ${sizes[i]}`;
  };
  
  // Format date for display
  const formatDate = (date: Date): string => {
    return new Date(date).toLocaleString();
  };
  
  // Check if a file is an archive that can be extracted
  const isExtractable = (fileName: string): boolean => {
    const lowerName = fileName.toLowerCase();
    return lowerName.endsWith('.zip') || 
           lowerName.endsWith('.tar') || 
           lowerName.endsWith('.tar.gz') || 
           lowerName.endsWith('.tgz');
  };
  
  // Handle checkbox selection
  const handleCheckboxSelect = (filePath: string, event: React.ChangeEvent<HTMLInputElement>) => {
    event.stopPropagation();
    
    const newSelectedFiles = new Set(selectedFiles);
    
    if (event.target.checked) {
      newSelectedFiles.add(filePath);
    } else {
      newSelectedFiles.delete(filePath);
    }
    
    setSelectedFiles(newSelectedFiles);
  };

  // Toggle all checkboxes
  const handleSelectAll = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.checked) {
      // Select all files
      const allFilePaths = files.map(file => file.path);
      setSelectedFiles(new Set(allFilePaths));
    } else {
      // Deselect all files
      setSelectedFiles(new Set());
    }
  };

  // Check if all files are selected
  const areAllSelected = useMemo(() => {
    return files.length > 0 && selectedFiles.size === files.length;
  }, [files, selectedFiles]);
  
  // Initialize component - load directory contents when tab changes
  useEffect(() => {
    loadDirectoryContents();
  }, [loadDirectoryContents]);
  
  return (
    <div className="bg-black/30 border border-amber-500/20 rounded-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-amber-300 font-mono">File Manager</h2>
        
        <div className="flex space-x-4">
          <button
            type="button"
            onClick={() => setCurrentTab('packages')}
            className={`px-3 py-1 font-mono text-xs rounded-md transition-colors ${
              currentTab === 'packages'
                ? 'bg-amber-500/30 text-amber-300'
                : 'bg-amber-500/10 text-amber-400/70 hover:bg-amber-500/20'
            }`}
          >
            Packages
          </button>
          
          <button
            type="button"
            onClick={() => setCurrentTab('assets')}
            className={`px-3 py-1 font-mono text-xs rounded-md transition-colors ${
              currentTab === 'assets'
                ? 'bg-amber-500/30 text-amber-300'
                : 'bg-amber-500/10 text-amber-400/70 hover:bg-amber-500/20'
            }`}
          >
            Assets
          </button>
        </div>
      </div>
      
      {/* Breadcrumbs - fixed to use stable keys */}
      <div className="flex items-center flex-wrap mb-4 text-sm text-amber-400/70 font-mono">
        {breadcrumbs.map((crumb, index) => (
          <React.Fragment key={breadcrumbKeys[index]}>
            {index > 0 && <span className="mx-1">/</span>}
            <button
              type="button"
              onClick={() => handleBreadcrumbClick(index)}
              className="hover:text-amber-300 transition-colors"
            >
              {crumb}
            </button>
          </React.Fragment>
        ))}
      </div>
      
      {/* Selection and Action Buttons */}
      <div className="flex justify-between mb-6">
        <div className="flex space-x-2">
          <button
            type="button"
            onClick={handleUploadClick}
            disabled={isUploading}
            className="px-3 py-1 bg-amber-500/20 text-amber-300 rounded-md hover:bg-amber-500/30 transition-colors font-mono text-xs flex items-center disabled:opacity-50"
          >
            {isUploading ? (
              <>
                <div className="h-3 w-3 animate-spin rounded-full border-t-2 border-amber-400 border-r-2 border-amber-400/30 mr-1" />
                Uploading ({uploadProgress}%)
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" viewBox="0 0 20 20" fill="currentColor" aria-labelledby="upload-icon">
                  <title id="upload-icon">Upload</title>
                  <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
                Upload
              </>
            )}
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            className="hidden"
          />
          
          <button
            type="button"
            onClick={() => loadDirectoryContents(currentPath)}
            disabled={isLoading}
            className="px-3 py-1 bg-amber-500/20 text-amber-300 rounded-md hover:bg-amber-500/30 transition-colors font-mono text-xs flex items-center disabled:opacity-50"
          >
            {isLoading ? (
              <div className="h-3 w-3 animate-spin rounded-full border-t-2 border-amber-400 border-r-2 border-amber-400/30 mr-1" />
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" viewBox="0 0 20 20" fill="currentColor" aria-labelledby="refresh-icon">
                <title id="refresh-icon">Refresh</title>
                <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
              </svg>
            )}
            Refresh
          </button>
          
          {/* Move Up Button */}
          <button
            type="button"
            onClick={handleMoveUp}
            disabled={isMoving || selectedFiles.size === 0 || breadcrumbs.length <= 1}
            className="px-3 py-1 bg-amber-500/20 text-amber-300 rounded-md hover:bg-amber-500/30 transition-colors font-mono text-xs flex items-center disabled:opacity-50"
          >
            {isMoving ? (
              <div className="h-3 w-3 animate-spin rounded-full border-t-2 border-amber-400 border-r-2 border-amber-400/30 mr-1" />
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" viewBox="0 0 20 20" fill="currentColor" aria-labelledby="move-up-icon">
                <title id="move-up-icon">Move Up</title>
                <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
              </svg>
            )}
            Move Up
          </button>
          
          {/* Delete Selected Button */}
          {selectedFiles.size > 0 && (
            <button
              type="button"
              onClick={() => {
                if (confirm(`Are you sure you want to delete ${selectedFiles.size} selected item${selectedFiles.size !== 1 ? 's' : ''}?`)) {
                  // Create a copy to avoid mutation during iteration
                  const filesToDelete = Array.from(selectedFiles);
                  
                  // Sequential deletion to avoid overwhelming the server
                  const deleteNext = async (index: number) => {
                    if (index >= filesToDelete.length) {
                      toast.success('All selected items deleted');
                      loadDirectoryContents(currentPath);
                      return;
                    }
                    
                    const filePath = filesToDelete[index];
                    const fileObj = files.find(f => f.path === filePath);
                    
                    if (!fileObj) {
                      deleteNext(index + 1);
                      return;
                    }
                    
                    try {
                      const response = await fetch(`/api/files/delete?path=${encodeURIComponent(filePath)}`, {
                        method: 'DELETE',
                        headers: {
                          ...getAuthHeader(),
                        },
                      });
                      
                      if (!response.ok) {
                        throw new Error(`Failed to delete: ${response.statusText}`);
                      }
                      
                      await response.json();
                      deleteNext(index + 1);
                    } catch (error) {
                      toast.error(`Error deleting ${fileObj.name}: ${(error as Error).message}`);
                      deleteNext(index + 1);
                    }
                  };
                  
                  deleteNext(0);
                }
              }}
              className="px-3 py-1 bg-red-900/20 text-red-400 rounded-md hover:bg-red-900/30 transition-colors font-mono text-xs flex items-center"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" viewBox="0 0 20 20" fill="currentColor" aria-labelledby="delete-selected-icon">
                <title id="delete-selected-icon">Delete Selected</title>
                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              Delete Selected
            </button>
          )}
        </div>
        
        {/* Selection Counter */}
        {selectedFiles.size > 0 && (
          <div className="px-3 py-1 bg-amber-500/10 text-amber-300 rounded-md font-mono text-xs flex items-center">
            {selectedFiles.size} item{selectedFiles.size !== 1 ? 's' : ''} selected
          </div>
        )}
      </div>
      
      {/* File listing */}
      <div className="overflow-x-auto">
        <table className="w-full font-mono text-sm">
          <thead className="text-left">
            <tr className="border-b border-amber-500/20">
              <th className="pb-2 w-6">
                {files.length > 0 && (
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="select-all"
                      checked={areAllSelected}
                      onChange={handleSelectAll}
                      className="w-4 h-4 bg-transparent border border-amber-500/40 rounded text-amber-500 focus:ring-amber-500/30"
                    />
                  </div>
                )}
              </th>
              <th className="pb-2 text-amber-300 font-normal">Name</th>
              <th className="pb-2 text-amber-300 font-normal">Size</th>
              <th className="pb-2 text-amber-300 font-normal">Modified</th>
              <th className="pb-2 text-amber-300 font-normal">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className="py-4 text-center text-amber-400/70">
                  <div className="flex justify-center items-center">
                    <div className="h-5 w-5 animate-spin rounded-full border-t-2 border-amber-400 border-r-2 border-amber-400/30 mr-2" />
                    Loading...
                  </div>
                </td>
              </tr>
            ) : files.length === 0 && breadcrumbs.length <= 1 ? (
              <tr>
                <td colSpan={5} className="py-4 text-center text-amber-400/70">
                  No files found in this directory
                </td>
              </tr>
            ) : (
              <>
                {/* Parent Directory Entry (..) - only show when not in root directory */}
                {breadcrumbs.length > 1 && (
                  <tr className="border-b border-amber-500/10 hover:bg-amber-500/5">
                    <td className="py-2" />
                    <td className="py-2">
                      <button
                        type="button"
                        onClick={() => {
                          const parentPath = pathUtils.dirname(currentPath);
                          handleDirectoryChange(parentPath);
                        }}
                        className="flex items-center text-amber-300 hover:underline drop-target"
                        onDragOver={handleDragOver}
                        onDragEnter={handleDragEnter}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop(pathUtils.dirname(currentPath))}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor" aria-labelledby="parent-directory-icon">
                          <title id="parent-directory-icon">Parent Directory</title>
                          <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
                        </svg>
                        ..
                      </button>
                    </td>
                    <td className="py-2 text-amber-400/70">--</td>
                    <td className="py-2 text-amber-400/70">--</td>
                    <td className="py-2">--</td>
                  </tr>
                )}

                {/* Regular file entries */}
                {files.map((file) => (
                  <tr 
                    key={file.path} 
                    className={`border-b border-amber-500/10 hover:bg-amber-500/5 ${isSelected(file.path) ? 'bg-amber-500/20' : ''}`}
                    onClick={(e) => handleSelect(file.path, e)}
                    onKeyDown={(e) => handleKeyDown(file.path, e)}
                    tabIndex={0}
                    draggable
                    onDragStart={handleDragStart(file)}
                  >
                    <td className="py-2 pl-2">
                      <input
                        type="checkbox"
                        checked={isSelected(file.path)}
                        onChange={(e) => handleCheckboxSelect(file.path, e)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-4 h-4 bg-transparent border border-amber-500/40 rounded text-amber-500 focus:ring-amber-500/30"
                        aria-label={`Select ${file.name}`}
                      />
                    </td>
                    <td className="py-2">
                      {file.isDirectory ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDirectoryChange(file.path);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.stopPropagation();
                              handleDirectoryChange(file.path);
                            }
                          }}
                          className={`flex items-center ${isSelected(file.path) ? 'text-amber-300' : 'text-amber-300'} hover:underline drop-target`}
                          onDragOver={handleDragOver}
                          onDragEnter={handleDragEnter}
                          onDragLeave={handleDragLeave}
                          onDrop={handleDrop(file.path)}
                          tabIndex={-1}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor" aria-labelledby={`folder-icon-${file.name}`}>
                            <title id={`folder-icon-${file.name}`}>Folder</title>
                            <path fillRule="evenodd" d="M2 6a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1H8a3 3 0 00-3 3v1.5a1.5 1.5 0 01-3 0V6z" clipRule="evenodd" />
                            <path d="M6 12a2 2 0 012-2h8a2 2 0 012 2v2a2 2 0 01-2 2H8a2 2 0 01-2-2v-2z" />
                          </svg>
                          {file.name}
                        </button>
                      ) : (
                        <span className={`flex items-center ${isSelected(file.path) ? 'text-amber-300' : 'text-amber-400/90'}`}>
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor" aria-labelledby={`file-icon-${file.name}`}>
                            <title id={`file-icon-${file.name}`}>File</title>
                            <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                          </svg>
                          {file.name}
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-amber-400/70">
                      {file.isDirectory ? '--' : formatFileSize(file.size)}
                    </td>
                    <td className="py-2 text-amber-400/70">
                      {formatDate(file.modified)}
                    </td>
                    <td className="py-2 space-x-2 flex">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(file.path, file.isDirectory);
                        }}
                        className="px-2 py-1 bg-red-900/20 text-red-400 rounded hover:bg-red-900/30 transition-colors"
                        title="Delete"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor" aria-labelledby={`delete-icon-${file.name}`}>
                          <title id={`delete-icon-${file.name}`}>Delete</title>
                          <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                      </button>
                      
                      {!file.isDirectory && isExtractable(file.name) && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleExtract(file.path);
                          }}
                          disabled={isExtracting}
                          className="px-2 py-1 bg-amber-500/20 text-amber-300 rounded hover:bg-amber-500/30 transition-colors disabled:opacity-50"
                          title="Extract"
                        >
                          {isExtracting ? (
                            <div className="h-3 w-3 animate-spin rounded-full border-t-2 border-amber-400 border-r-2 border-amber-400/30" />
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor" aria-labelledby={`extract-icon-${file.name}`}>
                              <title id={`extract-icon-${file.name}`}>Extract</title>
                              <path fillRule="evenodd" d="M5 2a1 1 0 011 1v1h1a1 1 0 010 2H6v1a1 1 0 01-2 0V6H3a1 1 0 010-2h1V3a1 1 0 011-1zm0 10a1 1 0 011 1v1h1a1 1 0 110 2H6v1a1 1 0 11-2 0v-1H3a1 1 0 110-2h1v-1a1 1 0 011-1zM12 2a1 1 0 01.967.744L14.146 7.2 17.5 9.134a1 1 0 010 1.732l-3.354 1.935-1.18 4.455a1 1 0 01-1.933 0L9.854 12.8 6.5 10.866a1 1 0 010-1.732l3.354-1.935 1.18-4.455A1 1 0 0112 2z" clipRule="evenodd" />
                            </svg>
                          )}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
} 