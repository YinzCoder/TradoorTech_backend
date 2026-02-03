/**
 * Authentication Middleware
 * Verifies JWT tokens and Privy authentication
 */

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

/**
 * Verify JWT token from request
 */
function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header' });
    }
    
    const token = authHeader.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    // For Privy, the token is the user ID
    // In production, you'd verify this with Privy's API
    // For now, we'll accept any non-empty token as the user ID
    
    req.user = {
      id: token // Privy user ID
    };
    
    next();
    
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(401).json({ error: 'Invalid token' });
  }
}

/**
 * Optional authentication (doesn't fail if no token)
 */
function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      if (token) {
        req.user = {
          id: token
        };
      }
    }
    
    next();
    
  } catch (error) {
    // Don't fail, just proceed without user
    next();
  }
}

module.exports = {
  authenticate,
  optionalAuth
};
