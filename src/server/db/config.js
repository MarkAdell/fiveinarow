import { neon } from "@neondatabase/serverless";
import pg from "pg";
const { Pool } = pg;
import dotenv from "dotenv";

dotenv.config();

const DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://localhost:5432/fiveinrow";

function createSafeQueryExecutor(queryFn) {
  return async (...args) => {
    try {
      return { result: await queryFn(...args), success: true };
    } catch (error) {
      return { result: [], success: false, error: error.message };
    }
  };
}

export const sql = createSafeQueryExecutor(neon(DATABASE_URL));

export const pool = new Pool({ connectionString: DATABASE_URL });

pool.on("error", (err) => {
  console.error("neon connection pool error:", err);
});

export async function testConnection() {
  try {
    const result = await sql`SELECT NOW()`;
    if (!result.success) {
      throw new Error("Failed to test connection");
    }
    console.log("Database connection successful");
  } catch (error) {
    console.error("Database connection failed:", error.message);
  }
}

process.on("SIGINT", async () => {
  try {
    await pool.end();
    console.log("Database pool has ended");
  } catch (error) {
    console.error("Error closing pool:", error.message);
  }
  process.exit(0);
});
