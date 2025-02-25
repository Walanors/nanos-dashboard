import express from 'express';
import { createServer } from 'node:http';
import * as path from 'node:path';
import next from 'next';
import { Server } from 'socket.io';
import { authenticateRequest as authenticate } from './middleware/auth';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Import routes and middleware
import commandRouter from './handlers/commands';
import fileRouter from './handlers/files';
import systemRouter from './handlers/system';
import { configureSocketHandlers } from './socket/handlers';

// Define interface for custom type
interface CustomRequest extends express.Request {
  user?: {
    username: string;
  };
}

// Setup Next.js
const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'localhost';
const port = Number.parseInt(process.env.PORT || '3000', 10);
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Prepare Next.js for handling requests
app.prepare().then(() => {
  const server = express();
  const httpServer = createServer(server);
  
  // Initialize Socket.io
  const io = new Server(httpServer, {
    cors: {
      origin: dev ? ["http://localhost:3000"] : ["https://yourdomain.com"],
      methods: ["GET", "POST"],
      credentials: true
    }
  });
  
  // Configure Socket.io authentication middleware
  io.use((socket, next) => {
    const { username, password } = socket.handshake.auth;
    
    if (!username || !password) {
      return next(new Error('Authentication failed'));
    }
    
    if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
      socket.data.user = { username };
      return next();
    }
    
    return next(new Error('Invalid credentials'));
  });
  
  // Set up Socket.io event handlers
  configureSocketHandlers(io);
  
  // Middleware
  server.use(cors({
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
    credentials: true
  }));
  
  // Configure Helmet CSP based on environment
  const scriptSrcDirectives = ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net"];
  // Add unsafe-eval in development mode for Next.js hot reloading
  if (dev) {
    scriptSrcDirectives.push("'unsafe-eval'");
  }
  
  server.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: scriptSrcDirectives,
        styleSrc: ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'", "ws:", "wss:"], // Add WebSocket support
        fontSrc: ["'self'", "cdn.jsdelivr.net"],
        objectSrc: ["'none'"],
        frameSrc: ["'none'"]
      }
    }
  }));
  
  server.use(express.json());
  
  // API Routes - these bypass Next.js for system operations
  server.use('/api/commands', authenticate, commandRouter);
  server.use('/api/files', authenticate, fileRouter);
  server.use('/api/system', authenticate, systemRouter);
  
  // Handle Next.js requests
  server.all('*', (req: express.Request, res: express.Response) => {
    return handle(req, res);
  });
  
  // Start the server
  httpServer.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
}); 