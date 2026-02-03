const { Connection, PublicKey } = require('@solana/web3.js');
const { subscribeToProgramLogs, connection } = require('../utils/solana');
const { detectRugPull } = require('./rugDetection');
const { executeTrade } = require('./tradingService');
const { query } = require('../database/setup');

const PUMPFUN_PROGRAM_ID = process.env.PUMPFUN_PROGRAM_ID || '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const RAYDIUM_AMM_PROGRAM_ID = process.env.RAYDIUM_AMM_PROGRAM_ID || '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';

let sniperSubscriptions = [];
let isRunning = false;

/**
 * Start the sniper engine
 */
async function startSniperEngine() {
  if (isRunning) {
    console.log('Sniper engine already running');
    return;
  }
  
  isRunning = true;
  console.log('🎯 Sniper engine starting...');
  
  try {
    // Monitor Pump.fun for new launches
    const pumpfunSub = subscribeToProgramLogs(
      PUMPFUN_PROGRAM_ID,
      async (logs, context) => {
        await handlePumpfunLaunch(logs, context);
      }
    );
    sniperSubscriptions.push(pumpfunSub);
    
    // Monitor Raydium for new pools
    const raydiumSub = subscribeToProgramLogs(
      RAYDIUM_AMM_PROGRAM_ID,
      async (logs, context) => {
        await handleRaydiumPool(logs, context);
      }
    );
    sniperSubscriptions.push(raydiumSub);
    
    console.log('✅ Sniper engine monitoring Pump.fun and Raydium');
    
  } catch (error) {
    console.error('❌ Failed to start sniper engine:', error);
    isRunning = false;
    throw error;
  }
}

/**
 * Handle new Pump.fun token launch
 */
async function handlePumpfunLaunch(logs, context) {
  try {
    // Parse logs to extract token info
    const tokenInfo = parsePumpfunLogs(logs);
    if (!tokenInfo) return;
    
    console.log('🚀 New Pump.fun launch detected:', tokenInfo.address);
    
    // Store in database
    await query(
      `INSERT INTO pumpfun_launches (
        token_address, token_symbol, token_name, 
        creator_address, initial_liquidity_sol, launch_timestamp
      ) VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (token_address) DO NOTHING`,
      [
        tokenInfo.address,
        tokenInfo.symbol,
        tokenInfo.name,
        tokenInfo.creator,
        tokenInfo.liquidity
      ]
    );
    
    // Get all active sniper configs
    const configs = await query(
      `SELECT sc.*, w.id as wallet_id, w.encrypted_private_key
       FROM sniper_configs sc
       JOIN wallets w ON sc.wallet_id = w.id
       WHERE sc.is_active = TRUE 
       AND sc.auto_snipe_enabled = TRUE
       AND sc.min_liquidity_sol <= $1`,
      [tokenInfo.liquidity]
    );
    
    // Check for rug pull indicators if enabled
    if (configs.rows.length > 0 && configs.rows[0].rug_check_enabled) {
      const rugRisk = await detectRugPull(tokenInfo.address);
      
      if (rugRisk.isRug || rugRisk.riskScore > 70) {
        console.log('⚠️  High rug risk detected, skipping:', tokenInfo.address);
        return;
      }
    }
    
    // Execute snipes for all eligible users
    for (const config of configs.rows) {
      try {
        await executeSnipe(config, tokenInfo);
      } catch (error) {
        console.error(`Failed to execute snipe for user ${config.user_id}:`, error.message);
      }
    }
    
  } catch (error) {
    console.error('Error handling Pump.fun launch:', error);
  }
}

/**
 * Handle new Raydium pool creation
 */
async function handleRaydiumPool(logs, context) {
  try {
    // Parse logs to extract pool info
    const poolInfo = parseRaydiumLogs(logs);
    if (!poolInfo) return;
    
    console.log('💧 New Raydium pool detected:', poolInfo.address);
    
    // Check if this is a Pump.fun graduation
    const pumpfunToken = await query(
      'SELECT * FROM pumpfun_launches WHERE token_address = $1',
      [poolInfo.tokenAddress]
    );
    
    if (pumpfunToken.rows.length > 0) {
      await query(
        `UPDATE pumpfun_launches 
         SET graduated_to_raydium = TRUE, graduation_timestamp = NOW()
         WHERE token_address = $1`,
        [poolInfo.tokenAddress]
      );
      
      console.log('🎓 Pump.fun token graduated to Raydium:', poolInfo.tokenAddress);
    }
    
    // Get all active sniper configs
    const configs = await query(
      `SELECT sc.*, w.id as wallet_id, w.encrypted_private_key
       FROM sniper_configs sc
       JOIN wallets w ON sc.wallet_id = w.id
       WHERE sc.is_active = TRUE 
       AND sc.auto_snipe_enabled = TRUE`,
      []
    );
    
    // Execute snipes for eligible users
    for (const config of configs.rows) {
      try {
        await executeSnipe(config, {
          address: poolInfo.tokenAddress,
          liquidity: poolInfo.liquidity,
          source: 'raydium'
        });
      } catch (error) {
        console.error(`Failed to execute snipe for user ${config.user_id}:`, error.message);
      }
    }
    
  } catch (error) {
    console.error('Error handling Raydium pool:', error);
  }
}

