'use client';

import { useState, type FormEvent, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface DebugInfo {
  status: number;
  ok: boolean;
  data: Record<string, unknown>;
}

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);
  const [cursorVisible, setCursorVisible] = useState(true);

  // Blinking cursor effect
  useEffect(() => {
    const interval = setInterval(() => {
      setCursorVisible(v => !v);
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault(); // Prevent the form from submitting normally
    setError('');
    setLoading(true);
    setDebugInfo(null);

    try {
      // Create basic auth header
      const credentials = btoa(`${username}:${password}`);
      
      console.log('Attempting login with:', { username, hasPassword: !!password });
      
      // Test credentials with a simple API request
      const response = await fetch('/api/system/info', {
        headers: {
          'Authorization': `Basic ${credentials}`
        }
      });

      const responseData = await response.json();
      console.log('Auth response:', { 
        status: response.status, 
        ok: response.ok,
        data: responseData
      });
      
      setDebugInfo({
        status: response.status,
        ok: response.ok,
        data: responseData
      });

      if (response.ok) {
        console.log('Login successful, storing credentials and redirecting');
        // Store credentials in sessionStorage (not secure for production)
        sessionStorage.setItem('credentials', credentials);
        
        // Redirect to dashboard
        router.push('/dashboard');
      } else {
        console.log('Login failed:', responseData);
        setError('Authentication failed: Invalid credentials');
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('Connection error: Unable to reach server');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-black to-zinc-900 py-12 px-4 sm:px-6 lg:px-8 text-amber-50">
      <div className="absolute top-0 right-0 p-4 text-xs text-amber-400/50 font-mono">
        <div>System: Nanos World Manager</div>
        <div>Version: 1.0.0</div>
      </div>

      {/* Terminal window container */}
      <div className="max-w-md w-full backdrop-blur-sm backdrop-filter bg-black/60 border border-amber-500/20 shadow-2xl rounded-md overflow-hidden">
        {/* Terminal header */}
        <div className="flex items-center justify-between px-4 py-2 bg-zinc-900/90 border-b border-amber-500/20">
          <div className="flex items-center space-x-2">
            <div className="h-3 w-3 rounded-full bg-red-500/80" />
            <div className="h-3 w-3 rounded-full bg-yellow-500/80" />
            <div className="h-3 w-3 rounded-full bg-green-500/80" />
          </div>
          <div className="font-mono text-xs text-amber-400/70">nanos_dashboard:/login</div>
        </div>
        
        {/* Terminal content */}
        <div className="p-6 space-y-6 font-mono">
          <div className="space-y-1">
            <div className="text-amber-400 text-xl flex items-center">
              <span className="mr-2">$</span>
              <span className="font-bold tracking-wide">NANOS DASHBOARD</span>
              <span className={`w-2 h-5 bg-amber-400 ml-2 ${cursorVisible ? 'opacity-100' : 'opacity-0'}`} />
            </div>
            <div className="text-amber-400/70 text-xs border-b border-amber-500/20 pb-2">
              Secure access terminal for Nanos World Management
            </div>
          </div>
          
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-4">
              {/* Username input with terminal style */}
              <div className="space-y-1">
                <div className="flex items-center text-amber-400/80 text-sm">
                  <span className="mr-2">$</span>
                  <span>username:</span>
                </div>
                <div className="flex">
                  <span className="text-amber-400/50 mr-2">❯</span>
                  <input
                    id="username"
                    name="username"
                    type="text"
                    required
                    className="flex-1 bg-transparent border-b border-amber-500/30 text-amber-100 focus:border-amber-400 outline-none px-1 py-1 text-sm font-mono placeholder-amber-400/30"
                    placeholder="Enter username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </div>
              </div>
              
              {/* Password input with terminal style */}
              <div className="space-y-1">
                <div className="flex items-center text-amber-400/80 text-sm">
                  <span className="mr-2">$</span>
                  <span>password:</span>
                </div>
                <div className="flex">
                  <span className="text-amber-400/50 mr-2">❯</span>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    required
                    className="flex-1 bg-transparent border-b border-amber-500/30 text-amber-100 focus:border-amber-400 outline-none px-1 py-1 text-sm font-mono placeholder-amber-400/30"
                    placeholder="Enter password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Error message with terminal styling */}
            {error && (
              <div className="text-red-400 text-sm p-2 bg-zinc-900/40 border border-red-500/30 rounded font-mono">
                <span className="text-red-500 mr-2">!</span>
                {error}
              </div>
            )}

            {/* Login button with terminal styling */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2 px-4 bg-amber-500/10 border border-amber-500/40 text-amber-400 hover:bg-zinc-800 rounded focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:ring-offset-2 focus:ring-offset-black disabled:opacity-50 transition-all duration-200 font-mono text-sm"
              >
                {loading ? 'AUTHENTICATING...' : 'LOGIN TO SYSTEM'}
              </button>
            </div>
          </form>
          
          {/* Terminal-style debug output */}
          {debugInfo && (
            <div className="mt-4 p-3 bg-zinc-900/50 border border-amber-500/30 rounded text-xs text-amber-200 font-mono overflow-auto">
              <div className="text-amber-400 mb-1">$ debug --output</div>
              <pre className="whitespace-pre-wrap break-all text-green-300">
                {JSON.stringify(debugInfo, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
      
      {/* Footer with terminal-style text */}
      <div className="absolute bottom-4 text-amber-400/40 text-xs font-mono">
        Nanos World Management System v1.0.0 | Running on secure connection
      </div>
    </div>
  );
}
