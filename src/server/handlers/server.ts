import { Router, type Request, type Response } from 'express';
import { exec, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

// Define interface for user in request
interface RequestWithUser extends Request {
  user?: {
    username: string;
  };
}

// Hardcoded paths as requested
const NANOS_SERVER_PATH = '/opt/nanos-world-server/NanosWorldServer.sh';
const NANOS_CONFIG_PATH = '/opt/nanos-world-server/Config.toml';
const NANOS_LOG_PATH = '/tmp/nanos-server.log';

// Process management - store the server process if it's running
let serverProcess: ReturnType<typeof exec> | null = null;
let serverRunning = false;

const execPromise = promisify(exec);
const router = Router();

/**
 * Check if the Nanos World server is running
 */
async function checkServerStatus(): Promise<{running: boolean, pid?: number, uptime?: number}> {
  try {
    // Use ps command to find the NanosWorldServer process
    const { stdout } = await execPromise("ps aux | grep NanosWorldServer | grep -v grep");
    
    if (stdout.trim()) {
      // Extract PID from ps output (second column)
      const pid = Number.parseInt(stdout.trim().split(/\s+/)[1], 10);
      
      // Try to get process uptime if we have a valid PID
      let uptime = undefined;
      if (pid && !Number.isNaN(pid)) {
        try {
          const { stdout: procStats } = await execPromise(`ps -o etimes= -p ${pid}`);
          uptime = Number.parseInt(procStats.trim(), 10);
        } catch (e) {
          console.log('Error getting process uptime:', e);
        }
      }
      
      return { running: true, pid, uptime };
    }
    
    return { running: false };
  } catch (error) {
    console.error('Error checking server status:', error);
    return { running: false };
  }
}

/**
 * Start the Nanos World server
 */
async function startServer(): Promise<{success: boolean, message: string}> {
  try {
    // First check if server is already running
    const status = await checkServerStatus();
    if (status.running) {
      return { 
        success: false, 
        message: `Server already running with PID ${status.pid}` 
      };
    }

    // Check if server script exists
    try {
      await fs.access(NANOS_SERVER_PATH);
    } catch (err) {
      return { 
        success: false, 
        message: `Server script not found at ${NANOS_SERVER_PATH}` 
      };
    }

    // Start the server in the background using screen to allow interactive commands
    // First check if screen is installed
    try {
      await execPromise('which screen');
    } catch {
      // If screen is not installed, try to install it
      console.log('Screen is not installed, attempting to install it...');
      try {
        // Try to detect the package manager and install screen
        const { stdout: osRelease } = await execPromise('cat /etc/os-release');
        
        if (osRelease.includes('ID=debian') || osRelease.includes('ID=ubuntu')) {
          console.log('Debian/Ubuntu detected, using apt to install screen');
          await execPromise('sudo apt-get update && sudo apt-get install -y screen');
        } else if (osRelease.includes('ID=fedora') || osRelease.includes('ID=centos') || osRelease.includes('ID=rhel')) {
          console.log('Fedora/CentOS/RHEL detected, using dnf/yum to install screen');
          await execPromise('sudo dnf install -y screen || sudo yum install -y screen');
        } else if (osRelease.includes('ID=arch')) {
          console.log('Arch Linux detected, using pacman to install screen');
          await execPromise('sudo pacman -Sy --noconfirm screen');
        } else {
          // Unknown distro, try common package managers
          console.log('Unknown Linux distribution, trying common package managers');
          try {
            await execPromise('sudo apt-get update && sudo apt-get install -y screen || sudo dnf install -y screen || sudo yum install -y screen || sudo pacman -Sy --noconfirm screen');
          } catch (e) {
            throw new Error('Could not install screen: Unknown package manager');
          }
        }
        
        // Verify screen was installed
        await execPromise('which screen');
        console.log('Screen installed successfully');
      } catch (installError) {
        // If we couldn't install screen, fall back to the original method
        console.log('Failed to install screen:', installError);
        console.log('Falling back to basic execution');
        serverProcess = exec(`${NANOS_SERVER_PATH} > ${NANOS_LOG_PATH} 2>&1 &`);
        serverRunning = true;
        
        return { 
          success: true, 
          message: 'Server starting (basic mode)...' 
        };
      }
    }
    
    // Start the server in a detached screen session
    // First, make sure we don't have an existing session
    try {
      await execPromise('screen -wipe'); // Clean up any dead sessions
      await execPromise('screen -S nanos-server -X quit'); // Try to quit any existing session
    } catch {
      // It's okay if this fails (no existing session)
    }
    
    // Start a new screen session with the server
    serverProcess = exec(`screen -dmS nanos-server ${NANOS_SERVER_PATH} 2>&1`);
    
    // Set up logging by redirecting screen output to the log file
    exec(`screen -S nanos-server -X logfile ${NANOS_LOG_PATH}`);
    exec('screen -S nanos-server -X log on');
    
    serverRunning = true;
    
    return { 
      success: true, 
      message: 'Server starting in interactive mode...' 
    };
  } catch (error) {
    console.error('Error starting server:', error);
    return { 
      success: false, 
      message: `Failed to start server: ${(error as Error).message}` 
    };
  }
}

/**
 * Stop the Nanos World server
 */
async function stopServer(): Promise<{success: boolean, message: string}> {
  try {
    // Check if server is running
    const status = await checkServerStatus();
    if (!status.running) {
      return { 
        success: false, 
        message: 'Server is not running' 
      };
    }

    // If we have a PID, kill the process
    if (status.pid) {
      // Try graceful termination first (SIGTERM)
      await execPromise(`kill -15 ${status.pid}`);
      
      // Wait 5 seconds and check if it's still running
      await new Promise(resolve => setTimeout(resolve, 5000));
      const checkStatus = await checkServerStatus();
      
      // If still running, force kill (SIGKILL)
      if (checkStatus.running && checkStatus.pid) {
        await execPromise(`kill -9 ${checkStatus.pid}`);
      }
      
      serverProcess = null;
      serverRunning = false;
      
      return { 
        success: true, 
        message: 'Server stopped' 
      };
    }
    
    return { 
      success: false, 
      message: 'Could not determine server PID' 
    };
  } catch (error) {
    console.error('Error stopping server:', error);
    return { 
      success: false, 
      message: `Failed to stop server: ${(error as Error).message}` 
    };
  }
}

/**
 * Send a command to the Nanos World server via its stdin
 */
async function sendCommandToServer(command: string): Promise<{success: boolean, message: string}> {
  try {
    // Check if server is running
    const status = await checkServerStatus();
    if (!status.running) {
      return { 
        success: false, 
        message: 'Server is not running' 
      };
    }

    if (!status.pid) {
      return { 
        success: false, 
        message: 'Could not determine server PID' 
      };
    }

    // Try to use screen to send the command if available
    try {
      await execPromise('which screen');
      
      // Check if our screen session exists
      const { stdout } = await execPromise('screen -ls');
      if (stdout.includes('nanos-server')) {
        // Send command to the screen session
        await execPromise(`screen -S nanos-server -X stuff "${command.replace(/"/g, '\\"')}\\n"`);
        return { 
          success: true, 
          message: 'Command sent to server via screen' 
        };
      }
    } catch (screenError) {
      console.log('Screen not available or session not found, falling back to direct input');
    }

    // Fall back to direct process input if screen is not available
    try {
      await execPromise(`echo "${command}" > /proc/${status.pid}/fd/0`);
      return { 
        success: true, 
        message: 'Command sent to server' 
      };
    } catch (commandError) {
      console.error('Error sending command to server:', commandError);
      return { 
        success: false, 
        message: `Failed to send command: ${(commandError as Error).message}` 
      };
    }
  } catch (error) {
    console.error('Error in sendCommandToServer:', error);
    return { 
      success: false, 
      message: `Internal error: ${(error as Error).message}` 
    };
  }
}

// Endpoint to start the server
router.post('/start', async (req: RequestWithUser, res: Response): Promise<void> => {
  try {
    console.log(`API request to start server from user: ${req.user?.username || 'unknown'}`);
    const result = await startServer();
    res.json(result);
  } catch (error) {
    console.error('Error in start server endpoint:', error);
    res.status(500).json({ 
      success: false, 
      message: `Internal server error: ${(error as Error).message}` 
    });
  }
});

// Endpoint to stop the server
router.post('/stop', async (req: RequestWithUser, res: Response): Promise<void> => {
  try {
    console.log(`API request to stop server from user: ${req.user?.username || 'unknown'}`);
    const result = await stopServer();
    res.json(result);
  } catch (error) {
    console.error('Error in stop server endpoint:', error);
    res.status(500).json({ 
      success: false, 
      message: `Internal server error: ${(error as Error).message}` 
    });
  }
});

// Endpoint to get server status
router.get('/status', async (req: RequestWithUser, res: Response): Promise<void> => {
  try {
    console.log(`API request to check server status from user: ${req.user?.username || 'unknown'}`);
    const status = await checkServerStatus();
    res.json({
      success: true,
      ...status,
      configPath: NANOS_CONFIG_PATH
    });
  } catch (error) {
    console.error('Error in server status endpoint:', error);
    res.status(500).json({ 
      success: false, 
      message: `Internal server error: ${(error as Error).message}` 
    });
  }
});

// Endpoint to get server logs
router.get('/logs', async (req: RequestWithUser, res: Response): Promise<void> => {
  try {
    console.log(`API request to get server logs from user: ${req.user?.username || 'unknown'}`);
    
    // Get the query parameters for tail options
    const lines = Number.parseInt(req.query.lines as string || '100', 10);
    
    try {
      // Use tail command to get the last N lines of the log file
      const { stdout } = await execPromise(`tail -n ${lines} ${NANOS_LOG_PATH}`);
      
      res.json({
        success: true,
        logs: stdout.split('\n')
      });
    } catch (logError) {
      // Check if the log file exists
      try {
        await fs.access(NANOS_LOG_PATH);
      } catch {
        // Log file doesn't exist yet
        res.json({
          success: true,
          logs: ["Server hasn't been started yet or hasn't produced any logs."]
        });
        return;
      }
      
      res.status(500).json({ 
        success: false, 
        message: `Failed to read log file: ${(logError as Error).message}` 
      });
    }
  } catch (error) {
    console.error('Error in server logs endpoint:', error);
    res.status(500).json({ 
      success: false, 
      message: `Internal server error: ${(error as Error).message}` 
    });
  }
});

// Endpoint to send a command to the server
router.post('/command', async (req: RequestWithUser, res: Response): Promise<void> => {
  try {
    const { command } = req.body;
    
    if (!command || typeof command !== 'string') {
      res.status(400).json({ 
        success: false, 
        message: 'Invalid command' 
      });
      return;
    }
    
    console.log(`API request to send command to server from user: ${req.user?.username || 'unknown'}`);
    console.log(`Command: ${command}`);
    
    const result = await sendCommandToServer(command);
    res.json(result);
  } catch (error) {
    console.error('Error in server command endpoint:', error);
    res.status(500).json({ 
      success: false, 
      message: `Internal server error: ${(error as Error).message}` 
    });
  }
});

export default router;