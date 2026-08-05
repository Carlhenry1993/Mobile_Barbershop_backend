require("dotenv").config();

const pool = require("../db/pool");
const { auditPublicTablesWithoutRls } = require("../db/rls");

const formatTable = (row) => `${row.schema_name}.${row.table_name}`;

(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set. Connect this script to the Supabase database first.");
  }

  const tables = await auditPublicTablesWithoutRls();

  if (!tables.length) {
    console.log("All public tables have Row Level Security enabled.");
    return;
  }

  console.log("Public tables without Row Level Security:");
  tables.forEach((table) => console.log(`- ${formatTable(table)}`));
  process.exitCode = 1;
})()
  .catch((error) => {
    console.error("RLS audit failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
