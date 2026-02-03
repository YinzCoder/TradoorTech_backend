/**
 * Input Validation Middleware
 */

/**
 * Validate required fields in request body
 */
function validateRequired(fields) {
  return (req, res, next) => {
    const missing = [];
    
    for (const field of fields) {
      if (!req.body[field]) {
        missing.push(field);
      }
    }
    
    if (missing.length > 0) {
      return res.status(400).json({
        error: 'Missing required fields',
        fields: missing
      });
    }
    
    next();
  };
}

/**
 * Validate Solana address format
 */
function validateSolanaAddress(field) {
  return (req, res, next) => {
    const address = req.body[field] || req.params[field];
    
    if (!address) {
      return res.status(400).json({
        error: `${field} is required`
      });
    }
    
    // Basic validation: 32-44 characters, base58
    if (address.length < 32 || address.length > 44) {
      return res.status(400).json({
        error: `Invalid Solana address: ${field}`
      });
    }
    
    next();
  };
}

/**
 * Validate numeric value
 */
function validateNumber(field, min, max) {
  return (req, res, next) => {
    const value = parseFloat(req.body[field]);
    
    if (isNaN(value)) {
      return res.status(400).json({
        error: `${field} must be a number`
      });
    }
    
    if (min !== undefined && value < min) {
      return res.status(400).json({
        error: `${field} must be at least ${min}`
      });
    }
    
    if (max !== undefined && value > max) {
      return res.status(400).json({
        error: `${field} must be at most ${max}`
      });
    }
    
    next();
  };
}

module.exports = {
  validateRequired,
  validateSolanaAddress,
  validateNumber
};
