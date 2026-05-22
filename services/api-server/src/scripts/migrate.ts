import dotenv from "dotenv";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, "../../migrations");

function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (process.env.NODE_ENV === "production" || process.env.APP_ENV === "production") {
    throw new Error("DATABASE_URL is required in production");
  }
  return "postgres://postgres@localhost:5432/ai_model_platform";
}

async function main() {
  const pool = new Pool({
    connectionString: resolveDatabaseUrl()
  });
  const files = (await fs.readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const version = file.replace(/\.sql$/, "");
    const applied = await pool.query(
      "select 1 from schema_migrations where version = $1",
      [version]
    ).catch(() => ({ rowCount: 0 }));
    if (applied.rowCount) {
      console.log(`skip ${version}`);
      continue;
    }
    const sql = await fs.readFile(path.join(migrationsDir, file), "utf8");
    await pool.query("begin");
    try {
      await pool.query(sql);
      await pool.query(
        "insert into schema_migrations (version) values ($1) on conflict do nothing",
        [version]
      );
      await pool.query("commit");
      console.log(`applied ${version}`);
    } catch (error) {
      await pool.query("rollback");
      throw error;
    }
  }
  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
