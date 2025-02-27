import { Router } from 'express';
import type { Request, Response } from 'express';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import toml from 'toml';
import multer from 'multer';
import * as childProcess from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdirSync } from 'node:fs';

// Define interface for user in request
interface RequestWithUser extends Request {
  user?: {
    username: string;
  };
}

// Define file stat result type
interface FileStats {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modified: Date;
}

interface ReadResult {
  content: string;
}

interface WriteResult {
  success: boolean;
}

interface ListResult {
  files: FileStats[];
}

type FileOperationResult = ReadResult | WriteResult | ListResult | UploadResult | DeleteResult | ExtractResult;

// Extend types for multer
declare global {
  namespace Express {
    interface Request {
      file?: Multer.File;
    }
  }
}

// Paths for Nanos server packages and assets
const NANOS_SERVER_PATH = '/opt/nanos-world-server';
const NANOS_PACKAGES_PATH = path.join(NANOS_SERVER_PATH, 'Packages');
const NANOS_ASSETS_PATH = path.join(NANOS_SERVER_PATH, 'Assets');

// Create directories if they don't exist
try {
  if (!existsSync(NANOS_PACKAGES_PATH)) {
    mkdirSync(NANOS_PACKAGES_PATH, { recursive: true });
  }
  if (!existsSync(NANOS_ASSETS_PATH)) {
    mkdirSync(NANOS_ASSETS_PATH, { recursive: true });
  }
} catch (error) {
  console.error('Failed to create directories:', error);
}

// Upload storage configuration
const storage = multer.diskStorage({
  destination: (req: Request, file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
    const type = (req.query.type || 'packages') as string;
    const uploadPath = type.toLowerCase() === 'assets' ? NANOS_ASSETS_PATH : NANOS_PACKAGES_PATH;
    cb(null, uploadPath);
  },
  filename: (req: Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
    cb(null, file.originalname);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 1024 * 1024 * 1024 * 20 // 20GB limit to accommodate large assets
  }
});

// Promisify exec
const execPromise = promisify(childProcess.exec);

// Define new result interfaces
interface UploadResult {
  success: boolean;
  filePath?: string;
  fileName?: string;
}

interface DeleteResult {
  success: boolean;
  path?: string;
}

interface ExtractResult {
  success: boolean;
  extractedTo?: string;
}

const router = Router();

/**
 * Handle file operations (read, write, list)
 * @param operation The operation to perform (read, write, list)
 * @param filePath The path to the file or directory
 * @param content The content to write (for write operation)
 * @returns The result of the operation
 */
export async function handleFileOperation(
  operation: 'read' | 'write' | 'list', 
  filePath: string,
  content?: string
): Promise<FileOperationResult> {
  console.log(`File operation: ${operation} on ${filePath}`);
  
  try {
    switch (operation) {
      case 'read': {
        const fileContent = await fs.readFile(filePath, 'utf-8');
        return { content: fileContent };
      }
      
      case 'write': {
        if (!content) {
          throw new Error('Content is required for write operation');
        }
        await fs.writeFile(filePath, content, 'utf-8');
        return { success: true };
      }
      
      case 'list': {
        const files = await fs.readdir(filePath);
        const fileStats = await Promise.all(
          files.map(async (file) => {
            const fullPath = path.join(filePath, file);
            const stat = await fs.stat(fullPath);
            return {
              name: file,
              path: fullPath,
              isDirectory: stat.isDirectory(),
              size: stat.size,
              modified: stat.mtime
            };
          })
        );
        return { files: fileStats };
      }
      
      default:
        throw new Error(`Unsupported operation: ${operation}`);
    }
  } catch (error) {
    console.error(`File operation error: ${(error as Error).message}`);
    throw error;
  }
}

/**
 * Read and parse a TOML file
 * @param filePath The path to the TOML file
 * @returns The parsed TOML content
 */
export async function readAndParseTomlFile(filePath: string): Promise<{content: Record<string, unknown>}> {
  try {
    console.log(`Reading TOML file: ${filePath}`);
    const fileContent = await fs.readFile(filePath, 'utf8');
    console.log(`TOML file read successfully: ${filePath}`);
    
    try {
      const parsedContent = toml.parse(fileContent);
      console.log(`TOML file parsed successfully: ${filePath}`);
      return { content: parsedContent };
    } catch (parseError) {
      console.error(`Error parsing TOML file: ${(parseError as Error).message}`);
      throw new Error(`Failed to parse TOML file: ${(parseError as Error).message}`);
    }
  } catch (fileError) {
    console.error(`Error reading TOML file: ${(fileError as Error).message}`);
    throw fileError;
  }
}

