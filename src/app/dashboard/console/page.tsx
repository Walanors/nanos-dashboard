'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useSocket } from '@/hooks/useSocket';

export default function ConsolePage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [command, setCommand] = useState('');
  const [commandOutput, setCommandOutput] = useState<string[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const outputEndRef = useRef<HTMLDivElement>(null);
  const prevOutputLengthRef = useRef<number>(0);
  
  // Get socket connection
  const { socket, isConnected, connectionError: socketError } = useSocket();
  
  useEffect(() => {
    // Check if user is authenticated
    const credentials = sessionStorage.getItem('credentials');
    
    if (!credentials) {
      console.log('No credentials found, redirecting to login');
      router.push('/');
    } else {
      setIsLoading(false);
    }
  }, [router]);

  useEffect(() => {
    // Set up socket listeners for console events
    if (socket) {
      const handleConsoleOutput = (output: string) => {
        setCommandOutput(prev => [...prev, output]);
      };

      socket.on('console:output', handleConsoleOutput);
      
      // Request initial console logs
      socket.emit('console:getLogs');

      return () => {
        socket.off('console:output', handleConsoleOutput);
      };
    }
  }, [socket]);

  useEffect(() => {
    // Only scroll if the output length has changed (new messages)
    if (outputEndRef.current && commandOutput.length > prevOutputLengthRef.current) {
      outputEndRef.current.scrollIntoView({ behavior: 'smooth' });
      prevOutputLengthRef.current = commandOutput.length;
    }
  });

  const executeCommand = () => {
    if (!command.trim() || !socket || !isConnected) return;
    
    setIsExecuting(true);
    
    // Add command to output with a prompt symbol
    setCommandOutput(prev => [...prev, `> ${command}`]);
    
    // Send command to server
    socket.emit('console:executeCommand', command, (response: { success: boolean, message?: string }) => {
      if (!response.success && response.message) {
        setCommandOutput(prev => [...prev, `Error: ${response.message}`]);
      }
      setIsExecuting(false);
    });
    
    // Clear command input
    setCommand('');
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-pulse text-amber-400 text-lg font-mono">
          <span className="mr-2">$</span>
          Loading console...
        </div>
      </div>
    );
  }
  
  // Show connection error if socket isn't connected after loading
  if (!isConnected && socketError && !isLoading) {
    return (
      <div className="min-h-screen bg-black/95 flex items-center justify-center">
        <div className="bg-black/70 border border-red-500/30 p-4 rounded-lg max-w-md text-center">
          <h3 className="text-red-400 text-lg mb-2">Connection Error</h3>
          <p className="text-amber-300/80 mb-4">{socketError}</p>
          <p className="text-amber-400/60 text-sm">
            Unable to connect to the server console. 
            Please check your connection and try again.
          </p>
          <button 
            type="button"
            onClick={() => router.push('/dashboard')}
            className="px-4 py-2 bg-amber-500/20 text-amber-300 rounded mt-4 hover:bg-amber-500/30 transition-colors"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black/95 p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-amber-300 font-mono">Server Console</h1>
        <button
          type="button"
          onClick={() => router.push('/dashboard')}
          className="px-4 py-2 bg-amber-500/20 text-amber-300 text-sm rounded hover:bg-amber-500/30 transition-colors"
        >
          Back to Dashboard
        </button>
      </div>
      
      {/* Console Output */}
      <div className="bg-black/70 border border-amber-500/20 rounded-lg p-4 h-[60vh] mb-4 overflow-y-auto font-mono text-sm">
        <div className="text-amber-300/80">
          {commandOutput.length > 0 ? (
            commandOutput.map((line, index) => (
              <div key={`console-line-${index}-${line.substring(0, 10)}`} className={`mb-1 ${line.startsWith('> ') ? 'text-green-400' : ''}`}>
                {line}
              </div>
            ))
          ) : (
            <div className="text-amber-400/50 italic">No console output yet...</div>
          )}
          <div ref={outputEndRef} />
        </div>
      </div>
      
      {/* Command Input */}
      <div className="flex">
        <div className="bg-black/40 border border-amber-500/20 rounded-l-lg px-3 py-2 text-amber-400 font-mono">
          &gt;
        </div>
        <input
          type="text"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && executeCommand()}
          disabled={isExecuting || !isConnected}
          placeholder="Type your command here..."
          className="flex-1 bg-black/40 border-y border-r border-amber-500/20 rounded-r-lg px-3 py-2 text-amber-300 font-mono focus:outline-none focus:border-amber-500/50"
        />
        <button
          type="button"
          onClick={executeCommand}
          disabled={isExecuting || !command.trim() || !isConnected}
          className="ml-2 px-4 py-2 bg-amber-500/20 text-amber-300 rounded hover:bg-amber-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Execute
        </button>
      </div>
      
      {/* Common Commands */}
      <div className="mt-6">
        <h3 className="text-amber-400 font-mono mb-2 text-sm">Quick Commands</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {['help', 'status', 'list players', 'restart'].map((cmd) => (
            <button
              key={cmd}
              type="button"
              onClick={() => {
                setCommand(cmd);
              }}
              className="px-3 py-1 bg-black/40 border border-amber-500/20 rounded text-amber-300 text-sm hover:bg-black/60 transition-colors"
            >
              {cmd}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
} 