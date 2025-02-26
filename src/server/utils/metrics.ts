import * as os from 'node:os';
import * as osUtils from 'node-os-utils';

interface SystemMetrics {
  cpu: {
    usage: number;
    cores: number;
    loadAvg: number[];
  };
  memory: {
    total: number;
    used: number;
    free: number;
  };
  uptime: number;
  hostname: string;
  platform: string;
  arch: string;
}

export function getSystemMetrics(): SystemMetrics {
  const cpuCount = os.cpus().length;
  const loadAvg = os.loadavg();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;

  return {
    cpu: {
      usage: Math.min(100, Math.round((loadAvg[0] / cpuCount) * 100)), // Convert load to percentage
      cores: cpuCount,
      loadAvg
    },
    memory: {
      total: totalMem,
      used: usedMem,
      free: freeMem
    },
    uptime: os.uptime(),
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch()
  };
} 