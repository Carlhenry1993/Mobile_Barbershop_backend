const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

pool.on("error", (err) => {
  console.error("❌ PostgreSQL Pool Error:", err.message);
});

async function testDatabase() {
  try {
    const result = await pool.query("SELECT NOW()");
    console.log("✅ DATABASE CONNECTED:", result.rows[0]);
  } catch (err) {
    console.error("❌ DATABASE ERROR FULL:", err);
  }
}

testDatabase();

module.exports = pool;