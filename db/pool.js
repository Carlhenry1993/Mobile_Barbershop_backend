const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
});

pool.query("SELECT NOW()")
  .then((result) => {
    console.log("✅ DATABASE CONNECTED:", result.rows[0]);
  })
  .catch((err) => {
    console.error("❌ DATABASE ERROR:", err.message);
  });

module.exports = pool;