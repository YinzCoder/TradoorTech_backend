const { 
  Connection, 
  PublicKey, 
  Keypair,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  VersionedTransaction,
  ComputeBudgetProgram,
  TransactionInstruction
} = require('@solana/web3.js');
const {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID
} = require('@solana/spl-token');

// Initialize Solana connection
const connection = new Connection(
  process.env.HELIUS_API_KEY 
    ? `https://rpc.helius.xyz/?api-key=${process.env.HELIUS_API_KEY}`
    : process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
  {
    commitment: 'confirmed',
    confirmTransactionInitialTimeout: 60000
  }
);

// WebSocket connection for real-time updates
const wsConnection = new Connection(
  process.env.SOLANA_WS_URL || 'wss://api.mainnet-beta.solana.com',
  {
    commitment: 'confirmed',
    wsEndpoint: process.env.SOLANA_WS_URL || 'wss://api.mainnet-beta.solana.com'
  }
);

/**
 * Get SOL balance for a wallet
 */
async function getBalance(publicKey) {
  try {
    const balance = await connection.getBalance(new PublicKey(publicKey));
    return balance / LAMPORTS_PER_SOL;
  } catch (error) {
    console.error('Error getting balance:', error);
    throw error;
  }
}

/**
 * Get token balance for a wallet
 */
async function getTokenBalance(walletPublicKey, tokenMintAddress) {
  try {
    const walletPubkey = new PublicKey(walletPublicKey);
    const mintPubkey = new PublicKey(tokenMintAddress);
    
    const tokenAccount = await getAssociatedTokenAddress(
      mintPubkey,
      walletPubkey
    );
    
    const balance = await connection.getTokenAccountBalance(tokenAccount);
    return parseFloat(balance.value.uiAmount || 0);
  } catch (error) {
    // Token account might not exist
    return 0;
  }
}

/**
 * Get all token accounts for a wallet
 */
async function getTokenAccounts(publicKey) {
  try {
    const accounts = await connection.getParsedTokenAccountsByOwner(
      new PublicKey(publicKey),
      { programId: TOKEN_PROGRAM_ID }
    );
    
    return accounts.value.map(account => ({
      mint: account.account.data.parsed.info.mint,
      amount: account.account.data.parsed.info.tokenAmount.uiAmount,
      decimals: account.account.data.parsed.info.tokenAmount.decimals
    }));
  } catch (error) {
    console.error('Error getting token accounts:', error);
    return [];
  }
}

/**
 * Get token metadata
 */
async function getTokenMetadata(tokenAddress) {
  try {
    // For now, return basic info
    // In production, integrate with Helius DAS API or similar
    const supply = await connection.getTokenSupply(new PublicKey(tokenAddress));
    
    return {
      address: tokenAddress,
      supply: supply.value.uiAmount,
      decimals: supply.value.decimals
    };
  } catch (error) {
    console.error('Error getting token metadata:', error);
    return null;
  }
}

/**
 * Get recent transactions for a wallet
 */
async function getRecentTransactions(publicKey, limit = 10) {
  try {
    const signatures = await connection.getSignaturesForAddress(
      new PublicKey(publicKey),
      { limit }
    );
    
    const transactions = await Promise.all(
      signatures.map(async (sig) => {
        const tx = await connection.getTransaction(sig.signature, {
          maxSupportedTransactionVersion: 0
        });
        return {
          signature: sig.signature,
          timestamp: sig.blockTime,
          status: sig.err ? 'failed' : 'success',
          slot: sig.slot,
          ...tx
        };
      })
    );
    
    return transactions;
  } catch (error) {
    console.error('Error getting recent transactions:', error);
    return [];
  }
}

/**
 * Send SOL transaction with priority fees and MEV protection (Jito)
 * 
 * Speed modes:
 * - standard: Basic priority fee (1,000 micro-lamports)
 * - fast: High priority fee (10,000 micro-lamports) + Jito tip (10,000 lamports)
 * - ultra: Maximum priority (100,000 micro-lamports) + Large Jito tip (100,000 lamports)
 */
