/**
 * Migration Script: JSON to Turso
 * Migrates existing database.json data to Turso SQLite
 *
 * Run with: bun run database/migrate-to-turso.ts
 */

import { readFile } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import { getDB, initializeSchema, saveFullDatabase, type DBTables } from "./turso";

async function migrate() {
    console.log("=== Turso Migration Script ===\n");

    // Check environment variables
    const url = process.env.TURSO_URL || process.env.TURSO_DATABASE_URL;
    const token = process.env.TURSO_AUTH_TOKEN;

    if (!url) {
        console.error("ERROR: TURSO_URL environment variable is not set!");
        console.log("\nSet it with:");
        console.log('  export TURSO_URL="libsql://your-database.turso.io"');
        console.log('  export TURSO_AUTH_TOKEN="your-token"');
        process.exit(1);
    }

    console.log(`Turso URL: ${url}`);
    console.log(`Auth Token: ${token ? "***" + token.slice(-8) : "NOT SET (embedded replica?)"}\n`);

    // Read existing JSON database
    const dbPath = join(import.meta.dir, "database.json");

    if (!existsSync(dbPath)) {
        console.error(`ERROR: database.json not found at ${dbPath}`);
        process.exit(1);
    }

    console.log("Reading database.json...");
    const jsonContent = await readFile(dbPath, "utf-8");
    const jsonData: DBTables = JSON.parse(jsonContent);

    console.log("\nData found:");
    console.log(`  - Websites: ${jsonData.websites?.length || 0}`);
    console.log(`  - Pages: ${jsonData.pages?.length || 0}`);
    console.log(`  - Blocks: ${jsonData.blocks?.length || 0}`);
    console.log(`  - Collections: ${jsonData.collections?.length || 0}`);
    console.log(`  - Items: ${jsonData.items?.length || 0}`);
    console.log(`  - Media: ${jsonData.media?.length || 0}`);
    console.log(`  - Settings: ${jsonData.settings?.length || 0}`);
    console.log(`  - Connections: ${jsonData.connections?.length || 0}`);

    // Initialize schema
    console.log("\nInitializing Turso schema...");
    try {
        await initializeSchema();
        console.log("Schema created successfully!");
    } catch (e) {
        console.error("Failed to create schema:", e);
        process.exit(1);
    }

    // Migrate data
    console.log("\nMigrating data to Turso...");
    try {
        await saveFullDatabase(jsonData);
        console.log("Data migrated successfully!");
    } catch (e) {
        console.error("Failed to migrate data:", e);
        process.exit(1);
    }

    // Verify migration
    console.log("\nVerifying migration...");
    const db = getDB();

    const [websites, items, settings] = await Promise.all([
        db.execute("SELECT COUNT(*) as count FROM websites"),
        db.execute("SELECT COUNT(*) as count FROM items"),
        db.execute("SELECT COUNT(*) as count FROM settings")
    ]);

    console.log("Verification results:");
    console.log(`  - Websites in Turso: ${websites.rows[0].count}`);
    console.log(`  - Items in Turso: ${items.rows[0].count}`);
    console.log(`  - Settings in Turso: ${settings.rows[0].count}`);

    console.log("\n=== Migration Complete! ===");
    console.log("\nNext steps:");
    console.log("1. Set TURSO_URL and TURSO_AUTH_TOKEN on Render");
    console.log("2. Deploy the updated server.ts");
    console.log("3. The server will automatically use Turso when the env vars are set");
}

migrate().catch(console.error);
