'use client';

import type { ReactNode } from 'react';
import { Toaster } from 'react-hot-toast';
import { SocketProvider } from '@/contexts/SocketContext';

interface ProvidersProps {
  children: ReactNode;
}

export default function Providers({ children }: ProvidersProps) {
  return (
    <>
      <SocketProvider>
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#1a1a1a',
              color: '#fff',
              border: '1px solid rgba(245, 158, 11, 0.1)',
            },
            success: {
              iconTheme: {
                primary: '#10B981',
                secondary: '#1a1a1a',
              },
            },
            error: {
              iconTheme: {
                primary: '#EF4444',
                secondary: '#1a1a1a',
              },
            },
          }}
        />
      </SocketProvider>
    </>
  );
} 