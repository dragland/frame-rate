'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { joinSession } from '../../lib/session';
import { Session } from '../../lib/types';
import { Home } from '../page';

export default function SessionCodePage({ params }: { params: { code: string } }) {
  const router = useRouter();
  const [sessionData, setSessionData] = useState<Session | null>(null);
  const [username, setUsername] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [needsUsername, setNeedsUsername] = useState(false);
  
  useEffect(() => {
    const { code } = params;
    
    if (!code || !/^[A-Z]{4}$/.test(code)) {
      router.replace('/');
      return;
    }

    const tryJoinSession = async () => {
      // Check if we have a stored username
      const storedUsername = localStorage.getItem('frameRateUsername');
      
      if (storedUsername) {
        try {
          const response = await joinSession(code, storedUsername);
          if (response.success && response.session) {
            // Successfully joined (or rejoined)
            setSessionData(response.session);
            setUsername(storedUsername);
            setIsLoading(false);
            return;
          }
        } catch (error) {
          console.error('Failed to auto-join session:', error);
        }
      }
      
      // If auto-join failed or no stored username, redirect to join page
      router.replace(`/?join=${code}`);
    };

    tryJoinSession();
  }, [params, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Joining session...</p>
        </div>
      </div>
    );
  }

  if (sessionData) {
    // Render the main app with session data
    return (
      <div className="session-wrapper">
        <Home 
          initialSessionData={sessionData} 
          initialUsername={username}
          initialSessionCode={params.code}
        />
      </div>
    );
  }

  return null;
} 