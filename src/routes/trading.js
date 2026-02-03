const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { executeTrade } = require('../services/tradingService');
const { query } = require('../database/setup');

/**
 * Execute a buy trade
 * POST /api/trading/buy
 */
router.post('/buy', authenticate, async (req, res) => {
  try {
    const {
      walletId,
      tokenAddress,
      amountSol,
      slippageBps,
      transactionSpeed,
      useMevProtection
    } = req.body;
    
    const userId = req.user.id;
    
    if (!walletId || !tokenAddress || !amountSol) {
      return res.status(400).json({
        error: 'Missing required fields: walletId, tokenAddress, amountSol'
      });
    }
    
    const result = await executeTrade({
      userId,
      walletId,
      tokenAddress,
      tradeType: 'BUY',
      amountSol: parseFloat(amountSol),
      slippageBps: slippageBps || 500,
      transactionSpeed: transactionSpeed || 'standard',
      useMevProtection: useMevProtection || false
    });
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
    
  } catch (error) {
    console.error('Buy error:', error);
    res.status(500).json({ error: 'Failed to execute buy' });
  }
});

/**
 * Execute a sell trade
 * POST /api/trading/sell
 */
router.post('/sell', authenticate, async (req, res) => {
  try {
    const {
      walletId,
      tokenAddress,
      amountSol,
      slippageBps,
      transactionSpeed,
      useMevProtection
    } = req.body;
    
    const userId = req.user.id;
    
    if (!walletId || !tokenAddress || !amountSol) {
      return res.status(400).json({
        error: 'Missing required fields: walletId, tokenAddress, amountSol'
      });
    }
    
    const result = await executeTrade({
      userId,
      walletId,
      tokenAddress,
      tradeType: 'SELL',
      amountSol: parseFloat(amountSol),
      slippageBps: slippageBps || 1000, // Higher slippage for sells
      transactionSpeed: transactionSpeed || 'fast',
      useMevProtection: useMevProtection !== false // Default true for sells
    });
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
    
  } catch (error) {
    console.error('Sell error:', error);
    res.status(500).json({ error: 'Failed to execute sell' });
  }
});

/**
 * Get trade history
 * GET /api/trading/history
 */
router.get('/history', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 50, offset = 0 } = req.query;
    
    const result = await query(
      `SELECT t.*, w.public_key as wallet_address
       FROM trades t
       JOIN wallets w ON t.wallet_id = w.id
       WHERE t.user_id = $1
       ORDER BY t.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    
    res.json({
      success: true,
      trades: result.rows,
      count: result.rows.length
    });
    
  } catch (error) {
    console.error('History error:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

/**
 * Get portfolio (current holdings)
 * GET /api/trading/portfolio
 */
router.get('/portfolio', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const result = await query(
      `SELECT 
        token_address,
        SUM(CASE WHEN trade_type = 'BUY' THEN amount_tokens ELSE -amount_tokens END) as balance,
        AVG(CASE WHEN trade_type = 'BUY' THEN price_per_token_sol END) as avg_buy_price
       FROM trades
       WHERE user_id = $1 AND status = 'SUCCESS'
       GROUP BY token_address
       HAVING SUM(CASE WHEN trade_type = 'BUY' THEN amount_tokens ELSE -amount_tokens END) > 0`,
      [userId]
    );
    
    res.json({
      success: true,
      holdings: result.rows
    });
    
  } catch (error) {
    console.error('Portfolio error:', error);
    res.status(500).json({ error: 'Failed to fetch portfolio' });
  }
});

module.exports = router;
