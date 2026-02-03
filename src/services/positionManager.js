const { query } = require('../database/setup');
const { getTokenPrice } = require('./dexscreener');
const { executeTrade } = require('./tradingService');
const { getBondingCurveProgress } = require('./pumpfun');

/**
 * Position Management Service
 * Handles take profit, stop loss, and position tracking
 */

/**
 * Create or update position for a user
 */
async function createPosition(params) {
  const {
    userId,
    walletId,
    tokenAddress,
    entryPrice,
    amount,
    amountSol,
    takeProfitPercent = null,
    stopLossPercent = null,
    tradeId
  } = params;
  
  try {
    const result = await query(
      `INSERT INTO positions (
        user_id, wallet_id, token_address, entry_price,
        amount, amount_sol, take_profit_percent, stop_loss_percent,
        status, entry_trade_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'OPEN', $9)
      RETURNING *`,
      [
        userId, walletId, tokenAddress, entryPrice,
        amount, amountSol, takeProfitPercent, stopLossPercent,
        tradeId
      ]
    );
    
    console.log(`📊 Position created: ${tokenAddress} at $${entryPrice}`);
    
    return {
      success: true,
      position: result.rows[0]
    };
    
  } catch (error) {
    console.error('Error creating position:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get user's open positions
 */
async function getOpenPositions(userId) {
  try {
    const result = await query(
      `SELECT p.*, 
        w.public_key as wallet_address,
        (SELECT COUNT(*) FROM trades t WHERE t.user_id = p.user_id AND t.token_address = p.token_address) as trade_count
      FROM positions p
      JOIN wallets w ON p.wallet_id = w.id
      WHERE p.user_id = $1 AND p.status = 'OPEN'
      ORDER BY p.created_at DESC`,
      [userId]
    );
    
    return {
      success: true,
      positions: result.rows
    };
    
  } catch (error) {
    console.error('Error fetching positions:', error);
    return {
      success: false,
      error: error.message,
      positions: []
    };
  }
}

/**
 * Get position by ID
 */
async function getPosition(positionId, userId) {
  try {
    const result = await query(
      `SELECT p.*, w.public_key as wallet_address
      FROM positions p
      JOIN wallets w ON p.wallet_id = w.id
      WHERE p.id = $1 AND p.user_id = $2`,
      [positionId, userId]
    );
    
    if (result.rows.length === 0) {
      return { success: false, error: 'Position not found' };
    }
    
    return {
      success: true,
      position: result.rows[0]
    };
    
  } catch (error) {
    console.error('Error fetching position:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Update position's take profit and stop loss
 */
async function updatePositionLevels(positionId, userId, takeProfitPercent, stopLossPercent) {
  try {
    const result = await query(
      `UPDATE positions 
      SET take_profit_percent = $3,
          stop_loss_percent = $4,
          updated_at = NOW()
      WHERE id = $1 AND user_id = $2 AND status = 'OPEN'
      RETURNING *`,
      [positionId, userId, takeProfitPercent, stopLossPercent]
    );
    
    if (result.rows.length === 0) {
      return { success: false, error: 'Position not found or already closed' };
    }
    
    console.log(`🎯 Updated position levels: TP ${takeProfitPercent}% SL ${stopLossPercent}%`);
    
    return {
      success: true,
      position: result.rows[0]
    };
    
  } catch (error) {
    console.error('Error updating position:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Close position (sell all tokens)
 */
async function closePosition(positionId, userId, reason = 'MANUAL') {
  try {
    // Get position details
    const posResult = await getPosition(positionId, userId);
    if (!posResult.success) {
      return posResult;
    }
    
    const position = posResult.position;
    
    // Get current price
    const priceData = await getTokenPrice('solana', position.token_address);
    const currentPrice = parseFloat(priceData.token?.priceUsd || position.entry_price);
    
    // Execute sell trade
    const tradeResult = await executeTrade({
      userId: position.user_id,
      walletId: position.wallet_id,
      tokenAddress: position.token_address,
      tradeType: 'SELL',
      amountSol: position.amount_sol, // Sell equivalent SOL amount
      slippageBps: 1000, // 10% slippage for emergency exits
      useMevProtection: true // Always use MEV protection on exits
    });
    
    if (!tradeResult.success) {
      return {
        success: false,
        error: `Failed to execute sell: ${tradeResult.error}`
      };
    }
    
    // Calculate P&L
    const pnlPercent = ((currentPrice - position.entry_price) / position.entry_price) * 100;
    const pnlSol = (position.amount_sol * pnlPercent) / 100;
    
    // Update position status
    await query(
      `UPDATE positions 
      SET status = 'CLOSED',
          exit_price = $2,
          exit_date = NOW(),
          pnl_percent = $3,
          pnl_sol = $4,
          close_reason = $5,
          exit_trade_id = $6,
          updated_at = NOW()
      WHERE id = $1`,
      [positionId, currentPrice, pnlPercent, pnlSol, reason, tradeResult.tradeId]
    );
    
    console.log(`✅ Position closed: ${position.token_address}`);
    console.log(`   Entry: $${position.entry_price} → Exit: $${currentPrice}`);
    console.log(`   P&L: ${pnlPercent > 0 ? '+' : ''}${pnlPercent.toFixed(2)}% (${pnlSol.toFixed(4)} SOL)`);
    
    return {
      success: true,
      position: {
        ...position,
        exitPrice: currentPrice,
        pnlPercent,
        pnlSol,
        closeReason: reason
      },
      trade: tradeResult
    };
    
  } catch (error) {
    console.error('Error closing position:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Check all open positions for take profit / stop loss triggers
 */
async function checkPositionTriggers(userId = null) {
  try {
    // Get all open positions (or just for one user)
    const query_text = userId 
      ? `SELECT * FROM positions WHERE user_id = $1 AND status = 'OPEN' AND (take_profit_percent IS NOT NULL OR stop_loss_percent IS NOT NULL)`
      : `SELECT * FROM positions WHERE status = 'OPEN' AND (take_profit_percent IS NOT NULL OR stop_loss_percent IS NOT NULL)`;
    
    const params = userId ? [userId] : [];
    const result = await query(query_text, params);
    
    const triggered = [];
    
    for (const position of result.rows) {
      // Get current price
      const priceData = await getTokenPrice('solana', position.token_address);
      if (!priceData.success) continue;
      
      const currentPrice = parseFloat(priceData.token.priceUsd);
      const entryPrice = parseFloat(position.entry_price);
      
      // Calculate current P&L
      const pnlPercent = ((currentPrice - entryPrice) / entryPrice) * 100;
      
      // Check take profit
      if (position.take_profit_percent && pnlPercent >= position.take_profit_percent) {
        console.log(`🎯 TAKE PROFIT triggered for ${position.token_address}: ${pnlPercent.toFixed(2)}%`);
        
        const closeResult = await closePosition(position.id, position.user_id, 'TAKE_PROFIT');
        if (closeResult.success) {
          triggered.push({
            positionId: position.id,
            type: 'TAKE_PROFIT',
            pnl: pnlPercent
          });
        }
      }
      
      // Check stop loss
      else if (position.stop_loss_percent && pnlPercent <= -Math.abs(position.stop_loss_percent)) {
        console.log(`🛑 STOP LOSS triggered for ${position.token_address}: ${pnlPercent.toFixed(2)}%`);
        
        const closeResult = await closePosition(position.id, position.user_id, 'STOP_LOSS');
        if (closeResult.success) {
          triggered.push({
            positionId: position.id,
            type: 'STOP_LOSS',
            pnl: pnlPercent
          });
        }
      }
    }
    
    return {
      success: true,
      triggered,
      checked: result.rows.length
    };
    
  } catch (error) {
    console.error('Error checking position triggers:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get position with live price and P&L
 */
async function getPositionWithLiveData(positionId, userId) {
  try {
    const posResult = await getPosition(positionId, userId);
    if (!posResult.success) return posResult;
    
    const position = posResult.position;
    
    // Get current price
    const priceData = await getTokenPrice('solana', position.token_address);
    const currentPrice = parseFloat(priceData.token?.priceUsd || position.entry_price);
    
    // Calculate live P&L
    const entryPrice = parseFloat(position.entry_price);
    const pnlPercent = ((currentPrice - entryPrice) / entryPrice) * 100;
    const pnlSol = (position.amount_sol * pnlPercent) / 100;
    
    // Get bonding curve if Pump.fun token
    const bondingData = await getBondingCurveProgress(position.token_address);
    
    return {
      success: true,
      position: {
        ...position,
        currentPrice,
        pnlPercent,
        pnlSol,
        pnlUsd: pnlSol * (priceData.token?.priceNative ? parseFloat(priceData.token.priceNative) : 200),
        priceChange24h: priceData.token?.priceChange?.h24 || 0,
        bonding: bondingData.success ? bondingData.bondingProgress : null
      }
    };
    
  } catch (error) {
    console.error('Error getting live position data:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Start monitoring positions for auto-close
 * Run this in the background
 */
function startPositionMonitor() {
  console.log('📊 Position monitor started');
  
  // Check positions every 30 seconds
  setInterval(async () => {
    try {
      await checkPositionTriggers();
    } catch (error) {
      console.error('Position monitor error:', error);
    }
  }, 30000);
}

module.exports = {
  createPosition,
  getOpenPositions,
  getPosition,
  updatePositionLevels,
  closePosition,
  checkPositionTriggers,
  getPositionWithLiveData,
  startPositionMonitor
};
