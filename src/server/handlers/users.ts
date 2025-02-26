import { Router } from 'express';
import type { Request, Response } from 'express';
import { 
  getUser, 
  createUser, 
  updateOnboardingStatus, 
  getOnboardingStatus,
  updateLastLogin
} from '../database';

// Define interface for user in request
interface RequestWithUser extends Request {
  user?: {
    username: string;
  };
}

const router = Router();

// Get current user data
router.get('/me', async (req: RequestWithUser, res: Response): Promise<void> => {
  try {
    const username = req.user?.username;
    
    if (!username) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    
    // Get or create user
    let user = getUser(username);
    
    if (!user) {
      user = createUser(username);
    }
    
    // Update last login time
    updateLastLogin(username);
    
    // Get onboarding status
    const onboardingCompleted = getOnboardingStatus(username);
    
    res.json({
      username,
      onboardingCompleted,
      success: true
    });
  } catch (error) {
    console.error('Error getting user data:', error);
    res.status(500).json({ 
      error: 'Failed to get user data',
      details: (error as Error).message
    });
  }
});

// Update onboarding status
router.post('/onboarding', async (req: RequestWithUser, res: Response): Promise<void> => {
  try {
    const username = req.user?.username;
    const { completed } = req.body;
    
    if (!username) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    
    if (typeof completed !== 'boolean') {
      res.status(400).json({ error: 'Completed status must be a boolean' });
      return;
    }
    
    // Update onboarding status
    const success = updateOnboardingStatus(username, completed);
    
    if (!success) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    
    res.json({
      success: true,
      onboardingCompleted: completed
    });
  } catch (error) {
    console.error('Error updating onboarding status:', error);
    res.status(500).json({ 
      error: 'Failed to update onboarding status',
      details: (error as Error).message
    });
  }
});

export default router;
