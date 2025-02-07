require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // This should include ?sslmode=require
  ssl: { rejectUnauthorized: false },
  // Force IPv4 (if supported by the underlying connection code)
  family: 4,
});

pool.connect()
  .then(() => console.log("Connexion réussie à PostgreSQL !"))
  .catch((err) => console.error("Erreur de connexion à PostgreSQL :", err));

module.exports = pool;
