const fs = require('fs');
const path = require('path');
const { query } = require('../src/config/database');

const migrationsDir = path.join(__dirname, 'migrations');

const runMigrations = async () => {
  try {
    // Read all migration files
    const files = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort(); // Sort to ensure migrations run in order

    console.log(`Found ${files.length} migration files`);

    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      console.log(`Running migration: ${file}`);

      try {
        await query(sql);
        console.log(`✓ Migration ${file} completed successfully`);
      } catch (error) {
        console.error(`✗ Migration ${file} failed:`, error.message);
        throw error;
      }
    }

    console.log('All migrations completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  }
};

runMigrations();
