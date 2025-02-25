# Next.js Implementation for Nanos Dashboard

This document outlines the implementation plan for converting the Nanos Dashboard to a Next.js application with a custom Express server. This approach provides a modern frontend experience while maintaining the system-level capabilities needed for droplet management.

## Architecture Overview

The application uses a hybrid architecture:
- **Next.js Frontend**: Modern React-based UI with built-in routing and optimizations
- **Custom Express Server**: Handles system commands, file operations, and Socket.io connections
- **Single Codebase**: Everything runs in one project for simplified deployment and maintenance

## Project Setup

```bash
# Create a Next.js project
npx create-next-app@latest nanos-dashboard --typescript
cd nanos-dashboard
npm install express socket.io cors helmet dotenv
```

## Project Structure

```
nanos-dashboard/
├── public/                # Static assets
├── src/
│   ├── app/               # Next.js app (UI components and routes)
│   │   ├── page.tsx       # Login page
│   │   ├── layout.tsx     # Root layout
│   │   └── dashboard/     # Dashboard pages
│   ├── components/        # Reusable React components
│   │   ├── ui/            # UI components
│   │   ├── dashboard/     # Dashboard-specific components
│   │   └── terminal/      # Terminal component  
│   ├── server/            # Custom server code
│   │   ├── index.ts       # Express + Next.js server setup
│   │   ├── middleware/    # Authentication middleware
│   │   │   └── auth.ts    # Username/password auth
│   │   ├── socket/        # Socket.io implementation
│   │   │   └── handlers.ts # Socket event handlers
│   │   └── handlers/      # API handlers
│   │       ├── commands.ts # Command execution
│   │       ├── files.ts    # File operations
│   │       └── system.ts   # System information
│   ├── lib/               # Shared utilities
│   └── hooks/             # React hooks
│       └── useSocket.ts   # Socket.io client hook
├── next.config.js         # Next.js configuration
├── package.json           # Dependencies and scripts
├── setup.sh               # Installation script
└── .env.example           # Environment variable template
```

## Key Implementation Files

### Custom Server (src/server/index.ts)

```typescript
import express from 'express';
import http from 'node:http';
import next from 'next';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import path from 'node:path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Import routes and middleware
import { authenticateRequest } from './middleware/auth';
import commandRouter from './handlers/commands';
import fileRouter from './handlers/files';
import systemRouter from './handlers/system';
import { setupSocketHandlers } from './socket/handlers';

// Setup Next.js
const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();
const PORT = process.env.PORT || 3000;

// Prepare Next.js for handling requests
app.prepare().then(() => {
  const server = express();
  const httpServer = http.createServer(server);
  
  // Socket.io setup
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
      methods: ['GET', 'POST'],
      credentials: true
    }
  });
  
  // Middleware
  server.use(cors({
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
    credentials: true
  }));
  
  server.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net"],
        styleSrc: ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", "cdn.jsdelivr.net"],
        objectSrc: ["'none'"],
        frameSrc: ["'none'"]
      }
    }
  }));
  
  server.use(express.json());
  
  // API Routes - these bypass Next.js for system operations
  server.use('/api/commands', authenticateRequest, commandRouter);
  server.use('/api/files', authenticateRequest, fileRouter);
  server.use('/api/system', authenticateRequest, systemRouter);
  
  // Setup Socket.io with authentication
  setupSocketHandlers(io);
  
  // Let Next.js handle all other routes
  server.all('*', (req, res) => {
    return handle(req, res);
  });
  
  // Start server
  httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});
```

### Authentication Middleware (src/server/middleware/auth.ts)

```typescript
import { Request, Response, NextFunction } from 'express';

/**
 * Middleware to authenticate API requests with username/password
 */
export function authenticateRequest(req: Request, res: Response, next: NextFunction) {
  // Get authorization header
  const authHeader = req.headers.authorization;
  
  console.log('API auth attempt:', {
    path: req.path,
    hasAuthHeader: !!authHeader,
    isBasicAuth: authHeader && authHeader.startsWith('Basic ')
  });
  
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    console.log('API authentication failed: No valid authorization header');
    return res.status(401).json({ error: 'Authentication required' });
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
      return res.status(401).json({ error: 'Invalid credentials' });
    }
  } catch (error) {
    console.log('API authentication error:', (error as Error).message);
    return res.status(403).json({ error: 'Authentication error' });
  }
}
```

### Socket.io Setup (src/server/socket/handlers.ts)

