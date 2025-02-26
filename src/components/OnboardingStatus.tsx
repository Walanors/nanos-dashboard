'use client';

import { useState } from 'react';
import { useUser } from '@/hooks/useUser';

export default function OnboardingStatus() {
  const { userData, loading, error, updateOnboardingStatus } = useUser();
  const [isUpdating, setIsUpdating] = useState(false);
  
  const handleToggleOnboarding = async () => {
    if (!userData) return;
    
    setIsUpdating(true);
    try {
      // Toggle the current status
      await updateOnboardingStatus(!userData.onboardingCompleted);
    } finally {
      setIsUpdating(false);
    }
  };
  
  if (loading) {
    return <div className="p-4 bg-gray-100 rounded-lg">Loading user data...</div>;
  }
  
  if (error) {
    return (
      <div className="p-4 bg-red-100 text-red-800 rounded-lg">
        Error: {error}
      </div>
    );
  }
  
  if (!userData) {
    return <div className="p-4 bg-yellow-100 rounded-lg">No user data available</div>;
  }
  
  return (
    <div className="p-4 bg-white border rounded-lg shadow-sm">
      <h3 className="text-lg font-medium mb-2">Onboarding Status</h3>
      <div className="flex items-center justify-between mb-4">
        <span>
          Status: 
          <span className={`ml-2 font-medium ${userData.onboardingCompleted ? 'text-green-600' : 'text-yellow-600'}`}>
            {userData.onboardingCompleted ? 'Completed' : 'Not Completed'}
          </span>
        </span>
        <button
          onClick={handleToggleOnboarding}
          disabled={isUpdating}
          className={`px-4 py-2 rounded-md ${
            userData.onboardingCompleted 
              ? 'bg-yellow-500 hover:bg-yellow-600' 
              : 'bg-green-500 hover:bg-green-600'
          } text-white transition-colors disabled:opacity-50`}
        >
          {isUpdating ? 'Updating...' : userData.onboardingCompleted ? 'Mark as Incomplete' : 'Mark as Complete'}
        </button>
      </div>
      <div className="text-sm text-gray-600">
        <p>Username: {userData.username}</p>
      </div>
    </div>
  );
}
