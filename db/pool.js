// db/pool.js
const { Pool } = require("pg");

const pool = new Pool({
  connectionString:
    "postgresql://postgres.dknknkrxlhvhouyvldvd:FAAqkazgy%401993@aws-1-us-east-1.pooler.supabase.com:6543/postgres",
  ssl: { rejectUnauthorized: false },
});

module.exports = pool;