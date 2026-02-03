/**
 * Migration: Add Transaction Speed Controls
 * 
 * Adds fields for:
 * - transaction_speed (standard/fast/ultra)
 * - jito_tip_lamports (configurable Jito tips)
 * - priority_fee_lamports (priority fee amount)
 * - compute_unit_price_micro_lamports (CU price)
 * - compute_unit_limit (CU limit)
 * - use_private_rpc (private RPC toggle)
 */

const { query } = require('../src/database/setup');

async function migrate() {
  console.log('🔄 Running migration: Add Transaction Speed Controls');
  
  try {
    // Check if columns already exist
    const checkResult = await query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'sniper_configs' 
      AND column_name = 'transaction_speed'
    `);
    
    if (checkResult.rows.length > 0) {
      console.log('⚠️  Speed columns already exist, skipping migration');
      return;
    }
    
    // Add new columns
    await query(`
      ALTER TABLE sniper_configs
      ADD COLUMN IF NOT EXISTS transaction_speed VARCHAR(20) DEFAULT 'standard' 
        CHECK (transaction_speed IN ('standard', 'fast', 'ultra')),
      ADD COLUMN IF NOT EXISTS jito_tip_lamports BIGINT DEFAULT 10000,
      ADD COLUMN IF NOT EXISTS priority_fee_lamports BIGINT DEFAULT 1000,
      ADD COLUMN IF NOT EXISTS compute_unit_price_micro_lamports BIGINT DEFAULT 1000,
      ADD COLUMN IF NOT EXISTS compute_unit_limit INTEGER DEFAULT 200000,
      ADD COLUMN IF NOT EXISTS use_private_rpc BOOLEAN DEFAULT FALSE
    `);
    
    console.log('✅ Added transaction speed columns');
    
    // Update existing configs with default values based on their current MEV protection setting
    await query(`
      UPDATE sniper_configs
      SET 
        transaction_speed = CASE 
          WHEN mev_protection = TRUE THEN 'fast'
          ELSE 'standard'
        END,
        jito_tip_lamports = 10000,
        priority_fee_lamports = 1000,
        compute_unit_price_micro_lamports = CASE
          WHEN mev_protection = TRUE THEN 10000
          ELSE 1000
        END,
        compute_unit_limit = 200000,
        use_private_rpc = FALSE,
        updated_at = NOW()
      WHERE transaction_speed IS NULL
    `);
    
    console.log('✅ Updated existing configurations with speed defaults');
    console.log('ℹ️  Users with MEV protection got "fast" mode, others got "standard"');
    console.log('');
    console.log('📊 Speed Modes Available:');
    console.log('  - STANDARD: Low cost, normal speed (1,000 micro-lamports)');
    console.log('  - FAST: High priority, moderate cost (10,000 micro-lamports)');
    console.log('  - ULTRA: Maximum speed, highest cost (50,000+ micro-lamports)');
    console.log('');
    console.log('✅ Migration completed successfully');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

// Run migration if called directly
if (require.main === module) {
  migrate()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { migrate };
