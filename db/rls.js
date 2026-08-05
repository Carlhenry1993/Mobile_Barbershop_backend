const fs = require("fs");
const path = require("path");

const pool = require("./pool");

const migrationPath = path.join(
  __dirname,
  "..",
  "migrations",
  "20260805_enable_rls_for_public_tables.sql"
);

let cachedMigrationSql;

const getRlsMigrationSql = () => {
  if (!cachedMigrationSql) {
    cachedMigrationSql = fs.readFileSync(migrationPath, "utf8");
  }

  return cachedMigrationSql;
};

const auditPublicTablesWithoutRls = async () => {
  const result = await pool.query(`
    SELECT n.nspname AS schema_name, c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND c.relrowsecurity = false
    ORDER BY c.relname
  `);

  return result.rows;
};

const auditPublicApiSelectExposure = async (roles = ["anon", "authenticated"]) => {
  const result = await pool.query(
    `
      SELECT n.nspname AS schema_name, c.relname AS table_name, r.rolname AS role_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_roles r ON r.rolname = ANY($1::text[])
      WHERE n.nspname = 'public'
        AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
        AND has_table_privilege(r.rolname, c.oid, 'SELECT')
      ORDER BY c.relname, r.rolname
    `,
    [roles]
  );

  return result.rows;
};

const applyRlsSecurity = async () => {
  await pool.query(getRlsMigrationSql());
  return auditPublicTablesWithoutRls();
};

module.exports = {
  applyRlsSecurity,
  auditPublicApiSelectExposure,
  auditPublicTablesWithoutRls,
  getRlsMigrationSql,
};