```typescript
import { Server, Socket } from 'socket.io';
import { executeCommand } from '../handlers/commands';
import { handleFileOperation } from '../handlers/files';

interface AuthenticatedSocket extends Socket {
  user?: {
    username: string;
  };
}

/**
 * Setup Socket.io connection handlers
 */
export function setupSocketHandlers(io: Server) {
  // Socket Authentication
  io.use((socket: AuthenticatedSocket, next) => {
    const auth = socket.handshake.auth;
    
    console.log('Socket auth attempt:', {
      username: auth?.username,
      passwordProvided: auth?.password ? true : false,
      expectedUsername: process.env.ADMIN_USERNAME
    });
    
    if (!auth || !auth.username || !auth.password) {
      console.log('Authentication failed: Missing credentials');
      return next(new Error('Authentication error: Credentials required'));
    }
    
    try {
      // Check username and password against environment variables
      if (auth.username === process.env.ADMIN_USERNAME && 
          auth.password === process.env.ADMIN_PASSWORD) {
        console.log('Authentication successful for user:', auth.username);
        socket.user = { username: auth.username };
        next();
      } else {
        console.log('Authentication failed: Invalid credentials');
        next(new Error('Authentication error: Invalid credentials'));
      }
    } catch (err) {
      console.log('Authentication error:', (err as Error).message);
      next(new Error('Authentication error'));
    }
  });

  // Socket Connection
  io.on('connection', (socket: AuthenticatedSocket) => {
    console.log('New client connected:', socket.id);
    
    // Join a room specific to this user/droplet
    const username = socket.user?.username;
    socket.join(`user-${username}`);
    
    // Handle command execution
    socket.on('execute-command', async (data, callback) => {
      try {
        const { command } = data;
        const userId = socket.user?.username;
        console.log(`Executing command: "${command}" for user: ${userId}`);
        
        // Execute command with user ID
        const result = await executeCommand(command, userId);
        
        // If callback is provided, use it (acknowledgment)
        if (typeof callback === 'function') {
          callback({ success: true, result });
        } else {
          // Otherwise emit event
          socket.emit('command-result', { 
            success: true, 
            result 
          });
        }
      } catch (error) {
        console.error('Command execution error:', (error as Error).message);
        
        if (typeof callback === 'function') {
          callback({ success: false, error: (error as Error).message });
        } else {
          socket.emit('command-result', { 
            success: false, 
            error: (error as Error).message 
          });
        }
      }
    });
    
    // Handle file operations
    socket.on('file-operation', async (data, callback) => {
      try {
        const { operation, path, content } = data;
        // File operation logic
        const result = await handleFileOperation(operation, path, content);
        
        if (typeof callback === 'function') {
          callback({ success: true, result });
        } else {
          socket.emit('file-result', { 
            success: true, 
            result 
          });
        }
      } catch (error) {
        if (typeof callback === 'function') {
          callback({ success: false, error: (error as Error).message });
        } else {
          socket.emit('file-result', { 
            success: false, 
            error: (error as Error).message 
          });
        }
      }
    });
    
    // Handle disconnection
    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });
}
```

### React Socket Hook (src/hooks/useSocket.ts)

```typescript
'use client';

import { useEffect, useState, useCallback } from 'react';
import io, { Socket } from 'socket.io-client';

interface Credentials {
  username: string;
  password: string;
}

export function useSocket(credentials: Credentials | null) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  
  useEffect(() => {
    if (!credentials) return;
    
    // Connect to socket with authentication
    const newSocket = io({
      auth: credentials,
      reconnection: false
    });
    
    newSocket.on('connect', () => {
      console.log('Socket connection established');
      setIsConnected(true);
    });
    
    newSocket.on('connect_error', (error) => {
      console.error('Socket connection error:', error.message);
      setIsConnected(false);
    });
    
    newSocket.on('disconnect', () => {
      console.log('Socket disconnected');
      setIsConnected(false);
    });
    
    setSocket(newSocket);
    
    // Clean up on unmount
    return () => {
      newSocket.disconnect();
    };
  }, [credentials]);
  
  // Command execution function
  const executeCommand = useCallback((command: string) => {
    return new Promise((resolve, reject) => {
      if (!socket || !isConnected) {
        reject(new Error('Socket not connected'));
        return;
      }
      
      socket.emit('execute-command', { command }, (response: any) => {
        if (response.success) {
          resolve(response.result);
        } else {
          reject(new Error(response.error));
        }
      });
    });
  }, [socket, isConnected]);
  
  // File operation function
  const performFileOperation = useCallback((operation: string, filePath: string, content?: string) => {
    return new Promise((resolve, reject) => {
      if (!socket || !isConnected) {
        reject(new Error('Socket not connected'));
        return;
      }
      
      socket.emit('file-operation', { operation, path: filePath, content }, (response: any) => {
        if (response.success) {
          resolve(response.result);
        } else {
          reject(new Error(response.error));
        }
      });
    });
  }, [socket, isConnected]);
  
  return {
    socket,
    isConnected,
    executeCommand,
    performFileOperation
  };
}
```

### package.json

