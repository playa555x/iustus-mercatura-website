/**
 * Turso Database Client for Iustus Mercatura
 * Uses LibSQL (SQLite Edge) for cloud-based storage
 */

import { createClient, type Client } from "@libsql/client";

// Singleton client instance
let client: Client | null = null;

// Get or create database client
export function getDB(): Client {
    if (!client) {
        const url = process.env.TURSO_URL || process.env.TURSO_DATABASE_URL;
        const authToken = process.env.TURSO_AUTH_TOKEN;

        if (!url) {
            throw new Error("TURSO_URL environment variable is not set");
        }

        client = createClient({
            url,
            authToken
        });
    }
    return client;
}

// Initialize database schema
export async function initializeSchema(): Promise<void> {
    const db = getDB();

    // Websites table
    await db.execute(`
        CREATE TABLE IF NOT EXISTS websites (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            slug TEXT NOT NULL,
            domain TEXT,
            template TEXT,
            created TEXT NOT NULL,
            updated TEXT NOT NULL,
            status TEXT DEFAULT 'active'
        )
    `);

    // Pages table
    await db.execute(`
        CREATE TABLE IF NOT EXISTS pages (
            id TEXT PRIMARY KEY,
            website_id TEXT NOT NULL,
            name TEXT NOT NULL,
            slug TEXT NOT NULL,
            blocks TEXT DEFAULT '[]',
            status TEXT DEFAULT 'active',
            display_order INTEGER DEFAULT 0,
            FOREIGN KEY (website_id) REFERENCES websites(id)
        )
    `);

    // Blocks table
    await db.execute(`
        CREATE TABLE IF NOT EXISTS blocks (
            id TEXT PRIMARY KEY,
            website_id TEXT,
            page_id TEXT,
            type TEXT NOT NULL,
            name TEXT,
            data TEXT DEFAULT '{}',
            enabled INTEGER DEFAULT 1,
            display_order INTEGER DEFAULT 0,
            FOREIGN KEY (page_id) REFERENCES pages(id)
        )
    `);

    // Collections table
    await db.execute(`
        CREATE TABLE IF NOT EXISTS collections (
            id TEXT PRIMARY KEY,
            website_id TEXT NOT NULL,
            name TEXT NOT NULL,
            icon TEXT,
            fields TEXT DEFAULT '[]',
            FOREIGN KEY (website_id) REFERENCES websites(id)
        )
    `);

    // Items table (for team, products, locations, projects, etc.)
    await db.execute(`
        CREATE TABLE IF NOT EXISTS items (
            id TEXT PRIMARY KEY,
            collection_id TEXT NOT NULL,
            website_id TEXT,
            data TEXT DEFAULT '{}',
            display_order INTEGER DEFAULT 0,
            FOREIGN KEY (collection_id) REFERENCES collections(id)
        )
    `);

    // Media table
    await db.execute(`
        CREATE TABLE IF NOT EXISTS media (
            id TEXT PRIMARY KEY,
            website_id TEXT,
            filename TEXT NOT NULL,
            original_name TEXT,
            url TEXT,
            type TEXT,
            size INTEGER,
            uploaded TEXT
        )
    `);

    // Settings table
    await db.execute(`
        CREATE TABLE IF NOT EXISTS settings (
            id TEXT PRIMARY KEY,
            website_id TEXT,
            key TEXT NOT NULL,
            value TEXT,
            UNIQUE(website_id, key)
        )
    `);

    // Sync log table
    await db.execute(`
        CREATE TABLE IF NOT EXISTS sync_log (
            id TEXT PRIMARY KEY,
            timestamp TEXT NOT NULL,
            source TEXT,
            target TEXT,
            action TEXT,
            status TEXT,
            details TEXT
        )
    `);

    // Connections table
    await db.execute(`
        CREATE TABLE IF NOT EXISTS connections (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            status TEXT DEFAULT 'disconnected',
            last_ping TEXT,
            error TEXT
        )
    `);

    console.log("[Turso] Database schema initialized");
}

