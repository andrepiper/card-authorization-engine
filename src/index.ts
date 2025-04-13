import 'reflect-metadata';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import dotenv from 'dotenv';
import swaggerUi from 'swagger-ui-express';
import { AppDataSource } from './config/database';
import { swaggerSpec } from './config/swagger';
import authorizationRoutes from './api/routes/authorizationRoutes';
import ruleRoutes from './api/routes/ruleRoutes';
import logger from './utils/logger';
import { initializeDatabase } from './utils/initDb';
import fs from 'fs';
import https from 'https';
import path from 'path';

// Load environment variables
dotenv.config();

// Create Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Enforce TLS for production environments (PCI compliance requirement)
const enforceTLS = process.env.ENFORCE_TLS === 'true';
const enableCSP = process.env.ENABLE_CSP === 'true';

// PCI compliance: Enforce HTTPS in production
app.use((req, res, next) => {
  if (enforceTLS && !req.secure && req.get('x-forwarded-proto') !== 'https') {
    logger.warn(`Insecure request rejected: ${req.method} ${req.url}`);
    return res.status(403).json({ 
      error: 'TLS Required', 
      message: 'Secure connection required for payment operations' 
    });
  }
  next();
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: enableCSP ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    }
  } : false,
  xssFilter: true,
  noSniff: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  hsts: {
    maxAge: 15552000, // 180 days
    includeSubDomains: true,
    preload: true
  }
}));

// CORS configuration - restrict to known origins in production
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://admin.example.com', 'https://api.example.com'] 
    : '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400 // 24 hours
}));

app.use(express.json({ limit: '100kb' })); // Limit payload size to prevent DoS
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// Apply rate limiting - critical for preventing brute force attacks
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'), // Default: 1 minute
  max: parseInt(process.env.RATE_LIMIT_MAX || '100'), // Default: 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  // PCI compliance: Also rate limit by IP for auth endpoints
  keyGenerator: (req): string => {
    // If it's an authorization endpoint, use a more strict rate limit by IP
    if (req.path.includes('/authorize')) {
      return req.ip || 'ip-unknown';
    }
    // Otherwise use the default (IP-based if no token)
    const authHeader = req.get('authorization');
    return authHeader || req.ip || 'default-key';
  }
});

app.use(limiter);

// Add request logger middleware
app.use((req, res, next) => {
  // PCI compliance: Don't log sensitive data
  const sanitizedUrl = req.url.replace(/card=.+?(&|$)/g, 'card=[REDACTED]$1')
                            .replace(/cvv=.+?(&|$)/g, 'cvv=[REDACTED]$1')
                            .replace(/pan=.+?(&|$)/g, 'pan=[REDACTED]$1');
  
  logger.debug(`${req.method} ${sanitizedUrl}`, {
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  next();
});

// API Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  explorer: true,
  customCss: '.swagger-ui .topbar { display: none }',
  swaggerOptions: {
    docExpansion: 'list',
    filter: true,
    showRequestDuration: true,
  },
}));

// Serve Swagger JSON
app.get('/swagger.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// Routes
app.use('/api/v1/authorization', authorizationRoutes);
app.use('/api/v1/rules', ruleRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  // PCI Compliance: Don't expose internal error details in production
  const isProduction = process.env.NODE_ENV === 'production';
  
  // Log the full error internally
  logger.error(`Unhandled error: ${err.message}`, { stack: err.stack });
  
  // Return a sanitized error response
  res.status(500).json({
    status: 'error',
    message: isProduction ? 'An unexpected error occurred' : err.message,
    timestamp: new Date().toISOString(),
    ...(isProduction ? {} : { stack: err.stack })
  });
});

// Initialize database connection and start server
const startServer = async () => {
  try {
    // Initialize database with schema if needed
    await initializeDatabase();
    
    // Check if we should use HTTPS for PCI compliance in production
    if (process.env.NODE_ENV === 'production' && enforceTLS) {
      try {
        // Load SSL certificate and key
        const sslKeyPath = process.env.SSL_KEY_PATH;
        const sslCertPath = process.env.SSL_CERT_PATH;
        
        if (!sslKeyPath || !sslCertPath) {
          throw new Error('SSL_KEY_PATH and SSL_CERT_PATH must be provided in production');
        }
        
        const options = {
          key: fs.readFileSync(sslKeyPath),
          cert: fs.readFileSync(sslCertPath)
        };
        
        // Create HTTPS server
        https.createServer(options, app).listen(PORT, () => {
          logger.info(`Secure server running on port ${PORT}`);
          logger.info(`Environment: ${process.env.NODE_ENV}`);
          logger.info(`API Documentation available at https://localhost:${PORT}/api-docs`);
        });
      } catch (sslError) {
        logger.error(`Failed to start secure server: ${sslError instanceof Error ? sslError.message : String(sslError)}`);
        process.exit(1);
      }
    } else {
      // Start regular HTTP server (for development only)
      app.listen(PORT, () => {
        logger.info(`Server running on port ${PORT}`);
        logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
        logger.info(`API Documentation available at http://localhost:${PORT}/api-docs`);
      });
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to start server: ${errorMessage}`, { 
      stack: error instanceof Error ? error.stack : undefined 
    });
    process.exit(1);
  }
};

// Start the application
startServer();