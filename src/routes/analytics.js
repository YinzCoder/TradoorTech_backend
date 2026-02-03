const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { query } = require('../database/setup');

/**
 * Get dashboard analytics
 * GET /api/analytics/dashboard
 */
router.get('/dashboard', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get user stats
    const userStats = await query(
      `SELECT 
        total_trades,
        total_volume_sol,
        created_at
       FROM users
       WHERE id = $1`,
      [userId]
    );
    
    // Get open positions count
    const openPositions = await query(
      `SELECT COUNT(*) as count FROM positions WHERE user_id = $1 AND status = 'OPEN'`,
      [userId]
    );
    
    // Get recent trades
    const recentTrades = await query(
      `SELECT COUNT(*) as count,
              SUM(amount_sol) as volume
       FROM trades
       WHERE user_id = $1 AND created_at > NOW() - INTERVAL '24 hours'`,
      [userId]
    );
    
    // Get P&L from closed positions
    const pnl = await query(
      `SELECT 
        SUM(pnl_sol) as total_pnl,
        AVG(pnl_percent) as avg_pnl_percent
       FROM positions
       WHERE user_id = $1 AND status = 'CLOSED'`,
      [userId]
    );
    
    res.json({
      success: true,
      stats: {
        totalTrades: userStats.rows[0]?.total_trades || 0,
        totalVolume: userStats.rows[0]?.total_volume_sol || 0,
        openPositions: parseInt(openPositions.rows[0]?.count || 0),
        trades24h: parseInt(recentTrades.rows[0]?.count || 0),
        volume24h: recentTrades.rows[0]?.volume || 0,
        totalPnl: pnl.rows[0]?.total_pnl || 0,
        avgPnlPercent: pnl.rows[0]?.avg_pnl_percent || 0,
        memberSince: userStats.rows[0]?.created_at
      }
    });
    
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard' });
  }
});

/**
 * Get token analytics
 * GET /api/analytics/tokens
 */
router.get('/tokens', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const result = await query(
      `SELECT 
        token_address,
        COUNT(*) as trade_count,
        SUM(amount_sol) as total_volume,
        MAX(created_at) as last_trade
       FROM trades
       WHERE user_id = $1
       GROUP BY token_address
       ORDER BY total_volume DESC
       LIMIT 20`,
      [userId]
    );
    
    res.json({
      success: true,
      tokens: result.rows
    });
    
  } catch (error) {
    console.error('Tokens error:', error);
    res.status(500).json({ error: 'Failed to fetch tokens' });
  }
});

/**
 * Get performance metrics
 * GET /api/analytics/performance
 */
router.get('/performance', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { period = '7d' } = req.query;
    
    let interval = '7 days';
    if (period === '24h') interval = '24 hours';
    if (period === '30d') interval = '30 days';
    
    const result = await query(
      `SELECT 
        DATE(created_at) as date,
        COUNT(*) as trades,
        SUM(amount_sol) as volume,
        SUM(platform_fee_sol) as fees
       FROM trades
       WHERE user_id = $1 
         AND created_at > NOW() - INTERVAL '${interval}'
         AND status = 'SUCCESS'
       GROUP BY DATE(created_at)
       ORDER BY date DESC`,
      [userId]
    );
    
    res.json({
      success: true,
      performance: result.rows,
      period
    });
    
  } catch (error) {
    console.error('Performance error:', error);
    res.status(500).json({ error: 'Failed to fetch performance' });
  }
});

/**
 * Get revenue analytics (admin only - check fee collection)
 * GET /api/analytics/revenue
 */
router.get('/revenue', authenticate, async (req, res) => {
  try {
    // In production, add admin check here
    
    const result = await query(
      `SELECT 
        COUNT(*) as total_trades,
        SUM(platform_fee_sol) as total_fees_collected,
        SUM(amount_sol) as total_volume,
        AVG(platform_fee_sol) as avg_fee_per_trade
       FROM trades
       WHERE status = 'SUCCESS' AND platform_fee_sol > 0`
    );
    
    const recentFees = await query(
      `SELECT 
        DATE(created_at) as date,
        SUM(platform_fee_sol) as daily_fees
       FROM trades
       WHERE status = 'SUCCESS' 
         AND platform_fee_sol > 0
         AND created_at > NOW() - INTERVAL '30 days'
       GROUP BY DATE(created_at)
       ORDER BY date DESC`
    );
    
    res.json({
      success: true,
      revenue: {
        ...result.rows[0],
        feeWallet: process.env.FEE_COLLECTION_WALLET || 'GeKFPYBQ5yLRcnCEdaAs93Xwji63xCSbwwibMteKqUN8',
        feePercentage: parseFloat(process.env.TRANSACTION_FEE_PERCENTAGE || '1.0')
      },
      daily: recentFees.rows
    });
    
  } catch (error) {
    console.error('Revenue error:', error);
    res.status(500).json({ error: 'Failed to fetch revenue' });
  }
});

module.exports = router;
