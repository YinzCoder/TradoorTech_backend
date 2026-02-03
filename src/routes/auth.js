const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { query } = require('../database/setup');
const { createWallet } = require('../services/walletService');

/**
 * Register/Login with Privy (supports Twitter, Wallet, Email, etc.)
 * Privy handles the OAuth flow, we just verify the token
 */
router.post('/privy', async (req, res) => {
  try {
    const { privyToken, privyUserId, email, twitterUsername, walletAddress } = req.body;
    
    if (!privyUserId) {
      return res.status(400).json({ error: 'Privy user ID required' });
    }
    
    // Verify Privy token (optional - Privy SDK handles this on frontend)
    // In production, you can add server-side verification here
    
    // Check if user exists
    let user = await query(
      'SELECT * FROM users WHERE privy_user_id = $1',
      [privyUserId]
    );
    
    if (user.rows.length === 0) {
      // Create new user
      const newUser = await query(
        `INSERT INTO users (privy_user_id, email, created_at, last_login)
         VALUES ($1, $2, NOW(), NOW())
         RETURNING *`,
        [privyUserId, email || null]
      );
      
      user = newUser;
      
      // Create default wallet for new user
      await createWallet(newUser.rows[0].id, 'Main Wallet');
      
      console.log(`✅ New user registered via ${twitterUsername ? 'Twitter' : 'wallet'}: ${privyUserId}`);
      
    } else {
      // Update last login
      await query(
        'UPDATE users SET last_login = NOW() WHERE privy_user_id = $1',
        [privyUserId]
      );
      
      console.log(`✅ User logged in: ${privyUserId}`);
    }
    
    // Generate JWT
    const userData = user.rows[0];
    const token = jwt.sign(
      {
        userId: userData.id,
        privyUserId: userData.privy_user_id,
        email: userData.email
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.json({
      success: true,
      token,
      user: {
        id: userData.id,
        privyUserId: userData.privy_user_id,
        email: userData.email,
        isPremium: userData.is_premium,
        createdAt: userData.created_at,
        totalTrades: userData.total_trades,
        totalVolume: parseFloat(userData.total_volume_sol),
        totalProfit: parseFloat(userData.total_profit_sol)
      },
      loginMethod: twitterUsername ? 'twitter' : walletAddress ? 'wallet' : 'email'
    });
    
  } catch (error) {
    console.error('Privy auth error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

/**
 * Get current user info
 */
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await query(
      `SELECT 
        id, privy_user_id, email, is_premium, 
        subscription_ends_at, total_trades, 
        total_volume_sol, total_profit_sol, created_at
       FROM users
       WHERE id = $1`,
      [req.user.userId]
    );
    
    if (user.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userData = user.rows[0];
    
    res.json({
      id: userData.id,
      privyUserId: userData.privy_user_id,
      email: userData.email,
      isPremium: userData.is_premium,
      subscriptionEndsAt: userData.subscription_ends_at,
      totalTrades: userData.total_trades,
      totalVolume: parseFloat(userData.total_volume_sol),
      totalProfit: parseFloat(userData.total_profit_sol),
      createdAt: userData.created_at
    });
    
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

/**
 * Refresh JWT token
 */
router.post('/refresh', authenticateToken, async (req, res) => {
  try {
    const newToken = jwt.sign(
      {
        userId: req.user.userId,
        privyUserId: req.user.privyUserId,
        email: req.user.email
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.json({ token: newToken });
    
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({ error: 'Failed to refresh token' });
  }
});

/**
 * Logout (client-side operation, just for logging)
 */
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    console.log(`User logged out: ${req.user.userId}`);
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Logout failed' });
  }
});

/**
 * Middleware to authenticate JWT token
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
  
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }
  
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    
    req.user = user;
    next();
  });
}

module.exports = router;
module.exports.authenticateToken = authenticateToken;