```json
{
  "name": "nanos-dashboard",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "ts-node --transpile-only src/server/index.ts",
    "build": "next build && tsc --project tsconfig.server.json",
    "start": "NODE_ENV=production node dist/server/index.js",
    "setup": "bash setup.sh"
  },
  "dependencies": {
    "next": "latest",
    "react": "latest",
    "react-dom": "latest",
    "express": "^4.18.2",
    "socket.io": "^4.7.2",
    "socket.io-client": "^4.7.2",
    "cors": "^2.8.5",
    "helmet": "^7.0.0",
    "dotenv": "^16.3.1"
  },
  "devDependencies": {
    "typescript": "^5.0.4",
    "ts-node": "^10.9.1",
    "@types/react": "^18.2.0",
    "@types/express": "^4.17.17",
    "@types/node": "^20.2.5"
  }
}
```

### tsconfig.server.json

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "module": "commonjs",
    "outDir": "dist",
    "target": "es2017",
    "isolatedModules": false,
    "noEmit": false
  },
  "include": ["src/server/**/*.ts"]
}
```

### Next.js Config (next.config.js)

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // This is necessary for working with some Node.js modules in Next.js
    config.externals.push({
      bufferutil: 'bufferutil',
      'utf-8-validate': 'utf-8-validate',
    });
    return config;
  }
};

module.exports = nextConfig;
```

### Environment Variables (.env.example)

```
PORT=3000
ADMIN_USERNAME=admin
ADMIN_PASSWORD=adminpassword
ALLOWED_ORIGINS=http://localhost:3000
```

## Deployment Process

1. **Development:**
   - Run `npm run dev` for development
   - This starts the custom server with Next.js in development mode

2. **Production Build:**
   - Run `npm run build` to create optimized build
   - This builds both Next.js assets and compiles the TypeScript server

3. **Production Start:**
   - Run `npm start` to start the production server
   - Or use a process manager like PM2: `pm2 start npm --name "nanos-dashboard" -- start`

## Complete Deployment & Setup Script

Below is the complete bash script that handles installation, configuration, and setup of the Nanos Dashboard on a droplet:

