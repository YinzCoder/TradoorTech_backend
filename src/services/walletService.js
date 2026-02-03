const { Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');
const crypto = require('crypto');
const { query } = require('../database/setup');

const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const ENCRYPTION_KEY = Buffer.from(
  process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex'),
  'hex'
).slice(0, 32);

/**
 * Encrypt private key
 */
function encryptPrivateKey(privateKey) {
  try {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, ENCRYPTION_KEY, iv);
    
    let encrypted = cipher.update(privateKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return {
      encrypted: encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    };
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt private key');
  }
}

/**
 * Decrypt private key
 */
function decryptPrivateKey(encryptedData) {
  try {
    const { encrypted, iv, authTag } = typeof encryptedData === 'string' 
      ? JSON.parse(encryptedData) 
      : encryptedData;
    
    const decipher = crypto.createDecipheriv(
      ENCRYPTION_ALGORITHM,
      ENCRYPTION_KEY,
      Buffer.from(iv, 'hex')
    );
    
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt private key');
  }
}

/**
 * Create new Solana wallet
 */
async function createWallet(userId, walletName = 'Main Wallet') {
  try {
    // Generate new keypair
    const keypair = Keypair.generate();
    const publicKey = keypair.publicKey.toString();
    const privateKey = bs58.encode(keypair.secretKey);
    
    // Encrypt private key
    const encryptedData = encryptPrivateKey(privateKey);
    
    // Store in database
    const result = await query(
      `INSERT INTO wallets (user_id, public_key, encrypted_private_key, wallet_name)
       VALUES ($1, $2, $3, $4)
       RETURNING id, public_key, wallet_name, created_at`,
      [userId, publicKey, JSON.stringify(encryptedData), walletName]
    );
    
    return {
      ...result.rows[0],
      privateKey // Return private key only once for user to backup
    };
  } catch (error) {
    console.error('Error creating wallet:', error);
    throw error;
  }
}

/**
 * Import existing wallet
 */
async function importWallet(userId, privateKey, walletName = 'Imported Wallet') {
  try {
    // Validate private key format
    let keypair;
    try {
      const secretKey = bs58.decode(privateKey);
      keypair = Keypair.fromSecretKey(secretKey);
    } catch {
      throw new Error('Invalid private key format');
    }
    
    const publicKey = keypair.publicKey.toString();
    
    // Check if wallet already exists
    const existing = await query(
      'SELECT id FROM wallets WHERE public_key = $1',
      [publicKey]
    );
    
    if (existing.rows.length > 0) {
      throw new Error('Wallet already imported');
    }
    
    // Encrypt private key
    const encryptedData = encryptPrivateKey(privateKey);
    
    // Store in database
    const result = await query(
      `INSERT INTO wallets (user_id, public_key, encrypted_private_key, wallet_name, is_primary)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, public_key, wallet_name, created_at`,
      [userId, publicKey, JSON.stringify(encryptedData), walletName, false]
    );
    
    return result.rows[0];
  } catch (error) {
    console.error('Error importing wallet:', error);
    throw error;
  }
}

/**
 * Get user's wallets
 */
async function getUserWallets(userId) {
  try {
    const result = await query(
      `SELECT id, public_key, wallet_name, is_primary, balance_sol, created_at, last_used_at
       FROM wallets
       WHERE user_id = $1
       ORDER BY is_primary DESC, created_at DESC`,
      [userId]
    );
    
    return result.rows;
  } catch (error) {
    console.error('Error getting user wallets:', error);
    throw error;
  }
}

/**
 * Get wallet keypair (for signing transactions)
 */
async function getWalletKeypair(walletId, userId) {
  try {
    const result = await query(
      'SELECT encrypted_private_key FROM wallets WHERE id = $1 AND user_id = $2',
      [walletId, userId]
    );
    
    if (result.rows.length === 0) {
      throw new Error('Wallet not found');
    }
    
    const privateKey = decryptPrivateKey(result.rows[0].encrypted_private_key);
    const secretKey = bs58.decode(privateKey);
    
    return Keypair.fromSecretKey(secretKey);
  } catch (error) {
    console.error('Error getting wallet keypair:', error);
    throw error;
  }
}

/**
 * Export private key (requires authentication)
 */
async function exportPrivateKey(walletId, userId) {
  try {
    const result = await query(
      'SELECT encrypted_private_key, public_key FROM wallets WHERE id = $1 AND user_id = $2',
      [walletId, userId]
    );
    
    if (result.rows.length === 0) {
      throw new Error('Wallet not found');
    }
    
    const privateKey = decryptPrivateKey(result.rows[0].encrypted_private_key);
    
    // Update last used timestamp
    await query(
      'UPDATE wallets SET last_used_at = NOW() WHERE id = $1',
      [walletId]
    );
    
    return {
      publicKey: result.rows[0].public_key,
      privateKey: privateKey
    };
  } catch (error) {
    console.error('Error exporting private key:', error);
    throw error;
  }
}

/**
 * Update wallet balance
 */
async function updateWalletBalance(walletId, balanceSol) {
  try {
    await query(
      'UPDATE wallets SET balance_sol = $1 WHERE id = $2',
      [balanceSol, walletId]
    );
  } catch (error) {
    console.error('Error updating wallet balance:', error);
    throw error;
  }
}

/**
 * Set primary wallet
 */
async function setPrimaryWallet(walletId, userId) {
  try {
    // Remove primary flag from all user's wallets
    await query(
      'UPDATE wallets SET is_primary = FALSE WHERE user_id = $1',
      [userId]
    );
    
    // Set new primary wallet
    await query(
      'UPDATE wallets SET is_primary = TRUE WHERE id = $1 AND user_id = $2',
      [walletId, userId]
    );
  } catch (error) {
    console.error('Error setting primary wallet:', error);
    throw error;
  }
}

/**
 * Delete wallet
 */
async function deleteWallet(walletId, userId) {
  try {
    // Don't allow deleting primary wallet if it's the only wallet
    const wallets = await getUserWallets(userId);
    
    if (wallets.length === 1) {
      throw new Error('Cannot delete your only wallet');
    }
    
    const result = await query(
      'DELETE FROM wallets WHERE id = $1 AND user_id = $2 RETURNING id',
      [walletId, userId]
    );
    
    if (result.rows.length === 0) {
      throw new Error('Wallet not found');
    }
    
    // If deleted wallet was primary, set another as primary
    const deletedWallet = wallets.find(w => w.id === walletId);
    if (deletedWallet && deletedWallet.is_primary) {
      const nextWallet = wallets.find(w => w.id !== walletId);
      if (nextWallet) {
        await setPrimaryWallet(nextWallet.id, userId);
      }
    }
  } catch (error) {
    console.error('Error deleting wallet:', error);
    throw error;
  }
}

/**
 * Validate wallet ownership
 */
async function validateWalletOwnership(walletId, userId) {
  try {
    const result = await query(
      'SELECT id FROM wallets WHERE id = $1 AND user_id = $2',
      [walletId, userId]
    );
    
    return result.rows.length > 0;
  } catch (error) {
    console.error('Error validating wallet ownership:', error);
    return false;
  }
}

module.exports = {
  createWallet,
  importWallet,
  getUserWallets,
  getWalletKeypair,
  exportPrivateKey,
  updateWalletBalance,
  setPrimaryWallet,
  deleteWallet,
  validateWalletOwnership,
  encryptPrivateKey,
  decryptPrivateKey
};
