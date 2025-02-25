import { Router } from 'express';
import type { Request, Response } from 'express';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

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

type FileOperationResult = ReadResult | WriteResult | ListResult;

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

export default router; 