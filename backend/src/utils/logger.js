/**
 * Simple logger with timestamp and log level prefixes
 */
const logger = {
  info: (message) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [INFO] ${message}`);
  },

  warn: (message) => {
    const timestamp = new Date().toISOString();
    console.warn(`[${timestamp}] [WARN] ${message}`);
  },

  error: (message) => {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] [ERROR] ${message}`);
  }
};

module.exports = logger;
