const { Pool } = require("pg");

console.log("DATABASE URL HOST:", new URL(process.env.DATABASE_URL).hostname);
console.log("DATABASE URL PORT:", new URL(process.env.DATABASE_URL).port);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

pool.query("SELECT NOW()")
  .then((result) => {
    console.log("✅ DATABASE CONNECTED:", result.rows[0]);
  })
  .catch((err) => {
    console.error("❌ DATABASE ERROR FULL:", err);
  });

module.exports = pool;