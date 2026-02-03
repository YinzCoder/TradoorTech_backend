const express = require('express');
const router = express.Router();
const { query } = require('../database/setup');
const { authenticate } = require('../middleware/auth');
const { getRecentPriorityFees, getSpeedPreset, estimateTransactionCost } = require('../utils/solana');

/**
 * Get or create sniper configuration
 */
router.get('/config', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const result = await query(
      `SELECT * FROM sniper_configs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    
    if (result.rows.length > 0) {
      res.json(result.rows[0]);
    } else {
      res.json(null);
    }
  } catch (error) {
    console.error('Error fetching sniper config:', error);
    res.status(500).json({ error: 'Failed to fetch configuration' });
  }
});

/**
 * Create or update sniper configuration
 */
router.post('/config', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      walletId,
      autoSnipeEnabled,
      minLiquiditySol,
      maxBuyAmountSol,
      slippageBps,
      takeProfitPercentage,
      stopLossPercentage,
      rugCheckEnabled,
      mevProtection,
      transactionSpeed,
      jitoTipLamports,
      priorityFeeLamports,
      computeUnitPriceMicroLamports,
      computeUnitLimit,
      usePrivateRpc
    } = req.body;
    
    // Check if config exists
    const existing = await query(
      `SELECT id FROM sniper_configs WHERE user_id = $1`,
      [userId]
    );
    
    if (existing.rows.length > 0) {
      // Update existing
      const result = await query(
        `UPDATE sniper_configs SET
          wallet_id = COALESCE($2, wallet_id),
          auto_snipe_enabled = COALESCE($3, auto_snipe_enabled),
          min_liquidity_sol = COALESCE($4, min_liquidity_sol),
          max_buy_amount_sol = COALESCE($5, max_buy_amount_sol),
          slippage_bps = COALESCE($6, slippage_bps),
          take_profit_percentage = COALESCE($7, take_profit_percentage),
          stop_loss_percentage = COALESCE($8, stop_loss_percentage),
          rug_check_enabled = COALESCE($9, rug_check_enabled),
          mev_protection = COALESCE($10, mev_protection),
          transaction_speed = COALESCE($11, transaction_speed),
          jito_tip_lamports = COALESCE($12, jito_tip_lamports),
          priority_fee_lamports = COALESCE($13, priority_fee_lamports),
          compute_unit_price_micro_lamports = COALESCE($14, compute_unit_price_micro_lamports),
          compute_unit_limit = COALESCE($15, compute_unit_limit),
          use_private_rpc = COALESCE($16, use_private_rpc),
          updated_at = NOW()
         WHERE user_id = $1
         RETURNING *`,
        [
          userId, walletId, autoSnipeEnabled, minLiquiditySol, maxBuyAmountSol,
          slippageBps, takeProfitPercentage, stopLossPercentage, rugCheckEnabled,
          mevProtection, transactionSpeed, jitoTipLamports, priorityFeeLamports,
          computeUnitPriceMicroLamports, computeUnitLimit, usePrivateRpc
        ]
      );
      
      res.json(result.rows[0]);
    } else {
      // Create new
      const result = await query(
        `INSERT INTO sniper_configs (
          user_id, wallet_id, auto_snipe_enabled, min_liquidity_sol,
          max_buy_amount_sol, slippage_bps, take_profit_percentage,
          stop_loss_percentage, rug_check_enabled, mev_protection,
          transaction_speed, jito_tip_lamports, priority_fee_lamports,
          compute_unit_price_micro_lamports, compute_unit_limit, use_private_rpc
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        RETURNING *`,
        [
          userId, walletId, autoSnipeEnabled || false, minLiquiditySol || 5,
          maxBuyAmountSol || 0.5, slippageBps || 500, takeProfitPercentage || 200,
          stopLossPercentage || 30, rugCheckEnabled !== false, mevProtection || false,
          transactionSpeed || 'standard', jitoTipLamports || 10000,
          priorityFeeLamports || 1000, computeUnitPriceMicroLamports || 1000,
          computeUnitLimit || 200000, usePrivateRpc || false
        ]
      );
      
      res.json(result.rows[0]);
    }
  } catch (error) {
    console.error('Error saving sniper config:', error);
    res.status(500).json({ error: 'Failed to save configuration' });
  }
});

/**
 * Get current network priority fees
 */
router.get('/priority-fees', authenticate, async (req, res) => {
  try {
    const fees = await getRecentPriorityFees();
    res.json({
      fees,
      timestamp: new Date().toISOString(),
      description: {
        min: 'Minimum recent priority fee',
        median: 'Median priority fee (50th percentile)',
        p75: '75th percentile (fast)',
        p95: '95th percentile (ultra fast)',
        max: 'Maximum recent priority fee'
      }
    });
  } catch (error) {
    console.error('Error fetching priority fees:', error);
    res.status(500).json({ error: 'Failed to fetch priority fees' });
  }
});

/**
 * Get speed presets with current network conditions
 */
router.get('/speed-presets', authenticate, async (req, res) => {
  try {
    const [standard, fast, ultra] = await Promise.all([
      getSpeedPreset('standard'),
      getSpeedPreset('fast'),
      getSpeedPreset('ultra')
    ]);
    
    res.json({
      standard: {
        ...standard,
        cost: await estimateTransactionCost({
          transactionSpeed: 'standard',
          useMevProtection: false
        })
      },
      fast: {
        ...fast,
        cost: await estimateTransactionCost({
          transactionSpeed: 'fast',
          useMevProtection: false
        })
      },
      ultra: {
        ...ultra,
        cost: await estimateTransactionCost({
          transactionSpeed: 'ultra',
          useMevProtection: true
        })
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching speed presets:', error);
    res.status(500).json({ error: 'Failed to fetch speed presets' });
  }
});

/**
 * Estimate transaction cost
 */
router.post('/estimate-cost', authenticate, async (req, res) => {
  try {
    const { transactionSpeed, useMevProtection, computeUnitLimit } = req.body;
    
    const cost = await estimateTransactionCost({
      transactionSpeed: transactionSpeed || 'standard',
      useMevProtection: useMevProtection || false,
      computeUnitLimit: computeUnitLimit || 200000
    });
    
    res.json(cost);
  } catch (error) {
    console.error('Error estimating cost:', error);
    res.status(500).json({ error: 'Failed to estimate cost' });
  }
});

module.exports = router;
