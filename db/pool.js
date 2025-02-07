const { Pool } = require("pg");

const pool = new Pool({
  connectionString: "postgresql://postgres.llvfkrypjgkukquysvsm:FAAqkazgy@1993@aws-0-us-west-1.pooler.supabase.com:5432/postgres",
  ssl: { rejectUnauthorized: false },
});

module.exports = pool;