/**
 * Save TOML content to a file
 * @param filePath The path to save the TOML file
 * @param content The content to save
 * @returns Success status
 */
export async function saveTomlFile(filePath: string, content: Record<string, unknown>): Promise<{ success: boolean }> {
  try {
    console.log(`Saving TOML file: ${filePath}`);
    
    // Format the TOML content
    let formattedContent = '';
    
    // Process each section of the TOML content
    for (const [sectionName, sectionData] of Object.entries(content)) {
      if (typeof sectionData === 'object' && sectionData !== null) {
        formattedContent += `[${sectionName}]\n`;
        
        // Process each property in the section
        for (const [key, value] of Object.entries(sectionData as Record<string, unknown>)) {
          // Format the value based on its type
          let formattedValue = '';
          if (typeof value === 'string') {
            formattedValue = `"${value}"`;
          } else if (Array.isArray(value)) {
            formattedValue = JSON.stringify(value);
          } else {
            formattedValue = String(value);
          }
          
          formattedContent += `    ${key} = ${formattedValue}\n`;
        }
        
        formattedContent += '\n';
      }
    }
    
    await fs.writeFile(filePath, formattedContent, 'utf8');
    console.log(`TOML file saved successfully: ${filePath}`);
    return { success: true };
  } catch (error) {
    console.error(`Error saving TOML file: ${(error as Error).message}`);
    throw error;
  }
}

