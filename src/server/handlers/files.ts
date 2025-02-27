import { Router } from 'express';
import type { Request, Response } from 'express';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import toml from 'toml';

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

export default router; 