```bash
#!/bin/bash
# setup.sh - Installation and setup script for Nanos Dashboard

# Default configuration
DEFAULT_PORT=3000
DEFAULT_USERNAME="admin"
DEFAULT_PASSWORD=$(openssl rand -base64 12)
INSTALL_DIR=$(pwd)
LOG_FILE="install.log"

# Function for logging
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Welcome message
log "======================================"
log "Nanos Dashboard Installation Script"
log "======================================"
log ""

# Check if running as root or with sudo
if [ "$(id -u)" -ne 0 ]; then
  log "⚠️  Warning: This script is not running as root, some operations might fail."
  log "   Consider running with sudo if you encounter permission issues."
  sleep 2
fi

# Check for Node.js and npm
if ! command -v node > /dev/null || ! command -v npm > /dev/null; then
  log "📦 Node.js not found. Installing Node.js 18.x..."
  curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - >> "$LOG_FILE" 2>&1
  sudo apt-get install -y nodejs >> "$LOG_FILE" 2>&1
  
  # Verify installation
  if ! command -v node > /dev/null; then
    log "❌ Failed to install Node.js. Please install manually and try again."
    exit 1
  fi
  
  log "✅ Node.js installed: $(node -v)"
  log "✅ npm installed: $(npm -v)"
else
  log "✅ Node.js already installed: $(node -v)"
  log "✅ npm already installed: $(npm -v)"
fi

# Install production dependencies
log "📦 Installing dependencies..."
if [ "$NODE_ENV" = "production" ]; then
  npm ci --only=production >> "$LOG_FILE" 2>&1
else
  npm install >> "$LOG_FILE" 2>&1
fi

# Configuration
log "🔧 Setting up configuration..."
log "   (Press Enter to accept default values)"

read -p "Port number [$DEFAULT_PORT]: " port
port=${port:-$DEFAULT_PORT}

read -p "Admin username [$DEFAULT_USERNAME]: " username
username=${username:-$DEFAULT_USERNAME}

read -p "Admin password [$DEFAULT_PASSWORD]: " -s password
echo ""
password=${password:-$DEFAULT_PASSWORD}

read -p "Allowed origins (comma-separated) [http://localhost:$port]: " origins
origins=${origins:-"http://localhost:$port"}

# Create .env file
log "📝 Creating environment configuration..."
cat > .env << EOL
PORT=$port
ADMIN_USERNAME=$username
ADMIN_PASSWORD=$password
ALLOWED_ORIGINS=$origins
EOL

# Build the application
if [ "$NODE_ENV" != "production" ]; then
  log "🏗️  Building application..."
  npm run build >> "$LOG_FILE" 2>&1
  
  if [ $? -ne 0 ]; then
    log "❌ Build failed. Check $LOG_FILE for details."
    exit 1
  fi
fi

# Create systemd service for auto-start
log "🔄 Setting up systemd service..."
SERVICE_FILE="/etc/systemd/system/nanos-dashboard.service"

sudo bash -c "cat > $SERVICE_FILE" << EOL
[Unit]
Description=Nanos Dashboard
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$INSTALL_DIR
ExecStart=$(which node) dist/server/index.js
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOL

# Reload systemd, enable and start service
log "🚀 Starting service..."
sudo systemctl daemon-reload >> "$LOG_FILE" 2>&1
sudo systemctl enable nanos-dashboard.service >> "$LOG_FILE" 2>&1
sudo systemctl start nanos-dashboard.service >> "$LOG_FILE" 2>&1

# Check if service started successfully
sleep 2
if sudo systemctl is-active --quiet nanos-dashboard.service; then
  log "✅ Service started successfully!"
else
  log "⚠️  Service may have failed to start. Check status with: sudo systemctl status nanos-dashboard.service"
fi

# Clean up development files if in production
if [ "$NODE_ENV" = "production" ]; then
  log "🧹 Cleaning up development files..."
  rm -rf src/app/.next/cache
  rm -rf node_modules/.cache
fi

# Final instructions
log ""
log "======================================"
log "✅ Installation complete!"
log "🌐 Dashboard is running at: http://localhost:$port"
log "👤 Username: $username"
log "🔑 Password: $password"
log ""
log "📝 Important commands:"
log "   - Check service status: sudo systemctl status nanos-dashboard.service"
log "   - Restart service: sudo systemctl restart nanos-dashboard.service"
log "   - View logs: sudo journalctl -u nanos-dashboard.service"
log "======================================"

# Optional: Open firewall port
if command -v ufw > /dev/null; then
  read -p "Would you like to open the port $port in the firewall? (y/n) " open_port
  if [[ $open_port == "y" || $open_port == "Y" ]]; then
    sudo ufw allow $port/tcp >> "$LOG_FILE" 2>&1
    log "🔥 Firewall rule added for port $port"
  fi
fi

# Optional: Configure Nginx if installed
if command -v nginx > /dev/null; then
  read -p "Would you like to set up Nginx as a reverse proxy? (y/n) " setup_nginx
  if [[ $setup_nginx == "y" || $setup_nginx == "Y" ]]; then
    read -p "Enter domain name (e.g., dashboard.example.com): " domain_name
    
    if [ -z "$domain_name" ]; then
      log "⚠️  No domain provided, skipping Nginx setup"
    else
      sudo bash -c "cat > /etc/nginx/sites-available/$domain_name" << EOL
server {
    listen 80;
    server_name $domain_name;

    location / {
        proxy_pass http://localhost:$port;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOL
      
      sudo ln -s /etc/nginx/sites-available/$domain_name /etc/nginx/sites-enabled/ >> "$LOG_FILE" 2>&1
      sudo nginx -t >> "$LOG_FILE" 2>&1
      
      if [ $? -eq 0 ]; then
        sudo systemctl reload nginx >> "$LOG_FILE" 2>&1
        log "✅ Nginx configured successfully!"
        log "🌐 Dashboard is now available at: http://$domain_name"
        
        # Ask about SSL
        read -p "Would you like to secure with SSL using Let's Encrypt? (y/n) " setup_ssl
        if [[ $setup_ssl == "y" || $setup_ssl == "Y" ]]; then
          if ! command -v certbot > /dev/null; then
            log "📦 Installing Certbot..."
            sudo apt-get update >> "$LOG_FILE" 2>&1
            sudo apt-get install -y certbot python3-certbot-nginx >> "$LOG_FILE" 2>&1
          fi
          
          sudo certbot --nginx -d $domain_name --non-interactive --agree-tos --email admin@$domain_name >> "$LOG_FILE" 2>&1
          
          if [ $? -eq 0 ]; then
            log "🔒 SSL certificate installed successfully!"
            log "🌐 Dashboard is now available at: https://$domain_name"
          else
            log "⚠️  SSL setup failed. Check $LOG_FILE for details."
          fi
        fi
      else
        log "⚠️  Nginx configuration test failed. Check syntax and try again."
      fi
    fi
  fi
fi

exit 0
```

## Final Notes

This implementation provides:

1. **Single Codebase**: All code is in one project
2. **Lightweight**: Only necessary files are kept in production
3. **Easy Installation**: The setup script handles everything
4. **Modern UI**: Next.js provides an optimized frontend
5. **Full System Access**: The custom server has the same capabilities as your current implementation
6. **Scalability**: This architecture can easily grow as needed

After building, the production deployment is quite small and efficient, making it perfect for running on a droplet. The setup script provides options for configuring the service, opening firewall ports, and even setting up Nginx with SSL if desired. 