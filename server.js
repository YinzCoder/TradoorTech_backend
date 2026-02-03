require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { setupDatabase } = require('./src/database/setup');
const { startSniperEngine } = require('./src/services/sniperEngine');
const { startWebSocketServer } = require('./src/services/websocket');

// Import routes
const authRoutes = require('./src/routes/auth');
const walletRoutes = require('./src/routes/wallet');
const sniperRoutes = require('./src/routes/sniper');
const tradingRoutes = require('./src/routes/trading');
const analyticsRoutes = require('./src/routes/analytics');
const webhookRoutes = require('./src/routes/webhooks');
const dexscreenerRoutes = require('./src/routes/dexscreener');
const positionsRoutes = require('./src/routes/positions');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3001',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    uptime: process.uptime()
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/sniper', sniperRoutes);
app.use('/api/trading', tradingRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/dexscreener', dexscreenerRoutes);
app.use('/api/positions', positionsRoutes);
app.use('/webhooks', webhookRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Tradoor Tech API',
    version: '1.0.0',
    status: 'running',
    docs: '/api/docs',
    endpoints: {
      health: '/health',
      auth: '/api/auth',
      wallet: '/api/wallet',
      sniper: '/api/sniper',
      trading: '/api/trading',
      analytics: '/api/analytics',
      dexscreener: '/api/dexscreener',
      positions: '/api/positions'
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Not Found',
    message: 'The requested endpoint does not exist',
    path: req.path
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
});

// Initialize application
async function startServer() {
  try {
    console.log('🚀 Starting Solana Sniper Bot...');
    
    // Setup database
    console.log('📊 Setting up database...');
    await setupDatabase();
    
    // Start HTTP server
    const server = app.listen(PORT, () => {
      console.log(`✅ Server running on port ${PORT}`);
      console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🌐 API URL: http://localhost:${PORT}`);
    });

    // Start WebSocket server
    console.log('🔌 Starting WebSocket server...');
    startWebSocketServer(server);
    
    // Start sniper engine
    if (process.env.AUTO_SNIPE_ENABLED === 'true') {
      console.log('🎯 Starting sniper engine...');
      await startSniperEngine();
    }
    
    // Start position monitor (for automatic TP/SL)
    console.log('📊 Starting position monitor...');
    const { startPositionMonitor } = require('./src/services/positionManager');
    startPositionMonitor();
    
    console.log('✨ All systems operational!');
    console.log('💰 Transaction fee: ' + (process.env.TRANSACTION_FEE_PERCENTAGE || '1.0') + '%');
    console.log('💳 Fee wallet: GeKFPYBQ5yLRcnCEdaAs93Xwji63xCSbwwibMteKqUN8');
    console.log('');
    console.log('Ready to snipe! 🚀');

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  process.exit(0);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the server
startServer();

module.exports = app;