async function sendTransaction(transaction, signers, options = {}) {
  try {
    const {
      skipPreflight = false,
      maxRetries = 3,
      useMevProtection = false,
      transactionSpeed = 'standard',
      jitoTipLamports = 10000,
      priorityFeeLamports = 1000,
      computeUnitPrice = 1000, // micro-lamports per compute unit
      computeUnitLimit = 200000, // compute units to request
      usePrivateRpc = false
    } = options;
    
    // Get latest blockhash
    transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    transaction.feePayer = signers[0].publicKey;
    
    // Add priority fee instructions (ALWAYS for better execution)
    // SetComputeUnitLimit - Request more compute units for complex transactions
    const computeUnitLimitIx = ComputeBudgetProgram.setComputeUnitLimit({
      units: computeUnitLimit
    });
    
    // SetComputeUnitPrice - Pay more per compute unit for higher priority
    const computeUnitPriceIx = ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: computeUnitPrice
    });
    
    // Add priority fee instructions at the BEGINNING (before other instructions)
    transaction.instructions.unshift(computeUnitPriceIx, computeUnitLimitIx);
    
    // Add Jito tip for MEV protection (optional)
    if (useMevProtection && process.env.JITO_TIP_ACCOUNT) {
      const tipAccount = new PublicKey(process.env.JITO_TIP_ACCOUNT);
      
      const jitoTipIx = SystemProgram.transfer({
        fromPubkey: signers[0].publicKey,
        toPubkey: tipAccount,
        lamports: jitoTipLamports
      });
      
      // Add Jito tip at the END (after all other instructions)
      transaction.add(jitoTipIx);
      
      console.log(`💰 Jito tip: ${jitoTipLamports / LAMPORTS_PER_SOL} SOL`);
    }
    
    console.log(`⚡ Priority fee: ${computeUnitPrice} micro-lamports/CU (limit: ${computeUnitLimit} CU)`);
    console.log(`🚀 Transaction speed: ${transactionSpeed}`);
    
    // Sign transaction
    transaction.sign(...signers);
    
    // Choose RPC endpoint based on settings
    const rpcConnection = usePrivateRpc && process.env.PRIVATE_RPC_URL
      ? new Connection(process.env.PRIVATE_RPC_URL, { commitment: 'confirmed' })
      : connection;
    
    // Send with retries
    let lastError;
    for (let i = 0; i < maxRetries; i++) {
      try {
        const signature = await rpcConnection.sendRawTransaction(
          transaction.serialize(),
          {
            skipPreflight,
            maxRetries: 2,
            preflightCommitment: 'confirmed'
          }
        );
        
        // Confirm transaction
        const confirmation = await rpcConnection.confirmTransaction(signature, 'confirmed');
        
        if (confirmation.value.err) {
          throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
        }
        
        console.log(`✅ Transaction confirmed: ${signature}`);
        return signature;
      } catch (error) {
        lastError = error;
        console.warn(`Transaction attempt ${i + 1} failed:`, error.message);
        
        if (i < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        }
      }
    }
    
    throw lastError;
  } catch (error) {
    console.error('Error sending transaction:', error);
    throw error;
  }
}

/**
 * Calculate transaction fees
 */
async function estimateTransactionFee(transaction) {
  try {
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    
    const fee = await connection.getFeeForMessage(
      transaction.compileMessage(),
      'confirmed'
    );
    
    return fee.value / LAMPORTS_PER_SOL;
  } catch (error) {
    console.error('Error estimating fee:', error);
    return 0.000005; // Default estimate
  }
}

/**
 * Monitor account for changes
 */
function subscribeToAccount(publicKey, callback) {
  try {
    const subscriptionId = wsConnection.onAccountChange(
      new PublicKey(publicKey),
      callback,
      'confirmed'
    );
    
    return subscriptionId;
  } catch (error) {
    console.error('Error subscribing to account:', error);
    throw error;
  }
}

/**
 * Monitor program logs
 */
function subscribeToProgramLogs(programId, callback) {
  try {
    const subscriptionId = wsConnection.onLogs(
      new PublicKey(programId),
      callback,
      'confirmed'
    );
    
    return subscriptionId;
  } catch (error) {
    console.error('Error subscribing to program logs:', error);
    throw error;
  }
}

/**
 * Unsubscribe from account/program updates
 */
async function unsubscribe(subscriptionId) {
  try {
    await wsConnection.removeAccountChangeListener(subscriptionId);
  } catch (error) {
    console.error('Error unsubscribing:', error);
  }
}

/**
 * Get current slot
 */
async function getCurrentSlot() {
  try {
    return await connection.getSlot('confirmed');
  } catch (error) {
    console.error('Error getting current slot:', error);
    return 0;
  }
}

/**
 * Get recent priority fee statistics
 * Uses Helius Priority Fee API if available
 */
