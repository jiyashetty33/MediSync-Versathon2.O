const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'medisync_db',
  waitForConnections: true,
  connectionLimit: 15,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  dateStrings: true
});

/**
 * Executes a parameterized SQL query using the connection pool.
 * @param {string} sql - Parameterized SQL string with '?' placeholders
 * @param {Array} params - Array of parameter values
 * @returns {Promise<Array>} - Query results
 */
async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

/**
 * Executes operations within an atomic MySQL transaction.
 * Automatically manages beginTransaction, commit, and rollback.
 * @param {Function} callback - Async function receiving the dedicated connection: async (conn) => { ... }
 * @returns {Promise<any>} - Result returned by the callback
 */
async function withTransaction(callback) {
  const conn = await pool.getConnection();
  const client = {
    async query(sql, params = []) {
      const [rows] = await conn.query(sql, params);
      return rows;
    }
  };
  try {
    await conn.beginTransaction();
    const result = await callback(client);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = {
  pool,
  query,
  withTransaction
};
