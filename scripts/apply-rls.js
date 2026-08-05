require("dotenv").config();

const pool = require("../db/pool");
const { applyRlsSecurity, auditPublicTablesWithoutRls } = require("../db/rls");

const formatTable = (row) => `${row.schema_name}.${row.table_name}`;

(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set. Connect this script to the Supabase database first.");
  }

  const before = await auditPublicTablesWithoutRls();
  if (before.length) {
    console.log("Public tables without Row Level Security before migration:");
    before.forEach((table) => console.log(`- ${formatTable(table)}`));
  } else {
    console.log("No public table was missing Row Level Security before migration.");
  }

  const after = await applyRlsSecurity();

  if (!after.length) {
    console.log("Row Level Security migration applied. All public tables are protected.");
    return;
  }

  console.log("Row Level Security migration applied, but these public tables still need policies/review:");
  after.forEach((table) => console.log(`- ${formatTable(table)}`));
  process.exitCode = 1;
})()
  .catch((error) => {
    console.error("RLS migration failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
