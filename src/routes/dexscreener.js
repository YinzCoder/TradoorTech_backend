const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const {
  getTokenPrice,
  searchTokens,
  getTokenPairs,
  getPairData,
  getLatestBoosts,
  getTopBoosts,
  getLatestProfiles,
  getMultipleTokens,
  getChartUrl,
  getEmbedUrl
} = require('../services/dexscreener');

/**
 * Get token price and data
 * GET /api/dexscreener/token/:chainId/:address
 */
router.get('/token/:chainId/:address', authenticate, async (req, res) => {
  try {
    const { chainId, address } = req.params;
    
    const result = await getTokenPrice(chainId, address);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(404).json({ error: result.error });
    }
  } catch (error) {
    console.error('Error in token price endpoint:', error);
    res.status(500).json({ error: 'Failed to fetch token data' });
  }
});

/**
 * Search for tokens
 * GET /api/dexscreener/search?q=BONK
 */
router.get('/search', authenticate, async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }
    
    const result = await searchTokens(q);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(404).json({ error: result.error });
    }
  } catch (error) {
    console.error('Error in search endpoint:', error);
    res.status(500).json({ error: 'Failed to search tokens' });
  }
});

/**
 * Get token pairs
 * GET /api/dexscreener/pairs/:chainId/:address
 */
router.get('/pairs/:chainId/:address', authenticate, async (req, res) => {
  try {
    const { chainId, address } = req.params;
    
    const result = await getTokenPairs(chainId, address);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(404).json({ error: result.error });
    }
  } catch (error) {
    console.error('Error in pairs endpoint:', error);
    res.status(500).json({ error: 'Failed to fetch pairs' });
  }
});

/**
 * Get specific pair data
 * GET /api/dexscreener/pair/:chainId/:pairAddress
 */
router.get('/pair/:chainId/:pairAddress', authenticate, async (req, res) => {
  try {
    const { chainId, pairAddress } = req.params;
    
    const result = await getPairData(chainId, pairAddress);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(404).json({ error: result.error });
    }
  } catch (error) {
    console.error('Error in pair endpoint:', error);
    res.status(500).json({ error: 'Failed to fetch pair data' });
  }
});

/**
 * Get multiple tokens at once
 * POST /api/dexscreener/tokens/batch
 * Body: { chainId: 'solana', addresses: ['addr1', 'addr2'] }
 */
router.post('/tokens/batch', authenticate, async (req, res) => {
  try {
    const { chainId, addresses } = req.body;
    
    if (!chainId || !addresses || !Array.isArray(addresses)) {
      return res.status(400).json({ 
        error: 'chainId and addresses array are required' 
      });
    }
    
    const result = await getMultipleTokens(chainId, addresses);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(404).json({ error: result.error });
    }
  } catch (error) {
    console.error('Error in batch tokens endpoint:', error);
    res.status(500).json({ error: 'Failed to fetch tokens' });
  }
});

/**
 * Get latest token boosts
 * GET /api/dexscreener/boosts/latest
 */
router.get('/boosts/latest', authenticate, async (req, res) => {
  try {
    const result = await getLatestBoosts();
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error('Error in boosts endpoint:', error);
    res.status(500).json({ error: 'Failed to fetch boosts' });
  }
});

/**
 * Get top boosted tokens
 * GET /api/dexscreener/boosts/top
 */
router.get('/boosts/top', authenticate, async (req, res) => {
  try {
    const result = await getTopBoosts();
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error('Error in top boosts endpoint:', error);
    res.status(500).json({ error: 'Failed to fetch top boosts' });
  }
});

/**
 * Get latest token profiles
 * GET /api/dexscreener/profiles/latest
 */
router.get('/profiles/latest', authenticate, async (req, res) => {
  try {
    const result = await getLatestProfiles();
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error('Error in profiles endpoint:', error);
    res.status(500).json({ error: 'Failed to fetch profiles' });
  }
});

/**
 * Get chart URL for a token
 * GET /api/dexscreener/chart-url/:chainId/:pairAddress
 */
router.get('/chart-url/:chainId/:pairAddress', authenticate, (req, res) => {
  try {
    const { chainId, pairAddress } = req.params;
    const { embed } = req.query;
    
    const url = embed === 'true' 
      ? getEmbedUrl(chainId, pairAddress)
      : getChartUrl(chainId, pairAddress);
    
    res.json({ url, chainId, pairAddress });
  } catch (error) {
    console.error('Error generating chart URL:', error);
    res.status(500).json({ error: 'Failed to generate chart URL' });
  }
});

/**
 * Get portfolio value (for user's holdings)
 * POST /api/dexscreener/portfolio-value
 * Body: { tokens: [{ address: 'xxx', amount: 1000 }] }
 */
router.post('/portfolio-value', authenticate, async (req, res) => {
  try {
    const { tokens, chainId = 'solana' } = req.body;
    
    if (!tokens || !Array.isArray(tokens)) {
      return res.status(400).json({ error: 'tokens array is required' });
    }
    
    // Get prices for all tokens
    const addresses = tokens.map(t => t.address);
    const priceData = await getMultipleTokens(chainId, addresses);
    
    if (!priceData.success) {
      return res.status(500).json({ error: 'Failed to fetch prices' });
    }
    
    // Calculate portfolio value
    let totalValue = 0;
    const holdings = tokens.map(holding => {
      const tokenData = priceData.tokens.find(
        t => t.baseToken?.address === holding.address
      );
      
      const price = parseFloat(tokenData?.priceUsd || 0);
      const value = price * holding.amount;
      totalValue += value;
      
      return {
        address: holding.address,
        symbol: tokenData?.baseToken?.symbol || 'UNKNOWN',
        amount: holding.amount,
        priceUsd: price,
        valueUsd: value,
        priceChange24h: tokenData?.priceChange?.h24 || 0
      };
    });
    
    res.json({
      success: true,
      totalValueUsd: totalValue,
      holdings,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error calculating portfolio value:', error);
    res.status(500).json({ error: 'Failed to calculate portfolio value' });
  }
});

module.exports = router;
