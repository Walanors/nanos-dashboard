import { Router } from 'express';
import type { Request, Response } from 'express';
import * as os from 'node:os';
import { execSync } from 'node:child_process';

// Define interface for user in request
interface RequestWithUser extends Request {
  user?: {
    username: string;
  };
}

const router = Router();

/**
 * Get system information
 */
export function getSystemInfo() {
  return {
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    cpus: os.cpus().length,
    memory: {
      total: os.totalmem(),
      free: os.freemem()
    },
    uptime: os.uptime(),
    load: os.loadavg()
  };
}

/**
 * Get disk usage information
 */
export function getDiskUsage() {
  try {
    // This is a simple way to get disk usage on Windows
    // For a production app, you'd want a more robust approach
    if (os.platform() === 'win32') {
      const output = execSync('wmic logicaldisk get deviceid, freespace, size').toString();
      const lines = output.split('\n');
      
      // Skip header line
      const disks = lines.slice(1)
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .map(line => {
          const parts = line.split(/\s+/);
          const deviceId = parts[0];
          const freeSpace = parseInt(parts[1], 10);
          const size = parseInt(parts[2], 10);
          
          return {
            drive: deviceId,
            size,
            free: freeSpace,
            used: size - freeSpace,
            usedPercentage: Math.round((size - freeSpace) / size * 100)
          };
        });
      
      return { disks };
    } else {
      // For Linux/Unix systems
      const output = execSync('df -h').toString();
      const lines = output.split('\n');
      
      // Skip header line
      const disks = lines.slice(1)
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .map(line => {
          const parts = line.split(/\s+/);
          return {
            filesystem: parts[0],
            size: parts[1],
            used: parts[2],
            available: parts[3],
            usedPercentage: parseInt(parts[4].replace('%', ''), 10),
            mountedOn: parts[5]
          };
        });
      
      return { disks };
    }
  } catch (error) {
    console.error('Error getting disk usage:', (error as Error).message);
    return { error: (error as Error).message };
  }
}

// Route to get system information
router.get('/info', (req: RequestWithUser, res: Response): void => {
  try {
    const systemInfo = getSystemInfo();
    res.json({
      success: true,
      info: systemInfo
    });
  } catch (error) {
    console.error('Error getting system info:', (error as Error).message);
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

// Route to get disk usage
router.get('/disk', (req: RequestWithUser, res: Response): void => {
  try {
    const diskUsage = getDiskUsage();
    res.json({
      success: true,
      ...diskUsage
    });
  } catch (error) {
    console.error('Error getting disk usage:', (error as Error).message);
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

export default router; 