const { 
  connection, 
  PublicKey, 
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
  sendTransaction
} = require('../utils/solana');
const { getWalletKeypair } = require('./walletService');
const { query } = require('../database/setup');
const { getTokenPrice } = require('./dexscreener');
const { createPosition } = require('./positionManager');
const BigNumber = require('bignumber.js');

// Your fee collection wallet
const FEE_COLLECTION_WALLET = new PublicKey(
  process.env.FEE_COLLECTION_WALLET || 'GeKFPYBQ5yLRcnCEdaAs93Xwji63xCSbwwibMteKqUN8'
);

const FEE_PERCENTAGE = parseFloat(process.env.TRANSACTION_FEE_PERCENTAGE || '1.0');

/**
 * Execute a trade (buy or sell) with automatic fee collection
 */
async function executeTrade(params) {
  const {
    userId,
    walletId,
    tokenAddress,
    tradeType, // 'BUY' or 'SELL'
    amountSol,
    slippageBps = 500,
    useMevProtection = false,
    transactionSpeed = 'standard',
    jitoTipLamports = 10000,
    computeUnitPrice = 1000,
    computeUnitLimit = 200000,
    usePrivateRpc = false
  } = params;

  let tradeId = null;
  
  try {
    // 1. Create trade record
    const tradeResult = await query(
      `INSERT INTO trades (
        user_id, wallet_id, token_address, trade_type, 
        amount_sol, slippage_bps, status
      ) VALUES ($1, $2, $3, $4, $5, $6, 'PENDING')
      RETURNING id`,
      [userId, walletId, tokenAddress, tradeType, amountSol, slippageBps]
    );
    
    tradeId = tradeResult.rows[0].id;
    
    // 2. Get user's wallet keypair
    const userKeypair = await getWalletKeypair(walletId, userId);
    
    // 3. Calculate fee (1% of trade amount by default)
    const feeAmount = new BigNumber(amountSol)
      .multipliedBy(FEE_PERCENTAGE)
      .dividedBy(100)
      .toNumber();
    
    const feeAmountLamports = Math.floor(feeAmount * LAMPORTS_PER_SOL);
    
    console.log(`💰 Trade fee: ${feeAmount} SOL (${FEE_PERCENTAGE}%) → ${FEE_COLLECTION_WALLET.toString()}`);
    
    // 4. Build transaction
    const transaction = new Transaction();
    
    if (tradeType === 'BUY') {
      // Add buy instruction (Raydium/Jupiter swap)
      const swapInstruction = await buildSwapInstruction({
        userPublicKey: userKeypair.publicKey,
        tokenAddress,
        amountSol: amountSol - feeAmount, // Trade amount minus fee
        slippageBps,
        direction: 'SOL_TO_TOKEN'
      });
      
      transaction.add(swapInstruction);
      
    } else if (tradeType === 'SELL') {
      // Add sell instruction (Raydium/Jupiter swap)
      const swapInstruction = await buildSwapInstruction({
        userPublicKey: userKeypair.publicKey,
        tokenAddress,
        amountSol, // This is the output SOL amount expected
        slippageBps,
        direction: 'TOKEN_TO_SOL'
      });
      
      transaction.add(swapInstruction);
    }
    
    // 5. Add fee transfer instruction (ALWAYS collected)
    const feeTransferInstruction = SystemProgram.transfer({
      fromPubkey: userKeypair.publicKey,
      toPubkey: FEE_COLLECTION_WALLET,
      lamports: feeAmountLamports
    });
    
    transaction.add(feeTransferInstruction);
    
    // 6. Send transaction with speed optimization and optional MEV protection
    const signature = await sendTransaction(
      transaction,
      [userKeypair],
      {
        skipPreflight: false,
        maxRetries: 3,
        useMevProtection,
        transactionSpeed,
        jitoTipLamports,
        computeUnitPrice,
        computeUnitLimit,
        usePrivateRpc
      }
    );
    
    console.log(`✅ Trade executed: ${signature} (speed: ${transactionSpeed})`);
    console.log(`💸 Fee collected: ${feeAmount} SOL → ${FEE_COLLECTION_WALLET.toString()}`);
    
    // 7. Update trade record
    await query(
      `UPDATE trades 
       SET status = 'SUCCESS',
           transaction_signature = $1,
           platform_fee_sol = $2,
           confirmed_at = NOW()
       WHERE id = $3`,
      [signature, feeAmount, tradeId]
    );
    
    // 8. Update user stats
    await query(
      `UPDATE users 
       SET total_trades = total_trades + 1,
           total_volume_sol = total_volume_sol + $1
       WHERE id = $2`,
      [amountSol, userId]
    );
    
    // 9. Create position for BUY trades (for tracking TP/SL)
    if (tradeType === 'BUY') {
      try {
        // Get entry price
        const priceData = await getTokenPrice('solana', tokenAddress);
        const entryPrice = parseFloat(priceData.token?.priceUsd || '0');
        
        // Get user's default TP/SL from sniper config
        const configResult = await query(
          `SELECT take_profit_percentage, stop_loss_percentage 
           FROM sniper_configs 
           WHERE user_id = $1 
           ORDER BY updated_at DESC 
           LIMIT 1`,
          [userId]
        );
        
        const config = configResult.rows[0];
        const takeProfitPercent = config?.take_profit_percentage || 200; // Default 200%
        const stopLossPercent = config?.stop_loss_percentage || 30; // Default 30%
        
        // Create position
        await createPosition({
          userId,
          walletId,
          tokenAddress,
          entryPrice,
          amount: 0, // TODO: Calculate from swap output
          amountSol,
          takeProfitPercent,
          stopLossPercent,
          tradeId
        });
        
        console.log(`📊 Position created with TP: ${takeProfitPercent}% SL: ${stopLossPercent}%`);
      } catch (posError) {
        console.error('Failed to create position:', posError);
        // Don't fail the trade if position creation fails
      }
    }
    
    // 10. Return success
    return {
      success: true,
      signature,
      tradeId,
      feeCollected: feeAmount,
      feeWallet: FEE_COLLECTION_WALLET.toString(),
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('❌ Trade execution failed:', error);
    
    // Update trade record with error
    if (tradeId) {
      await query(
        `UPDATE trades 
         SET status = 'FAILED',
             error_message = $1
         WHERE id = $2`,
        [error.message, tradeId]
      );
    }
    
    return {
      success: false,
      error: error.message,
      tradeId
    };
  }
}

/**
 * Build swap instruction using Jupiter or Raydium
 */
async function buildSwapInstruction(params) {
  const {
    userPublicKey,
    tokenAddress,
    amountSol,
    slippageBps,
    direction // 'SOL_TO_TOKEN' or 'TOKEN_TO_SOL'
  } = params;
  
  try {
    // Use Jupiter API for best routing
    const jupiterQuote = await getJupiterQuote({
      inputMint: direction === 'SOL_TO_TOKEN' 
        ? 'So11111111111111111111111111111111111111112' // Wrapped SOL
        : tokenAddress,
      outputMint: direction === 'SOL_TO_TOKEN'
        ? tokenAddress
        : 'So11111111111111111111111111111111111111112',
      amount: Math.floor(amountSol * LAMPORTS_PER_SOL),
      slippageBps
    });
    
    if (!jupiterQuote) {
      throw new Error('Failed to get swap quote');
    }
    
    // Get swap transaction from Jupiter
    const swapTransaction = await getJupiterSwapTransaction({
      quote: jupiterQuote,
      userPublicKey: userPublicKey.toString()
    });
    
    return swapTransaction.swapInstruction;
    
  } catch (error) {
    console.error('Error building swap instruction:', error);
    throw error;
  }
}

/**
 * Get Jupiter quote for token swap
 */
async function getJupiterQuote(params) {
  try {
    const { inputMint, outputMint, amount, slippageBps } = params;
    
    const response = await fetch(
      `https://quote-api.jup.ag/v6/quote?` +
      `inputMint=${inputMint}&` +
      `outputMint=${outputMint}&` +
      `amount=${amount}&` +
      `slippageBps=${slippageBps}`
    );
    
    if (!response.ok) {
      throw new Error('Jupiter API error');
    }
    
    return await response.json();
    
  } catch (error) {
    console.error('Error getting Jupiter quote:', error);
    return null;
  }
}

/**
 * Get Jupiter swap transaction
 */
async function getJupiterSwapTransaction(params) {
  try {
    const { quote, userPublicKey } = params;
    
    const response = await fetch('https://quote-api.jup.ag/v6/swap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey,
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: 'auto'
      })
    });
    
    if (!response.ok) {
      throw new Error('Jupiter swap transaction error');
    }
    
    return await response.json();
    
  } catch (error) {
    console.error('Error getting Jupiter swap transaction:', error);
    throw error;
  }
}

