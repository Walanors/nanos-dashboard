import express from 'express';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import * as path from 'node:path';
import * as fs from 'node:fs';
import next from 'next';
import { Server } from 'socket.io';
import { authenticateRequest as authenticate } from './middleware/auth';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import type { Server as HttpServer } from 'node:http';
import type { Server as HttpsServer } from 'node:https';
import * as os from 'node:os';

// Load environment variables
dotenv.config();

// Import routes and middleware
import commandRouter from './handlers/commands';
import fileRouter from './handlers/files';
import systemRouter from './handlers/system';
import userRouter from './handlers/users';
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

// Parse allowed origins from environment variable
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : ['http://localhost:3000'];

console.log('Allowed origins:', allowedOrigins);

// Prepare Next.js for handling requests
app.prepare().then(() => {
  const server = express();
  
  // Create HTTP or HTTPS server based on environment
  let httpServer: HttpServer | HttpsServer;
  
  // Enhanced SSL debugging
  console.log('SSL Configuration:');
  console.log('SSL_ENABLED:', process.env.SSL_ENABLED);
  console.log('SSL_CERT_PATH:', process.env.SSL_CERT_PATH);
  console.log('SSL_KEY_PATH:', process.env.SSL_KEY_PATH);
  
  // Check if SSL certificates exist
  const certExists = process.env.SSL_CERT_PATH ? fs.existsSync(process.env.SSL_CERT_PATH) : false;
  const keyExists = process.env.SSL_KEY_PATH ? fs.existsSync(process.env.SSL_KEY_PATH) : false;
  
  console.log('SSL_CERT_PATH exists:', certExists);
  console.log('SSL_KEY_PATH exists:', keyExists);
  
  const sslEnabled = process.env.SSL_ENABLED === 'true' && certExists && keyExists;
  console.log('Final sslEnabled value:', sslEnabled);
  
  if (sslEnabled) {
    try {
      // Create HTTPS server with SSL certificates
      const httpsOptions = {
        key: fs.readFileSync(process.env.SSL_KEY_PATH as string),
        cert: fs.readFileSync(process.env.SSL_CERT_PATH as string)
      };
      httpServer = createHttpsServer(httpsOptions, server);
      console.log('HTTPS server enabled successfully');
    } catch (error) {
      console.error('Error creating HTTPS server:', error);
      console.log('Falling back to HTTP server');
      httpServer = createHttpServer(server);
    }
  } else {
    // Create HTTP server
    httpServer = createHttpServer(server);
    console.log('HTTP server enabled (no SSL)');
    if (process.env.SSL_ENABLED === 'true') {
      console.log('SSL was enabled in config but certificates were not found or invalid');
    }
  }
  
  // Initialize Socket.io
  const io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
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
    origin: allowedOrigins,
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
        connectSrc: ["'self'", ...allowedOrigins, "ws:", "wss:"], // Add WebSocket and allowed origins
        fontSrc: ["'self'", "cdn.jsdelivr.net"],
        objectSrc: ["'none'"],
        frameSrc: ["'none'"],
        formAction: ["'self'", ...allowedOrigins] // Allow form submissions to allowed origins
      }
    },
    // Disable forcing HTTPS
    hsts: false
  }));
  
  server.use(express.json());
  
  // Simple ping endpoint for diagnostics
  server.get('/api/system/ping', authenticate, (req, res) => {
    console.log('Ping request received');
    res.json({
      status: 'ok',
      timestamp: Date.now(),
      server: {
        hostname: os.hostname(),
        platform: os.platform(),
        uptime: os.uptime()
      }
    });
  });
  
  // API Routes - these bypass Next.js for system operations
  server.use('/api/commands', authenticate, commandRouter);
  server.use('/api/files', authenticate, fileRouter);
  server.use('/api/system', authenticate, systemRouter);
  server.use('/api/users', authenticate, userRouter);
  
  // Handle Next.js requests
  server.all('*', (req: express.Request, res: express.Response) => {
    return handle(req, res);
  });
  
  // Start the server
  httpServer.listen(port, '0.0.0.0', () => {
    const protocol = sslEnabled ? 'https' : 'http';
    console.log(`> Ready on ${protocol}://0.0.0.0:${port}`);
    console.log(`> Admin username: ${process.env.ADMIN_USERNAME}`);
  });
}); 