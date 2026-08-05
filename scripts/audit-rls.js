require("dotenv").config();

const pool = require("../db/pool");
const {
  auditPublicApiSelectExposure,
  auditPublicTablesWithoutRls,
} = require("../db/rls");

const formatTable = (row) => `${row.schema_name}.${row.table_name}`;
const formatExposure = (row) => `${formatTable(row)} (${row.role_name})`;

(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set. Connect this script to the Supabase database first.");
  }

  const tables = await auditPublicTablesWithoutRls();
  const exposedTables = await auditPublicApiSelectExposure();

  if (!tables.length) {
    console.log("All public tables have Row Level Security enabled.");
  } else {
    console.log("Public tables without Row Level Security:");
    tables.forEach((table) => console.log(`- ${formatTable(table)}`));
  }

  if (!exposedTables.length) {
    console.log("No public table is visible through anon/authenticated SELECT grants.");
  } else {
    console.log("Public tables visible through anon/authenticated SELECT grants:");
    exposedTables.forEach((table) => console.log(`- ${formatExposure(table)}`));
  }

  if (tables.length || exposedTables.length) {
    process.exitCode = 1;
  }
})()
  .catch((error) => {
    console.error("RLS audit failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