/**
 * Get token price in SOL
 */
async function getTokenPrice(tokenAddress) {
  try {
    // Use Jupiter price API
    const response = await fetch(
      `https://price.jup.ag/v4/price?ids=${tokenAddress}`
    );
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    return data.data?.[tokenAddress]?.price || null;
    
  } catch (error) {
    console.error('Error getting token price:', error);
    return null;
  }
}

/**
 * Calculate trade profit/loss
 */
async function calculateProfitLoss(userId, tokenAddress) {
  try {
    // Get all buy and sell trades for this token
    const trades = await query(
      `SELECT trade_type, amount_sol, amount_tokens, price_per_token_sol
       FROM trades
       WHERE user_id = $1 AND token_address = $2 AND status = 'SUCCESS'
       ORDER BY created_at ASC`,
      [userId, tokenAddress]
    );
    
    let totalBuySol = 0;
    let totalSellSol = 0;
    let remainingTokens = 0;
    
    for (const trade of trades.rows) {
      if (trade.trade_type === 'BUY') {
        totalBuySol += parseFloat(trade.amount_sol);
        remainingTokens += parseFloat(trade.amount_tokens);
      } else {
        totalSellSol += parseFloat(trade.amount_sol);
        remainingTokens -= parseFloat(trade.amount_tokens);
      }
    }
    
    // Calculate current value of remaining tokens
    const currentPrice = await getTokenPrice(tokenAddress);
    const currentValue = remainingTokens * (currentPrice || 0);
    
    const realizedPnL = totalSellSol - totalBuySol;
    const unrealizedPnL = currentValue - totalBuySol;
    const totalPnL = realizedPnL + unrealizedPnL;
    
    return {
      totalBuySol,
      totalSellSol,
      remainingTokens,
      currentValue,
      realizedPnL,
      unrealizedPnL,
      totalPnL,
      roi: totalBuySol > 0 ? (totalPnL / totalBuySol) * 100 : 0
    };
    
  } catch (error) {
    console.error('Error calculating profit/loss:', error);
    return null;
  }
}

