'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useSocket } from '@/hooks/useSocket';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { metrics } = useSocket();
  const [activeMenu, setActiveMenu] = useState<string>('');

  // Format bytes to human-readable size
  const formatBytes = (bytes: number): string => {
    if (!bytes || bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return `${Number.parseFloat((bytes / (k ** i)).toFixed(1))} ${sizes[i]}`;
  };

  useEffect(() => {
    // Extract the active menu from pathname
    const path = pathname.split('/')[2] || '';
    setActiveMenu(path || 'overview');
  }, [pathname]);

  const handleLogout = () => {
    sessionStorage.removeItem('credentials');
    router.push('/');
  };

  // Calculate RAM percentage
  const ramPercentage = metrics ? 
    Math.round((metrics.memory.used / metrics.memory.total) * 100) : 0;

  // Use the actual CPU usage instead of load average
  const cpuPercentage = metrics ? Math.round(metrics.cpu.usage) : 0;

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-black to-zinc-900 text-amber-50">
      {/* Sidebar */}
      <div className="w-64 border-r border-amber-500/20 backdrop-blur-sm backdrop-filter bg-black/60 flex flex-col">
        {/* Logo area */}
        <div className="p-4 border-b border-amber-500/20">
          <div className="flex items-center">
            <div className="text-xl font-bold text-amber-400">
              nanos_
            </div>
            <div className="ml-2 text-xs text-amber-400/50 font-mono self-end">
              DASHBOARD
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-grow py-6 px-4 font-mono">
          <ul className="space-y-1">
            {[
              { path: '', label: 'Overview', defaultActive: true },
              { path: 'configuration', label: 'Configuration' },
              { path: 'console', label: 'Console' },
              { path: 'modules', label: 'Modules' },
              { path: 'settings', label: 'Settings' }
            ].map(item => {
              const isActive = activeMenu === (item.path || 'overview');
              return (
                <li key={item.path || 'overview'}>
                  <Link 
                    href={`/dashboard${item.path ? `/${item.path}` : ''}`}
                    className={`flex items-center px-3 py-2 rounded-md transition-all ${
                      isActive 
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' 
                        : 'text-amber-400/70 hover:bg-zinc-800 hover:text-amber-300'
                    }`}
                  >
                    <span className="text-amber-400/90 mr-2">$</span>
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* System Metrics */}
        <div className="px-4 pt-4 pb-2">
          <h3 className="text-amber-400/70 text-xs mb-3 border-b border-amber-500/20 pb-1">SYSTEM METRICS</h3>
          
          {/* RAM Usage */}
          <div className="mb-3">
            <div className="flex justify-between text-xs text-amber-400/90 mb-1">
              <span>RAM</span>
              <span>{ramPercentage}%</span>
            </div>
            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div 
                className={`h-full ${
                  ramPercentage > 90 ? 'bg-red-500' : 
                  ramPercentage > 70 ? 'bg-amber-500' : 'bg-green-500'
                }`}
                style={{ width: `${ramPercentage}%` }}
              />
            </div>
            {metrics && (
              <div className="text-[10px] text-amber-400/60 mt-1 text-right">
                {formatBytes(metrics.memory.used)} / {formatBytes(metrics.memory.total)}
              </div>
            )}
          </div>
          
          {/* CPU Usage */}
          <div className="mb-3">
            <div className="flex justify-between text-xs text-amber-400/90 mb-1">
              <span>CPU</span>
              <span>{cpuPercentage}%</span>
            </div>
            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div 
                className={`h-full ${
                  cpuPercentage > 90 ? 'bg-red-500' : 
                  cpuPercentage > 70 ? 'bg-amber-500' : 'bg-green-500'
                }`}
                style={{ width: `${cpuPercentage}%` }}
              />
            </div>
            {metrics && (
              <div className="text-[10px] text-amber-400/60 mt-1 text-right">
                Load: {metrics.cpu.loadAvg[0].toFixed(2)} | Cores: {metrics.cpu.cores}
              </div>
            )}
          </div>
        </div>

        {/* Logout button */}
        <div className="p-4 border-t border-amber-500/20 mt-auto">
          <button
            type="button"
            onClick={handleLogout}
            className="w-full py-2 px-4 bg-zinc-900/80 border border-red-500/30 text-red-400/90 hover:bg-zinc-800 rounded focus:outline-none focus:ring-2 focus:ring-red-500/40 focus:ring-offset-2 focus:ring-offset-black transition-all duration-200 font-mono text-sm flex items-center justify-center"
          >
            <span className="mr-2">⬢</span>
            <span>Logout</span>
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-hidden">
        {children}
      </div>
    </div>
  );
} 