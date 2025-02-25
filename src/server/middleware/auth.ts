import type { Request, Response, NextFunction } from 'express';

/**
 * Middleware to authenticate API requests with username/password
 */
export function authenticateRequest(req: Request, res: Response, next: NextFunction): void {
  // Get authorization header
  const authHeader = req.headers.authorization;
  
  console.log('API auth attempt:', {
    path: req.path,
    hasAuthHeader: !!authHeader,
    isBasicAuth: authHeader?.startsWith('Basic ')
  });
  
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    console.log('API authentication failed: No valid authorization header');
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  
  try {
    // Extract and decode the base64 credentials
    const base64Credentials = authHeader.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf8');
    const [username, password] = credentials.split(':');
    
    console.log('API credentials check:', { 
      username, 
      passwordProvided: !!password,
      expectedUsername: process.env.ADMIN_USERNAME
    });
    
    // Compare with environment variables
    if (username === process.env.ADMIN_USERNAME && 
        password === process.env.ADMIN_PASSWORD) {
      console.log('API authentication successful for:', username);
      // Add user info to request
      (req as any).user = { username };
      next();
    } else {
      console.log('API authentication failed: Invalid credentials');
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }
  } catch (error) {
    console.log('API authentication error:', (error as Error).message);
    res.status(403).json({ error: 'Authentication error' });
    return;
  }
} 