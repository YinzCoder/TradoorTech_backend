const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const {
  getOpenPositions,
  getPosition,
  updatePositionLevels,
  closePosition,
  getPositionWithLiveData
} = require('../services/positionManager');
const { getPumpfunTokenInfo } = require('../services/pumpfun');

/**
 * Get all open positions for user
 * GET /api/positions
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const result = await getOpenPositions(userId);
    
    if (result.success) {
      // Add live data for each position
      const positionsWithLiveData = await Promise.all(
        result.positions.map(async (pos) => {
          const liveData = await getPositionWithLiveData(pos.id, userId);
          return liveData.success ? liveData.position : pos;
        })
      );
      
      res.json({
        success: true,
        positions: positionsWithLiveData,
        count: positionsWithLiveData.length
      });
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    console.error('Error fetching positions:', error);
    res.status(500).json({ error: 'Failed to fetch positions' });
  }
});

/**
 * Get specific position with live data
 * GET /api/positions/:id
 */
router.get('/:id', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const positionId = req.params.id;
    
    const result = await getPositionWithLiveData(positionId, userId);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    console.error('Error fetching position:', error);
    res.status(500).json({ error: 'Failed to fetch position' });
  }
});

/**
 * Update position's take profit and stop loss
 * PUT /api/positions/:id/levels
 * Body: { takeProfitPercent: 100, stopLossPercent: 30 }
 */
router.put('/:id/levels', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const positionId = req.params.id;
    const { takeProfitPercent, stopLossPercent } = req.body;
    
    // Validate inputs
    if (takeProfitPercent !== null && takeProfitPercent !== undefined) {
      if (takeProfitPercent < 0 || takeProfitPercent > 10000) {
        return res.status(400).json({ 
          error: 'Take profit must be between 0 and 10000%' 
        });
      }
    }
    
    if (stopLossPercent !== null && stopLossPercent !== undefined) {
      if (stopLossPercent < 0 || stopLossPercent > 100) {
        return res.status(400).json({ 
          error: 'Stop loss must be between 0 and 100%' 
        });
      }
    }
    
    const result = await updatePositionLevels(
      positionId,
      userId,
      takeProfitPercent,
      stopLossPercent
    );
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    console.error('Error updating position:', error);
    res.status(500).json({ error: 'Failed to update position' });
  }
});

/**
 * Close position (sell all tokens)
 * POST /api/positions/:id/close
 */
router.post('/:id/close', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const positionId = req.params.id;
    
    console.log(`🔴 User ${userId} closing position ${positionId}`);
    
    const result = await closePosition(positionId, userId, 'MANUAL');
    
    if (result.success) {
      res.json({
        success: true,
        message: 'Position closed successfully',
        position: result.position,
        trade: result.trade
      });
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    console.error('Error closing position:', error);
    res.status(500).json({ error: 'Failed to close position' });
  }
});

/**
 * Get token bonding curve info (for Pump.fun tokens)
 * GET /api/positions/bonding/:tokenAddress
 */
router.get('/bonding/:tokenAddress', authenticate, async (req, res) => {
  try {
    const { tokenAddress } = req.params;
    
    const result = await getPumpfunTokenInfo(tokenAddress);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    console.error('Error fetching bonding info:', error);
    res.status(500).json({ error: 'Failed to fetch bonding curve data' });
  }
});

/**
 * Get position history (closed positions)
 * GET /api/positions/history
 */
router.get('/history/all', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 50, offset = 0 } = req.query;
    
    const { query } = require('../database/setup');
    const result = await query(
      `SELECT p.*, 
        w.public_key as wallet_address,
        (CASE 
          WHEN p.pnl_percent > 0 THEN 'PROFIT'
          WHEN p.pnl_percent < 0 THEN 'LOSS'
          ELSE 'BREAKEVEN'
        END) as outcome
      FROM positions p
      JOIN wallets w ON p.wallet_id = w.id
      WHERE p.user_id = $1 AND p.status = 'CLOSED'
      ORDER BY p.exit_date DESC
      LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    
    res.json({
      success: true,
      positions: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('Error fetching position history:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

/**
 * Get position statistics
 * GET /api/positions/stats
 */
router.get('/stats/summary', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const { query } = require('../database/setup');
    const result = await query(
      `SELECT 
        COUNT(*) FILTER (WHERE status = 'OPEN') as open_positions,
        COUNT(*) FILTER (WHERE status = 'CLOSED') as closed_positions,
        COUNT(*) FILTER (WHERE status = 'CLOSED' AND pnl_percent > 0) as winning_trades,
        COUNT(*) FILTER (WHERE status = 'CLOSED' AND pnl_percent < 0) as losing_trades,
        AVG(pnl_percent) FILTER (WHERE status = 'CLOSED') as avg_pnl_percent,
        SUM(pnl_sol) FILTER (WHERE status = 'CLOSED') as total_pnl_sol,
        MAX(pnl_percent) FILTER (WHERE status = 'CLOSED') as best_trade_percent,
        MIN(pnl_percent) FILTER (WHERE status = 'CLOSED') as worst_trade_percent
      FROM positions
      WHERE user_id = $1`,
      [userId]
    );
    
    const stats = result.rows[0];
    const winRate = stats.closed_positions > 0 
      ? (stats.winning_trades / stats.closed_positions * 100).toFixed(2)
      : 0;
    
    res.json({
      success: true,
      stats: {
        ...stats,
        win_rate: parseFloat(winRate)
      }
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

module.exports = router;