/**
 * Get user's trading history
 */
async function getTradingHistory(userId, options = {}) {
  try {
    const {
      limit = 50,
      offset = 0,
      tokenAddress = null,
      tradeType = null,
      status = 'SUCCESS'
    } = options;
    
    let query_text = `
      SELECT 
        t.*,
        w.public_key as wallet_address,
        w.wallet_name
      FROM trades t
      JOIN wallets w ON t.wallet_id = w.id
      WHERE t.user_id = $1
    `;
    
    const params = [userId];
    let paramCount = 1;
    
    if (tokenAddress) {
      paramCount++;
      query_text += ` AND t.token_address = $${paramCount}`;
      params.push(tokenAddress);
    }
    
    if (tradeType) {
      paramCount++;
      query_text += ` AND t.trade_type = $${paramCount}`;
      params.push(tradeType);
    }
    
    if (status) {
      paramCount++;
      query_text += ` AND t.status = $${paramCount}`;
      params.push(status);
    }
    
    query_text += ` ORDER BY t.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(limit, offset);
    
    const result = await query(query_text, params);
    
    return result.rows;
    
  } catch (error) {
    console.error('Error getting trading history:', error);
    return [];
  }
}

/**
 * Get total fees collected (for admin dashboard)
 */
async function getTotalFeesCollected() {
  try {
    const result = await query(
      `SELECT 
        SUM(platform_fee_sol) as total_fees,
        COUNT(*) as total_trades,
        COUNT(DISTINCT user_id) as unique_users
       FROM trades
       WHERE status = 'SUCCESS' AND platform_fee_sol > 0`
    );
    
    const stats = result.rows[0];
    
    // Get current fee wallet balance
    const balance = await connection.getBalance(FEE_COLLECTION_WALLET);
    
    return {
      totalFeesCollected: parseFloat(stats.total_fees || 0),
      totalTrades: parseInt(stats.total_trades || 0),
      uniqueUsers: parseInt(stats.unique_users || 0),
      currentFeeWalletBalance: balance / LAMPORTS_PER_SOL,
      feeWalletAddress: FEE_COLLECTION_WALLET.toString(),
      feePercentage: FEE_PERCENTAGE
    };
    
  } catch (error) {
    console.error('Error getting total fees collected:', error);
    return null;
  }
}

module.exports = {
  executeTrade,
  getTokenPrice,
  calculateProfitLoss,
  getTradingHistory,
  getTotalFeesCollected,
  FEE_COLLECTION_WALLET
};
