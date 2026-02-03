require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const { setupDatabase, query } = require('./setup');
const { startPositionMonitor } = require('./positionManager');

const authRoutes = require('./auth');
const sniperRoutes = require('./sniper');
const tradingRoutes = require('./trading');
const analyticsRoutes = require('./analytics');
const webhookRoutes = require('./webhooks');
const dexscreenerRoutes = require('./dexscreener');
const positionsRoutes = require('./positions');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('combined'));

const limiter = require('express-rate-limit')({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use('/api/', limiter);

app.use('/api/auth', authRoutes);
app.use('/api/sniper', sniperRoutes);
app.use('/api/trading', tradingRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/dexscreener', dexscreenerRoutes);
app.use('/api/positions', positionsRoutes);
app.use('/webhooks', webhookRoutes);

app.get('/', (req, res) => {
  res.json({
    name: 'Tradoor Tech API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/health',
      auth: '/api/auth',
      sniper: '/api/sniper',
      trading: '/api/trading',
      analytics: '/api/analytics',
      dexscreener: '/api/dexscreener',
      positions: '/api/positions'
    }
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    uptime: process.uptime()
  });
});

app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: 'The requested endpoint does not exist',
    path: req.path
  });
});

app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

async function startServer() {
  try {
    console.log('📊 Connecting to database...');
    await setupDatabase();
    console.log('✅ Database connected successfully');

    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`✅ Server running on port ${PORT}`);
    });

    console.log('📊 Starting position monitor...');
    startPositionMonitor();
    
    console.log('✨ All systems operational!');
    console.log('💰 Transaction fee: ' + (process.env.TRANSACTION_FEE_PERCENTAGE || '1.0') + '%');
    console.log('💳 Fee wallet: GeKFPYBQ5yLRcnCEdaAs93Xwji63xCSbwwibMteKqUN8');
    console.log('Ready to snipe! 🚀');

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  process.exit(0);
});

startServer();