// Database interface types (matching existing structure)
export interface DBTables {
    websites: Website[];
    pages: Page[];
    blocks: Block[];
    collections: Collection[];
    items: CollectionItem[];
    media: MediaItem[];
    settings: Settings[];
    sync_log: SyncLogEntry[];
    connections: ConnectionStatus[];
}

export interface Website {
    id: string;
    name: string;
    slug: string;
    domain?: string;
    template?: string;
    created: string;
    updated: string;
    status: 'active' | 'draft' | 'archived';
}

export interface Page {
    id: string;
    website_id: string;
    name: string;
    slug: string;
    blocks: string[];
    status: 'active' | 'draft';
    order: number;
}

export interface Block {
    id: string;
    page_id: string;
    website_id?: string;
    type: string;
    name?: string;
    data: Record<string, any>;
    enabled?: boolean;
    order: number;
}

export interface Collection {
    id: string;
    website_id: string;
    name: string;
    icon: string;
    fields: { key: string; label: string; type: string; required?: boolean; options?: string[]; default?: any }[];
}

export interface CollectionItem {
    id: string;
    collection_id: string;
    website_id?: string;
    data: Record<string, any>;
    order: number;
}

export interface MediaItem {
    id: string;
    website_id?: string;
    filename: string;
    original_name?: string;
    url?: string;
    type?: string;
    size?: number;
    uploaded?: string;
}

export interface Settings {
    id: string;
    website_id: string;
    key: string;
    value: any;
}

export interface SyncLogEntry {
    id: string;
    timestamp: string;
    source?: string;
    target?: string;
    action?: string;
    status?: string;
    details?: string;
}

export interface ConnectionStatus {
    id: string;
    name: string;
    type: 'dev_admin' | 'admin_panel' | 'website' | 'database';
    status: 'connected' | 'disconnected' | 'error';
    last_ping: string;
    error?: string;
}

// Load entire database as JSON structure (for API compatibility)
export async function loadFullDatabase(): Promise<DBTables> {
    const db = getDB();

    const [
        websites,
        pages,
        blocks,
        collections,
        items,
        media,
        settings,
        sync_log,
        connections
    ] = await Promise.all([
        db.execute("SELECT * FROM websites"),
        db.execute("SELECT * FROM pages ORDER BY display_order"),
        db.execute("SELECT * FROM blocks ORDER BY display_order"),
        db.execute("SELECT * FROM collections"),
        db.execute("SELECT * FROM items ORDER BY display_order"),
        db.execute("SELECT * FROM media"),
        db.execute("SELECT * FROM settings"),
        db.execute("SELECT * FROM sync_log ORDER BY timestamp DESC LIMIT 100"),
        db.execute("SELECT * FROM connections")
    ]);

    return {
        websites: websites.rows.map(r => ({
            id: r.id as string,
            name: r.name as string,
            slug: r.slug as string,
            domain: r.domain as string | undefined,
            template: r.template as string | undefined,
            created: r.created as string,
            updated: r.updated as string,
            status: r.status as 'active' | 'draft' | 'archived'
        })),
        pages: pages.rows.map(r => ({
            id: r.id as string,
            website_id: r.website_id as string,
            name: r.name as string,
            slug: r.slug as string,
            blocks: JSON.parse(r.blocks as string || '[]'),
            status: r.status as 'active' | 'draft',
            order: r.display_order as number
        })),
        blocks: blocks.rows.map(r => ({
            id: r.id as string,
            page_id: r.page_id as string,
            website_id: r.website_id as string | undefined,
            type: r.type as string,
            name: r.name as string | undefined,
            data: JSON.parse(r.data as string || '{}'),
            enabled: r.enabled === 1,
            order: r.display_order as number
        })),
        collections: collections.rows.map(r => ({
            id: r.id as string,
            website_id: r.website_id as string,
            name: r.name as string,
            icon: r.icon as string,
            fields: JSON.parse(r.fields as string || '[]')
        })),
        items: items.rows.map(r => ({
            id: r.id as string,
            collection_id: r.collection_id as string,
            website_id: r.website_id as string | undefined,
            data: JSON.parse(r.data as string || '{}'),
            order: r.display_order as number
        })),
        media: media.rows.map(r => ({
            id: r.id as string,
            website_id: r.website_id as string | undefined,
            filename: r.filename as string,
            original_name: r.original_name as string | undefined,
            url: r.url as string | undefined,
            type: r.type as string | undefined,
            size: r.size as number | undefined,
            uploaded: r.uploaded as string | undefined
        })),
        settings: settings.rows.map(r => ({
            id: r.id as string,
            website_id: r.website_id as string,
            key: r.key as string,
            value: r.value as any
        })),
        sync_log: sync_log.rows.map(r => ({
            id: r.id as string,
            timestamp: r.timestamp as string,
            source: r.source as string | undefined,
            target: r.target as string | undefined,
            action: r.action as string | undefined,
            status: r.status as string | undefined,
            details: r.details as string | undefined
        })),
        connections: connections.rows.map(r => ({
            id: r.id as string,
            name: r.name as string,
            type: r.type as 'dev_admin' | 'admin_panel' | 'website' | 'database',
            status: r.status as 'connected' | 'disconnected' | 'error',
            last_ping: r.last_ping as string,
            error: r.error as string | undefined
        }))
    };
}

