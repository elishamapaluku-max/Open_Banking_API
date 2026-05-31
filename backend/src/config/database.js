const { Pool } = require('pg');
const { DATABASE_URL, NODE_ENV } = require('./env');

const pool = new Pool({
  connectionString: DATABASE_URL
});

// Query helper function
const query = async (text, params) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', { text, duration, rows: result.rowCount });
    return result;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
};

// Get client for transactions
const getClient = async () => {
  const client = await pool.connect();
  return client;
};

// Pool error event handler
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  if (NODE_ENV === 'production') {
    process.exit(-1);
  }
});

// Test connection on startup
const testConnection = async () => {
  try {
    const result = await pool.query('SELECT NOW()');
    console.log('Database connection successful:', result.rows[0]);
  } catch (error) {
    console.error('Database connection failed:', error.message);
    if (NODE_ENV === 'production') {
      process.exit(1);
    } else {
      console.warn('Continuing without database connection in development mode');
    }
  }
};

testConnection();

module.exports = {
  pool,
  query,
  getClient
};
