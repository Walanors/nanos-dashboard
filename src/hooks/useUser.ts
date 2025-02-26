'use client';

import { useState, useEffect, useCallback } from 'react';

interface UserData {
  username: string;
  onboardingCompleted: boolean;
}

export function useUser() {
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch user data
  const fetchUserData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Get credentials from session storage
      const credentialsBase64 = sessionStorage.getItem('credentials');
      if (!credentialsBase64) {
        setError('No credentials found');
        setLoading(false);
        return;
      }
      
      // Make API request with authentication
      const response = await fetch('/api/users/me', {
        headers: {
          'Authorization': `Basic ${credentialsBase64}`
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch user data');
      }
      
      const data = await response.json();
      setUserData({
        username: data.username,
        onboardingCompleted: data.onboardingCompleted
      });
    } catch (err) {
      console.error('Error fetching user data:', err);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  
  // Update onboarding status
  const updateOnboardingStatus = useCallback(async (completed: boolean) => {
    try {
      setError(null);
      
      // Get credentials from session storage
      const credentialsBase64 = sessionStorage.getItem('credentials');
      if (!credentialsBase64) {
        setError('No credentials found');
        return false;
      }
      
      // Make API request with authentication
      const response = await fetch('/api/users/onboarding', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${credentialsBase64}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ completed })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update onboarding status');
      }
      
      const data = await response.json();
      
      // Update local state
      if (userData) {
        setUserData({
          ...userData,
          onboardingCompleted: data.onboardingCompleted
        });
      }
      
      return true;
    } catch (err) {
      console.error('Error updating onboarding status:', err);
      setError((err as Error).message);
      return false;
    }
  }, [userData]);
  
  // Load user data on mount
  useEffect(() => {
    fetchUserData();
  }, [fetchUserData]);
  
  return {
    userData,
    loading,
    error,
    fetchUserData,
    updateOnboardingStatus
  };
}
