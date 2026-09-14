const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

// TEST DATABASE CONNECTION
pool.query("SELECT NOW()")
  .then(() => console.log("✅ DATABASE CONNECTED"))
  .catch(err => console.error("❌ DATABASE ERROR:", err.message));

module.exports = pool;