'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [debugInfo, setDebugInfo] = useState<any>(null);

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
        setError('Invalid username or password');
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Nanos Dashboard
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Please sign in with your administrator credentials
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="username" className="sr-only">Username</label>
              <input
                id="username"
                name="username"
                type="text"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          {error && (
            <div className="text-red-500 text-sm text-center">
              {error}
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </div>
        </form>
        
        {debugInfo && (
          <div className="mt-4 p-4 bg-gray-100 rounded-md">
            <h3 className="text-sm font-medium text-gray-900">Debug Info:</h3>
            <pre className="mt-2 text-xs overflow-auto">
              {JSON.stringify(debugInfo, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
