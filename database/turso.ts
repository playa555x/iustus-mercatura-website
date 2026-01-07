/**
 * Turso Database Client for Iustus Mercatura
 * Universal CMS - Multi-Site Orchestrator
 *
 * Uses LibSQL (SQLite Edge) for cloud-based storage
 * Single Source of Truth for all data
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

    // ==========================================
    // CORE TABLES
    // ==========================================

    // Websites table - Multi-Site Support
    await db.execute(`
        CREATE TABLE IF NOT EXISTS websites (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            slug TEXT NOT NULL UNIQUE,
            domain TEXT,
            template TEXT,
            created TEXT NOT NULL,
            updated TEXT NOT NULL,
            status TEXT DEFAULT 'active',
            config TEXT DEFAULT '{}'
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
            meta TEXT DEFAULT '{}',
            FOREIGN KEY (website_id) REFERENCES websites(id)
        )
    `);

    // Blocks table - Page content blocks
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

    // Collections table - Dynamic content types
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

    // Items table - Collection items (team, products, locations, projects, etc.)
    await db.execute(`
        CREATE TABLE IF NOT EXISTS items (
            id TEXT PRIMARY KEY,
            collection_id TEXT NOT NULL,
            website_id TEXT,
            data TEXT DEFAULT '{}',
            display_order INTEGER DEFAULT 0,
            created TEXT,
            updated TEXT,
            FOREIGN KEY (collection_id) REFERENCES collections(id)
        )
    `);

    // Media table - Uploaded files
    await db.execute(`
        CREATE TABLE IF NOT EXISTS media (
            id TEXT PRIMARY KEY,
            website_id TEXT,
            filename TEXT NOT NULL,
            original_name TEXT,
            url TEXT,
            type TEXT,
            size INTEGER,
            uploaded TEXT,
            metadata TEXT DEFAULT '{}'
        )
    `);

    // Settings table - Key-value settings per website
    await db.execute(`
        CREATE TABLE IF NOT EXISTS settings (
            id TEXT PRIMARY KEY,
            website_id TEXT,
            key TEXT NOT NULL,
            value TEXT,
            UNIQUE(website_id, key)
        )
    `);

    // ==========================================
    // SYNC & ORCHESTRATION TABLES
    // ==========================================

    // Environments table - Dev, Admin, Production instances
    await db.execute(`
        CREATE TABLE IF NOT EXISTS environments (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            type TEXT NOT NULL CHECK(type IN ('developer', 'admin', 'production', 'staging')),
            url TEXT,
            priority INTEGER DEFAULT 0,
            can_write_up INTEGER DEFAULT 0,
            can_write_down INTEGER DEFAULT 1,
            sync_interval_hours INTEGER DEFAULT 24,
            last_sync TEXT,
            status TEXT DEFAULT 'active',
            config TEXT DEFAULT '{}'
        )
    `);

    // Sync Queue - Pending synchronizations
    await db.execute(`
        CREATE TABLE IF NOT EXISTS sync_queue (
            id TEXT PRIMARY KEY,
            source_env TEXT NOT NULL,
            target_env TEXT,
            operation TEXT NOT NULL,
            table_name TEXT NOT NULL,
            record_id TEXT,
            data TEXT,
            priority TEXT DEFAULT 'normal' CHECK(priority IN ('immediate', 'scheduled', 'low')),
            scheduled_for TEXT,
            created TEXT NOT NULL,
            processed INTEGER DEFAULT 0,
            processed_at TEXT,
            result TEXT,
            error TEXT,
            FOREIGN KEY (source_env) REFERENCES environments(id)
        )
    `);

    // Sync Log - History of synchronizations
    await db.execute(`
        CREATE TABLE IF NOT EXISTS sync_log (
            id TEXT PRIMARY KEY,
            timestamp TEXT NOT NULL,
            source TEXT,
            target TEXT,
            action TEXT,
            status TEXT,
            details TEXT,
            records_affected INTEGER DEFAULT 0,
            duration_ms INTEGER
        )
    `);

    // Connections table - Active client connections
    await db.execute(`
        CREATE TABLE IF NOT EXISTS connections (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            environment_id TEXT,
            status TEXT DEFAULT 'disconnected',
            last_ping TEXT,
            ip_address TEXT,
            user_agent TEXT,
            error TEXT,
            FOREIGN KEY (environment_id) REFERENCES environments(id)
        )
    `);

    // Sync Config - Hierarchie rules
    await db.execute(`
        CREATE TABLE IF NOT EXISTS sync_config (
            id TEXT PRIMARY KEY,
            source_env_type TEXT NOT NULL,
            target_env_type TEXT NOT NULL,
            direction TEXT NOT NULL CHECK(direction IN ('up', 'down', 'bidirectional')),
            auto_sync INTEGER DEFAULT 0,
            requires_approval INTEGER DEFAULT 0,
            sync_tables TEXT DEFAULT '[]',
            exclude_tables TEXT DEFAULT '[]',
            sync_time TEXT,
            enabled INTEGER DEFAULT 1
        )
    `);

    // ==========================================
    // CONTENT TABLES (Legacy Support)
    // ==========================================

    // Content table - For legacy content blocks
    await db.execute(`
        CREATE TABLE IF NOT EXISTS content (
            id TEXT PRIMARY KEY,
            website_id TEXT NOT NULL,
            section TEXT NOT NULL,
            key TEXT NOT NULL,
            value TEXT,
            type TEXT DEFAULT 'text',
            updated TEXT,
            UNIQUE(website_id, section, key),
            FOREIGN KEY (website_id) REFERENCES websites(id)
        )
    `);

    // Insert default environments if not exist
    const envCheck = await db.execute("SELECT COUNT(*) as count FROM environments");
    if ((envCheck.rows[0].count as number) === 0) {
        await db.execute({
            sql: `INSERT INTO environments (id, name, type, priority, can_write_up, can_write_down, sync_interval_hours, status)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            args: ['env_developer', 'Developer Admin', 'developer', 100, 0, 1, 24, 'active']
        });
        await db.execute({
            sql: `INSERT INTO environments (id, name, type, priority, can_write_up, can_write_down, sync_interval_hours, status)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            args: ['env_admin', 'Admin Panel', 'admin', 50, 1, 1, 0, 'active']
        });
        await db.execute({
            sql: `INSERT INTO environments (id, name, type, priority, can_write_up, can_write_down, sync_interval_hours, status)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            args: ['env_production', 'Production Website', 'production', 10, 0, 0, 0, 'active']
        });

        // Insert default sync rules
        await db.execute({
            sql: `INSERT INTO sync_config (id, source_env_type, target_env_type, direction, auto_sync, requires_approval, sync_time, enabled)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            args: ['sync_dev_admin', 'developer', 'admin', 'down', 1, 0, '03:00', 1]
        });
        await db.execute({
            sql: `INSERT INTO sync_config (id, source_env_type, target_env_type, direction, auto_sync, requires_approval, sync_time, enabled)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            args: ['sync_admin_prod', 'admin', 'production', 'down', 1, 0, null, 1]
        });
        await db.execute({
            sql: `INSERT INTO sync_config (id, source_env_type, target_env_type, direction, auto_sync, requires_approval, sync_time, enabled)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            args: ['sync_admin_dev', 'admin', 'developer', 'up', 0, 1, '03:00', 1]
        });
    }

    console.log("[Turso] Database schema initialized with orchestration support");
}

// ==========================================
// TYPE DEFINITIONS
// ==========================================

export interface DBTables {
    websites: Website[];
    pages: Page[];
    blocks: Block[];
    collections: Collection[];
    items: CollectionItem[];
    media: MediaItem[];
    settings: Settings[];
    environments: Environment[];
    sync_queue: SyncQueueItem[];
    sync_log: SyncLogEntry[];
    sync_config: SyncConfig[];
    connections: ConnectionStatus[];
    content: ContentItem[];
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
    config?: Record<string, any>;
}

export interface Page {
    id: string;
    website_id: string;
    name: string;
    slug: string;
    blocks: string[];
    status: 'active' | 'draft';
    order: number;
    meta?: Record<string, any>;
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
    created?: string;
    updated?: string;
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
    metadata?: Record<string, any>;
}

export interface Settings {
    id: string;
    website_id: string;
    key: string;
    value: any;
}

export interface Environment {
    id: string;
    name: string;
    type: 'developer' | 'admin' | 'production' | 'staging';
    url?: string;
    priority: number;
    can_write_up: boolean;
    can_write_down: boolean;
    sync_interval_hours: number;
    last_sync?: string;
    status: 'active' | 'inactive';
    config?: Record<string, any>;
}

export interface SyncQueueItem {
    id: string;
    source_env: string;
    target_env?: string;
    operation: 'insert' | 'update' | 'delete' | 'full_sync';
    table_name: string;
    record_id?: string;
    data?: any;
    priority: 'immediate' | 'scheduled' | 'low';
    scheduled_for?: string;
    created: string;
    processed: boolean;
    processed_at?: string;
    result?: string;
    error?: string;
}

export interface SyncLogEntry {
    id: string;
    timestamp: string;
    source?: string;
    target?: string;
    action?: string;
    status?: string;
    details?: string;
    records_affected?: number;
    duration_ms?: number;
}

export interface SyncConfig {
    id: string;
    source_env_type: string;
    target_env_type: string;
    direction: 'up' | 'down' | 'bidirectional';
    auto_sync: boolean;
    requires_approval: boolean;
    sync_tables?: string[];
    exclude_tables?: string[];
    sync_time?: string;
    enabled: boolean;
}

export interface ConnectionStatus {
    id: string;
    name: string;
    type: 'dev_admin' | 'admin_panel' | 'website' | 'database';
    environment_id?: string;
    status: 'connected' | 'disconnected' | 'error';
    last_ping: string;
    ip_address?: string;
    user_agent?: string;
    error?: string;
}

export interface ContentItem {
    id: string;
    website_id: string;
    section: string;
    key: string;
    value: any;
    type: string;
    updated?: string;
}

// ==========================================
// FULL DATABASE OPERATIONS
// ==========================================

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
        environments,
        sync_queue,
        sync_log,
        sync_config,
        connections,
        content
    ] = await Promise.all([
        db.execute("SELECT * FROM websites"),
        db.execute("SELECT * FROM pages ORDER BY display_order"),
        db.execute("SELECT * FROM blocks ORDER BY display_order"),
        db.execute("SELECT * FROM collections"),
        db.execute("SELECT * FROM items ORDER BY display_order"),
        db.execute("SELECT * FROM media"),
        db.execute("SELECT * FROM settings"),
        db.execute("SELECT * FROM environments ORDER BY priority DESC"),
        db.execute("SELECT * FROM sync_queue WHERE processed = 0 ORDER BY created"),
        db.execute("SELECT * FROM sync_log ORDER BY timestamp DESC LIMIT 100"),
        db.execute("SELECT * FROM sync_config"),
        db.execute("SELECT * FROM connections"),
        db.execute("SELECT * FROM content")
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
            status: r.status as 'active' | 'draft' | 'archived',
            config: r.config ? JSON.parse(r.config as string) : undefined
        })),
        pages: pages.rows.map(r => ({
            id: r.id as string,
            website_id: r.website_id as string,
            name: r.name as string,
            slug: r.slug as string,
            blocks: JSON.parse(r.blocks as string || '[]'),
            status: r.status as 'active' | 'draft',
            order: r.display_order as number,
            meta: r.meta ? JSON.parse(r.meta as string) : undefined
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
            order: r.display_order as number,
            created: r.created as string | undefined,
            updated: r.updated as string | undefined
        })),
        media: media.rows.map(r => ({
            id: r.id as string,
            website_id: r.website_id as string | undefined,
            filename: r.filename as string,
            original_name: r.original_name as string | undefined,
            url: r.url as string | undefined,
            type: r.type as string | undefined,
            size: r.size as number | undefined,
            uploaded: r.uploaded as string | undefined,
            metadata: r.metadata ? JSON.parse(r.metadata as string) : undefined
        })),
        settings: settings.rows.map(r => ({
            id: r.id as string,
            website_id: r.website_id as string,
            key: r.key as string,
            value: r.value as any
        })),
        environments: environments.rows.map(r => ({
            id: r.id as string,
            name: r.name as string,
            type: r.type as 'developer' | 'admin' | 'production' | 'staging',
            url: r.url as string | undefined,
            priority: r.priority as number,
            can_write_up: r.can_write_up === 1,
            can_write_down: r.can_write_down === 1,
            sync_interval_hours: r.sync_interval_hours as number,
            last_sync: r.last_sync as string | undefined,
            status: r.status as 'active' | 'inactive',
            config: r.config ? JSON.parse(r.config as string) : undefined
        })),
        sync_queue: sync_queue.rows.map(r => ({
            id: r.id as string,
            source_env: r.source_env as string,
            target_env: r.target_env as string | undefined,
            operation: r.operation as 'insert' | 'update' | 'delete' | 'full_sync',
            table_name: r.table_name as string,
            record_id: r.record_id as string | undefined,
            data: r.data ? JSON.parse(r.data as string) : undefined,
            priority: r.priority as 'immediate' | 'scheduled' | 'low',
            scheduled_for: r.scheduled_for as string | undefined,
            created: r.created as string,
            processed: r.processed === 1,
            processed_at: r.processed_at as string | undefined,
            result: r.result as string | undefined,
            error: r.error as string | undefined
        })),
        sync_log: sync_log.rows.map(r => ({
            id: r.id as string,
            timestamp: r.timestamp as string,
            source: r.source as string | undefined,
            target: r.target as string | undefined,
            action: r.action as string | undefined,
            status: r.status as string | undefined,
            details: r.details as string | undefined,
            records_affected: r.records_affected as number | undefined,
            duration_ms: r.duration_ms as number | undefined
        })),
        sync_config: sync_config.rows.map(r => ({
            id: r.id as string,
            source_env_type: r.source_env_type as string,
            target_env_type: r.target_env_type as string,
            direction: r.direction as 'up' | 'down' | 'bidirectional',
            auto_sync: r.auto_sync === 1,
            requires_approval: r.requires_approval === 1,
            sync_tables: r.sync_tables ? JSON.parse(r.sync_tables as string) : undefined,
            exclude_tables: r.exclude_tables ? JSON.parse(r.exclude_tables as string) : undefined,
            sync_time: r.sync_time as string | undefined,
            enabled: r.enabled === 1
        })),
        connections: connections.rows.map(r => ({
            id: r.id as string,
            name: r.name as string,
            type: r.type as 'dev_admin' | 'admin_panel' | 'website' | 'database',
            environment_id: r.environment_id as string | undefined,
            status: r.status as 'connected' | 'disconnected' | 'error',
            last_ping: r.last_ping as string,
            ip_address: r.ip_address as string | undefined,
            user_agent: r.user_agent as string | undefined,
            error: r.error as string | undefined
        })),
        content: content.rows.map(r => ({
            id: r.id as string,
            website_id: r.website_id as string,
            section: r.section as string,
            key: r.key as string,
            value: r.value as any,
            type: r.type as string,
            updated: r.updated as string | undefined
        }))
    };
}

// Save entire database from JSON structure
export async function saveFullDatabase(data: Partial<DBTables>): Promise<void> {
    const db = getDB();
    const now = new Date().toISOString();

    // Use transactions for data integrity
    await db.execute("BEGIN TRANSACTION");

    try {
        // Save websites
        if (data.websites) {
            for (const w of data.websites) {
                await db.execute({
                    sql: `INSERT OR REPLACE INTO websites (id, name, slug, domain, template, created, updated, status, config)
                          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    args: [w.id, w.name, w.slug, w.domain || null, w.template || null,
                           w.created || now, w.updated || now, w.status || 'active',
                           w.config ? JSON.stringify(w.config) : '{}']
                });
            }
        }

        // Save pages
        if (data.pages) {
            for (const p of data.pages) {
                await db.execute({
                    sql: `INSERT OR REPLACE INTO pages (id, website_id, name, slug, blocks, status, display_order, meta)
                          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    args: [p.id, p.website_id, p.name, p.slug, JSON.stringify(p.blocks),
                           p.status || 'active', p.order || 0, p.meta ? JSON.stringify(p.meta) : '{}']
                });
            }
        }

        // Save blocks
        if (data.blocks) {
            for (const b of data.blocks) {
                await db.execute({
                    sql: `INSERT OR REPLACE INTO blocks (id, website_id, page_id, type, name, data, enabled, display_order)
                          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    args: [b.id, b.website_id || null, b.page_id, b.type, b.name || null,
                           JSON.stringify(b.data || {}), b.enabled !== false ? 1 : 0, b.order || 0]
                });
            }
        }

        // Save collections
        if (data.collections) {
            for (const c of data.collections) {
                await db.execute({
                    sql: `INSERT OR REPLACE INTO collections (id, website_id, name, icon, fields)
                          VALUES (?, ?, ?, ?, ?)`,
                    args: [c.id, c.website_id, c.name, c.icon, JSON.stringify(c.fields)]
                });
            }
        }

        // Save items
        if (data.items) {
            for (const i of data.items) {
                await db.execute({
                    sql: `INSERT OR REPLACE INTO items (id, collection_id, website_id, data, display_order, created, updated)
                          VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    args: [i.id, i.collection_id, i.website_id || null, JSON.stringify(i.data),
                           i.order || 0, i.created || now, i.updated || now]
                });
            }
        }

        // Save media
        if (data.media) {
            for (const m of data.media) {
                await db.execute({
                    sql: `INSERT OR REPLACE INTO media (id, website_id, filename, original_name, url, type, size, uploaded, metadata)
                          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    args: [m.id, m.website_id || null, m.filename, m.original_name || null,
                           m.url || null, m.type || null, m.size || null, m.uploaded || now,
                           m.metadata ? JSON.stringify(m.metadata) : '{}']
                });
            }
        }

        // Save settings
        if (data.settings) {
            for (const s of data.settings) {
                await db.execute({
                    sql: `INSERT OR REPLACE INTO settings (id, website_id, key, value)
                          VALUES (?, ?, ?, ?)`,
                    args: [s.id, s.website_id, s.key, typeof s.value === 'string' ? s.value : JSON.stringify(s.value)]
                });
            }
        }

        // Save connections
        if (data.connections) {
            for (const c of data.connections) {
                await db.execute({
                    sql: `INSERT OR REPLACE INTO connections (id, name, type, environment_id, status, last_ping, ip_address, user_agent, error)
                          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    args: [c.id, c.name, c.type, c.environment_id || null, c.status,
                           c.last_ping, c.ip_address || null, c.user_agent || null, c.error || null]
                });
            }
        }

        await db.execute("COMMIT");
        console.log("[Turso] Full database saved");
    } catch (error) {
        await db.execute("ROLLBACK");
        console.error("[Turso] Error saving database:", error);
        throw error;
    }
}

// ==========================================
// ITEM CRUD OPERATIONS
// ==========================================

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
        order: r.display_order as number,
        created: r.created as string | undefined,
        updated: r.updated as string | undefined
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
        order: r.display_order as number,
        created: r.created as string | undefined,
        updated: r.updated as string | undefined
    };
}

export async function createItem(item: CollectionItem): Promise<CollectionItem> {
    const db = getDB();
    const now = new Date().toISOString();
    await db.execute({
        sql: `INSERT INTO items (id, collection_id, website_id, data, display_order, created, updated)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [item.id, item.collection_id, item.website_id || null, JSON.stringify(item.data),
               item.order || 0, now, now]
    });
    return { ...item, created: now, updated: now };
}

export async function updateItem(itemId: string, data: Record<string, any>): Promise<void> {
    const db = getDB();
    await db.execute({
        sql: "UPDATE items SET data = ?, updated = ? WHERE id = ?",
        args: [JSON.stringify(data), new Date().toISOString(), itemId]
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
        sql: "UPDATE items SET display_order = ?, updated = ? WHERE id = ?",
        args: [order, new Date().toISOString(), itemId]
    });
}

// ==========================================
// SETTINGS OPERATIONS
// ==========================================

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

export async function getAllSettings(websiteId: string): Promise<Record<string, any>> {
    const db = getDB();
    const result = await db.execute({
        sql: "SELECT key, value FROM settings WHERE website_id = ?",
        args: [websiteId]
    });

    const settings: Record<string, any> = {};
    for (const row of result.rows) {
        const key = row.key as string;
        const value = row.value as string;
        try {
            settings[key] = JSON.parse(value);
        } catch {
            settings[key] = value;
        }
    }
    return settings;
}

// ==========================================
// SYNC QUEUE OPERATIONS
// ==========================================

export async function addToSyncQueue(item: Omit<SyncQueueItem, 'id' | 'created' | 'processed'>): Promise<string> {
    const db = getDB();
    const id = `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    await db.execute({
        sql: `INSERT INTO sync_queue (id, source_env, target_env, operation, table_name, record_id, data, priority, scheduled_for, created, processed)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        args: [id, item.source_env, item.target_env || null, item.operation, item.table_name,
               item.record_id || null, item.data ? JSON.stringify(item.data) : null,
               item.priority || 'normal', item.scheduled_for || null, now]
    });

    return id;
}

export async function getPendingSyncItems(targetEnv?: string): Promise<SyncQueueItem[]> {
    const db = getDB();
    let sql = "SELECT * FROM sync_queue WHERE processed = 0";
    const args: any[] = [];

    if (targetEnv) {
        sql += " AND (target_env = ? OR target_env IS NULL)";
        args.push(targetEnv);
    }

    sql += " ORDER BY CASE priority WHEN 'immediate' THEN 0 WHEN 'scheduled' THEN 1 ELSE 2 END, created";

    const result = await db.execute({ sql, args });

    return result.rows.map(r => ({
        id: r.id as string,
        source_env: r.source_env as string,
        target_env: r.target_env as string | undefined,
        operation: r.operation as 'insert' | 'update' | 'delete' | 'full_sync',
        table_name: r.table_name as string,
        record_id: r.record_id as string | undefined,
        data: r.data ? JSON.parse(r.data as string) : undefined,
        priority: r.priority as 'immediate' | 'scheduled' | 'low',
        scheduled_for: r.scheduled_for as string | undefined,
        created: r.created as string,
        processed: false,
        processed_at: undefined,
        result: undefined,
        error: undefined
    }));
}

export async function markSyncItemProcessed(id: string, result: string, error?: string): Promise<void> {
    const db = getDB();
    await db.execute({
        sql: "UPDATE sync_queue SET processed = 1, processed_at = ?, result = ?, error = ? WHERE id = ?",
        args: [new Date().toISOString(), result, error || null, id]
    });
}

// ==========================================
// SYNC LOG OPERATIONS
// ==========================================

export async function addSyncLog(log: Omit<SyncLogEntry, 'id'>): Promise<void> {
    const db = getDB();
    const id = `log_${Date.now()}`;

    await db.execute({
        sql: `INSERT INTO sync_log (id, timestamp, source, target, action, status, details, records_affected, duration_ms)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [id, log.timestamp, log.source || null, log.target || null, log.action || null,
               log.status || null, log.details || null, log.records_affected || 0, log.duration_ms || 0]
    });
}

// ==========================================
// CONTENT OPERATIONS
// ==========================================

export async function getContent(websiteId: string, section?: string): Promise<Record<string, any>> {
    const db = getDB();
    let sql = "SELECT section, key, value, type FROM content WHERE website_id = ?";
    const args: any[] = [websiteId];

    if (section) {
        sql += " AND section = ?";
        args.push(section);
    }

    const result = await db.execute({ sql, args });

    const content: Record<string, any> = {};
    for (const row of result.rows) {
        const sectionName = row.section as string;
        const key = row.key as string;
        let value = row.value as string;

        if (!content[sectionName]) {
            content[sectionName] = {};
        }

        try {
            content[sectionName][key] = JSON.parse(value);
        } catch {
            content[sectionName][key] = value;
        }
    }

    return content;
}

export async function setContent(websiteId: string, section: string, key: string, value: any, type: string = 'text'): Promise<void> {
    const db = getDB();
    const id = `cnt_${websiteId}_${section}_${key}`;
    const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
    const now = new Date().toISOString();

    await db.execute({
        sql: `INSERT INTO content (id, website_id, section, key, value, type, updated)
              VALUES (?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(website_id, section, key) DO UPDATE SET value = ?, type = ?, updated = ?`,
        args: [id, websiteId, section, key, valueStr, type, now, valueStr, type, now]
    });
}

// ==========================================
// BLOCK OPERATIONS
// ==========================================

export async function getBlock(blockId: string): Promise<Block | null> {
    const db = getDB();
    const result = await db.execute({
        sql: "SELECT * FROM blocks WHERE id = ?",
        args: [blockId]
    });

    if (result.rows.length === 0) return null;

    const r = result.rows[0];
    return {
        id: r.id as string,
        page_id: r.page_id as string,
        website_id: r.website_id as string | undefined,
        type: r.type as string,
        name: r.name as string | undefined,
        data: JSON.parse(r.data as string || '{}'),
        enabled: r.enabled === 1,
        order: r.display_order as number
    };
}

export async function updateBlock(blockId: string, data: Record<string, any>): Promise<void> {
    const db = getDB();
    await db.execute({
        sql: "UPDATE blocks SET data = ? WHERE id = ?",
        args: [JSON.stringify(data), blockId]
    });
}

export async function getBlocksByPage(pageId: string): Promise<Block[]> {
    const db = getDB();
    const result = await db.execute({
        sql: "SELECT * FROM blocks WHERE page_id = ? ORDER BY display_order",
        args: [pageId]
    });

    return result.rows.map(r => ({
        id: r.id as string,
        page_id: r.page_id as string,
        website_id: r.website_id as string | undefined,
        type: r.type as string,
        name: r.name as string | undefined,
        data: JSON.parse(r.data as string || '{}'),
        enabled: r.enabled === 1,
        order: r.display_order as number
    }));
}

export async function getBlocksByWebsite(websiteId: string): Promise<Block[]> {
    const db = getDB();
    const result = await db.execute({
        sql: "SELECT * FROM blocks WHERE website_id = ? ORDER BY display_order",
        args: [websiteId]
    });

    return result.rows.map(r => ({
        id: r.id as string,
        page_id: r.page_id as string,
        website_id: r.website_id as string | undefined,
        type: r.type as string,
        name: r.name as string | undefined,
        data: JSON.parse(r.data as string || '{}'),
        enabled: r.enabled === 1,
        order: r.display_order as number
    }));
}

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

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

// Get database stats
export async function getDBStats(): Promise<{
    websites: number;
    pages: number;
    blocks: number;
    collections: number;
    items: number;
    media: number;
    pendingSync: number;
}> {
    const db = getDB();
    const [websites, pages, blocks, collections, items, media, pendingSync] = await Promise.all([
        db.execute("SELECT COUNT(*) as count FROM websites"),
        db.execute("SELECT COUNT(*) as count FROM pages"),
        db.execute("SELECT COUNT(*) as count FROM blocks"),
        db.execute("SELECT COUNT(*) as count FROM collections"),
        db.execute("SELECT COUNT(*) as count FROM items"),
        db.execute("SELECT COUNT(*) as count FROM media"),
        db.execute("SELECT COUNT(*) as count FROM sync_queue WHERE processed = 0")
    ]);

    return {
        websites: websites.rows[0].count as number,
        pages: pages.rows[0].count as number,
        blocks: blocks.rows[0].count as number,
        collections: collections.rows[0].count as number,
        items: items.rows[0].count as number,
        media: media.rows[0].count as number,
        pendingSync: pendingSync.rows[0].count as number
    };
}
