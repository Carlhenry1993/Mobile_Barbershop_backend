require("dotenv").config();

const pool = require("../db/pool");
const {
  applyRlsSecurity,
  auditPublicApiSelectExposure,
  auditPublicTablesWithoutRls,
} = require("../db/rls");

const formatTable = (row) => `${row.schema_name}.${row.table_name}`;
const formatExposure = (row) => `${formatTable(row)} (${row.role_name})`;

(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set. Connect this script to the Supabase database first.");
  }

  const before = await auditPublicTablesWithoutRls();
  const exposedBefore = await auditPublicApiSelectExposure();
  if (before.length) {
    console.log("Public tables without Row Level Security before migration:");
    before.forEach((table) => console.log(`- ${formatTable(table)}`));
  } else {
    console.log("No public table was missing Row Level Security before migration.");
  }
  if (exposedBefore.length) {
    console.log("Public tables visible through anon/authenticated SELECT before migration:");
    exposedBefore.forEach((table) => console.log(`- ${formatExposure(table)}`));
  } else {
    console.log("No public table was visible through anon/authenticated SELECT before migration.");
  }

  const after = await applyRlsSecurity();
  const exposedAfter = await auditPublicApiSelectExposure();

  if (!after.length && !exposedAfter.length) {
    console.log("Row Level Security migration applied. Public GraphQL/Data API grants are closed.");
    return;
  }

  if (after.length) {
    console.log("Row Level Security migration applied, but these public tables still need RLS:");
    after.forEach((table) => console.log(`- ${formatTable(table)}`));
  }
  if (exposedAfter.length) {
    console.log("These public tables are still visible through anon/authenticated SELECT grants:");
    exposedAfter.forEach((table) => console.log(`- ${formatExposure(table)}`));
  }
  process.exitCode = 1;
})()
  .catch((error) => {
    console.error("RLS migration failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
