const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? {
    rejectUnauthorized: false
  } : false
});

async function setupDatabase() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE,
        privy_user_id VARCHAR(255) UNIQUE,
        created_at TIMESTAMP DEFAULT NOW(),
        last_login TIMESTAMP,
        is_premium BOOLEAN DEFAULT FALSE,
        subscription_ends_at TIMESTAMP,
        total_trades INTEGER DEFAULT 0,
        total_volume_sol DECIMAL(20, 9) DEFAULT 0,
        total_profit_sol DECIMAL(20, 9) DEFAULT 0
      )
    `);

    // Wallets table
    await client.query(`
      CREATE TABLE IF NOT EXISTS wallets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        public_key VARCHAR(44) UNIQUE NOT NULL,
        encrypted_private_key TEXT NOT NULL,
        wallet_name VARCHAR(100) DEFAULT 'Main Wallet',
        is_primary BOOLEAN DEFAULT TRUE,
        balance_sol DECIMAL(20, 9) DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        last_used_at TIMESTAMP
      )
    `);

    // Sniper configurations table
    await client.query(`
      CREATE TABLE IF NOT EXISTS sniper_configs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        wallet_id UUID REFERENCES wallets(id) ON DELETE CASCADE,
        is_active BOOLEAN DEFAULT TRUE,
        auto_snipe_enabled BOOLEAN DEFAULT FALSE,
        min_liquidity_sol DECIMAL(10, 2) DEFAULT 5,
        max_buy_amount_sol DECIMAL(10, 2) DEFAULT 1,
        slippage_bps INTEGER DEFAULT 500,
        take_profit_percentage DECIMAL(5, 2) DEFAULT 100,
        stop_loss_percentage DECIMAL(5, 2) DEFAULT 50,
        rug_check_enabled BOOLEAN DEFAULT TRUE,
        mev_protection BOOLEAN DEFAULT FALSE,
        transaction_speed VARCHAR(20) DEFAULT 'standard' CHECK (transaction_speed IN ('standard', 'fast', 'ultra')),
        jito_tip_lamports BIGINT DEFAULT 10000,
        priority_fee_lamports BIGINT DEFAULT 1000,
        compute_unit_price_micro_lamports BIGINT DEFAULT 1000,
        compute_unit_limit INTEGER DEFAULT 200000,
        use_private_rpc BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Tracked tokens table
    await client.query(`
      CREATE TABLE IF NOT EXISTS tracked_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        token_address VARCHAR(44) NOT NULL,
        token_symbol VARCHAR(20),
        token_name VARCHAR(100),
        initial_price_sol DECIMAL(20, 9),
        current_price_sol DECIMAL(20, 9),
        liquidity_sol DECIMAL(20, 9),
        market_cap_sol DECIMAL(20, 9),
        is_rug_detected BOOLEAN DEFAULT FALSE,
        rug_risk_score INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, token_address)
      )
    `);

    // Trades table
    await client.query(`
      CREATE TABLE IF NOT EXISTS trades (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        wallet_id UUID REFERENCES wallets(id) ON DELETE CASCADE,
        token_address VARCHAR(44) NOT NULL,
        trade_type VARCHAR(10) NOT NULL CHECK (trade_type IN ('BUY', 'SELL')),
        amount_sol DECIMAL(20, 9) NOT NULL,
        amount_tokens DECIMAL(30, 9),
        price_per_token_sol DECIMAL(20, 9),
        transaction_signature VARCHAR(88) UNIQUE,
        transaction_fee_sol DECIMAL(20, 9),
        platform_fee_sol DECIMAL(20, 9),
        slippage_bps INTEGER,
        status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED', 'CANCELLED')),
        error_message TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        confirmed_at TIMESTAMP
      )
    `);

    // Positions table (for tracking open positions with TP/SL)
    await client.query(`
      CREATE TABLE IF NOT EXISTS positions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        wallet_id UUID REFERENCES wallets(id) ON DELETE CASCADE,
        token_address VARCHAR(44) NOT NULL,
        entry_price DECIMAL(20, 10) NOT NULL,
        exit_price DECIMAL(20, 10),
        amount DECIMAL(30, 9) NOT NULL,
        amount_sol DECIMAL(20, 9) NOT NULL,
        take_profit_percent DECIMAL(10, 2),
        stop_loss_percent DECIMAL(10, 2),
        status VARCHAR(20) DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED', 'LIQUIDATED')),
        close_reason VARCHAR(30) CHECK (close_reason IN ('MANUAL', 'TAKE_PROFIT', 'STOP_LOSS', 'LIQUIDATION')),
        pnl_percent DECIMAL(10, 2),
        pnl_sol DECIMAL(20, 9),
        entry_trade_id UUID REFERENCES trades(id),
        exit_trade_id UUID REFERENCES trades(id),
        created_at TIMESTAMP DEFAULT NOW(),
        entry_date TIMESTAMP DEFAULT NOW(),
        exit_date TIMESTAMP,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Copy trading configurations
    await client.query(`
      CREATE TABLE IF NOT EXISTS copy_trade_configs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        wallet_id UUID REFERENCES wallets(id) ON DELETE CASCADE,
        target_wallet_address VARCHAR(44) NOT NULL,
        target_wallet_name VARCHAR(100),
        is_active BOOLEAN DEFAULT TRUE,
        copy_percentage DECIMAL(5, 2) DEFAULT 100,
        max_copy_amount_sol DECIMAL(10, 2) DEFAULT 0.5,
        copy_buys BOOLEAN DEFAULT TRUE,
        copy_sells BOOLEAN DEFAULT TRUE,
        delay_ms INTEGER DEFAULT 500,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, target_wallet_address)
      )
    `);

    // Whale wallets (for tracking)
    await client.query(`
      CREATE TABLE IF NOT EXISTS whale_wallets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        wallet_address VARCHAR(44) UNIQUE NOT NULL,
        wallet_name VARCHAR(100),
        total_trades INTEGER DEFAULT 0,
        win_rate DECIMAL(5, 2) DEFAULT 0,
        total_profit_sol DECIMAL(20, 9) DEFAULT 0,
        followers_count INTEGER DEFAULT 0,
        is_verified BOOLEAN DEFAULT FALSE,
        last_active_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Pump.fun launches (real-time monitoring)
    await client.query(`
      CREATE TABLE IF NOT EXISTS pumpfun_launches (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        token_address VARCHAR(44) UNIQUE NOT NULL,
        token_symbol VARCHAR(20),
        token_name VARCHAR(100),
        creator_address VARCHAR(44),
        initial_liquidity_sol DECIMAL(20, 9),
        launch_timestamp TIMESTAMP NOT NULL,
        graduated_to_raydium BOOLEAN DEFAULT FALSE,
        graduation_timestamp TIMESTAMP,
        is_rug BOOLEAN DEFAULT FALSE,
        rug_detected_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Platform analytics
    await client.query(`
      CREATE TABLE IF NOT EXISTS platform_analytics (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        date DATE NOT NULL,
        total_users INTEGER DEFAULT 0,
        active_users INTEGER DEFAULT 0,
        total_trades INTEGER DEFAULT 0,
        total_volume_sol DECIMAL(20, 9) DEFAULT 0,
        total_fees_collected_sol DECIMAL(20, 9) DEFAULT 0,
        successful_snipes INTEGER DEFAULT 0,
        failed_snipes INTEGER DEFAULT 0,
        rug_pulls_detected INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(date)
      )
    `);

    // Create indexes for performance
    await client.query('CREATE INDEX IF NOT EXISTS idx_users_privy ON users(privy_user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_wallets_user ON wallets(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_trades_user ON trades(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_trades_signature ON trades(transaction_signature)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_tracked_tokens_user ON tracked_tokens(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_pumpfun_launches_timestamp ON pumpfun_launches(launch_timestamp DESC)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_copy_configs_user ON copy_trade_configs(user_id)');
    
    await client.query('COMMIT');
    console.log('✅ Database schema created successfully');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Database setup failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Database helper functions
async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  
  if (duration > 1000) {
    console.warn('Slow query detected:', { text, duration });
  }
  
  return res;
}

async function getClient() {
  return await pool.connect();
}

module.exports = {
  setupDatabase,
  query,
  getClient,
  pool
};
