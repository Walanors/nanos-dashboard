// scripts/stop.js - Script to stop the Nanos Dashboard application
const { execSync } = require('node:child_process');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

// Determine if we're on Linux or Windows
const isLinux = os.platform() === 'linux';
const isWindows = os.platform() === 'win32';

console.log('Attempting to stop Nanos Dashboard...');

try {
  if (isLinux) {
    // Check if systemd service exists and is active
    try {
      const serviceStatus = execSync('systemctl is-active nanos-dashboard.service').toString().trim();
      if (serviceStatus === 'active') {
        console.log('Stopping systemd service...');
        execSync('sudo systemctl stop nanos-dashboard.service');
        console.log('✅ Nanos Dashboard service stopped successfully');
      } else {
        console.log('Service is not running, checking for process...');
        // Fallback to process killing
        findAndKillProcess();
      }
    } catch (error) {
      console.log('Service not found or not accessible, checking for process...');
      // Fallback to process killing
      findAndKillProcess();
    }
  } else {
    // On Windows or other OS, use process killing
    findAndKillProcess();
  }
} catch (error) {
  console.error('❌ Error stopping Nanos Dashboard:', error.message);
  process.exit(1);
}

function findAndKillProcess() {
  try {
    const processName = 'server.js';
    
    if (isWindows) {
      // Find process ID on Windows
      const cmd = `tasklist /FI "IMAGENAME eq node.exe" /FO CSV`;
      const output = execSync(cmd).toString();
      
      // Parse the CSV output to find node processes
      const lines = output.split('\n').filter(line => line.includes('node.exe'));
      
      if (lines.length > 0) {
        // Extract PIDs
        const pids = lines.map(line => {
          const parts = line.split(',');
          return parts[1] ? parts[1].replace(/"/g, '') : null;
        }).filter(Boolean);
        
        // Kill each node process (user will need to identify the correct one)
        console.log(`Found ${pids.length} node processes. Attempting to stop...`);
        
        for (const pid of pids) {
          try {
            console.log(`Stopping process with PID ${pid}...`);
            execSync(`taskkill /F /PID ${pid}`);
            console.log(`✅ Process ${pid} stopped`);
          } catch (e) {
            console.log(`Failed to stop process ${pid}: ${e.message}`);
          }
        }
      } else {
        console.log('No node processes found running');
      }
    } else {
      // Find and kill on Linux/Unix
      const cmd = `pkill -f "${processName}"`;
      execSync(cmd);
      console.log(`✅ Processes matching '${processName}' stopped`);
    }
  } catch (error) {
    if (error.status === 1) {
      console.log('No matching processes found to stop');
    } else {
      throw error;
    }
  }
} 