async function getRecentPriorityFees() {
  try {
    if (process.env.HELIUS_API_KEY) {
      const response = await fetch(
        `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getRecentPrioritizationFees',
            params: []
          })
        }
      );
      
      const data = await response.json();
      if (data.result && data.result.length > 0) {
        // Get percentiles
        const fees = data.result.map(f => f.prioritizationFee).sort((a, b) => a - b);
        return {
          min: fees[0],
          median: fees[Math.floor(fees.length / 2)],
          p75: fees[Math.floor(fees.length * 0.75)],
          p95: fees[Math.floor(fees.length * 0.95)],
          max: fees[fees.length - 1]
        };
      }
    }
    
    // Fallback defaults if API unavailable
    return {
      min: 1000,
      median: 5000,
      p75: 10000,
      p95: 50000,
      max: 100000
    };
  } catch (error) {
    console.error('Error getting priority fees:', error);
    return {
      min: 1000,
      median: 5000,
      p75: 10000,
      p95: 50000,
      max: 100000
    };
  }
}

/**
 * Get transaction speed preset values
 * 
 * Returns optimal settings for:
 * - standard: Low cost, normal speed (good for testing/low priority)
 * - fast: Moderate cost, high priority (good for most trading)
 * - ultra: High cost, maximum speed (good for competitive sniping)
 */
async function getSpeedPreset(speed = 'standard') {
  const recentFees = await getRecentPriorityFees();
  
  const presets = {
    standard: {
      computeUnitPrice: Math.max(recentFees.median, 1000), // Median fee
      computeUnitLimit: 200000,
      jitoTipLamports: 10000, // 0.00001 SOL
      description: 'Normal speed, low cost'
    },
    fast: {
      computeUnitPrice: Math.max(recentFees.p75, 10000), // 75th percentile
      computeUnitLimit: 300000,
      jitoTipLamports: 50000, // 0.00005 SOL
      description: 'High priority, moderate cost'
    },
    ultra: {
      computeUnitPrice: Math.max(recentFees.p95, 50000), // 95th percentile
      computeUnitLimit: 400000,
      jitoTipLamports: 100000, // 0.0001 SOL
      description: 'Maximum speed, highest cost'
    }
  };
  
  return presets[speed] || presets.standard;
}

/**
 * Estimate total transaction cost including priority fees
 */
async function estimateTransactionCost(options = {}) {
  const {
    transactionSpeed = 'standard',
    useMevProtection = false,
    computeUnitLimit = 200000
  } = options;
  
  const preset = await getSpeedPreset(transactionSpeed);
  
  // Base transaction fee (~5000 lamports)
  const baseFee = 5000;
  
  // Priority fee = computeUnitPrice * computeUnitLimit / 1,000,000
  const priorityFee = (preset.computeUnitPrice * computeUnitLimit) / 1000000;
  
  // Jito tip (if MEV protection enabled)
  const jitoTip = useMevProtection ? preset.jitoTipLamports : 0;
  
  const totalLamports = baseFee + priorityFee + jitoTip;
  const totalSol = totalLamports / LAMPORTS_PER_SOL;
  
  return {
    baseFee,
    priorityFee,
    jitoTip,
    totalLamports,
    totalSol,
    breakdown: {
      base: `${(baseFee / LAMPORTS_PER_SOL).toFixed(9)} SOL`,
      priority: `${(priorityFee / LAMPORTS_PER_SOL).toFixed(9)} SOL`,
      jito: `${(jitoTip / LAMPORTS_PER_SOL).toFixed(9)} SOL`,
      total: `${totalSol.toFixed(9)} SOL`
    }
  };
}


/**
 * Check if transaction was successful
 */
async function checkTransactionStatus(signature) {
  try {
    const status = await connection.getSignatureStatus(signature);
    
    return {
      confirmed: status.value?.confirmationStatus === 'confirmed' || 
                 status.value?.confirmationStatus === 'finalized',
      error: status.value?.err,
      slot: status.value?.slot
    };
  } catch (error) {
    console.error('Error checking transaction status:', error);
    return { confirmed: false, error: error.message };
  }
}

module.exports = {
  connection,
  wsConnection,
  getBalance,
  getTokenBalance,
  getTokenAccounts,
  getTokenMetadata,
  getRecentTransactions,
  sendTransaction,
  estimateTransactionFee,
  estimateTransactionCost,
  getRecentPriorityFees,
  getSpeedPreset,
  subscribeToAccount,
  subscribeToProgramLogs,
  unsubscribe,
  getCurrentSlot,
  checkTransactionStatus,
  LAMPORTS_PER_SOL,
  PublicKey,
  Keypair,
  SystemProgram
};
