/**
 * Migration: Make MEV Protection Optional
 * 
 * This migration changes the default value of mev_protection from TRUE to FALSE,
 * making it an optional feature that users can enable if they want.
 * 
 * MEV (Maximal Extractable Value) protection via Jito adds a small tip to transactions
 * to reduce front-running, but also adds a small cost. Making it optional lets users
 * decide if they want this protection.
 */

const { query } = require('../src/database/setup');

async function migrate() {
  console.log('🔄 Running migration: Make MEV Protection Optional');
  
  try {
    // Update existing sniper_configs to set mev_protection to false
    // Users can manually enable it if they want
    const result = await query(`
      UPDATE sniper_configs 
      SET mev_protection = FALSE,
          updated_at = NOW()
      WHERE mev_protection = TRUE
    `);
    
    console.log(`✅ Updated ${result.rowCount} configurations to disable MEV protection by default`);
    console.log('ℹ️  Users can now enable MEV protection manually in their settings');
    
    // Alter table default for future inserts
    await query(`
      ALTER TABLE sniper_configs 
      ALTER COLUMN mev_protection SET DEFAULT FALSE
    `);
    
    console.log('✅ Changed default value for new configurations');
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