// Route to read file
router.get('/read', async (req: RequestWithUser, res: Response): Promise<void> => {
  try {
    const { path } = req.query;
    
    if (!path || typeof path !== 'string') {
      res.status(400).json({ error: 'File path is required' });
      return;
    }
    
    const result = await handleFileOperation('read', path);
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error reading file:', (error as Error).message);
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

// Route to write file
router.post('/write', async (req: RequestWithUser, res: Response): Promise<void> => {
  try {
    const { path, content } = req.body;
    
    if (!path || typeof path !== 'string') {
      res.status(400).json({ error: 'File path is required' });
      return;
    }
    
    if (!content) {
      res.status(400).json({ error: 'File content is required' });
      return;
    }
    
    const result = await handleFileOperation('write', path, content);
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error writing file:', (error as Error).message);
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

// Route to list directory contents
router.get('/list', async (req: RequestWithUser, res: Response): Promise<void> => {
  try {
    const { path } = req.query;
    
    if (!path || typeof path !== 'string') {
      res.status(400).json({ error: 'Directory path is required' });
      return;
    }
    
    const result = await handleFileOperation('list', path);
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error listing directory:', (error as Error).message);
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

// Route to read TOML file
router.get('/toml', async (req: RequestWithUser, res: Response): Promise<void> => {
  try {
    const { path: filePath } = req.query;
    
    if (!filePath || typeof filePath !== 'string') {
      res.status(400).json({ error: 'File path is required' });
      return;
    }
    
    // Security check to ensure the path is not traversing outside allowed directories
    if (filePath.includes('..')) {
      res.status(403).json({ error: 'Invalid file path' });
      return;
    }
    
    try {
      const result = await readAndParseTomlFile(filePath);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  } catch (error) {
    console.error(`Error handling TOML request: ${(error as Error).message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Route to save TOML file
router.post('/toml', async (req: RequestWithUser, res: Response): Promise<void> => {
  try {
    const { path: filePath, content } = req.body;
    
    if (!filePath || typeof filePath !== 'string') {
      res.status(400).json({ error: 'File path is required' });
      return;
    }
    
    if (!content || typeof content !== 'object') {
      res.status(400).json({ error: 'Content is required and must be an object' });
      return;
    }
    
    // Security check to ensure the path is not traversing outside allowed directories
    if (filePath.includes('..')) {
      res.status(403).json({ error: 'Invalid file path' });
      return;
    }
    
    try {
      const result = await saveTomlFile(filePath, content);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  } catch (error) {
    console.error(`Error handling TOML save request: ${(error as Error).message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Route to upload a file to Packages or Assets directory
router.post('/upload', upload.single('file'), async (req: RequestWithUser & { file?: Express.Multer.File }, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, error: 'No file uploaded' });
      return;
    }

    console.log(`File uploaded by ${req.user?.username || 'unknown user'}: ${req.file.originalname}`);
    
    res.json({
      success: true,
      filePath: req.file.path,
      fileName: req.file.originalname
    });
  } catch (error) {
    console.error('Error uploading file:', (error as Error).message);
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

// Route to delete a file or directory
router.delete('/delete', async (req: RequestWithUser, res: Response): Promise<void> => {
  try {
    const { path: filePath } = req.query;
    
    if (!filePath || typeof filePath !== 'string') {
      res.status(400).json({ success: false, error: 'File path is required' });
      return;
    }

    // Security check to ensure we're only operating within allowed directories
    if (!filePath.startsWith(NANOS_PACKAGES_PATH) && !filePath.startsWith(NANOS_ASSETS_PATH)) {
      res.status(403).json({ success: false, error: 'Operation not allowed on this path' });
      return;
    }

    const stats = await fs.stat(filePath);
    
    if (stats.isDirectory()) {
      await fs.rm(filePath, { recursive: true, force: true });
    } else {
      await fs.unlink(filePath);
    }
    
    console.log(`File/directory deleted by ${req.user?.username || 'unknown user'}: ${filePath}`);
    
    res.json({
      success: true,
      path: filePath
    });
  } catch (error) {
    console.error('Error deleting file:', (error as Error).message);
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

// Route to extract zip/tar files
router.post('/extract', async (req: RequestWithUser, res: Response): Promise<void> => {
  try {
    const { path: filePath } = req.body;
    
    if (!filePath || typeof filePath !== 'string') {
      res.status(400).json({ success: false, error: 'File path is required' });
      return;
    }

    // Security check to ensure we're only operating within allowed directories
    if (!filePath.startsWith(NANOS_PACKAGES_PATH) && !filePath.startsWith(NANOS_ASSETS_PATH)) {
      res.status(403).json({ success: false, error: 'Operation not allowed on this path' });
      return;
    }

    // Get the directory where the file is located
    const targetDir = path.dirname(filePath);
    let extractCommand = '';

    // Determine the appropriate extraction command based on file extension
    if (filePath.endsWith('.zip')) {
      extractCommand = `unzip -o "${filePath}" -d "${targetDir}"`;
    } else if (filePath.endsWith('.tar')) {
      extractCommand = `tar -xf "${filePath}" -C "${targetDir}"`;
    } else if (filePath.endsWith('.tar.gz') || filePath.endsWith('.tgz')) {
      extractCommand = `tar -xzf "${filePath}" -C "${targetDir}"`;
    } else {
      res.status(400).json({ success: false, error: 'Unsupported archive format' });
      return;
    }

    // Execute the extraction command
    await execPromise(extractCommand);
    
    console.log(`File extracted by ${req.user?.username || 'unknown user'}: ${filePath}`);
    
    res.json({
      success: true,
      extractedTo: targetDir
    });
  } catch (error) {
    console.error('Error extracting file:', (error as Error).message);
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

// Route to move a file or directory
router.post('/move', async (req: RequestWithUser, res: Response): Promise<void> => {
  try {
    const { sourcePath, destinationPath } = req.body;
    
    if (!sourcePath || typeof sourcePath !== 'string') {
      res.status(400).json({ success: false, error: 'Source path is required' });
      return;
    }
    
    if (!destinationPath || typeof destinationPath !== 'string') {
      res.status(400).json({ success: false, error: 'Destination path is required' });
      return;
    }

    // Security check to ensure we're only operating within allowed directories
    if (!sourcePath.startsWith(NANOS_PACKAGES_PATH) && !sourcePath.startsWith(NANOS_ASSETS_PATH)) {
      res.status(403).json({ success: false, error: 'Operation not allowed on source path' });
      return;
    }
    
    if (!destinationPath.startsWith(NANOS_PACKAGES_PATH) && !destinationPath.startsWith(NANOS_ASSETS_PATH)) {
      res.status(403).json({ success: false, error: 'Operation not allowed on destination path' });
      return;
    }

    // Check if source exists
    try {
      await fs.access(sourcePath);
    } catch (error) {
      res.status(404).json({ success: false, error: 'Source file or directory not found' });
      return;
    }

    // Check if destination parent directory exists
    const destinationDir = path.dirname(destinationPath);
    try {
      await fs.access(destinationDir);
    } catch (error) {
      // Create destination directory if it doesn't exist
      await fs.mkdir(destinationDir, { recursive: true });
    }

    // Check if destination already exists
    try {
      await fs.access(destinationPath);
      // If we got here, the destination exists
      res.status(409).json({ success: false, error: 'Destination already exists' });
      return;
    } catch (error) {
      // This is good, destination doesn't exist
    }

    // Use rename to move the file/directory
    await fs.rename(sourcePath, destinationPath);
    
    console.log(`File/directory moved by ${req.user?.username || 'unknown user'}: ${sourcePath} -> ${destinationPath}`);
    
    res.json({
      success: true,
      sourcePath,
      destinationPath
    });
  } catch (error) {
    console.error('Error moving file:', (error as Error).message);
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

export default router; 