/**
 * Execute snipe buy order
 */
async function executeSnipe(config, tokenInfo) {
  try {
    console.log(`🎯 Executing snipe for user ${config.user_id} on ${tokenInfo.address}`);
    console.log(`⚡ Speed: ${config.transaction_speed || 'standard'}`);
    
    // Execute trade with configured speed settings
    const result = await executeTrade({
      userId: config.user_id,
      walletId: config.wallet_id,
      tokenAddress: tokenInfo.address,
      tradeType: 'BUY',
      amountSol: config.max_buy_amount_sol,
      slippageBps: config.slippage_bps,
      useMevProtection: config.mev_protection || false,
      transactionSpeed: config.transaction_speed || 'standard',
      jitoTipLamports: config.jito_tip_lamports || 10000,
      computeUnitPrice: config.compute_unit_price_micro_lamports || 1000,
      computeUnitLimit: config.compute_unit_limit || 200000,
      usePrivateRpc: config.use_private_rpc || false
    });
    
    if (result.success) {
      console.log(`✅ Snipe successful for user ${config.user_id}:`, result.signature);
      
      // Set up automatic take profit/stop loss if configured
      if (config.take_profit_percentage > 0 || config.stop_loss_percentage > 0) {
        await setupAutomaticSells(config, tokenInfo.address, result);
      }
    } else {
      console.log(`❌ Snipe failed for user ${config.user_id}:`, result.error);
    }
    
    return result;
    
  } catch (error) {
    console.error('Error executing snipe:', error);
    throw error;
  }
}

/**
 * Set up automatic take profit and stop loss orders
 */
async function setupAutomaticSells(config, tokenAddress, buyResult) {
  try {
    // This would integrate with a price monitoring service
    // For now, we'll just log the setup
    console.log(`Setting up automatic sells for ${tokenAddress}`);
    console.log(`Take profit: ${config.take_profit_percentage}%`);
    console.log(`Stop loss: ${config.stop_loss_percentage}%`);
    
    // In production, this would:
    // 1. Subscribe to token price updates
    // 2. Monitor for take profit or stop loss triggers
    // 3. Automatically execute sell orders
    
  } catch (error) {
    console.error('Error setting up automatic sells:', error);
  }
}

/**
 * Parse Pump.fun logs
 */
function parsePumpfunLogs(logs) {
  try {
    // This would parse the actual log data
    // For now, return mock data structure
    // In production, implement actual log parsing
    
    const logData = logs.logs[0]; // Example
    
    // Parse token creation instruction
    // Extract: token address, creator, liquidity, etc.
    
    return null; // Return null if not a token launch
    
  } catch (error) {
    console.error('Error parsing Pump.fun logs:', error);
    return null;
  }
}

/**
 * Parse Raydium logs
 */
function parseRaydiumLogs(logs) {
  try {
    // This would parse the actual log data
    // For now, return mock data structure
    // In production, implement actual log parsing
    
    return null; // Return null if not a pool creation
    
  } catch (error) {
    console.error('Error parsing Raydium logs:', error);
    return null;
  }
}

/**
 * Stop the sniper engine
 */
async function stopSniperEngine() {
  if (!isRunning) {
    console.log('Sniper engine not running');
    return;
  }
  
  console.log('Stopping sniper engine...');
  
  // Unsubscribe from all logs
  for (const sub of sniperSubscriptions) {
    try {
      await connection.removeOnLogsListener(sub);
    } catch (error) {
      console.error('Error unsubscribing:', error);
    }
  }
  
  sniperSubscriptions = [];
  isRunning = false;
  
  console.log('✅ Sniper engine stopped');
}

/**
 * Get sniper engine status
 */
function getSniperStatus() {
  return {
    isRunning,
    activeSubscriptions: sniperSubscriptions.length,
    monitoredPrograms: [
      { name: 'Pump.fun', id: PUMPFUN_PROGRAM_ID },
      { name: 'Raydium AMM', id: RAYDIUM_AMM_PROGRAM_ID }
    ]
  };
}

module.exports = {
  startSniperEngine,
  stopSniperEngine,
  getSniperStatus,
  executeSnipe
};
