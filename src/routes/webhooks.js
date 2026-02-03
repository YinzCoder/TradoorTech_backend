const express = require('express');
const router = express.Router();

/**
 * Webhook endpoint for Privy authentication events
 * POST /webhooks/privy
 */
router.post('/privy', async (req, res) => {
  try {
    const event = req.body;
    
    console.log('Privy webhook received:', event.type);
    
    // Handle different Privy events
    switch (event.type) {
      case 'user.created':
        console.log('New user created:', event.data.user.id);
        break;
        
      case 'user.authenticated':
        console.log('User authenticated:', event.data.user.id);
        break;
        
      default:
        console.log('Unknown event type:', event.type);
    }
    
    res.json({ received: true });
    
  } catch (error) {
    console.error('Privy webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

/**
 * Webhook endpoint for Helius transaction notifications
 * POST /webhooks/helius
 */
router.post('/helius', async (req, res) => {
  try {
    const transactions = req.body;
    
    console.log('Helius webhook received:', transactions.length, 'transactions');
    
    // Process transaction notifications
    // Can be used to track on-chain events, confirmations, etc.
    
    res.json({ received: true });
    
  } catch (error) {
    console.error('Helius webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

/**
 * Test webhook endpoint
 * GET /webhooks/test
 */
router.get('/test', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Webhooks endpoint is active',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
