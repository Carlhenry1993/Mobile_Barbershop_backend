const { Pool } = require('pg');
require('dotenv').config(); // Load .env variables

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.connect()
  .then(() => console.log('Connexion réussie à PostgreSQL !'))
  .catch((err) => console.error('Erreur de connexion à PostgreSQL :', err));

module.exports = pool;