// Save entire database from JSON structure
export async function saveFullDatabase(data: DBTables): Promise<void> {
    const db = getDB();

    // Use a transaction for atomic updates
    await db.batch([
        // Clear existing data
        { sql: "DELETE FROM websites", args: [] },
        { sql: "DELETE FROM pages", args: [] },
        { sql: "DELETE FROM blocks", args: [] },
        { sql: "DELETE FROM collections", args: [] },
        { sql: "DELETE FROM items", args: [] },
        { sql: "DELETE FROM media", args: [] },
        { sql: "DELETE FROM settings", args: [] },
        { sql: "DELETE FROM connections", args: [] }
    ]);

    // Insert websites
    for (const w of data.websites || []) {
        await db.execute({
            sql: `INSERT INTO websites (id, name, slug, domain, template, created, updated, status)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [w.id, w.name, w.slug, w.domain || null, w.template || null, w.created, w.updated, w.status]
        });
    }

    // Insert pages
    for (const p of data.pages || []) {
        await db.execute({
            sql: `INSERT INTO pages (id, website_id, name, slug, blocks, status, display_order)
                  VALUES (?, ?, ?, ?, ?, ?, ?)`,
            args: [p.id, p.website_id, p.name, p.slug, JSON.stringify(p.blocks), p.status, p.order || 0]
        });
    }

    // Insert blocks
    for (const b of data.blocks || []) {
        await db.execute({
            sql: `INSERT INTO blocks (id, website_id, page_id, type, name, data, enabled, display_order)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [b.id, b.website_id || null, b.page_id, b.type, b.name || null, JSON.stringify(b.data || {}), b.enabled !== false ? 1 : 0, b.order || 0]
        });
    }

    // Insert collections
    for (const c of data.collections || []) {
        await db.execute({
            sql: `INSERT INTO collections (id, website_id, name, icon, fields)
                  VALUES (?, ?, ?, ?, ?)`,
            args: [c.id, c.website_id, c.name, c.icon, JSON.stringify(c.fields)]
        });
    }

    // Insert items
    for (const i of data.items || []) {
        await db.execute({
            sql: `INSERT INTO items (id, collection_id, website_id, data, display_order)
                  VALUES (?, ?, ?, ?, ?)`,
            args: [i.id, i.collection_id, i.website_id || null, JSON.stringify(i.data), i.order || 0]
        });
    }

    // Insert media
    for (const m of data.media || []) {
        await db.execute({
            sql: `INSERT INTO media (id, website_id, filename, original_name, url, type, size, uploaded)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [m.id, m.website_id || null, m.filename, m.original_name || null, m.url || null, m.type || null, m.size || null, m.uploaded || null]
        });
    }

    // Insert settings
    for (const s of data.settings || []) {
        await db.execute({
            sql: `INSERT INTO settings (id, website_id, key, value)
                  VALUES (?, ?, ?, ?)`,
            args: [s.id, s.website_id, s.key, typeof s.value === 'string' ? s.value : JSON.stringify(s.value)]
        });
    }

    // Insert connections
    for (const c of data.connections || []) {
        await db.execute({
            sql: `INSERT INTO connections (id, name, type, status, last_ping, error)
                  VALUES (?, ?, ?, ?, ?, ?)`,
            args: [c.id, c.name, c.type, c.status, c.last_ping, c.error || null]
        });
    }

    console.log("[Turso] Full database saved");
}

// CRUD operations for items (most common operations)
export async function getItems(collectionId: string): Promise<CollectionItem[]> {
    const db = getDB();
    const result = await db.execute({
        sql: "SELECT * FROM items WHERE collection_id = ? ORDER BY display_order",
        args: [collectionId]
    });

    return result.rows.map(r => ({
        id: r.id as string,
        collection_id: r.collection_id as string,
        website_id: r.website_id as string | undefined,
        data: JSON.parse(r.data as string || '{}'),
        order: r.display_order as number
    }));
}

export async function getItem(itemId: string): Promise<CollectionItem | null> {
    const db = getDB();
    const result = await db.execute({
        sql: "SELECT * FROM items WHERE id = ?",
        args: [itemId]
    });

    if (result.rows.length === 0) return null;

    const r = result.rows[0];
    return {
        id: r.id as string,
        collection_id: r.collection_id as string,
        website_id: r.website_id as string | undefined,
        data: JSON.parse(r.data as string || '{}'),
        order: r.display_order as number
    };
}

export async function createItem(item: CollectionItem): Promise<CollectionItem> {
    const db = getDB();
    await db.execute({
        sql: `INSERT INTO items (id, collection_id, website_id, data, display_order)
              VALUES (?, ?, ?, ?, ?)`,
        args: [item.id, item.collection_id, item.website_id || null, JSON.stringify(item.data), item.order || 0]
    });
    return item;
}

export async function updateItem(itemId: string, data: Record<string, any>): Promise<void> {
    const db = getDB();
    await db.execute({
        sql: "UPDATE items SET data = ? WHERE id = ?",
        args: [JSON.stringify(data), itemId]
    });
}

export async function deleteItem(itemId: string): Promise<void> {
    const db = getDB();
    await db.execute({
        sql: "DELETE FROM items WHERE id = ?",
        args: [itemId]
    });
}

export async function updateItemOrder(itemId: string, order: number): Promise<void> {
    const db = getDB();
    await db.execute({
        sql: "UPDATE items SET display_order = ? WHERE id = ?",
        args: [order, itemId]
    });
}

// Settings operations
export async function getSetting(websiteId: string, key: string): Promise<any> {
    const db = getDB();
    const result = await db.execute({
        sql: "SELECT value FROM settings WHERE website_id = ? AND key = ?",
        args: [websiteId, key]
    });

    if (result.rows.length === 0) return null;

    const value = result.rows[0].value as string;
    try {
        return JSON.parse(value);
    } catch {
        return value;
    }
}

export async function setSetting(websiteId: string, key: string, value: any): Promise<void> {
    const db = getDB();
    const valueStr = typeof value === 'string' ? value : JSON.stringify(value);

    await db.execute({
        sql: `INSERT INTO settings (id, website_id, key, value)
              VALUES (?, ?, ?, ?)
              ON CONFLICT(website_id, key) DO UPDATE SET value = ?`,
        args: [`set_${Date.now()}`, websiteId, key, valueStr, valueStr]
    });
}

// Check if Turso is configured
export function isTursoConfigured(): boolean {
    return !!(process.env.TURSO_URL || process.env.TURSO_DATABASE_URL);
}

// Close connection (for cleanup)
export function closeDB(): void {
    if (client) {
        client.close();
        client = null;
    }
}
