const { Connection, PublicKey } = require('@solana/web3.js');
const { connection } = require('../utils/solana');

// Pump.fun program IDs
const PUMPFUN_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const BONKFUN_PROGRAM_ID = 'BondJk3qHVLhzPuN6jKYy5gKF8TZnCzZ7RQdaDpJnKp'; // Example

/**
 * Get bonding curve progress for a Pump.fun token
 * Returns percentage filled before graduation to Raydium
 */
async function getBondingCurveProgress(tokenAddress) {
  try {
    const tokenPubkey = new PublicKey(tokenAddress);
    
    // Get bonding curve account
    const bondingCurveAddress = await getBondingCurveAddress(tokenPubkey);
    const accountInfo = await connection.getAccountInfo(bondingCurveAddress);
    
    if (!accountInfo) {
      return {
        success: false,
        error: 'Not a Pump.fun token',
        isBonded: false
      };
    }
    
    // Parse bonding curve data
    const data = accountInfo.data;
    
    // Pump.fun bonding curve structure:
    // - virtualSolReserves (u64, 8 bytes at offset 8)
    // - virtualTokenReserves (u64, 8 bytes at offset 16)
    // - realSolReserves (u64, 8 bytes at offset 24)
    // - realTokenReserves (u64, 8 bytes at offset 32)
    // - complete (bool, 1 byte at offset 40)
    
    const virtualSolReserves = data.readBigUInt64LE(8);
    const virtualTokenReserves = data.readBigUInt64LE(16);
    const realSolReserves = data.readBigUInt64LE(24);
    const realTokenReserves = data.readBigUInt64LE(32);
    const complete = data.readUInt8(40) === 1;
    
    // Calculate bonding curve progress
    // Target: Usually 85 SOL in real reserves triggers graduation
    const TARGET_SOL = 85; // SOL needed for graduation
    const realSolAmount = Number(realSolReserves) / 1e9; // Convert lamports to SOL
    const progressPercent = Math.min((realSolAmount / TARGET_SOL) * 100, 100);
    
    // Calculate market cap
    const totalSupply = 1_000_000_000; // 1B tokens (Pump.fun standard)
    const soldTokens = totalSupply - (Number(realTokenReserves) / 1e6);
    const percentSold = (soldTokens / totalSupply) * 100;
    
    return {
      success: true,
      isBonded: complete,
      bondingProgress: {
        percent: progressPercent.toFixed(2),
        realSolReserves: realSolAmount.toFixed(4),
        targetSol: TARGET_SOL,
        remaining: Math.max(TARGET_SOL - realSolAmount, 0).toFixed(4),
        complete
      },
      tokenMetrics: {
        totalSupply,
        soldTokens: soldTokens.toFixed(0),
        percentSold: percentSold.toFixed(2),
        remainingTokens: (totalSupply - soldTokens).toFixed(0)
      },
      virtualReserves: {
        sol: (Number(virtualSolReserves) / 1e9).toFixed(4),
        tokens: (Number(virtualTokenReserves) / 1e6).toFixed(0)
      },
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('Error fetching bonding curve:', error);
    return {
      success: false,
      error: error.message,
      isBonded: false
    };
  }
}

/**
 * Derive bonding curve PDA for a token
 */
async function getBondingCurveAddress(tokenMint) {
  const [bondingCurve] = await PublicKey.findProgramAddress(
    [
      Buffer.from('bonding-curve'),
      tokenMint.toBuffer()
    ],
    new PublicKey(PUMPFUN_PROGRAM_ID)
  );
  
  return bondingCurve;
}

/**
 * Check if token has graduated to Raydium
 */
async function hasGraduated(tokenAddress) {
  const result = await getBondingCurveProgress(tokenAddress);
  return result.success && result.bondingProgress?.complete;
}

/**
 * Get current price from bonding curve
 * Uses constant product formula: x * y = k
 */
function calculateBondingCurvePrice(virtualSol, virtualTokens) {
  // Price = virtualSol / virtualTokens
  const sol = Number(virtualSol) / 1e9;
  const tokens = Number(virtualTokens) / 1e6;
  
  return (sol / tokens).toFixed(10);
}

/**
 * Estimate tokens received for SOL amount
 */
function estimateTokensOut(virtualSol, virtualTokens, solIn) {
  const k = virtualSol * virtualTokens;
  const newSolReserve = virtualSol + BigInt(Math.floor(solIn * 1e9));
  const newTokenReserve = k / newSolReserve;
  const tokensOut = virtualTokens - newTokenReserve;
  
  return Number(tokensOut) / 1e6;
}

/**
 * Estimate SOL received for token amount
 */
function estimateSolOut(virtualSol, virtualTokens, tokensIn) {
  const k = virtualSol * virtualTokens;
  const newTokenReserve = virtualTokens + BigInt(Math.floor(tokensIn * 1e6));
  const newSolReserve = k / newTokenReserve;
  const solOut = virtualSol - newSolReserve;
  
  return Number(solOut) / 1e9;
}

/**
 * Monitor bonding curve for graduation
 */
async function watchForGraduation(tokenAddress, callback) {
  const tokenPubkey = new PublicKey(tokenAddress);
  const bondingCurveAddress = await getBondingCurveAddress(tokenPubkey);
  
  console.log(`👀 Watching ${tokenAddress} for graduation...`);
  
  const subscriptionId = connection.onAccountChange(
    bondingCurveAddress,
    async (accountInfo) => {
      const complete = accountInfo.data.readUInt8(40) === 1;
      
      if (complete) {
        console.log(`🎓 Token graduated! ${tokenAddress}`);
        callback({
          tokenAddress,
          graduated: true,
          timestamp: new Date().toISOString()
        });
        
        // Unsubscribe after graduation
        connection.removeAccountChangeListener(subscriptionId);
      }
    },
    'confirmed'
  );
  
  return subscriptionId;
}

/**
 * Get Pump.fun token info
 */
async function getPumpfunTokenInfo(tokenAddress) {
  try {
    const bondingData = await getBondingCurveProgress(tokenAddress);
    
    if (!bondingData.success) {
      return {
        success: false,
        isPumpfun: false,
        error: bondingData.error
      };
    }
    
    return {
      success: true,
      isPumpfun: true,
      tokenAddress,
      bonding: bondingData.bondingProgress,
      metrics: bondingData.tokenMetrics,
      virtualReserves: bondingData.virtualReserves,
      currentPrice: calculateBondingCurvePrice(
        bondingData.virtualReserves.sol,
        bondingData.virtualReserves.tokens
      ),
      status: bondingData.isBonded ? 'GRADUATED' : 'BONDING',
      platform: 'pump.fun'
    };
    
  } catch (error) {
    return {
      success: false,
      isPumpfun: false,
      error: error.message
    };
  }
}

module.exports = {
  getBondingCurveProgress,
  hasGraduated,
  calculateBondingCurvePrice,
  estimateTokensOut,
  estimateSolOut,
  watchForGraduation,
  getPumpfunTokenInfo,
  PUMPFUN_PROGRAM_ID,
  BONKFUN_PROGRAM_ID
};
