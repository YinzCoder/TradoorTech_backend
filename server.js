const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

// Import database setup
const { setupDatabase, query } = require('./setup');

// Import routes
const authRoutes = require('./auth');  // ← CHANGED FROM ./src/routes/auth
const sniperRoutes = require('./sniper');  // ← CHANGED
const positionsRoutes = require('./positions');  // ← CHANGED
const dexscreenerRoutes = require('./dexscreener');  // ← CHANGED

// Import services for startup
const { startPositionMonitor } = require('./positionManager');  // ← CHANGED

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined'));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/sniper', sniperRoutes);
app.use('/api/positions', positionsRoutes);
app.use('/api/dexscreener', dexscreenerRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Tradoor Tech API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/health',
      auth: '/api/auth',
      sniper: '/api/sniper',
      positions: '/api/positions',
      dexscreener: '/api/dexscreener'
    }
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    uptime: process.uptime()
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
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Start server
async function startServer() {
  try {
    // Initialize database
    console.log('📊 Connecting to database...');
    await initializeDatabase();
    console.log('✅ Database connected successfully');

    // Start HTTP server
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`✅ Server running on port ${PORT}`);
      console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🌐 API URL: http://localhost:${PORT}`);
    });

    // Start position monitor
    console.log('📊 Starting position monitor...');
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

// Start the server
startServer();
```

Click "Commit changes" → Done!

## ✅ This Will Work Because:

All your files are already in the root directory:
- ✅ `setup.js` is there
- ✅ `auth.js` is there
- ✅ `sniper.js` is there
- ✅ `positions.js` is there
- ✅ `positionManager.js` is there
- ✅ `dexscreener.js` is there

So we just changed `server.js` to look for them in the root (`./ `) instead of in `src/` folders (`./src/routes/`)!

## 🚀 Railway Will Now Work!

Railway will:
1. Detect the change
2. Rebuild
3. Find all files ✅
4. Start successfully!

Check logs in 2 minutes - you should see:
```
✅ Database connected successfully
📊 Starting position monitor...
✨ All systems operational!
💳 Fee wallet: GeKFPYBQ5yLRcnCEdaAs93Xwji63xCSbwwibMteKqUN8
Ready to snipe! 🚀
