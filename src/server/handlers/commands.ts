import { Router, Request, Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';

// Define interface for user in request
interface RequestWithUser extends Request {
  user?: {
    username: string;
  };
}

const execPromise = promisify(exec);
const router = Router();

/**
 * Execute a system command
 * @param command The command to execute
 * @param userId The user ID (for logging)
 * @returns The command execution result
 */
export async function executeCommand(command: string, userId?: string): Promise<{ stdout: string; stderr: string }> {
  console.log(`Executing command for user ${userId || 'unknown'}: ${command}`);
  
  try {
    const result = await execPromise(command);
    console.log(`Command executed successfully: ${command.substring(0, 50)}${command.length > 50 ? '...' : ''}`);
    return result;
  } catch (error) {
    console.error(`Command execution error: ${(error as Error).message}`);
    throw error;
  }
}

// Route to execute commands
router.post('/execute', async (req: RequestWithUser, res: Response): Promise<void> => {
  try {
    const { command } = req.body;
    
    if (!command) {
      res.status(400).json({ error: 'Command is required' });
      return;
    }
    
    // Get user ID from the authenticated request
    const userId = req.user?.username;
    
    // Execute the command
    const result = await executeCommand(command, userId);
    
    // Return the result
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error executing command:', (error as Error).message);
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

export default router; 