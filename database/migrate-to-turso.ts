/**
 * Migration Script: Consolidate all data into Turso
 *
 * This script:
 * 1. Reads data from database.json
 * 2. Reads data from data.json (legacy)
 * 3. Merges Team images from data.json into items
 * 4. Migrates everything to Turso Cloud SQLite
 *
 * Run with: bun run database/migrate-to-turso.ts
 */

import { readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import * as turso from "./turso";

const BASE_DIR = join(import.meta.dir, "..");

interface LegacyDataJson {
    content?: Record<string, any>;
    team?: Record<string, Array<{
        id: number;
        name: string;
        role: string;
        description?: string;
        image?: string;
    }>>;
    locations?: Array<any>;
    products?: Array<any>;
    settings?: Record<string, any>;
    imageAssignments?: Record<string, any>;
    pageStructure?: any;
}

interface DatabaseJson {
    websites: any[];
    pages: any[];
    blocks: any[];
    collections: any[];
    items: any[];
    media: any[];
    settings: any[];
    sync_log?: any[];
    connections?: any[];
}

async function loadDataJson(): Promise<LegacyDataJson | null> {
    const path = join(BASE_DIR, "data.json");
    if (!existsSync(path)) {
        console.log("[Migration] data.json not found, skipping legacy data");
        return null;
    }

    try {
        const content = await readFile(path, "utf-8");
        return JSON.parse(content);
    } catch (e) {
        console.error("[Migration] Error reading data.json:", e);
        return null;
    }
}

async function loadDatabaseJson(): Promise<DatabaseJson | null> {
    const path = join(BASE_DIR, "database", "database.json");
    if (!existsSync(path)) {
        console.log("[Migration] database.json not found");
        return null;
    }

    try {
        const content = await readFile(path, "utf-8");
        return JSON.parse(content);
    } catch (e) {
        console.error("[Migration] Error reading database.json:", e);
        return null;
    }
}

// Map legacy team category names to database category names
function mapTeamCategory(legacyCategory: string): string {
    const mapping: Record<string, string> = {
        'leadership': 'Global Leadership',
        'ceo': 'CEO',
        'cooRegional': 'COO & Regional Heads'
    };
    return mapping[legacyCategory] || legacyCategory;
}

// Find matching team member by name
function findTeamMemberByName(items: any[], name: string): any | undefined {
    return items.find(item =>
        item.collection_id === 'col_team' &&
        item.data?.name?.toLowerCase().trim() === name.toLowerCase().trim()
    );
}

async function migrate() {
    console.log("==========================================");
    console.log("  Turso Migration - Iustus Mercatura CMS");
    console.log("==========================================\n");

    // Check if Turso is configured
    if (!turso.isTursoConfigured()) {
        console.error("ERROR: Turso is not configured!");
        console.error("Please set TURSO_URL and TURSO_AUTH_TOKEN environment variables.");
        console.error("\nExample:");
        console.error("  export TURSO_URL=libsql://your-database.turso.io");
        console.error("  export TURSO_AUTH_TOKEN=your-auth-token");
        process.exit(1);
    }

    // Load existing data
    console.log("[1/5] Loading existing data...");
    const databaseJson = await loadDatabaseJson();
    const dataJson = await loadDataJson();

    if (!databaseJson) {
        console.error("ERROR: Cannot proceed without database.json");
        process.exit(1);
    }

    console.log(`     - database.json: ${databaseJson.items?.length || 0} items`);
    console.log(`     - data.json: ${dataJson ? 'loaded' : 'not found'}`);

    // Initialize schema
    console.log("\n[2/5] Initializing Turso schema...");
    await turso.initializeSchema();

    // Merge team images from data.json into items
    console.log("\n[3/5] Merging team images from data.json...");
    let imagesUpdated = 0;

    if (dataJson?.team) {
        for (const [category, members] of Object.entries(dataJson.team)) {
            if (!Array.isArray(members)) continue;

            for (const member of members) {
                if (!member.image) continue;

                // Find matching item in database.json
                const matchingItem = findTeamMemberByName(databaseJson.items, member.name);

                if (matchingItem) {
                    // Update the image in the item's data
                    if (!matchingItem.data.image || matchingItem.data.image === '') {
                        matchingItem.data.image = member.image;
                        imagesUpdated++;
                        console.log(`     + Updated image for: ${member.name}`);
                    }
                } else {
                    console.log(`     ? No match found for: ${member.name}`);
                }
            }
        }
    }
    console.log(`     Total images updated: ${imagesUpdated}`);

    // Migrate content from data.json to content table
    console.log("\n[4/5] Migrating legacy content...");
    const contentToMigrate: Array<{
        website_id: string;
        section: string;
        key: string;
        value: any;
        type: string;
    }> = [];

    if (dataJson?.content) {
        for (const [section, sectionData] of Object.entries(dataJson.content)) {
            if (typeof sectionData === 'object' && sectionData !== null) {
                for (const [key, value] of Object.entries(sectionData)) {
                    contentToMigrate.push({
                        website_id: 'ws_iustus',
                        section,
                        key,
                        value,
                        type: typeof value === 'object' ? 'json' : 'text'
                    });
                }
            }
        }
        console.log(`     Content entries to migrate: ${contentToMigrate.length}`);
    }

    // Migrate settings from data.json if not already in database.json
    if (dataJson?.settings) {
        const existingSettingKeys = new Set(databaseJson.settings.map(s => s.key));

        for (const [key, value] of Object.entries(dataJson.settings)) {
            if (!existingSettingKeys.has(key)) {
                databaseJson.settings.push({
                    id: `set_${Date.now()}_${key}`,
                    website_id: 'ws_iustus',
                    key,
                    value: typeof value === 'string' ? value : JSON.stringify(value)
                });
                console.log(`     + Added setting: ${key}`);
            }
        }
    }

    // Save to Turso
    console.log("\n[5/5] Saving to Turso database...");

    // Prepare data for Turso
    const tursoData: Partial<turso.DBTables> = {
        websites: databaseJson.websites || [],
        pages: databaseJson.pages || [],
        blocks: databaseJson.blocks || [],
        collections: databaseJson.collections || [],
        items: databaseJson.items || [],
        media: databaseJson.media || [],
        settings: databaseJson.settings || [],
        connections: databaseJson.connections || []
    };

    // Save main database
    await turso.saveFullDatabase(tursoData);
    console.log("     Main database saved!");

    // Save content entries
    for (const entry of contentToMigrate) {
        await turso.setContent(entry.website_id, entry.section, entry.key, entry.value, entry.type);
    }
    console.log(`     Content entries saved: ${contentToMigrate.length}`);

    // Get and display stats
    const stats = await turso.getDBStats();

    console.log("\n==========================================");
    console.log("  Migration Complete!");
    console.log("==========================================");
    console.log(`\n  Database Statistics:`);
    console.log(`  - Websites:    ${stats.websites}`);
    console.log(`  - Pages:       ${stats.pages}`);
    console.log(`  - Blocks:      ${stats.blocks}`);
    console.log(`  - Collections: ${stats.collections}`);
    console.log(`  - Items:       ${stats.items}`);
    console.log(`  - Media:       ${stats.media}`);
    console.log(`  - Pending Sync: ${stats.pendingSync}`);

    // Backup the original files
    console.log("\n[Backup] Creating backups of original files...");
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    if (existsSync(join(BASE_DIR, "database", "database.json"))) {
        await writeFile(
            join(BASE_DIR, "database", `database.json.backup-${timestamp}`),
            await readFile(join(BASE_DIR, "database", "database.json"))
        );
        console.log("     Backed up: database.json");
    }

    if (existsSync(join(BASE_DIR, "data.json"))) {
        await writeFile(
            join(BASE_DIR, `data.json.backup-${timestamp}`),
            await readFile(join(BASE_DIR, "data.json"))
        );
        console.log("     Backed up: data.json");
    }

    console.log("\n==========================================");
    console.log("  Next Steps:");
    console.log("==========================================");
    console.log("  1. Test the server with: bun run server.ts");
    console.log("  2. Verify data in Developer Admin");
    console.log("  3. Remove legacy files if everything works:");
    console.log("     - rm data.json");
    console.log("     - Keep database.json as fallback");
    console.log("");

    turso.closeDB();
}

// Run migration
migrate().catch(error => {
    console.error("Migration failed:", error);
    process.exit(1);
});
