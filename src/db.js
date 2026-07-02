require('dotenv').config();
const { Pool, types } = require('pg');

// Faz campos DATE voltarem como "YYYY-MM-DD" em vez de objeto Date.
types.setTypeParser(1082, (value) => value);

const useSsl = String(process.env.DB_SSL || 'true').toLowerCase() !== 'false';

if (!process.env.DATABASE_URL) {
  console.warn('AVISO: DATABASE_URL não configurada no .env');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
});

async function query(sql, params = []) {
  return pool.query(sql, params);
}

async function get(sql, params = []) {
  const result = await query(sql, params);
  return result.rows[0] || null;
}

async function all(sql, params = []) {
  const result = await query(sql, params);
  return result.rows;
}

module.exports = { pool, query, get, all };
