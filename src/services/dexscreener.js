const axios = require('axios');

const DEXSCREENER_API_BASE = 'https://api.dexscreener.com';
const RATE_LIMIT = 60; // requests per minute

/**
 * DexScreener API Service
 * Rate limit: 60 requests per minute
 */

/**
 * Get token pairs by chain and token address
 * @param {string} chainId - Chain ID (e.g., 'solana')
 * @param {string} tokenAddress - Token address
 */
async function getTokenPairs(chainId, tokenAddress) {
  try {
    const response = await axios.get(
      `${DEXSCREENER_API_BASE}/latest/dex/tokens/${tokenAddress}`,
      { timeout: 5000 }
    );
    
    if (response.data && response.data.pairs) {
      // Filter for specified chain
      const chainPairs = response.data.pairs.filter(
        pair => pair.chainId === chainId
      );
      
      return {
        success: true,
        pairs: chainPairs,
        timestamp: new Date().toISOString()
      };
    }
    
    return { success: false, error: 'No pairs found' };
  } catch (error) {
    console.error('Error fetching token pairs:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Search for tokens by query
 * @param {string} query - Search query (token name, symbol, or address)
 */
async function searchTokens(query) {
  try {
    const response = await axios.get(
      `${DEXSCREENER_API_BASE}/latest/dex/search`,
      {
        params: { q: query },
        timeout: 5000
      }
    );
    
    if (response.data && response.data.pairs) {
      return {
        success: true,
        pairs: response.data.pairs,
        timestamp: new Date().toISOString()
      };
    }
    
    return { success: false, error: 'No results found' };
  } catch (error) {
    console.error('Error searching tokens:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Get token price and data
 * @param {string} chainId - Chain ID (e.g., 'solana')
 * @param {string} tokenAddress - Token address
 */
async function getTokenPrice(chainId, tokenAddress) {
  try {
    const result = await getTokenPairs(chainId, tokenAddress);
    
    if (!result.success || !result.pairs || result.pairs.length === 0) {
      return { success: false, error: 'Token not found' };
    }
    
    // Get the pair with highest liquidity
    const mainPair = result.pairs.sort((a, b) => 
      (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)
    )[0];
    
    return {
      success: true,
      token: {
        address: tokenAddress,
        symbol: mainPair.baseToken?.symbol,
        name: mainPair.baseToken?.name,
        priceUsd: mainPair.priceUsd,
        priceNative: mainPair.priceNative,
        priceChange: {
          m5: mainPair.priceChange?.m5,
          h1: mainPair.priceChange?.h1,
          h6: mainPair.priceChange?.h6,
          h24: mainPair.priceChange?.h24
        },
        volume: {
          h24: mainPair.volume?.h24,
          h6: mainPair.volume?.h6,
          h1: mainPair.volume?.h1,
          m5: mainPair.volume?.m5
        },
        liquidity: {
          usd: mainPair.liquidity?.usd,
          base: mainPair.liquidity?.base,
          quote: mainPair.liquidity?.quote
        },
        fdv: mainPair.fdv,
        marketCap: mainPair.marketCap,
        pairAddress: mainPair.pairAddress,
        dexId: mainPair.dexId,
        url: mainPair.url,
        chainId: mainPair.chainId
      },
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error fetching token price:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Get specific pair by chain and pair address
 * @param {string} chainId - Chain ID
 * @param {string} pairAddress - Pair address
 */
async function getPairData(chainId, pairAddress) {
  try {
    const response = await axios.get(
      `${DEXSCREENER_API_BASE}/latest/dex/pairs/${chainId}/${pairAddress}`,
      { timeout: 5000 }
    );
    
    if (response.data && response.data.pair) {
      return {
        success: true,
        pair: response.data.pair,
        timestamp: new Date().toISOString()
      };
    }
    
    return { success: false, error: 'Pair not found' };
  } catch (error) {
    console.error('Error fetching pair data:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Get latest token boosts
 */
async function getLatestBoosts() {
  try {
    const response = await axios.get(
      `${DEXSCREENER_API_BASE}/token-boosts/latest/v1`,
      { timeout: 5000 }
    );
    
    return {
      success: true,
      boosts: response.data || [],
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error fetching boosts:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Get top boosted tokens
 */
async function getTopBoosts() {
  try {
    const response = await axios.get(
      `${DEXSCREENER_API_BASE}/token-boosts/top/v1`,
      { timeout: 5000 }
    );
    
    return {
      success: true,
      boosts: response.data || [],
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error fetching top boosts:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Get token profiles (latest)
 */
async function getLatestProfiles() {
  try {
    const response = await axios.get(
      `${DEXSCREENER_API_BASE}/token-profiles/latest/v1`,
      { timeout: 5000 }
    );
    
    return {
      success: true,
      profiles: response.data || [],
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error fetching profiles:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Get orders for a token
 * @param {string} chainId - Chain ID
 * @param {string} tokenAddress - Token address
 */
async function getTokenOrders(chainId, tokenAddress) {
  try {
    const response = await axios.get(
      `${DEXSCREENER_API_BASE}/orders/v1/${chainId}/${tokenAddress}`,
      { timeout: 5000 }
    );
    
    return {
      success: true,
      orders: response.data || [],
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error fetching orders:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Get multiple tokens at once
 * @param {string} chainId - Chain ID
 * @param {string[]} tokenAddresses - Array of token addresses
 */
async function getMultipleTokens(chainId, tokenAddresses) {
  try {
    // DexScreener allows up to 30 addresses comma-separated
    const addressString = tokenAddresses.slice(0, 30).join(',');
    
    const response = await axios.get(
      `${DEXSCREENER_API_BASE}/latest/dex/tokens/${addressString}`,
      { timeout: 5000 }
    );
    
    if (response.data && response.data.pairs) {
      // Group pairs by token address
      const tokenMap = {};
      
      response.data.pairs.forEach(pair => {
        const tokenAddr = pair.baseToken?.address;
        if (!tokenAddr) return;
        
        if (!tokenMap[tokenAddr] || 
            (pair.liquidity?.usd || 0) > (tokenMap[tokenAddr].liquidity?.usd || 0)) {
          tokenMap[tokenAddr] = pair;
        }
      });
      
      return {
        success: true,
        tokens: Object.values(tokenMap),
        timestamp: new Date().toISOString()
      };
    }
    
    return { success: false, error: 'No tokens found' };
  } catch (error) {
    console.error('Error fetching multiple tokens:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Format price change with color indicator
 */
function formatPriceChange(change) {
  if (!change) return { value: '0.00', direction: 'neutral' };
  
  const value = parseFloat(change);
  return {
    value: Math.abs(value).toFixed(2),
    direction: value > 0 ? 'up' : value < 0 ? 'down' : 'neutral',
    raw: value
  };
}

/**
 * Format large numbers (volume, liquidity, etc.)
 */
function formatNumber(num) {
  if (!num) return '0';
  
  const absNum = Math.abs(num);
  
  if (absNum >= 1e9) {
    return (num / 1e9).toFixed(2) + 'B';
  } else if (absNum >= 1e6) {
    return (num / 1e6).toFixed(2) + 'M';
  } else if (absNum >= 1e3) {
    return (num / 1e3).toFixed(2) + 'K';
  }
  
  return num.toFixed(2);
}

/**
 * Get DexScreener chart URL for embedding
 */
function getChartUrl(chainId, pairAddress) {
  return `https://dexscreener.com/${chainId}/${pairAddress}`;
}

/**
 * Get DexScreener embed URL for charts
 */
function getEmbedUrl(chainId, pairAddress) {
  return `https://dexscreener.com/${chainId}/${pairAddress}?embed=1&theme=dark`;
}

module.exports = {
  getTokenPairs,
  getTokenPrice,
  searchTokens,
  getPairData,
  getLatestBoosts,
  getTopBoosts,
  getLatestProfiles,
  getTokenOrders,
  getMultipleTokens,
  formatPriceChange,
  formatNumber,
  getChartUrl,
  getEmbedUrl,
  RATE_LIMIT
};
