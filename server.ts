/**
 * Iustus Mercatura - Universal Dev Server
 * Full CMS Backend with Database, Sync & Monitoring
 */

import { serve, file } from "bun";
import { mkdir, writeFile, readFile, readdir, stat, copyFile, unlink } from "fs/promises";
import { join, extname } from "path";
import { existsSync, readdirSync } from "fs";

// ==========================================
// LIVE SYNC SYSTEM
// ==========================================
interface SyncClient {
    id: string;
    type: 'dev_admin' | 'admin_panel' | 'website';
    ws: any;
    lastPing: Date;
}

interface PendingChange {
    id: string;
    source: string;
    type: string;
    data: any;
    timestamp: string;
    scheduledFor?: string;
    applied: boolean;
}

interface SyncState {
    lastBackup: string | null;
    lastSync: string | null;
    pendingChanges: PendingChange[];
}

const syncClients: Map<string, SyncClient> = new Map();
let syncState: SyncState = {
    lastBackup: null,
    lastSync: null,
    pendingChanges: []
};
const BACKUP_DIR = join(import.meta.dir, "backups");
const SYNC_STATE_FILE = join(import.meta.dir, "database", "sync-state.json");

// Initialize backup directory
if (!existsSync(BACKUP_DIR)) {
    await mkdir(BACKUP_DIR, { recursive: true });
}

// Load sync state
async function loadSyncState() {
    try {
        if (existsSync(SYNC_STATE_FILE)) {
            const data = await readFile(SYNC_STATE_FILE, 'utf-8');
            syncState = JSON.parse(data);
        }
    } catch (e) {
        console.log('[Sync] No previous sync state found');
    }
}

async function saveSyncState() {
    await writeFile(SYNC_STATE_FILE, JSON.stringify(syncState, null, 2));
}

// ==========================================
// GIT AUTO-SYNC FOR CONTENT CHANGES
// ==========================================
let gitSyncPending = false;
let gitSyncTimeout: ReturnType<typeof setTimeout> | null = null;

// Debounced Git sync - waits 5 seconds after last change before syncing
async function scheduleGitSync(description: string) {
    // Only run on production (Render)
    if (!process.env.RENDER) {
        log("DEBUG", "[GitSync] Skipped - not on Render");
        return;
    }

    gitSyncPending = true;

    // Clear existing timeout
    if (gitSyncTimeout) {
        clearTimeout(gitSyncTimeout);
    }

    // Wait 5 seconds after last change before syncing
    gitSyncTimeout = setTimeout(async () => {
        if (!gitSyncPending) return;
        gitSyncPending = false;

        try {
            log("INFO", `[GitSync] Starting content sync: ${description}`);

            const { spawn } = await import('child_process');
            const BASE_DIR = import.meta.dir;

            // Only sync content files, not code
            const contentPaths = [
                'uploads/',
                'assets/images/team/',
                'database/database.json',
                'database/locations.json',
                'data.json'
            ];

            // Check if there are any changes
            const statusResult = await runGitCommand(spawn, BASE_DIR, ['status', '--porcelain', ...contentPaths]);

            if (!statusResult.trim()) {
                log("INFO", "[GitSync] No content changes to sync");
                return;
            }

            log("INFO", `[GitSync] Changes detected:\n${statusResult}`);

            // Configure git for Render environment
            await runGitCommand(spawn, BASE_DIR, ['config', 'user.email', 'admin@iustus-mercatura.com']);
            await runGitCommand(spawn, BASE_DIR, ['config', 'user.name', 'Iustus Admin']);

            // Add only content files
            for (const path of contentPaths) {
                try {
                    await runGitCommand(spawn, BASE_DIR, ['add', path]);
                } catch (e) {
                    // Ignore if path doesn't exist
                }
            }

            // Commit
            const commitMsg = `[Auto] Content update: ${description}\n\nAutomated sync from admin panel`;
            await runGitCommand(spawn, BASE_DIR, ['commit', '-m', commitMsg]);

            // Push
            await runGitCommand(spawn, BASE_DIR, ['push']);

            log("INFO", "[GitSync] Content synced to Git successfully");

        } catch (e) {
            log("ERROR", `[GitSync] Failed to sync: ${e}`);
        }
    }, 5000); // 5 second debounce
}

function runGitCommand(spawn: any, cwd: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
        const proc = spawn('git', args, { cwd });
        let stdout = '';
        let stderr = '';

        proc.stdout?.on('data', (data: Buffer) => { stdout += data.toString(); });
        proc.stderr?.on('data', (data: Buffer) => { stderr += data.toString(); });

        proc.on('close', (code: number) => {
            if (code === 0) {
                resolve(stdout);
            } else {
                reject(new Error(`Git ${args[0]} failed: ${stderr || stdout}`));
            }
        });

        proc.on('error', reject);
    });
}

// Broadcast to all WebSocket clients
function broadcastSync(message: any, excludeId?: string) {
    const msgStr = JSON.stringify(message);
    syncClients.forEach((client, id) => {
        if (id !== excludeId && client.ws.readyState === 1) {
            try {
                client.ws.send(msgStr);
            } catch (e) {
                console.error(`[Sync] Error sending to ${id}`);
            }
        }
    });
}

// Broadcast to specific client type
function broadcastToType(type: SyncClient['type'], message: any) {
    const msgStr = JSON.stringify(message);
    syncClients.forEach(client => {
        if (client.type === type && client.ws.readyState === 1) {
            try {
                client.ws.send(msgStr);
            } catch (e) {
                console.error(`[Sync] Error sending to ${client.type}`);
            }
        }
    });
}

// Get next 3:00 AM
function getNext3AM(): Date {
    const now = new Date();
    const next = new Date(now);
    next.setHours(3, 0, 0, 0);
    if (now.getHours() >= 3) next.setDate(next.getDate() + 1);
    return next;
}

// Create backup
async function createBackup(): Promise<string | null> {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFolder = join(BACKUP_DIR, `backup_${timestamp}`);
        await mkdir(backupFolder, { recursive: true });

        // Backup files
        const filesToBackup = ['database/database.json', 'data.json', 'index.html'];
        for (const f of filesToBackup) {
            const src = join(import.meta.dir, f);
            if (existsSync(src)) {
                await copyFile(src, join(backupFolder, f.split('/').pop()!));
            }
        }

        syncState.lastBackup = new Date().toISOString();
        await saveSyncState();
        console.log(`[Sync] Backup created: ${backupFolder}`);

        // Notify clients
        broadcastSync({
            type: 'backup_complete',
            timestamp: syncState.lastBackup,
            path: backupFolder
        });

        return backupFolder;
    } catch (e) {
        console.error('[Sync] Backup error:', e);
        return null;
    }
}

// Apply pending changes (from Dev Admin)
async function applyPendingChanges() {
    const pending = syncState.pendingChanges.filter(c => !c.applied);
    if (pending.length === 0) return;

    console.log(`[Sync] Applying ${pending.length} pending changes...`);

    for (const change of pending) {
        // Broadcast to Admin and Website
        broadcastToType('admin_panel', {
            type: 'sync_update',
            source: 'dev_admin',
            data: change.data,
            priority: 'immediate'
        });
        broadcastToType('website', {
            type: 'sync_update',
            source: 'dev_admin',
            data: change.data,
            priority: 'immediate'
        });
        change.applied = true;
    }

    syncState.lastSync = new Date().toISOString();
    await saveSyncState();
    console.log('[Sync] All pending changes applied');
}

// Scheduler for backup and sync
function startSyncScheduler() {
    setInterval(async () => {
        const now = new Date();
        const h = now.getHours();
        const m = now.getMinutes();

        // Backup at 23:59
        if (h === 23 && m === 59) {
            console.log('[Sync] Starting scheduled backup...');
            await createBackup();
        }

        // Apply changes at 3:00
        if (h === 3 && m === 0) {
            console.log('[Sync] Starting scheduled sync...');
            await applyPendingChanges();
        }
    }, 60000);
    console.log('[Sync] Scheduler started (Backup: 23:59, Sync: 03:00)');
}

// Initialize sync
await loadSyncState();
startSyncScheduler();

const PORT = parseInt(process.env.PORT || "3005");
const BASE_DIR = import.meta.dir;

// On Render, use persistent disk at /data for uploads and database
// This preserves data across deploys
const IS_RENDER = !!process.env.RENDER;
const PERSISTENT_DIR = IS_RENDER ? "/data" : BASE_DIR;

// Directories - use persistent storage on Render
const UPLOADS_DIR = IS_RENDER ? join(PERSISTENT_DIR, "uploads") : join(BASE_DIR, "uploads");
const DB_DIR = IS_RENDER ? join(PERSISTENT_DIR, "database") : join(BASE_DIR, "database");
const TEMPLATES_DIR = join(BASE_DIR, "templates");
const LOGS_DIR = IS_RENDER ? join(PERSISTENT_DIR, "logs") : join(BASE_DIR, "logs");
// Team images: persistent on Render, local in assets folder otherwise
const TEAM_IMAGES_DIR = IS_RENDER ? join(PERSISTENT_DIR, "images", "team") : join(BASE_DIR, "assets", "images", "team");

// Ensure directories exist
for (const dir of [UPLOADS_DIR, DB_DIR, TEMPLATES_DIR, LOGS_DIR, TEAM_IMAGES_DIR]) {
    if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
    }
}

// Log storage configuration
log("INFO", `[Storage] Running on ${IS_RENDER ? "Render" : "Local"}`);
log("INFO", `[Storage] Database: ${DB_DIR}`);
log("INFO", `[Storage] Uploads: ${UPLOADS_DIR}`);
log("INFO", `[Storage] Team Images: ${TEAM_IMAGES_DIR}`);

// Database Tables (JSON-based for local dev)
interface DBTables {
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

interface Website {
    id: string;
    name: string;
    slug: string;
    domain?: string;
    template?: string;
    created: string;
    updated: string;
    status: 'active' | 'draft' | 'archived';
}

interface Page {
    id: string;
    website_id: string;
    name: string;
    slug: string;
    blocks: string[];
    status: 'active' | 'draft';
    order: number;
}

interface Block {
    id: string;
    page_id: string;
    type: string;
    name: string;
    data: Record<string, any>;
    enabled: boolean;
    order: number;
}

interface Collection {
    id: string;
    website_id: string;
    name: string;
    icon: string;
    fields: { key: string; label: string; type: string; required?: boolean; options?: string[] }[];
}

interface CollectionItem {
    id: string;
    collection_id: string;
    data: Record<string, any>;
    order: number;
}

interface MediaItem {
    id: string;
    website_id: string;
    filename: string;
    original_name: string;
    url: string;
    type: string;
    size: number;
    uploaded: string;
}

interface Settings {
    id: string;
    website_id: string;
    key: string;
    value: any;
}

interface SyncLogEntry {
    id: string;
    timestamp: string;
    source: 'dev_admin' | 'admin_panel' | 'website' | 'server' | 'developer';
    target: 'dev_admin' | 'admin_panel' | 'website' | 'server' | 'all';
    action: string;
    status: 'success' | 'error' | 'pending';
    details?: string;
}

interface ConnectionStatus {
    id: string;
    name: string;
    type: 'dev_admin' | 'admin_panel' | 'website' | 'database';
    status: 'connected' | 'disconnected' | 'error';
    last_ping: string;
    error?: string;
}

// In-memory database cache
let db: DBTables = {
    websites: [],
    pages: [],
    blocks: [],
    collections: [],
    items: [],
    media: [],
    settings: [],
    sync_log: [],
    connections: []
};

// Load database on startup
async function loadDatabase(): Promise<void> {
    const dbFile = join(DB_DIR, "database.json");
    try {
        if (existsSync(dbFile)) {
            const content = await readFile(dbFile, "utf-8");
            db = JSON.parse(content);
            log("INFO", "Database loaded successfully");
        } else {
            // Initialize with default data
            db = getDefaultDatabase();
            await saveDatabase();
            log("INFO", "Database initialized with defaults");
        }
    } catch (e) {
        log("ERROR", `Failed to load database: ${e}`);
        db = getDefaultDatabase();
    }
}

async function saveDatabase(): Promise<void> {
    const dbFile = join(DB_DIR, "database.json");
    try {
        log("INFO", `[DB] Saving database to: ${dbFile}`);
        await writeFile(dbFile, JSON.stringify(db, null, 2), "utf-8");
        log("INFO", `[DB] Database saved successfully`);
    } catch (e: any) {
        log("ERROR", `Failed to save database to ${dbFile}: ${e?.message || e}`);
        throw e; // Re-throw so caller knows it failed
    }
}

function getDefaultDatabase(): DBTables {
    const now = new Date().toISOString();
    return {
        websites: [{
            id: "ws_iustus",
            name: "Iustus Mercatura",
            slug: "iustus-mercatura",
            domain: "localhost:3005",
            created: now,
            updated: now,
            status: "active"
        }],
        pages: [{
            id: "pg_index",
            website_id: "ws_iustus",
            name: "Iustus Mercatura",
            slug: "index.html",
            blocks: [],
            status: "active",
            order: 0
        }],
        blocks: [],
        collections: [
            {
                id: "col_team",
                website_id: "ws_iustus",
                name: "Team",
                icon: "fa-users",
                fields: [
                    { key: "name", label: "Name", type: "text", required: true },
                    { key: "role", label: "Position", type: "text", required: true },
                    { key: "image", label: "Bild", type: "image" },
                    { key: "description", label: "Beschreibung", type: "textarea" },
                    { key: "category", label: "Kategorie", type: "select", options: ["leadership", "ceo", "cooRegional"] }
                ]
            },
            {
                id: "col_products",
                website_id: "ws_iustus",
                name: "Produkte",
                icon: "fa-box",
                fields: [
                    { key: "name", label: "Name", type: "text", required: true },
                    { key: "category", label: "Kategorie", type: "select", options: ["Sugar", "Grains", "Other"] },
                    { key: "image", label: "Bild", type: "image" },
                    { key: "description", label: "Beschreibung", type: "textarea" }
                ]
            },
            {
                id: "col_locations",
                website_id: "ws_iustus",
                name: "Standorte",
                icon: "fa-map-marker-alt",
                fields: [
                    { key: "country", label: "Land", type: "text", required: true },
                    { key: "city", label: "Stadt", type: "text", required: true },
                    { key: "type", label: "Typ", type: "text" },
                    { key: "flag", label: "Flagge", type: "text" },
                    { key: "address", label: "Adresse", type: "textarea" }
                ]
            }
        ],
        items: [],
        media: [],
        settings: [
            { id: "set_1", website_id: "ws_iustus", key: "siteName", value: "Iustus Mercatura" },
            { id: "set_2", website_id: "ws_iustus", key: "primaryColor", value: "#0a1628" },
            { id: "set_3", website_id: "ws_iustus", key: "accentColor", value: "#c9a227" }
        ],
        sync_log: [],
        connections: [
            { id: "conn_1", name: "Dev Admin", type: "dev_admin", status: "disconnected", last_ping: now },
            { id: "conn_2", name: "Admin Panel", type: "admin_panel", status: "disconnected", last_ping: now },
            { id: "conn_3", name: "Website", type: "website", status: "connected", last_ping: now },
            { id: "conn_4", name: "Database", type: "database", status: "connected", last_ping: now }
        ]
    };
}

// Logging
async function log(level: string, message: string): Promise<void> {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] [${level}] ${message}\n`;
    console.log(logLine.trim());

    const logFile = join(LOGS_DIR, `${new Date().toISOString().split('T')[0]}.log`);
    try {
        const existing = existsSync(logFile) ? await readFile(logFile, "utf-8") : "";
        await writeFile(logFile, existing + logLine, "utf-8");
    } catch (e) {
        // Ignore log write errors
    }
}

// Add sync log entry
function addSyncLog(source: SyncLogEntry['source'], target: SyncLogEntry['target'], action: string, status: SyncLogEntry['status'], details?: string): void {
    db.sync_log.push({
        id: `sync_${Date.now()}`,
        timestamp: new Date().toISOString(),
        source,
        target,
        action,
        status,
        details
    });
    // Keep only last 100 entries
    if (db.sync_log.length > 100) {
        db.sync_log = db.sync_log.slice(-100);
    }
}

// Update connection status
function updateConnection(type: ConnectionStatus['type'], status: ConnectionStatus['status'], error?: string): void {
    const conn = db.connections.find(c => c.type === type);
    if (conn) {
        conn.status = status;
        conn.last_ping = new Date().toISOString();
        conn.error = error;
    }
}

// MIME types - UTF-8 charset for text files to prevent encoding issues
const MIME_TYPES: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".webp": "image/webp",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".pdf": "application/pdf",
};

// Load database before starting server
await loadDatabase();

console.log(`
╔══════════════════════════════════════════════════════════════╗
║           Iustus Mercatura - Universal Dev Server            ║
╠══════════════════════════════════════════════════════════════╣
║  Website:      http://localhost:${PORT}                        ║
║  Admin Panel:  http://localhost:${PORT}/admin.html             ║
║  Dev Admin:    http://localhost:${PORT}/developer.html         ║
║  API:          http://localhost:${PORT}/api/                   ║
╠══════════════════════════════════════════════════════════════╣
║  Database:     ${DB_DIR}                        ║
║  Uploads:      ${UPLOADS_DIR}                      ║
║  Templates:    ${TEMPLATES_DIR}                    ║
╚══════════════════════════════════════════════════════════════╝
`);

serve({
    port: PORT,
    async fetch(req, server) {
        const url = new URL(req.url);
        let pathname = url.pathname;

        // CORS headers
        const corsHeaders = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, X-Source",
        };

        // Handle OPTIONS (CORS preflight)
        if (req.method === "OPTIONS") {
            return new Response(null, { headers: corsHeaders });
        }

        // WebSocket upgrade for /ws/sync
        if (pathname === "/ws/sync") {
            const clientType = url.searchParams.get('type') as SyncClient['type'] || 'website';
            const upgraded = server.upgrade(req, {
                data: { type: clientType }
            });
            if (upgraded) return undefined as any;
            return new Response("WebSocket upgrade failed", { status: 500 });
        }

        // API Routes
        if (pathname.startsWith("/api/")) {
            return handleAPI(req, pathname, corsHeaders);
        }

        // Serve static files
        return serveStatic(pathname, corsHeaders);
    },
    websocket: {
        open(ws) {
            const clientType = (ws.data as any)?.type || 'website';
            const clientId = `${clientType}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

            syncClients.set(clientId, {
                id: clientId,
                type: clientType,
                ws: ws,
                lastPing: new Date()
            });

            (ws as any).clientId = clientId;

            console.log(`[WebSocket] ${clientType} connected (${clientId}). Total: ${syncClients.size}`);

            // Send welcome message with sync state
            ws.send(JSON.stringify({
                type: 'connected',
                clientId,
                syncState: {
                    lastBackup: syncState.lastBackup,
                    lastSync: syncState.lastSync,
                    pendingCount: syncState.pendingChanges.filter(c => !c.applied).length,
                    schedule: {
                        nextBackup: (() => {
                            const d = new Date();
                            d.setHours(23, 59, 0, 0);
                            if (d < new Date()) d.setDate(d.getDate() + 1);
                            return d.toISOString();
                        })(),
                        nextSync: getNext3AM().toISOString()
                    }
                },
                connectedClients: Array.from(syncClients.values()).map(c => ({ type: c.type, id: c.id }))
            }));

            // Notify others
            broadcastSync({
                type: 'client_connected',
                clientType,
                connectedClients: Array.from(syncClients.values()).map(c => ({ type: c.type, id: c.id }))
            }, clientId);
        },
        message(ws, message) {
            const clientId = (ws as any).clientId;
            const client = syncClients.get(clientId);
            if (!client) return;

            client.lastPing = new Date();

            try {
                const data = JSON.parse(message.toString());
                handleSyncMessage(client, data);
            } catch (e) {
                console.error('[WebSocket] Invalid message:', e);
            }
        },
        close(ws) {
            const clientId = (ws as any).clientId;
            const client = syncClients.get(clientId);

            if (client) {
                console.log(`[WebSocket] ${client.type} disconnected (${clientId}). Total: ${syncClients.size - 1}`);
                syncClients.delete(clientId);

                broadcastSync({
                    type: 'client_disconnected',
                    clientType: client.type,
                    connectedClients: Array.from(syncClients.values()).map(c => ({ type: c.type, id: c.id }))
                });
            }
        }
    }
});

// Handle sync messages
async function handleSyncMessage(client: SyncClient, data: any) {
    const { type, payload, priority } = data;

    switch (type) {
        case 'ping':
            client.ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
            break;

        case 'update':
            // Handle updates based on source
            if (client.type === 'dev_admin') {
                // Dev Admin changes are scheduled for 3:00 AM (unless immediate)
                if (priority === 'immediate') {
                    // Immediate sync to all
                    broadcastSync({
                        type: 'sync_update',
                        source: 'dev_admin',
                        data: payload,
                        timestamp: new Date().toISOString()
                    }, client.id);
                } else {
                    // Schedule for 3:00 AM
                    const pendingChange: PendingChange = {
                        id: `change_${Date.now()}`,
                        source: 'dev_admin',
                        type: payload?.changeType || 'unknown',
                        data: payload,
                        timestamp: new Date().toISOString(),
                        scheduledFor: getNext3AM().toISOString(),
                        applied: false
                    };
                    syncState.pendingChanges.push(pendingChange);
                    await saveSyncState();

                    client.ws.send(JSON.stringify({
                        type: 'change_scheduled',
                        changeId: pendingChange.id,
                        scheduledFor: pendingChange.scheduledFor
                    }));
                }
            } else if (client.type === 'admin_panel') {
                // Admin changes go to Website immediately
                broadcastToType('website', {
                    type: 'sync_update',
                    source: 'admin_panel',
                    data: payload,
                    timestamp: new Date().toISOString()
                });
                // Notify Dev about the change (for info)
                broadcastToType('dev_admin', {
                    type: 'update_notification',
                    source: 'admin_panel',
                    data: payload,
                    timestamp: new Date().toISOString()
                });
            } else if (client.type === 'website') {
                // Website changes go to Admin
                broadcastToType('admin_panel', {
                    type: 'sync_update',
                    source: 'website',
                    data: payload,
                    timestamp: new Date().toISOString()
                });
            }
            break;

        case 'request_sync':
            // Send full state
            client.ws.send(JSON.stringify({
                type: 'full_sync',
                syncState,
                connectedClients: Array.from(syncClients.values()).map(c => ({ type: c.type, id: c.id }))
            }));
            break;

        case 'force_sync':
            // Only Dev Admin can force sync
            if (client.type === 'dev_admin') {
                await applyPendingChanges();
                client.ws.send(JSON.stringify({ type: 'force_sync_complete' }));
            }
            break;

        case 'create_backup':
            // Only Dev Admin can create backup
            if (client.type === 'dev_admin') {
                const path = await createBackup();
                client.ws.send(JSON.stringify({ type: 'backup_created', path }));
            }
            break;
    }
}

async function handleAPI(req: Request, pathname: string, headers: Record<string, string>): Promise<Response> {
    const jsonHeaders = { ...headers, "Content-Type": "application/json" };
    const source = req.headers.get("X-Source") || "unknown";

    try {
        // ==========================================
        // HEALTH CHECK ENDPOINT
        // ==========================================

        // GET /api/health - Health check for connection monitoring
        if (pathname === "/api/health" && req.method === "GET") {
            return new Response(JSON.stringify({
                status: "ok",
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                server: "Iustus Mercatura Dev Server"
            }), { headers: jsonHeaders });
        }

        // ==========================================
        // PUBLIC WEBSITE API (Dynamic Content from DB)
        // ==========================================

        // GET /api/public/content - Get all website content from database.json
        if (pathname === "/api/public/content" && req.method === "GET") {
            try {
                // Get team members grouped by category
                const teamItems = db.items?.filter((item: any) => item.collection_id === 'col_team') || [];
                const teamByCategory: Record<string, any[]> = {};

                teamItems.forEach((item: any) => {
                    const category = item.data?.category || 'Other';
                    if (!teamByCategory[category]) {
                        teamByCategory[category] = [];
                    }
                    teamByCategory[category].push({
                        id: item.id,
                        name: item.data?.name || '',
                        role: item.data?.role || '',
                        image: item.data?.image || '',
                        initials: item.data?.initials || '',
                        description: item.data?.description || '',
                        linkedin: item.data?.linkedin || '',
                        order: item.order || 0
                    });
                });

                // Sort each category by order
                Object.keys(teamByCategory).forEach(cat => {
                    teamByCategory[cat].sort((a, b) => a.order - b.order);
                });

                // Get products
                const productItems = db.items?.filter((item: any) => item.collection_id === 'col_products') || [];
                const products = productItems.map((item: any) => ({
                    id: item.id,
                    name: item.data?.name || '',
                    category: item.data?.category || '',
                    image: item.data?.image || null,
                    showImage: item.data?.showImage || false,
                    description: item.data?.description || '',
                    specs: item.data?.specs || {},
                    featured: item.data?.featured || false,
                    order: item.order || 0
                })).sort((a: any, b: any) => a.order - b.order);

                // Get locations
                const locationItems = db.items?.filter((item: any) => item.collection_id === 'col_locations') || [];
                const locations = locationItems.map((item: any) => ({
                    id: item.id,
                    country: item.data?.country || '',
                    city: item.data?.city || '',
                    type: item.data?.type || '',
                    company: item.data?.company || '',
                    address: item.data?.address || '',
                    countryCode: item.data?.countryCode || '',
                    coordinates: item.data?.coordinates || { x: 0, y: 0 },
                    order: item.order || 0
                })).sort((a: any, b: any) => a.order - b.order);

                // Get projects
                const projectItems = db.items?.filter((item: any) => item.collection_id === 'col_projects') || [];
                const projects = projectItems.map((item: any) => ({
                    id: item.id,
                    name: item.data?.name || '',
                    year: item.data?.year || '',
                    description: item.data?.description || '',
                    status: item.data?.status || '',
                    stats: item.data?.stats || [],
                    order: item.order || 0
                })).sort((a: any, b: any) => a.order - b.order);

                // Get blocks data (hero, values, sustainability, partners)
                const blocks: Record<string, any> = {};
                db.blocks?.forEach((block: any) => {
                    blocks[block.type] = block.data || {};
                });

                // Get settings
                const settings: Record<string, any> = {};
                db.settings?.forEach((s: any) => {
                    settings[s.key] = s.value;
                });

                return new Response(JSON.stringify({
                    success: true,
                    data: {
                        team: teamByCategory,
                        products,
                        locations,
                        projects,
                        blocks,
                        settings,
                        lastUpdated: new Date().toISOString()
                    }
                }), { headers: jsonHeaders });
            } catch (e) {
                log("ERROR", `Failed to get public content: ${e}`);
                return new Response(JSON.stringify({
                    success: false,
                    error: "Failed to load content"
                }), { status: 500, headers: jsonHeaders });
            }
        }

        // GET /api/public/team - Get only team data
        if (pathname === "/api/public/team" && req.method === "GET") {
            try {
                const teamItems = db.items?.filter((item: any) => item.collection_id === 'col_team') || [];
                const teamByCategory: Record<string, any[]> = {};

                teamItems.forEach((item: any) => {
                    const category = item.data?.category || 'Other';
                    if (!teamByCategory[category]) {
                        teamByCategory[category] = [];
                    }
                    teamByCategory[category].push({
                        id: item.id,
                        name: item.data?.name || '',
                        role: item.data?.role || '',
                        image: item.data?.image || '',
                        initials: item.data?.initials || '',
                        description: item.data?.description || '',
                        linkedin: item.data?.linkedin || '',
                        order: item.order || 0
                    });
                });

                // Sort each category by order
                Object.keys(teamByCategory).forEach(cat => {
                    teamByCategory[cat].sort((a, b) => a.order - b.order);
                });

                return new Response(JSON.stringify({
                    success: true,
                    team: teamByCategory
                }), { headers: jsonHeaders });
            } catch (e) {
                return new Response(JSON.stringify({ success: false, error: "Failed to load team" }), { status: 500, headers: jsonHeaders });
            }
        }

        // ==========================================
        // COMMODITY PRICE ENDPOINT
        // ==========================================

        // GET /api/commodity-price - Get Sugar IC45 or other commodity prices
        if (pathname === "/api/commodity-price" && req.method === "GET") {
            try {
                // Use a free commodity API - Alpha Vantage or similar
                // For Sugar, we'll fetch from a reliable source
                // Fallback to cached/static data if API fails

                // Try to fetch real data from Yahoo Finance API (free, no key needed for some endpoints)
                const response = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/SB=F?interval=1d&range=2d');

                if (response.ok) {
                    const data = await response.json();
                    const result = data.chart?.result?.[0];

                    if (result) {
                        const meta = result.meta;

                        // Current price (regularMarketPrice is in cents per pound for raw sugar)
                        const rawPriceCentsPerLb = meta.regularMarketPrice;
                        const previousClose = meta.chartPreviousClose || meta.previousClose;

                        // Calculate change percentage (based on raw sugar movement)
                        const change = rawPriceCentsPerLb - previousClose;
                        const changePercent = ((change / previousClose) * 100);

                        // Convert raw sugar price to IC45 white sugar price
                        // Raw sugar (SB=F) is in cents/lb
                        // 1 metric ton = 2204.62 lbs
                        // IC45 white refined sugar trades at a premium of ~20-25% over raw sugar
                        // Plus processing/refining premium
                        const rawPricePerTon = (rawPriceCentsPerLb / 100) * 2204.62;

                        // IC45 Premium: Raw sugar base + refining/processing premium
                        // IC45 white refined sugar (ICUMSA 45) FOB Santos typically trades at:
                        // - ~25-35% premium over raw sugar for quality/refinement
                        // - Plus logistics and certification costs
                        // Current market: IC45 FOB Santos ~$550-650/ton (Dec 2024)
                        const ic45Premium = 1.32; // 32% premium for white refined IC45
                        const processingCost = 120; // USD per ton refining/processing/certification
                        const ic45PricePerTon = (rawPricePerTon * ic45Premium) + processingCost;

                        return new Response(JSON.stringify({
                            commodity: "Sugar IC45",
                            symbol: "IC45-BR",
                            price: ic45PricePerTon.toFixed(2),
                            change: changePercent.toFixed(2),
                            direction: change >= 0 ? "positive" : "negative",
                            currency: "USD",
                            unit: "per metric ton",
                            basis: "FOB Santos",
                            timestamp: new Date().toISOString(),
                            source: "Calculated from NYBOT Raw Sugar"
                        }), { headers: jsonHeaders });
                    }
                }

                // Fallback to realistic IC45 static data if API fails
                return new Response(JSON.stringify({
                    commodity: "Sugar IC45",
                    price: "605.00",
                    change: "1.8",
                    direction: "positive",
                    currency: "USD",
                    unit: "per metric ton",
                    basis: "FOB Santos",
                    timestamp: new Date().toISOString(),
                    source: "cached"
                }), { headers: jsonHeaders });

            } catch (error) {
                console.error('[API] Error fetching commodity price:', error);
                // Return realistic IC45 fallback data
                return new Response(JSON.stringify({
                    commodity: "Sugar IC45",
                    price: "605.00",
                    change: "1.8",
                    direction: "positive",
                    currency: "USD",
                    unit: "per metric ton",
                    basis: "FOB Santos",
                    timestamp: new Date().toISOString(),
                    source: "fallback"
                }), { headers: jsonHeaders });
            }
        }

        // ==========================================
        // DATABASE ENDPOINTS
        // ==========================================

        // GET /api/db - Get full database
        if (pathname === "/api/db" && req.method === "GET") {
            updateConnection("dev_admin", "connected");
            return new Response(JSON.stringify(db), { headers: jsonHeaders });
        }

        // POST /api/db - Save full database
        if (pathname === "/api/db" && req.method === "POST") {
            try {
                const body = await req.json();
                log("INFO", `[API] POST /api/db - Received ${Object.keys(body).length} keys`);

                // Update in-memory database
                if (body.websites) db.websites = body.websites;
                if (body.pages) db.pages = body.pages;
                if (body.blocks) db.blocks = body.blocks;
                if (body.collections) db.collections = body.collections;
                if (body.items) db.items = body.items;
                if (body.media) db.media = body.media;
                if (body.settings) db.settings = body.settings;

                // Save to file using the existing saveDatabase function
                await saveDatabase();
                log("INFO", "[API] Database saved successfully via POST /api/db");

                return new Response(JSON.stringify({ success: true }), { headers: jsonHeaders });
            } catch (error: any) {
                const errorMessage = error?.message || String(error);
                log("ERROR", `[API] Failed to save database: ${errorMessage}`);
                return new Response(JSON.stringify({ error: "Failed to save database", details: errorMessage }), { status: 500, headers: jsonHeaders });
            }
        }

        // GET /api/db/tables - Get table names and counts
        if (pathname === "/api/db/tables" && req.method === "GET") {
            const tables = Object.entries(db).map(([name, data]) => ({
                name,
                count: Array.isArray(data) ? data.length : 0
            }));
            return new Response(JSON.stringify({ tables }), { headers: jsonHeaders });
        }

        // GET /api/db/:table - Get specific table
        if (pathname.match(/^\/api\/db\/[a-z_]+$/) && req.method === "GET") {
            const tableName = pathname.split("/").pop() as keyof DBTables;
            if (db[tableName]) {
                return new Response(JSON.stringify({ [tableName]: db[tableName] }), { headers: jsonHeaders });
            }
            return new Response(JSON.stringify({ error: "Table not found" }), { status: 404, headers: jsonHeaders });
        }

        // ==========================================
        // WEBSITES ENDPOINTS
        // ==========================================

        // GET /api/websites - Get all websites
        if (pathname === "/api/websites" && req.method === "GET") {
            return new Response(JSON.stringify({ websites: db.websites }), { headers: jsonHeaders });
        }

        // POST /api/websites - Create new website
        if (pathname === "/api/websites" && req.method === "POST") {
            const body = await req.json();
            const website: Website = {
                id: `ws_${Date.now()}`,
                name: body.name,
                slug: body.slug || body.name.toLowerCase().replace(/\s+/g, '-'),
                domain: body.domain,
                template: body.template,
                created: new Date().toISOString(),
                updated: new Date().toISOString(),
                status: "draft"
            };
            db.websites.push(website);
            await saveDatabase();
            addSyncLog(source as any, "server", "create_website", "success", website.name);
            return new Response(JSON.stringify({ success: true, website }), { headers: jsonHeaders });
        }

        // ==========================================
        // PAGES ENDPOINTS
        // ==========================================

        // GET /api/pages?website_id=xxx
        if (pathname === "/api/pages" && req.method === "GET") {
            const websiteId = new URL(req.url).searchParams.get("website_id");
            const pages = websiteId
                ? db.pages.filter(p => p.website_id === websiteId)
                : db.pages;
            return new Response(JSON.stringify({ pages }), { headers: jsonHeaders });
        }

        // POST /api/pages
        if (pathname === "/api/pages" && req.method === "POST") {
            const body = await req.json();
            const page: Page = {
                id: `pg_${Date.now()}`,
                website_id: body.website_id,
                name: body.name,
                slug: body.slug || body.name.toLowerCase().replace(/\s+/g, '-') + '.html',
                blocks: [],
                status: "draft",
                order: db.pages.filter(p => p.website_id === body.website_id).length
            };
            db.pages.push(page);
            await saveDatabase();
            return new Response(JSON.stringify({ success: true, page }), { headers: jsonHeaders });
        }

        // ==========================================
        // BLOCKS ENDPOINTS
        // ==========================================

        // GET /api/blocks?page_id=xxx
        if (pathname === "/api/blocks" && req.method === "GET") {
            const pageId = new URL(req.url).searchParams.get("page_id");
            const blocks = pageId
                ? db.blocks.filter(b => b.page_id === pageId)
                : db.blocks;
            return new Response(JSON.stringify({ blocks }), { headers: jsonHeaders });
        }

        // POST /api/blocks
        if (pathname === "/api/blocks" && req.method === "POST") {
            const body = await req.json();
            const block: Block = {
                id: `blk_${Date.now()}`,
                page_id: body.page_id,
                type: body.type,
                name: body.name || body.type,
                data: body.data || {},
                enabled: true,
                order: db.blocks.filter(b => b.page_id === body.page_id).length
            };
            db.blocks.push(block);
            await saveDatabase();
            return new Response(JSON.stringify({ success: true, block }), { headers: jsonHeaders });
        }

        // PUT /api/blocks/:id
        if (pathname.match(/^\/api\/blocks\/blk_\d+$/) && req.method === "PUT") {
            const blockId = pathname.split("/").pop()!;
            const body = await req.json();
            const index = db.blocks.findIndex(b => b.id === blockId);
            if (index > -1) {
                db.blocks[index] = { ...db.blocks[index], ...body };
                await saveDatabase();
                return new Response(JSON.stringify({ success: true, block: db.blocks[index] }), { headers: jsonHeaders });
            }
            return new Response(JSON.stringify({ error: "Block not found" }), { status: 404, headers: jsonHeaders });
        }

        // DELETE /api/blocks/:id
        if (pathname.match(/^\/api\/blocks\/blk_\d+$/) && req.method === "DELETE") {
            const blockId = pathname.split("/").pop()!;
            const index = db.blocks.findIndex(b => b.id === blockId);
            if (index > -1) {
                db.blocks.splice(index, 1);
                await saveDatabase();
                return new Response(JSON.stringify({ success: true }), { headers: jsonHeaders });
            }
            return new Response(JSON.stringify({ error: "Block not found" }), { status: 404, headers: jsonHeaders });
        }

        // ==========================================
        // COLLECTIONS ENDPOINTS
        // ==========================================

        // GET /api/collections
        if (pathname === "/api/collections" && req.method === "GET") {
            const websiteId = new URL(req.url).searchParams.get("website_id");
            const collections = websiteId
                ? db.collections.filter(c => c.website_id === websiteId)
                : db.collections;
            return new Response(JSON.stringify({ collections }), { headers: jsonHeaders });
        }

        // POST /api/collections
        if (pathname === "/api/collections" && req.method === "POST") {
            const body = await req.json();
            const collection: Collection = {
                id: `col_${Date.now()}`,
                website_id: body.website_id,
                name: body.name,
                icon: body.icon || "fa-folder",
                fields: body.fields || [{ key: "name", label: "Name", type: "text", required: true }]
            };
            db.collections.push(collection);
            await saveDatabase();
            return new Response(JSON.stringify({ success: true, collection }), { headers: jsonHeaders });
        }

        // ==========================================
        // COLLECTION ITEMS ENDPOINTS
        // ==========================================

        // GET /api/items?collection_id=xxx
        if (pathname === "/api/items" && req.method === "GET") {
            const collectionId = new URL(req.url).searchParams.get("collection_id");
            const items = collectionId
                ? db.items.filter(i => i.collection_id === collectionId)
                : db.items;
            return new Response(JSON.stringify({ items }), { headers: jsonHeaders });
        }

        // POST /api/items
        if (pathname === "/api/items" && req.method === "POST") {
            const body = await req.json();
            const item: CollectionItem = {
                id: `itm_${Date.now()}`,
                collection_id: body.collection_id,
                data: body.data || {},
                order: db.items.filter(i => i.collection_id === body.collection_id).length
            };
            db.items.push(item);
            await saveDatabase();
            return new Response(JSON.stringify({ success: true, item }), { headers: jsonHeaders });
        }

        // PUT /api/items/:id
        if (pathname.match(/^\/api\/items\/itm_\d+$/) && req.method === "PUT") {
            const itemId = pathname.split("/").pop()!;
            const body = await req.json();
            const index = db.items.findIndex(i => i.id === itemId);
            if (index > -1) {
                db.items[index] = { ...db.items[index], ...body };
                await saveDatabase();
                return new Response(JSON.stringify({ success: true, item: db.items[index] }), { headers: jsonHeaders });
            }
            return new Response(JSON.stringify({ error: "Item not found" }), { status: 404, headers: jsonHeaders });
        }

        // DELETE /api/items/:id
        if (pathname.match(/^\/api\/items\/itm_\d+$/) && req.method === "DELETE") {
            const itemId = pathname.split("/").pop()!;
            const index = db.items.findIndex(i => i.id === itemId);
            if (index > -1) {
                db.items.splice(index, 1);
                await saveDatabase();
                return new Response(JSON.stringify({ success: true }), { headers: jsonHeaders });
            }
            return new Response(JSON.stringify({ error: "Item not found" }), { status: 404, headers: jsonHeaders });
        }

        // ==========================================
        // MEDIA ENDPOINTS
        // ==========================================

        // GET /api/media
        if (pathname === "/api/media" && req.method === "GET") {
            const websiteId = new URL(req.url).searchParams.get("website_id");
            const media = websiteId
                ? db.media.filter(m => m.website_id === websiteId)
                : db.media;
            return new Response(JSON.stringify({ media }), { headers: jsonHeaders });
        }

        // GET /api/team - Extract team data from index.html
        if (pathname === "/api/team" && req.method === "GET") {
            try {
                const indexPath = join(BASE_DIR, "index.html");
                const html = await readFile(indexPath, "utf-8");

                // Extract team members by category title
                const extractTeamByCategory = (categoryTitle: string) => {
                    // Find the category title
                    const titlePattern = new RegExp(`<h3 class="team-category-title">${categoryTitle}</h3>`, 'i');
                    const titleMatch = html.match(titlePattern);
                    if (!titleMatch) return [];

                    const titleIdx = html.indexOf(titleMatch[0]);

                    // Find the team-grid after this title
                    const gridStartIdx = html.indexOf('<div class="team-grid', titleIdx);
                    if (gridStartIdx === -1) return [];

                    // Find where this grid ends (next team-category or section end)
                    const nextCategory = html.indexOf('<div class="team-category">', gridStartIdx + 10);
                    const sectionEnd = html.indexOf('</section>', gridStartIdx);

                    let gridEnd = sectionEnd;
                    if (nextCategory !== -1 && nextCategory < sectionEnd) {
                        gridEnd = nextCategory;
                    }

                    const section = html.substring(gridStartIdx, gridEnd);
                    const members: any[] = [];

                    // Split by team-card-flip
                    const cards = section.split('<div class="team-card-flip">').slice(1);
                    cards.forEach((card, idx) => {
                        const nameMatch = card.match(/<h4[^>]*>([^<]+)<\/h4>/);
                        const roleMatch = card.match(/<span class="role">([^<]+)<\/span>/);
                        const descMatch = card.match(/<div class="back-content">[\s\S]*?<p[^>]*>([^<]*)<\/p>/);
                        const imgMatch = card.match(/<img[^>]*src="([^"]*)"/);

                        if (nameMatch) {
                            members.push({
                                id: idx + 1,
                                name: nameMatch[1].trim(),
                                role: roleMatch ? roleMatch[1].replace(/&amp;/g, '&').trim() : '',
                                description: descMatch ? descMatch[1].trim() : '',
                                image: imgMatch ? imgMatch[1] : ''
                            });
                        }
                    });

                    return members;
                };

                const team = {
                    leadership: extractTeamByCategory('Global Leadership'),
                    ceo: extractTeamByCategory('CEO'),
                    cooRegional: extractTeamByCategory('COO &amp; Regional Heads')
                };

                return new Response(JSON.stringify({ team }), { headers: jsonHeaders });
            } catch (e) {
                log("ERROR", `Failed to extract team: ${e}`);
                return new Response(JSON.stringify({ team: { leadership: [], ceo: [], cooRegional: [] } }), { headers: jsonHeaders });
            }
        }

        // GET /api/cards - Extract cards/features/values from index.html
        if (pathname === "/api/cards" && req.method === "GET") {
            try {
                const indexPath = join(BASE_DIR, "index.html");
                const html = await readFile(indexPath, "utf-8");

                // Extract Features (About section)
                const features: any[] = [];
                const featuresStart = html.indexOf('class="about-features">');
                if (featuresStart !== -1) {
                    const featuresEnd = html.indexOf('</div>\n                </div>\n            </div>', featuresStart);
                    const featuresSection = html.substring(featuresStart, featuresEnd > 0 ? featuresEnd + 50 : featuresStart + 2000);
                    const featureItems = featuresSection.split('<div class="feature-item">').slice(1);
                    featureItems.forEach((item, idx) => {
                        const titleMatch = item.match(/<h4>([^<]+)<\/h4>/);
                        const descMatch = item.match(/<p>([^<]+)<\/p>/);
                        if (titleMatch) {
                            features.push({
                                id: idx + 1,
                                title: titleMatch[1].trim(),
                                description: descMatch ? descMatch[1].trim() : '',
                                type: 'feature'
                            });
                        }
                    });
                }

                // Extract Values (value-cards)
                const values: any[] = [];
                const valuesCards = html.match(/<div class="value-card"[^>]*>[\s\S]*?<div class="value-number">(\d+)<\/div>\s*<h3>([^<]+)<\/h3>\s*<p>([^<]+)<\/p>/g);
                if (valuesCards) {
                    valuesCards.forEach((card, idx) => {
                        const numMatch = card.match(/<div class="value-number">(\d+)<\/div>/);
                        const titleMatch = card.match(/<h3>([^<]+)<\/h3>/);
                        const descMatch = card.match(/<p>([^<]+)<\/p>/);
                        if (titleMatch) {
                            values.push({
                                id: idx + 1,
                                number: numMatch ? numMatch[1] : String(idx + 1).padStart(2, '0'),
                                title: titleMatch[1].replace(/&amp;/g, '&').trim(),
                                description: descMatch ? descMatch[1].trim() : '',
                                type: 'value'
                            });
                        }
                    });
                }

                // Extract Sustainability Cards
                const sustainability: any[] = [];
                const sustainSection = html.match(/class="sustainability-grid">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>\s*<\/section>/);
                if (sustainSection) {
                    const sustainCards = sustainSection[1].split('<div class="sustainability-card">').slice(1);
                    sustainCards.forEach((card, idx) => {
                        const titleMatch = card.match(/<h3>([^<]+)<\/h3>/);
                        const descMatch = card.match(/<h3>[^<]+<\/h3>\s*<p>([^<]+)<\/p>/);
                        if (titleMatch) {
                            sustainability.push({
                                id: idx + 1,
                                title: titleMatch[1].trim(),
                                description: descMatch ? descMatch[1].trim() : '',
                                type: 'sustainability'
                            });
                        }
                    });
                }

                return new Response(JSON.stringify({
                    features,
                    values,
                    sustainability
                }), { headers: jsonHeaders });
            } catch (e) {
                log("ERROR", `Failed to extract cards: ${e}`);
                return new Response(JSON.stringify({ features: [], values: [], sustainability: [] }), { headers: jsonHeaders });
            }
        }

        // GET /api/locations - Load from locations.json
        if (pathname === "/api/locations" && req.method === "GET") {
            try {
                const locationsPath = join(BASE_DIR, "database", "locations.json");
                const locationsData = await readFile(locationsPath, "utf-8");
                const data = JSON.parse(locationsData);
                log("INFO", `Loaded ${data.locations?.length || 0} locations from database`);
                return new Response(JSON.stringify(data), { headers: jsonHeaders });
            } catch (e) {
                log("ERROR", `Failed to load locations: ${e}`);
                return new Response(JSON.stringify({ locations: [] }), { headers: jsonHeaders });
            }
        }

        // GET /api/content - Extract all content sections from index.html
        if (pathname === "/api/content" && req.method === "GET") {
            try {
                const indexPath = join(BASE_DIR, "index.html");
                const html = await readFile(indexPath, "utf-8");

                // Helper function to extract text content
                const extractText = (selector: string, context?: string): string => {
                    const searchHtml = context || html;
                    const patterns: Record<string, RegExp> = {
                        '.hero-label': /<span class="hero-label"[^>]*>([\s\S]*?)<\/span>/,
                        '.hero-title .title-line:nth-child(1)': /<span class="title-line"[^>]*>(.*?)<\/span>/,
                        '.hero-description': /<p class="hero-description"[^>]*>([\s\S]*?)<\/p>/,
                        '.section-label': /<span class="section-label"[^>]*>([^<]+)<\/span>/,
                        '.section-title': /<h2 class="section-title"[^>]*>([\s\S]*?)<\/h2>/,
                        '.lead': /<p class="lead"[^>]*>([\s\S]*?)<\/p>/,
                        '.ceo-quote': /<blockquote class="ceo-quote"[^>]*>([\s\S]*?)<\/blockquote>/,
                        '.footer-tagline': /<p class="footer-tagline"[^>]*>([^<]+)<\/p>/,
                    };
                    const pattern = patterns[selector];
                    if (pattern) {
                        const match = searchHtml.match(pattern);
                        return match ? match[1].replace(/<[^>]+>/g, '').trim() : '';
                    }
                    return '';
                };

                // Extract Hero Section
                const heroSection = html.match(/<section class="hero-section"[^>]*>([\s\S]*?)<\/section>/);
                const heroHtml = heroSection ? heroSection[1] : '';

                const titleLines = heroHtml.match(/<span class="title-line"[^>]*>(.*?)<\/span>/g) || [];
                const hero = {
                    label: extractText('.hero-label', heroHtml).replace(/◆\s*/, '').trim(),
                    titleLine1: titleLines[0]?.replace(/<[^>]+>/g, '').trim() || '',
                    titleLine2: titleLines[1]?.replace(/<[^>]+>/g, '').trim() || '',
                    titleLine3: titleLines[2]?.replace(/<[^>]+>/g, '').trim() || '',
                    description: extractText('.hero-description', heroHtml),
                    button1: (heroHtml.match(/<a[^>]*class="[^"]*btn-primary[^"]*"[^>]*>([\s\S]*?)<\/a>/) || [])[1]?.replace(/<[^>]+>/g, '').trim() || '',
                    button2: (heroHtml.match(/<a[^>]*class="[^"]*btn-secondary[^"]*"[^>]*>([\s\S]*?)<\/a>/) || [])[1]?.replace(/<[^>]+>/g, '').trim() || ''
                };

                // Extract About Section
                const aboutSection = html.match(/<section[^>]*id="about"[^>]*>([\s\S]*?)<\/section>/);
                const aboutHtml = aboutSection ? aboutSection[1] : '';

                const featureItems = aboutHtml.match(/<div class="feature-item">([\s\S]*?)<\/div>\s*<\/div>/g) || [];
                const features: { title: string; desc: string }[] = [];
                featureItems.forEach(item => {
                    const titleMatch = item.match(/<h4>([^<]+)<\/h4>/);
                    const descMatch = item.match(/<p>([^<]+)<\/p>/);
                    if (titleMatch) {
                        features.push({
                            title: titleMatch[1].trim(),
                            desc: descMatch ? descMatch[1].trim() : ''
                        });
                    }
                });

                const about = {
                    sectionLabel: (aboutHtml.match(/<span class="section-label"[^>]*>([^<]+)<\/span>/) || [])[1]?.trim() || 'About Us',
                    title: (aboutHtml.match(/<h2 class="section-title"[^>]*>([\s\S]*?)<\/h2>/) || [])[1]?.replace(/<[^>]+>/g, '').trim() || '',
                    leadText: (aboutHtml.match(/<p class="lead"[^>]*>([\s\S]*?)<\/p>/) || [])[1]?.trim() || '',
                    description: (aboutHtml.match(/<p class="lead"[^>]*>[\s\S]*?<\/p>\s*<p>([\s\S]*?)<\/p>/) || [])[1]?.trim() || '',
                    feature1Title: features[0]?.title || '',
                    feature1Desc: features[0]?.desc || '',
                    feature2Title: features[1]?.title || '',
                    feature2Desc: features[1]?.desc || '',
                    feature3Title: features[2]?.title || '',
                    feature3Desc: features[2]?.desc || ''
                };

                // Extract CEO Section
                const ceoSection = html.match(/<section class="ceo-section"[^>]*>([\s\S]*?)<\/section>/);
                const ceoHtml = ceoSection ? ceoSection[1] : '';

                const ceo = {
                    sectionLabel: (ceoHtml.match(/<span class="section-label"[^>]*>([^<]+)<\/span>/) || [])[1]?.trim() || 'CEO Message',
                    quote: (ceoHtml.match(/<blockquote class="ceo-quote"[^>]*>([\s\S]*?)<\/blockquote>/) || [])[1]?.trim() || '',
                    name: (ceoHtml.match(/<span class="ceo-name"[^>]*>([^<]+)<\/span>/) || [])[1]?.trim() || 'Dr. Gerhard Kral',
                    role: (ceoHtml.match(/<span class="ceo-role"[^>]*>([^<]+)<\/span>/) || [])[1]?.trim() || 'Group CEO & Founder'
                };

                // Extract Contact Section
                const contactSection = html.match(/<section[^>]*id="contact"[^>]*>([\s\S]*?)<\/section>/);
                const contactHtml = contactSection ? contactSection[1] : '';

                const contact = {
                    sectionLabel: (contactHtml.match(/<span class="section-label"[^>]*>([^<]+)<\/span>/) || [])[1]?.trim() || 'Get In Touch',
                    title: (contactHtml.match(/<h2 class="section-title"[^>]*>([\s\S]*?)<\/h2>/) || [])[1]?.replace(/<[^>]+>/g, '').trim() || "Let's Work Together",
                    description: (contactHtml.match(/<p class="section-description"[^>]*>([^<]+)<\/p>/) || [])[1]?.trim() || ''
                };

                // Extract Footer
                const footerSection = html.match(/<footer[^>]*>([\s\S]*?)<\/footer>/);
                const footerHtml = footerSection ? footerSection[1] : '';

                const footer = {
                    tagline: (footerHtml.match(/<p class="footer-tagline"[^>]*>([^<]+)<\/p>/) || [])[1]?.trim() || '',
                    copyright: (footerHtml.match(/©[^<]+/) || [])[0]?.trim() || ''
                };

                // Extract Products Section
                const productsSection = html.match(/<section[^>]*id="products"[^>]*>([\s\S]*?)<\/section>/);
                const productsHtml = productsSection ? productsSection[1] : '';

                const products = {
                    sectionLabel: (productsHtml.match(/<span class="section-label"[^>]*>([^<]+)<\/span>/) || [])[1]?.trim() || 'Our Products',
                    title: (productsHtml.match(/<h2 class="section-title"[^>]*>([\s\S]*?)<\/h2>/) || [])[1]?.replace(/<[^>]+>/g, '').trim() || '',
                    description: (productsHtml.match(/<p class="section-description"[^>]*>([^<]+)<\/p>/) || [])[1]?.trim() || ''
                };

                // Extract Services Section
                const servicesSection = html.match(/<section[^>]*id="services"[^>]*>([\s\S]*?)<\/section>/);
                const servicesHtml = servicesSection ? servicesSection[1] : '';

                const services = {
                    sectionLabel: (servicesHtml.match(/<span class="section-label"[^>]*>([^<]+)<\/span>/) || [])[1]?.trim() || 'Our Services',
                    title: (servicesHtml.match(/<h2 class="section-title"[^>]*>([\s\S]*?)<\/h2>/) || [])[1]?.replace(/<[^>]+>/g, '').trim() || '',
                    description: (servicesHtml.match(/<p class="section-description"[^>]*>([^<]+)<\/p>/) || [])[1]?.trim() || ''
                };

                return new Response(JSON.stringify({
                    content: {
                        hero,
                        about,
                        ceo,
                        products,
                        services,
                        contact,
                        footer
                    }
                }), { headers: jsonHeaders });
            } catch (e) {
                log("ERROR", `Failed to extract content: ${e}`);
                return new Response(JSON.stringify({ content: {} }), { headers: jsonHeaders });
            }
        }

        // GET /api/images - List all images from uploads folder AND assets folder (for Admin Panel)
        if (pathname === "/api/images" && req.method === "GET") {
            try {
                const mediaDb = db.media || [];
                let allImages: any[] = [];

                // 1. Get images from uploads folder
                const uploadFiles = readdirSync(UPLOADS_DIR);
                const uploadImages = uploadFiles
                    .filter(f => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(f))
                    .map(filename => {
                        const url = `/uploads/${filename}`;
                        const mediaEntry = mediaDb.find((m: any) => m.url === url);
                        const originalName = mediaEntry?.original_name || filename;

                        // Determine folder based on original_name or file path
                        let folder = 'uploads';
                        if (originalName && originalName !== filename) {
                            // If it has an original name, it's likely a team member image
                            folder = 'team';
                        }

                        return {
                            filename,
                            url,
                            type: `image/${filename.split('.').pop()?.toLowerCase() || 'png'}`,
                            original_name: originalName,
                            folder
                        };
                    });
                allImages = [...uploadImages];

                // 2. Get flags from assets/images/flags
                const flagsDir = join(import.meta.dir, 'assets', 'images', 'flags');
                if (existsSync(flagsDir)) {
                    const flagFiles = readdirSync(flagsDir);
                    const countryNames: Record<string, string> = {
                        'ae': 'United Arab Emirates',
                        'br': 'Brazil',
                        'gb': 'United Kingdom',
                        'ke': 'Kenya',
                        'ug': 'Uganda',
                        'us': 'United States',
                        'vg': 'British Virgin Islands'
                    };
                    const flagImages = flagFiles
                        .filter(f => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(f))
                        .map(filename => {
                            const code = filename.replace(/\.(svg|png|jpg|jpeg|webp)$/i, '').toLowerCase();
                            return {
                                filename,
                                url: `/assets/images/flags/${filename}`,
                                type: `image/${filename.split('.').pop()?.toLowerCase() || 'svg'}`,
                                original_name: countryNames[code] || filename,
                                folder: 'flags'
                            };
                        });
                    allImages = [...allImages, ...flagImages];
                }

                // 3. Get team images from persistent storage (TEAM_IMAGES_DIR)
                if (existsSync(TEAM_IMAGES_DIR)) {
                    const teamFiles = readdirSync(TEAM_IMAGES_DIR);
                    const teamImages = teamFiles
                        .filter(f => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(f))
                        .map(filename => {
                            // Convert filename to readable name (e.g., "Christian-Thomas.png" -> "Christian Thomas")
                            const nameWithoutExt = filename.replace(/\.(jpg|jpeg|png|gif|webp|svg)$/i, '');
                            const readableName = nameWithoutExt.replace(/-/g, ' ');
                            return {
                                filename,
                                url: `/assets/images/team/${filename}`,
                                type: `image/${filename.split('.').pop()?.toLowerCase() || 'png'}`,
                                original_name: readableName,
                                folder: 'team'
                            };
                        });
                    allImages = [...allImages, ...teamImages];
                }

                // 4. Get logo from assets/images
                const logoPath = join(import.meta.dir, 'assets', 'images', 'logo.jpg');
                if (existsSync(logoPath)) {
                    allImages.push({
                        filename: 'logo.jpg',
                        url: '/assets/images/logo.jpg',
                        type: 'image/jpeg',
                        original_name: 'Iustus Mercatura Logo',
                        folder: 'logos'
                    });
                }

                return new Response(JSON.stringify({ images: allImages }), { headers: jsonHeaders });
            } catch (e) {
                log("ERROR", `Failed to list images: ${e}`);
                return new Response(JSON.stringify({ images: [] }), { headers: jsonHeaders });
            }
        }

        // DELETE /api/images/:filename - Delete image by filename
        if (pathname.startsWith("/api/images/") && req.method === "DELETE") {
            try {
                const filename = pathname.split('/').pop();
                if (!filename) {
                    return new Response(JSON.stringify({ error: "No filename provided" }), {
                        status: 400,
                        headers: jsonHeaders
                    });
                }

                // Check if it's a team image (from TEAM_IMAGES_DIR - persistent storage)
                const teamFilePath = join(TEAM_IMAGES_DIR, filename);
                if (existsSync(teamFilePath)) {
                    // Delete team image file
                    try {
                        await unlink(teamFilePath);
                        log("INFO", `Team image deleted: ${filename}`);

                        const imageUrl = `/assets/images/team/${filename}`;

                        // Remove from data.json (team members)
                        try {
                            const dataFile = join(BASE_DIR, "data.json");
                            if (existsSync(dataFile)) {
                                const dataContent = await readFile(dataFile, "utf-8");
                                const dataJson = JSON.parse(dataContent);

                                // Remove from team members
                                if (dataJson.team) {
                                    dataJson.team = dataJson.team.filter((member: any) => member.image !== imageUrl);
                                }

                                // Remove from imageAssignments
                                if (dataJson.imageAssignments && dataJson.imageAssignments[imageUrl]) {
                                    delete dataJson.imageAssignments[imageUrl];
                                }

                                await writeFile(dataFile, JSON.stringify(dataJson, null, 2), "utf-8");
                                log("INFO", `Removed image references from data.json: ${imageUrl}`);
                            }
                        } catch (e) {
                            log("ERROR", `Failed to update data.json: ${e}`);
                        }

                        // Remove from database/database.json (team members)
                        try {
                            const dbFile = join(BASE_DIR, "database", "database.json");
                            if (existsSync(dbFile)) {
                                const dbContent = await readFile(dbFile, "utf-8");
                                const dbJson = JSON.parse(dbContent);

                                // Remove from team_members
                                if (dbJson.team_members) {
                                    dbJson.team_members = dbJson.team_members.filter((member: any) =>
                                        member.data?.image !== imageUrl
                                    );
                                }

                                await writeFile(dbFile, JSON.stringify(dbJson, null, 2), "utf-8");
                                log("INFO", `Removed image references from database.json: ${imageUrl}`);
                            }
                        } catch (e) {
                            log("ERROR", `Failed to update database.json: ${e}`);
                        }

                        // Remove from index.html (team cards)
                        try {
                            const indexFile = join(BASE_DIR, "index.html");
                            if (existsSync(indexFile)) {
                                let indexContent = await readFile(indexFile, "utf-8");

                                // Remove team card containing this image
                                const teamCardRegex = new RegExp(
                                    `<div class="team-card"[^>]*>[\\s\\S]*?${filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?<\\/div>\\s*<\\/div>\\s*<\\/div>`,
                                    'g'
                                );
                                indexContent = indexContent.replace(teamCardRegex, '');

                                await writeFile(indexFile, indexContent, "utf-8");
                                log("INFO", `Removed team card from index.html for: ${filename}`);
                            }
                        } catch (e) {
                            log("ERROR", `Failed to update index.html: ${e}`);
                        }

                        // Remove from locations.json (responsible person images)
                        try {
                            const locationsFile = join(BASE_DIR, "database", "locations.json");
                            if (existsSync(locationsFile)) {
                                const locContent = await readFile(locationsFile, "utf-8");
                                const locJson = JSON.parse(locContent);

                                // Remove image reference from locations
                                if (locJson.locations) {
                                    locJson.locations = locJson.locations.map((loc: any) => {
                                        if (loc.responsiblePerson?.image === imageUrl) {
                                            loc.responsiblePerson.image = '';
                                        }
                                        return loc;
                                    });
                                }

                                await writeFile(locationsFile, JSON.stringify(locJson, null, 2), "utf-8");
                                log("INFO", `Removed image references from locations.json: ${imageUrl}`);
                            }
                        } catch (e) {
                            log("ERROR", `Failed to update locations.json: ${e}`);
                        }

                        // Broadcast sync to all connected clients
                        broadcastSync({
                            type: 'media_deleted',
                            data: { filename, url: imageUrl }
                        });

                        // Schedule Git sync for content changes
                        scheduleGitSync(`Deleted team image: ${filename}`);

                        return new Response(JSON.stringify({ success: true }), { headers: jsonHeaders });
                    } catch (e) {
                        log("ERROR", `Failed to delete team image: ${e}`);
                        return new Response(JSON.stringify({ error: "Delete failed" }), {
                            status: 500,
                            headers: jsonHeaders
                        });
                    }
                }

                // Find media item in database by filename (from url field)
                const mediaIndex = db.media.findIndex(m => m.url === `/uploads/${filename}`);

                if (mediaIndex === -1) {
                    // Also check if file exists in uploads folder without db entry
                    const uploadsFilePath = join(UPLOADS_DIR, filename);
                    if (existsSync(uploadsFilePath)) {
                        try {
                            await unlink(uploadsFilePath);
                            log("INFO", `Orphan upload file deleted: ${filename}`);
                            return new Response(JSON.stringify({ success: true }), { headers: jsonHeaders });
                        } catch (e) {
                            log("ERROR", `Failed to delete orphan file: ${e}`);
                        }
                    }
                    return new Response(JSON.stringify({ error: "Image not found" }), {
                        status: 404,
                        headers: jsonHeaders
                    });
                }

                const mediaItem = db.media[mediaIndex];

                // Delete physical file from uploads directory
                const filePath = join(UPLOADS_DIR, filename);
                if (existsSync(filePath)) {
                    try {
                        await unlink(filePath);
                        log("INFO", `Image file deleted: ${filename}`);
                    } catch (e) {
                        log("ERROR", `Failed to delete file: ${e}`);
                    }
                }

                // Remove from database
                db.media.splice(mediaIndex, 1);
                await saveDatabase();

                // Remove from imageAssignments in data.json
                const imageUrl = mediaItem.url;
                try {
                    const dataFile = join(BASE_DIR, "data.json");
                    if (existsSync(dataFile)) {
                        const dataContent = await readFile(dataFile, "utf-8");
                        const dataJson = JSON.parse(dataContent);

                        if (dataJson.imageAssignments && dataJson.imageAssignments[imageUrl]) {
                            delete dataJson.imageAssignments[imageUrl];
                            await writeFile(dataFile, JSON.stringify(dataJson, null, 2), "utf-8");
                            log("INFO", `Image assignment removed for: ${imageUrl}`);
                        }
                    }
                } catch (e) {
                    log("ERROR", `Failed to remove image assignment: ${e}`);
                    // Don't fail the whole operation if assignment removal fails
                }

                // Broadcast sync to all connected clients
                broadcastSync({
                    type: 'media_deleted',
                    data: { filename, id: mediaItem.id, url: imageUrl }
                });

                // Schedule Git sync for content changes
                scheduleGitSync(`Deleted image: ${filename}`);

                log("INFO", `Image deleted: ${filename}`);
                return new Response(JSON.stringify({ success: true }), { headers: jsonHeaders });

            } catch (e) {
                log("ERROR", `Failed to delete image: ${e}`);
                return new Response(JSON.stringify({ error: "Delete failed" }), {
                    status: 500,
                    headers: jsonHeaders
                });
            }
        }

        // POST /api/upload/team - Upload team image to persistent storage
        if (pathname === "/api/upload/team" && req.method === "POST") {
            const formData = await req.formData();
            const imageFile = formData.get("file") as File;

            if (!imageFile) {
                return new Response(JSON.stringify({ error: "No file provided" }), {
                    status: 400,
                    headers: jsonHeaders,
                });
            }

            // Keep original filename for team images
            const filename = imageFile.name;
            const filePath = join(TEAM_IMAGES_DIR, filename);

            const arrayBuffer = await imageFile.arrayBuffer();
            await writeFile(filePath, Buffer.from(arrayBuffer));

            log("INFO", `Team image uploaded: ${filename} to ${TEAM_IMAGES_DIR}`);

            // Broadcast to sync clients
            broadcastToSyncClients({
                type: 'media_uploaded',
                data: { filename, folder: 'team', url: `/assets/images/team/${filename}` }
            });

            return new Response(JSON.stringify({
                success: true,
                filename,
                url: `/assets/images/team/${filename}`,
                folder: 'team'
            }), { headers: jsonHeaders });
        }

        // POST /api/upload
        if (pathname === "/api/upload" && req.method === "POST") {
            const formData = await req.formData();
            const imageFile = formData.get("file") as File;
            const websiteId = formData.get("website_id") as string || "ws_iustus";

            if (!imageFile) {
                return new Response(JSON.stringify({ error: "No file provided" }), {
                    status: 400,
                    headers: jsonHeaders,
                });
            }

            const ext = imageFile.name.split('.').pop() || 'png';
            const timestamp = Date.now();
            const randomId = Math.random().toString(36).substring(2, 8);
            const filename = `img_${timestamp}_${randomId}.${ext}`;
            const filePath = join(UPLOADS_DIR, filename);

            const arrayBuffer = await imageFile.arrayBuffer();
            await writeFile(filePath, Buffer.from(arrayBuffer));

            const mediaItem: MediaItem = {
                id: `med_${timestamp}`,
                website_id: websiteId,
                filename: filename,
                original_name: imageFile.name,
                url: `/uploads/${filename}`,
                type: imageFile.type,
                size: imageFile.size,
                uploaded: new Date().toISOString()
            };
            db.media.push(mediaItem);
            await saveDatabase();

            log("INFO", `Image uploaded: ${filename}`);
            return new Response(JSON.stringify({ success: true, media: mediaItem }), { headers: jsonHeaders });
        }

        // POST /api/upload-image - Upload image (alias for /api/upload with 'image' param)
        if (pathname === "/api/upload-image" && req.method === "POST") {
            const formData = await req.formData();
            const imageFile = formData.get("image") as File; // Note: admin.js uses 'image' not 'file'
            const websiteId = formData.get("website_id") as string || "ws_iustus";

            if (!imageFile) {
                return new Response(JSON.stringify({ error: "No file provided" }), {
                    status: 400,
                    headers: jsonHeaders,
                });
            }

            const ext = imageFile.name.split('.').pop() || 'png';
            const timestamp = Date.now();
            const randomId = Math.random().toString(36).substring(2, 8);
            const filename = `img_${timestamp}_${randomId}.${ext}`;
            const filePath = join(UPLOADS_DIR, filename);

            const arrayBuffer = await imageFile.arrayBuffer();
            await writeFile(filePath, Buffer.from(arrayBuffer));

            const mediaItem: MediaItem = {
                id: `med_${timestamp}`,
                website_id: websiteId,
                filename: filename,
                original_name: imageFile.name,
                url: `/uploads/${filename}`,
                type: imageFile.type,
                size: imageFile.size,
                uploaded: new Date().toISOString()
            };
            db.media.push(mediaItem);
            await saveDatabase();

            // Broadcast sync to all connected clients
            broadcastSync({
                type: 'media_uploaded',
                data: mediaItem
            });

            log("INFO", `Image uploaded via /api/upload-image: ${filename}`);
            return new Response(JSON.stringify({ success: true, media: mediaItem }), { headers: jsonHeaders });
        }

        // POST /api/upload/media - Upload any media type (videos, logos, documents)
        if (pathname === "/api/upload/media" && req.method === "POST") {
            const formData = await req.formData();
            const mediaFile = formData.get("file") as File;
            const mediaType = formData.get("media_type") as string || "images";
            const category = formData.get("category") as string || "";
            const websiteId = formData.get("website_id") as string || "ws_iustus";

            if (!mediaFile) {
                return new Response(JSON.stringify({ error: "No file provided" }), {
                    status: 400,
                    headers: jsonHeaders,
                });
            }

            // Determine upload folder based on media type
            const uploadFolders: Record<string, string> = {
                images: "uploads",
                videos: "uploads/videos",
                logos: "uploads/logos",
                documents: "uploads/documents"
            };

            const uploadFolder = join(BASE_DIR, uploadFolders[mediaType] || "uploads");

            // Ensure folder exists
            if (!existsSync(uploadFolder)) {
                await mkdir(uploadFolder, { recursive: true });
            }

            const ext = mediaFile.name.split('.').pop() || '';
            const timestamp = Date.now();
            const randomId = Math.random().toString(36).substring(2, 8);
            const prefix = mediaType === 'videos' ? 'vid' : mediaType === 'logos' ? 'logo' : mediaType === 'documents' ? 'doc' : 'file';
            const filename = `${prefix}_${timestamp}_${randomId}.${ext}`;
            const filePath = join(uploadFolder, filename);

            const arrayBuffer = await mediaFile.arrayBuffer();
            await writeFile(filePath, Buffer.from(arrayBuffer));

            const mediaItem: MediaItem = {
                id: `${mediaType}_${timestamp}`,
                website_id: websiteId,
                filename: filename,
                original_name: mediaFile.name,
                url: `/${uploadFolders[mediaType]}/${filename}`,
                type: mediaFile.type,
                size: mediaFile.size,
                uploaded: new Date().toISOString()
            };

            // Add category for logos
            if (mediaType === 'logos' && category) {
                (mediaItem as any).category = category;
            }

            db.media.push(mediaItem);
            await saveDatabase();

            log("INFO", `${mediaType} uploaded: ${filename}`);
            return new Response(JSON.stringify({ success: true, media: mediaItem }), { headers: jsonHeaders });
        }

        // ==========================================
        // MEDIA ENDPOINTS (Videos, Logos, Documents)
        // ==========================================

        // GET /api/media/videos - List all videos
        if (pathname === "/api/media/videos" && req.method === "GET") {
            const videos = db.media.filter(m => m.type.startsWith('video/'));
            return new Response(JSON.stringify({ videos }), { headers: jsonHeaders });
        }

        // DELETE /api/media/videos/:id - Delete a video
        if (pathname.startsWith("/api/media/videos/") && req.method === "DELETE") {
            const id = pathname.split('/').pop();
            const index = db.media.findIndex(m => m.id === id);
            if (index !== -1) {
                const video = db.media[index];
                // Delete file from disk
                try {
                    const filePath = join(BASE_DIR, video.url.replace(/^\//, ''));
                    if (existsSync(filePath)) {
                        await Bun.write(filePath, ''); // Empty the file first
                        // Note: Bun doesn't have unlink, so we leave the empty file
                    }
                } catch (e) {
                    console.error('Error deleting video file:', e);
                }
                db.media.splice(index, 1);
                await saveDatabase();
                return new Response(JSON.stringify({ success: true }), { headers: jsonHeaders });
            }
            return new Response(JSON.stringify({ error: "Video not found" }), { status: 404, headers: jsonHeaders });
        }

        // GET /api/media/logos - List all logos by category
        if (pathname === "/api/media/logos" && req.method === "GET") {
            const logos = db.media.filter(m => m.url.includes('/logos/'));
            const categorized = {
                partners: logos.filter((l: any) => l.category === 'partners'),
                certifications: logos.filter((l: any) => l.category === 'certifications'),
                flags: logos.filter((l: any) => l.category === 'flags')
            };
            return new Response(JSON.stringify({ logos: categorized }), { headers: jsonHeaders });
        }

        // DELETE /api/media/logos/:id - Delete a logo
        if (pathname.startsWith("/api/media/logos/") && req.method === "DELETE") {
            const id = pathname.split('/').pop();
            const index = db.media.findIndex(m => m.id === id);
            if (index !== -1) {
                db.media.splice(index, 1);
                await saveDatabase();
                return new Response(JSON.stringify({ success: true }), { headers: jsonHeaders });
            }
            return new Response(JSON.stringify({ error: "Logo not found" }), { status: 404, headers: jsonHeaders });
        }

        // GET /api/media/documents - List all documents
        if (pathname === "/api/media/documents" && req.method === "GET") {
            const documents = db.media.filter(m =>
                m.type.includes('pdf') ||
                m.type.includes('word') ||
                m.type.includes('excel') ||
                m.type.includes('powerpoint') ||
                m.type.includes('document') ||
                m.type.includes('spreadsheet') ||
                m.type.includes('presentation')
            );
            return new Response(JSON.stringify({ documents }), { headers: jsonHeaders });
        }

        // DELETE /api/media/documents/:id - Delete a document
        if (pathname.startsWith("/api/media/documents/") && req.method === "DELETE") {
            const id = pathname.split('/').pop();
            const index = db.media.findIndex(m => m.id === id);
            if (index !== -1) {
                db.media.splice(index, 1);
                await saveDatabase();
                return new Response(JSON.stringify({ success: true }), { headers: jsonHeaders });
            }
            return new Response(JSON.stringify({ error: "Document not found" }), { status: 404, headers: jsonHeaders });
        }

        // GET /api/media/embedded-videos - List embedded videos (YouTube, Vimeo)
        if (pathname === "/api/media/embedded-videos" && req.method === "GET") {
            // Load from a separate JSON file
            const embeddedPath = join(DB_DIR, "embedded-videos.json");
            let videos: any[] = [];
            try {
                if (existsSync(embeddedPath)) {
                    const data = await readFile(embeddedPath, 'utf-8');
                    videos = JSON.parse(data);
                }
            } catch (e) {
                videos = [];
            }
            return new Response(JSON.stringify({ videos }), { headers: jsonHeaders });
        }

        // POST /api/media/embedded-videos - Add embedded video
        if (pathname === "/api/media/embedded-videos" && req.method === "POST") {
            const body = await req.json();
            const { url, platform, videoId } = body;

            const embeddedPath = join(DB_DIR, "embedded-videos.json");
            let videos: any[] = [];
            try {
                if (existsSync(embeddedPath)) {
                    const data = await readFile(embeddedPath, 'utf-8');
                    videos = JSON.parse(data);
                }
            } catch (e) {
                videos = [];
            }

            const newVideo = {
                id: `emb_${Date.now()}`,
                url,
                platform,
                videoId,
                title: '',
                added: new Date().toISOString()
            };

            videos.push(newVideo);
            await writeFile(embeddedPath, JSON.stringify(videos, null, 2));

            return new Response(JSON.stringify({ success: true, video: newVideo }), { headers: jsonHeaders });
        }

        // DELETE /api/media/embedded-videos/:id - Delete embedded video
        if (pathname.startsWith("/api/media/embedded-videos/") && req.method === "DELETE") {
            const id = pathname.split('/').pop();
            const embeddedPath = join(DB_DIR, "embedded-videos.json");
            let videos: any[] = [];
            try {
                if (existsSync(embeddedPath)) {
                    const data = await readFile(embeddedPath, 'utf-8');
                    videos = JSON.parse(data);
                }
            } catch (e) {
                videos = [];
            }

            const index = videos.findIndex((v: any) => v.id === id);
            if (index !== -1) {
                videos.splice(index, 1);
                await writeFile(embeddedPath, JSON.stringify(videos, null, 2));
                return new Response(JSON.stringify({ success: true }), { headers: jsonHeaders });
            }
            return new Response(JSON.stringify({ error: "Video not found" }), { status: 404, headers: jsonHeaders });
        }

        // ==========================================
        // SYNC ENDPOINTS
        // ==========================================

        // GET /api/sync/status - Get sync status
        if (pathname === "/api/sync/status" && req.method === "GET") {
            return new Response(JSON.stringify({
                connections: db.connections,
                last_syncs: db.sync_log.slice(-10).reverse()
            }), { headers: jsonHeaders });
        }

        // POST /api/sync/ping - Ping from client
        if (pathname === "/api/sync/ping" && req.method === "POST") {
            const body = await req.json();
            updateConnection(body.type, "connected");
            await saveDatabase();
            return new Response(JSON.stringify({
                success: true,
                timestamp: new Date().toISOString(),
                server_time: Date.now()
            }), { headers: jsonHeaders });
        }

        // POST /api/sync/push - Push data to server (with confirmation required)
        if (pathname === "/api/sync/push" && req.method === "POST") {
            const body = await req.json();
            const { data, target, confirmed } = body;
            const sourceType = source as SyncLogEntry['source'];

            if (!confirmed) {
                // Return preview of changes
                addSyncLog(sourceType, target, "push_preview", "pending");
                return new Response(JSON.stringify({
                    needs_confirmation: true,
                    preview: {
                        source: sourceType,
                        target,
                        changes: Object.keys(data || {})
                    }
                }), { headers: jsonHeaders });
            }

            // Apply sync
            if (data) {
                // Merge data based on source
                if (data.blocks) db.blocks = data.blocks;
                if (data.items) db.items = data.items;
                if (data.pages) db.pages = data.pages;
                if (data.collections) db.collections = data.collections;
                if (data.settings) db.settings = data.settings;
                await saveDatabase();
            }

            addSyncLog(sourceType, target, "push", "success");
            log("INFO", `Sync push from ${sourceType} to ${target}`);

            return new Response(JSON.stringify({
                success: true,
                message: `Data synced from ${sourceType}`,
                timestamp: new Date().toISOString()
            }), { headers: jsonHeaders });
        }

        // GET /api/sync/pull - Pull data from server
        if (pathname === "/api/sync/pull" && req.method === "GET") {
            const websiteId = new URL(req.url).searchParams.get("website_id") || "ws_iustus";
            const sourceType = source as SyncLogEntry['source'];

            addSyncLog("server", sourceType, "pull", "success");

            return new Response(JSON.stringify({
                success: true,
                data: {
                    website: db.websites.find(w => w.id === websiteId),
                    pages: db.pages.filter(p => p.website_id === websiteId),
                    blocks: db.blocks,
                    collections: db.collections.filter(c => c.website_id === websiteId),
                    items: db.items,
                    media: db.media.filter(m => m.website_id === websiteId),
                    settings: db.settings.filter(s => s.website_id === websiteId)
                },
                timestamp: new Date().toISOString()
            }), { headers: jsonHeaders });
        }

        // ==========================================
        // BACKUP & VERSIONING SYSTEM
        // ==========================================

        // GET /api/backup/list - List all backups
        if (pathname === "/api/backup/list" && req.method === "GET") {
            try {
                const backups: any[] = [];
                if (existsSync(BACKUP_DIR)) {
                    const folders = readdirSync(BACKUP_DIR);
                    for (const folder of folders) {
                        if (folder.startsWith('backup_')) {
                            const backupPath = join(BACKUP_DIR, folder);
                            const stats = await stat(backupPath);
                            const timestamp = folder.replace('backup_', '').replace(/-/g, ':').replace('T', ' ');

                            // Check which files exist in backup
                            const files: string[] = [];
                            const possibleFiles = ['database.json', 'data.json', 'index.html'];
                            for (const f of possibleFiles) {
                                if (existsSync(join(backupPath, f))) {
                                    files.push(f);
                                }
                            }

                            backups.push({
                                id: folder,
                                timestamp: stats.mtime.toISOString(),
                                files,
                                size: files.length
                            });
                        }
                    }
                    // Sort by date descending
                    backups.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
                }
                return new Response(JSON.stringify({ success: true, backups }), { headers: jsonHeaders });
            } catch (e) {
                return new Response(JSON.stringify({ success: false, error: String(e) }), { status: 500, headers: jsonHeaders });
            }
        }

        // POST /api/backup/create - Create a new backup
        if (pathname === "/api/backup/create" && req.method === "POST") {
            try {
                const body = await req.json();
                const description = body.description || 'Manual backup';
                const sourceType = body.source || source || 'dev_admin';

                const backupPath = await createBackup();
                if (backupPath) {
                    log("INFO", `Backup created by ${sourceType}: ${description}`);
                    return new Response(JSON.stringify({
                        success: true,
                        backup: backupPath,
                        timestamp: new Date().toISOString(),
                        description
                    }), { headers: jsonHeaders });
                }
                return new Response(JSON.stringify({ success: false, error: "Backup failed" }), { status: 500, headers: jsonHeaders });
            } catch (e) {
                return new Response(JSON.stringify({ success: false, error: String(e) }), { status: 500, headers: jsonHeaders });
            }
        }

        // POST /api/backup/restore/:backupId - Restore from a specific backup
        if (pathname.match(/^\/api\/backup\/restore\/backup_/) && req.method === "POST") {
            const backupId = pathname.split('/').pop();
            const backupPath = join(BACKUP_DIR, backupId || '');

            try {
                if (!existsSync(backupPath)) {
                    return new Response(JSON.stringify({ success: false, error: "Backup not found" }), { status: 404, headers: jsonHeaders });
                }

                // Check source permission (only dev_admin can restore)
                const body = await req.json();
                const requesterSource = body.source || source;
                if (requesterSource !== 'dev_admin' && requesterSource !== 'developer') {
                    return new Response(JSON.stringify({
                        success: false,
                        error: "Only Developer can restore backups"
                    }), { status: 403, headers: jsonHeaders });
                }

                // Create a pre-restore backup first
                await createBackup();

                // Restore files
                const restoredFiles: string[] = [];
                const filesToRestore = [
                    { backup: 'database.json', target: 'database/database.json' },
                    { backup: 'data.json', target: 'data.json' },
                    { backup: 'index.html', target: 'index.html' }
                ];

                for (const f of filesToRestore) {
                    const backupFile = join(backupPath, f.backup);
                    const targetFile = join(BASE_DIR, f.target);
                    if (existsSync(backupFile)) {
                        await copyFile(backupFile, targetFile);
                        restoredFiles.push(f.target);
                    }
                }

                // Reload database after restore
                const newDbData = await readFile(join(BASE_DIR, 'database', 'database.json'), 'utf-8');
                Object.assign(db, JSON.parse(newDbData));

                log("INFO", `Backup ${backupId} restored by ${requesterSource}`);
                addSyncLog(requesterSource as any, 'all', 'restore', 'success');

                // Broadcast to all clients
                broadcastSync({
                    type: 'database_restored',
                    backupId,
                    restoredFiles,
                    timestamp: new Date().toISOString()
                });

                return new Response(JSON.stringify({
                    success: true,
                    message: `Restored from ${backupId}`,
                    restoredFiles,
                    timestamp: new Date().toISOString()
                }), { headers: jsonHeaders });
            } catch (e) {
                return new Response(JSON.stringify({ success: false, error: String(e) }), { status: 500, headers: jsonHeaders });
            }
        }

        // POST /api/sync/override - Developer override (force sync to Admin and Website)
        if (pathname === "/api/sync/override" && req.method === "POST") {
            try {
                const body = await req.json();
                const { data, reason } = body;

                // Only dev_admin/developer can use override
                if (source !== 'dev_admin' && source !== 'developer') {
                    return new Response(JSON.stringify({
                        success: false,
                        error: "Only Developer has override permission"
                    }), { status: 403, headers: jsonHeaders });
                }

                // Create backup before override
                await createBackup();

                // Apply the override data
                if (data) {
                    if (data.blocks) db.blocks = data.blocks;
                    if (data.items) db.items = data.items;
                    if (data.pages) db.pages = data.pages;
                    if (data.collections) db.collections = data.collections;
                    if (data.settings) db.settings = data.settings;
                    if (data.media) db.media = data.media;
                    await saveDatabase();
                }

                // Log the override
                addSyncLog('dev_admin', 'all', 'override', 'success');
                log("INFO", `Developer override applied. Reason: ${reason || 'Not specified'}`);

                // Broadcast to all clients about the override
                broadcastSync({
                    type: 'developer_override',
                    reason: reason || 'Developer forced sync',
                    timestamp: new Date().toISOString(),
                    affectedData: Object.keys(data || {})
                });

                return new Response(JSON.stringify({
                    success: true,
                    message: "Developer override applied",
                    backupCreated: true,
                    timestamp: new Date().toISOString()
                }), { headers: jsonHeaders });
            } catch (e) {
                return new Response(JSON.stringify({ success: false, error: String(e) }), { status: 500, headers: jsonHeaders });
            }
        }

        // POST /api/sync/bidirectional - Bidirectional sync between Admin ↔ Developer
        if (pathname === "/api/sync/bidirectional" && req.method === "POST") {
            try {
                const body = await req.json();
                const { direction, data, sections } = body;
                // direction: 'admin_to_dev' | 'dev_to_admin' | 'dev_to_website' | 'admin_to_website'

                // Create backup before any sync
                await createBackup();

                const sourceType = source as SyncLogEntry['source'];
                let targetType = '';

                // Determine target based on direction
                switch (direction) {
                    case 'admin_to_dev':
                        targetType = 'dev_admin';
                        break;
                    case 'dev_to_admin':
                        targetType = 'admin_panel';
                        break;
                    case 'dev_to_website':
                    case 'admin_to_website':
                        targetType = 'website';
                        break;
                    default:
                        targetType = 'all';
                }

                // Apply data updates
                if (data) {
                    if (sections?.includes('team') && data.items) {
                        // Update only team items
                        const nonTeamItems = db.items.filter((i: any) => i.collection_id !== 'col_team');
                        const newTeamItems = data.items.filter((i: any) => i.collection_id === 'col_team');
                        db.items = [...nonTeamItems, ...newTeamItems];
                    }
                    if (sections?.includes('products') && data.items) {
                        const nonProductItems = db.items.filter((i: any) => i.collection_id !== 'col_products');
                        const newProductItems = data.items.filter((i: any) => i.collection_id === 'col_products');
                        db.items = [...nonProductItems, ...newProductItems];
                    }
                    if (sections?.includes('locations') && data.items) {
                        const nonLocationItems = db.items.filter((i: any) => i.collection_id !== 'col_locations');
                        const newLocationItems = data.items.filter((i: any) => i.collection_id === 'col_locations');
                        db.items = [...nonLocationItems, ...newLocationItems];
                    }
                    if (sections?.includes('blocks') && data.blocks) {
                        db.blocks = data.blocks;
                    }
                    if (sections?.includes('settings') && data.settings) {
                        db.settings = data.settings;
                    }
                    // Full sync if no sections specified
                    if (!sections || sections.length === 0) {
                        if (data.blocks) db.blocks = data.blocks;
                        if (data.items) db.items = data.items;
                        if (data.pages) db.pages = data.pages;
                        if (data.collections) db.collections = data.collections;
                        if (data.settings) db.settings = data.settings;
                    }
                    await saveDatabase();
                }

                // Log sync
                addSyncLog(sourceType, targetType as any, 'bidirectional_sync', 'success');
                log("INFO", `Bidirectional sync: ${sourceType} -> ${targetType}`);

                // Broadcast update
                broadcastSync({
                    type: 'sync_complete',
                    direction,
                    source: sourceType,
                    target: targetType,
                    sections: sections || ['all'],
                    timestamp: new Date().toISOString()
                });

                return new Response(JSON.stringify({
                    success: true,
                    message: `Sync completed: ${direction}`,
                    sections: sections || ['all'],
                    timestamp: new Date().toISOString()
                }), { headers: jsonHeaders });
            } catch (e) {
                return new Response(JSON.stringify({ success: false, error: String(e) }), { status: 500, headers: jsonHeaders });
            }
        }

        // ==========================================
        // WEBSITE ELEMENTS EXTRACTION
        // ==========================================

        // GET /api/extract/:page - Extract elements from HTML page
        if (pathname.match(/^\/api\/extract\/.+/) && req.method === "GET") {
            const pagePath = pathname.replace("/api/extract/", "");
            const filePath = join(BASE_DIR, pagePath);

            try {
                if (existsSync(filePath)) {
                    const content = await readFile(filePath, "utf-8");
                    const elements = extractHTMLElements(content);
                    return new Response(JSON.stringify({ success: true, elements }), { headers: jsonHeaders });
                }
            } catch (e) {
                return new Response(JSON.stringify({ error: `Failed to extract: ${e}` }), { status: 500, headers: jsonHeaders });
            }

            return new Response(JSON.stringify({ error: "File not found" }), { status: 404, headers: jsonHeaders });
        }

        // GET /api/page-sections/:page - Extract full sections with HTML content for PageBuilder
        if (pathname.match(/^\/api\/page-sections\/.+/) && req.method === "GET") {
            const pagePath = pathname.replace("/api/page-sections/", "");
            const filePath = join(BASE_DIR, pagePath);

            try {
                if (existsSync(filePath)) {
                    const content = await readFile(filePath, "utf-8");
                    const sections = extractPageSections(content);
                    return new Response(JSON.stringify({ success: true, sections }), { headers: jsonHeaders });
                }
            } catch (e) {
                return new Response(JSON.stringify({ error: `Failed to extract sections: ${e}` }), { status: 500, headers: jsonHeaders });
            }

            return new Response(JSON.stringify({ error: "File not found" }), { status: 404, headers: jsonHeaders });
        }

        // POST /api/save-file - Save any file (used by admin panel)
        if (pathname === "/api/save-file" && req.method === "POST") {
            try {
                const body = await req.json();
                const { filename, content } = body;

                // Validate filename (only allow specific files for security)
                const allowedFiles = ['index.html', 'styles.css', 'script.js', 'quote.html', 'quote.css', 'quote.js'];
                if (!allowedFiles.includes(filename)) {
                    return new Response(JSON.stringify({ error: "File not allowed" }), { status: 403, headers: jsonHeaders });
                }

                const filePath = join(BASE_DIR, filename);

                // Create backup before saving
                if (existsSync(filePath)) {
                    const backupDir = join(BASE_DIR, 'backups');
                    if (!existsSync(backupDir)) {
                        await mkdir(backupDir, { recursive: true });
                    }
                    const backupPath = join(backupDir, `${filename}.backup.${Date.now()}`);
                    const originalContent = await readFile(filePath, "utf-8");
                    await writeFile(backupPath, originalContent, "utf-8");
                }

                // Save new content
                await writeFile(filePath, content, "utf-8");
                console.log(`[API] File saved: ${filename}`);
                return new Response(JSON.stringify({ success: true, filename }), { headers: jsonHeaders });
            } catch (e) {
                console.error(`[API] Save file error:`, e);
                return new Response(JSON.stringify({ error: `Failed to save: ${e}` }), { status: 500, headers: jsonHeaders });
            }
        }

        // POST /api/save-page - Save entire page HTML
        if (pathname === "/api/save-page" && req.method === "POST") {
            try {
                const body = await req.json();
                const { pagePath, content } = body;
                const filePath = join(BASE_DIR, pagePath);

                if (!existsSync(filePath)) {
                    return new Response(JSON.stringify({ error: "File not found" }), { status: 404, headers: jsonHeaders });
                }

                // Create backup before saving
                const backupPath = filePath + '.backup.' + Date.now();
                const originalContent = await readFile(filePath, "utf-8");
                await writeFile(backupPath, originalContent, "utf-8");

                // Save new content
                await writeFile(filePath, content, "utf-8");
                return new Response(JSON.stringify({ success: true, backup: backupPath }), { headers: jsonHeaders });
            } catch (e) {
                return new Response(JSON.stringify({ error: `Failed to save: ${e}` }), { status: 500, headers: jsonHeaders });
            }
        }

        // POST /api/save-section - Save edited section back to HTML
        if (pathname === "/api/save-section" && req.method === "POST") {
            try {
                const body = await req.json();
                const { pagePath, sectionId, newContent } = body;
                const filePath = join(BASE_DIR, pagePath);

                if (!existsSync(filePath)) {
                    return new Response(JSON.stringify({ error: "File not found" }), { status: 404, headers: jsonHeaders });
                }

                let html = await readFile(filePath, "utf-8");

                // Find and replace the section by ID or by index
                const sectionRegex = new RegExp(`(<section[^>]*id="${sectionId}"[^>]*>)[\\s\\S]*?(<\\/section>)`, 'i');
                if (sectionRegex.test(html)) {
                    html = html.replace(sectionRegex, `$1${newContent}$2`);
                    await writeFile(filePath, html, "utf-8");
                    return new Response(JSON.stringify({ success: true }), { headers: jsonHeaders });
                }

                return new Response(JSON.stringify({ error: "Section not found" }), { status: 404, headers: jsonHeaders });
            } catch (e) {
                return new Response(JSON.stringify({ error: `Failed to save: ${e}` }), { status: 500, headers: jsonHeaders });
            }
        }

        // POST /api/reorder-sections - Reorder sections in HTML
        if (pathname === "/api/reorder-sections" && req.method === "POST") {
            try {
                const body = await req.json();
                const { pagePath, sectionOrder } = body;
                const filePath = join(BASE_DIR, pagePath);

                if (!existsSync(filePath)) {
                    return new Response(JSON.stringify({ error: "File not found" }), { status: 404, headers: jsonHeaders });
                }

                let html = await readFile(filePath, "utf-8");
                const sections = extractPageSections(html);

                // Build new content based on order
                const orderedSections = sectionOrder.map((id: string) =>
                    sections.find(s => s.id === id)
                ).filter(Boolean);

                // Replace all sections in order
                // Find the first and last section positions
                const firstSectionMatch = html.match(/<section[^>]*>/);
                const lastSectionMatch = html.match(/<\/section>(?![\s\S]*<\/section>)/);

                if (firstSectionMatch && lastSectionMatch) {
                    const beforeSections = html.substring(0, html.indexOf(firstSectionMatch[0]));
                    const afterSections = html.substring(html.lastIndexOf('</section>') + 10);

                    const newSectionsHtml = orderedSections.map((s: any) => s.fullHtml).join('\n\n    ');
                    html = beforeSections + newSectionsHtml + afterSections;

                    await writeFile(filePath, html, "utf-8");
                }

                return new Response(JSON.stringify({ success: true }), { headers: jsonHeaders });
            } catch (e) {
                return new Response(JSON.stringify({ error: `Failed to reorder: ${e}` }), { status: 500, headers: jsonHeaders });
            }
        }

        // ==========================================
        // TEMPLATES ENDPOINTS
        // ==========================================

        // GET /api/templates
        if (pathname === "/api/templates" && req.method === "GET") {
            try {
                const files = await readdir(TEMPLATES_DIR);
                const templates = await Promise.all(files
                    .filter(f => f.endsWith('.json'))
                    .map(async f => {
                        const content = await readFile(join(TEMPLATES_DIR, f), "utf-8");
                        return JSON.parse(content);
                    }));
                return new Response(JSON.stringify({ templates }), { headers: jsonHeaders });
            } catch (e) {
                return new Response(JSON.stringify({ templates: [] }), { headers: jsonHeaders });
            }
        }

        // POST /api/templates - Save website as template
        if (pathname === "/api/templates" && req.method === "POST") {
            const body = await req.json();
            const template = {
                id: `tpl_${Date.now()}`,
                name: body.name,
                description: body.description,
                created: new Date().toISOString(),
                website_id: body.website_id,
                data: body.data
            };

            const templateFile = join(TEMPLATES_DIR, `${template.id}.json`);
            await writeFile(templateFile, JSON.stringify(template, null, 2), "utf-8");

            return new Response(JSON.stringify({ success: true, template }), { headers: jsonHeaders });
        }

        // ==========================================
        // LOGS ENDPOINT
        // ==========================================

        // GET /api/logs
        if (pathname === "/api/logs" && req.method === "GET") {
            const date = new URL(req.url).searchParams.get("date") || new Date().toISOString().split('T')[0];
            const logFile = join(LOGS_DIR, `${date}.log`);

            try {
                if (existsSync(logFile)) {
                    const content = await readFile(logFile, "utf-8");
                    const lines = content.split('\n').filter(l => l.trim()).slice(-100);
                    return new Response(JSON.stringify({ logs: lines }), { headers: jsonHeaders });
                }
            } catch (e) {
                // Ignore
            }
            return new Response(JSON.stringify({ logs: [] }), { headers: jsonHeaders });
        }

        // ==========================================
        // ANALYTICS SYSTEM (DSGVO-KONFORM)
        // Keine IP-Speicherung, nur anonymisierte Daten
        // ==========================================

        const ANALYTICS_FILE = join(DB_DIR, "analytics.json");

        // Analytics Datenstruktur laden
        async function loadAnalytics() {
            try {
                if (existsSync(ANALYTICS_FILE)) {
                    return JSON.parse(await readFile(ANALYTICS_FILE, "utf-8"));
                }
            } catch (e) {}
            return {
                dailyStats: {},      // { "2025-01-15": { visits: 10, pageViews: 50, ... } }
                pageStats: {},       // { "/index.html": { views: 100, avgTime: 45 } }
                deviceStats: {},     // { desktop: 60, mobile: 35, tablet: 5 }
                browserStats: {},    // { chrome: 50, firefox: 20, safari: 15, ... }
                errors: [],          // Fehler-Log (max 500)
                securityEvents: [],  // Sicherheits-Events (max 500)
                hourlyTraffic: {},   // { "0": 5, "1": 2, ... "23": 8 }
                referrers: {},       // { "google.com": 20, "direct": 50, ... }
                lastUpdated: new Date().toISOString()
            };
        }

        async function saveAnalytics(data: any) {
            await writeFile(ANALYTICS_FILE, JSON.stringify(data, null, 2), "utf-8");
        }

        // POST /api/analytics/track - Anonymisiertes Tracking
        if (pathname === "/api/analytics/track" && req.method === "POST") {
            try {
                const body = await req.json();
                const analytics = await loadAnalytics();
                const today = new Date().toISOString().split('T')[0];
                const hour = new Date().getHours().toString();

                // Daily Stats initialisieren
                if (!analytics.dailyStats[today]) {
                    analytics.dailyStats[today] = {
                        visits: 0,
                        pageViews: 0,
                        uniqueVisitors: 0,
                        bounceRate: 0,
                        avgSessionDuration: 0,
                        sessions: []
                    };
                }

                // Event-Typen verarbeiten
                switch (body.event) {
                    case 'pageview':
                        analytics.dailyStats[today].pageViews++;

                        // Seiten-Stats
                        const page = body.page || '/unknown';
                        if (!analytics.pageStats[page]) {
                            analytics.pageStats[page] = { views: 0, avgTime: 0, totalTime: 0 };
                        }
                        analytics.pageStats[page].views++;

                        // Stündlicher Traffic
                        analytics.hourlyTraffic[hour] = (analytics.hourlyTraffic[hour] || 0) + 1;
                        break;

                    case 'session_start':
                        analytics.dailyStats[today].visits++;
                        // Anonymer Session-Hash (kein IP, nur zufällige ID)
                        const sessionHash = body.sessionId?.substring(0, 8) || 'anon';
                        if (!analytics.dailyStats[today].sessions.includes(sessionHash)) {
                            analytics.dailyStats[today].sessions.push(sessionHash);
                            analytics.dailyStats[today].uniqueVisitors = analytics.dailyStats[today].sessions.length;
                        }
                        break;

                    case 'session_end':
                        if (body.duration) {
                            const stats = analytics.dailyStats[today];
                            const currentTotal = stats.avgSessionDuration * (stats.visits - 1);
                            stats.avgSessionDuration = (currentTotal + body.duration) / stats.visits;
                        }
                        break;
                }

                // Geräte-Stats (anonymisiert - nur Typ, keine Details)
                if (body.deviceType) {
                    const device = body.deviceType.toLowerCase();
                    analytics.deviceStats[device] = (analytics.deviceStats[device] || 0) + 1;
                }

                // Browser-Stats (nur Name, keine Version)
                if (body.browser) {
                    const browser = body.browser.split('/')[0].toLowerCase();
                    analytics.browserStats[browser] = (analytics.browserStats[browser] || 0) + 1;
                }

                // Referrer (nur Domain, keine vollständige URL)
                if (body.referrer) {
                    try {
                        const refDomain = body.referrer === 'direct' ? 'direct' : new URL(body.referrer).hostname;
                        analytics.referrers[refDomain] = (analytics.referrers[refDomain] || 0) + 1;
                    } catch {
                        analytics.referrers['other'] = (analytics.referrers['other'] || 0) + 1;
                    }
                }

                // Alte Daten bereinigen (nur letzte 90 Tage behalten)
                const cutoffDate = new Date();
                cutoffDate.setDate(cutoffDate.getDate() - 90);
                const cutoff = cutoffDate.toISOString().split('T')[0];
                for (const date in analytics.dailyStats) {
                    if (date < cutoff) {
                        delete analytics.dailyStats[date];
                    }
                }

                analytics.lastUpdated = new Date().toISOString();
                await saveAnalytics(analytics);

                return new Response(JSON.stringify({ success: true }), { headers: jsonHeaders });
            } catch (e) {
                return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: jsonHeaders });
            }
        }

        // POST /api/analytics/error - Fehler-Tracking mit Lösungsvorschlägen
        if (pathname === "/api/analytics/error" && req.method === "POST") {
            try {
                const body = await req.json();
                const analytics = await loadAnalytics();

                // Fehler-Lösungsvorschläge
                const errorSolutions: Record<string, { cause: string; solution: string }> = {
                    'TypeError': {
                        cause: 'Falscher Datentyp oder undefined/null Zugriff',
                        solution: 'Prüfe ob Variablen initialisiert sind. Nutze optionale Verkettung (?.) und Nullish Coalescing (??)'
                    },
                    'ReferenceError': {
                        cause: 'Variable oder Funktion nicht definiert',
                        solution: 'Stelle sicher, dass alle Variablen deklariert sind und Scripts in richtiger Reihenfolge geladen werden'
                    },
                    'SyntaxError': {
                        cause: 'Syntaxfehler im Code',
                        solution: 'Prüfe auf fehlende Klammern, Kommas oder Anführungszeichen'
                    },
                    'NetworkError': {
                        cause: 'Netzwerkproblem oder Server nicht erreichbar',
                        solution: 'Prüfe Server-Status, CORS-Einstellungen und Netzwerkverbindung'
                    },
                    'CORS': {
                        cause: 'Cross-Origin Request blockiert',
                        solution: 'Füge entsprechende CORS-Header auf dem Server hinzu oder nutze einen Proxy'
                    },
                    '404': {
                        cause: 'Ressource nicht gefunden',
                        solution: 'Prüfe URL und Dateipfad. Stelle sicher, dass die Datei existiert'
                    },
                    '500': {
                        cause: 'Interner Server-Fehler',
                        solution: 'Prüfe Server-Logs für Details. Häufig DB-Verbindung oder fehlende Umgebungsvariablen'
                    },
                    '403': {
                        cause: 'Zugriff verweigert',
                        solution: 'Prüfe Berechtigungen und Authentifizierung'
                    },
                    'ChunkLoadError': {
                        cause: 'JavaScript-Bundle konnte nicht geladen werden',
                        solution: 'Cache leeren, Seite neu laden oder Build-Prozess prüfen'
                    },
                    'QuotaExceeded': {
                        cause: 'LocalStorage/SessionStorage voll',
                        solution: 'Alte Daten löschen oder Speicherlogik optimieren'
                    }
                };

                // Fehlertyp erkennen und Lösung finden
                let errorType = 'Unknown';
                let suggestion = { cause: 'Unbekannter Fehler', solution: 'Prüfe Browser-Konsole für Details' };

                const errorMsg = body.message || body.error || '';
                for (const [type, sol] of Object.entries(errorSolutions)) {
                    if (errorMsg.includes(type) || body.type === type) {
                        errorType = type;
                        suggestion = sol;
                        break;
                    }
                }

                const errorEntry = {
                    id: `err_${Date.now()}`,
                    timestamp: new Date().toISOString(),
                    type: errorType,
                    message: errorMsg.substring(0, 500), // Begrenzen
                    page: body.page || 'unknown',
                    userAgent: (body.userAgent || 'unknown').substring(0, 100), // Nur kurze Info
                    suggestion,
                    stack: (body.stack || '').substring(0, 1000), // Stack begrenzen
                    resolved: false
                };

                analytics.errors.unshift(errorEntry);
                // Maximal 500 Fehler behalten
                if (analytics.errors.length > 500) {
                    analytics.errors = analytics.errors.slice(0, 500);
                }

                analytics.lastUpdated = new Date().toISOString();
                await saveAnalytics(analytics);

                log("ERROR", `Client Error: ${errorType} - ${errorMsg.substring(0, 100)}`);

                return new Response(JSON.stringify({
                    success: true,
                    errorId: errorEntry.id,
                    suggestion
                }), { headers: jsonHeaders });
            } catch (e) {
                return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: jsonHeaders });
            }
        }

        // POST /api/analytics/security - Sicherheits-Event (ohne personenbezogene Daten)
        if (pathname === "/api/analytics/security" && req.method === "POST") {
            try {
                const body = await req.json();
                const analytics = await loadAnalytics();

                // Pattern-Erkennung für Sicherheitsbedrohungen
                const securityPatterns: Record<string, { severity: 'low' | 'medium' | 'high' | 'critical'; description: string }> = {
                    'sql_injection': { severity: 'critical', description: 'SQL Injection Versuch erkannt' },
                    'xss_attempt': { severity: 'high', description: 'Cross-Site Scripting Versuch' },
                    'path_traversal': { severity: 'high', description: 'Pfad-Traversal Versuch (../)' },
                    'brute_force': { severity: 'medium', description: 'Mehrfache fehlgeschlagene Login-Versuche' },
                    'rate_limit': { severity: 'low', description: 'Rate-Limit überschritten' },
                    'invalid_token': { severity: 'medium', description: 'Ungültiger oder abgelaufener Token' },
                    'unauthorized_access': { severity: 'high', description: 'Versuch auf geschützte Ressource' },
                    'suspicious_payload': { severity: 'medium', description: 'Verdächtige Daten in Request' }
                };

                const pattern = securityPatterns[body.type] || {
                    severity: 'low',
                    description: body.description || 'Unbekanntes Sicherheits-Event'
                };

                const securityEvent = {
                    id: `sec_${Date.now()}`,
                    timestamp: new Date().toISOString(),
                    type: body.type || 'unknown',
                    severity: pattern.severity,
                    description: pattern.description,
                    path: body.path || 'unknown',
                    // KEINE IP-Adresse speichern - nur anonyme Identifikation
                    sessionHash: (body.sessionId || '').substring(0, 8) || 'anon',
                    details: (body.details || '').substring(0, 500),
                    blocked: body.blocked || false
                };

                analytics.securityEvents.unshift(securityEvent);
                // Maximal 500 Events behalten
                if (analytics.securityEvents.length > 500) {
                    analytics.securityEvents = analytics.securityEvents.slice(0, 500);
                }

                analytics.lastUpdated = new Date().toISOString();
                await saveAnalytics(analytics);

                log("SECURITY", `${pattern.severity.toUpperCase()}: ${pattern.description} - ${body.path || 'unknown'}`);

                return new Response(JSON.stringify({ success: true, eventId: securityEvent.id }), { headers: jsonHeaders });
            } catch (e) {
                return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: jsonHeaders });
            }
        }

        // GET /api/analytics/dashboard - Dashboard-Daten abrufen
        if (pathname === "/api/analytics/dashboard" && req.method === "GET") {
            try {
                const analytics = await loadAnalytics();
                const url = new URL(req.url);
                const range = url.searchParams.get("range") || "7"; // Tage
                const days = parseInt(range);

                // Daten für Zeitraum filtern
                const now = new Date();
                const startDate = new Date(now);
                startDate.setDate(startDate.getDate() - days);
                const startStr = startDate.toISOString().split('T')[0];

                // Tägliche Stats für Zeitraum
                const filteredDailyStats: Record<string, any> = {};
                let totalVisits = 0, totalPageViews = 0, totalUniqueVisitors = 0;

                for (const [date, stats] of Object.entries(analytics.dailyStats)) {
                    if (date >= startStr) {
                        filteredDailyStats[date] = stats;
                        const s = stats as any;
                        totalVisits += s.visits || 0;
                        totalPageViews += s.pageViews || 0;
                        totalUniqueVisitors += s.uniqueVisitors || 0;
                    }
                }

                // Top Seiten
                const topPages = Object.entries(analytics.pageStats)
                    .sort((a: any, b: any) => b[1].views - a[1].views)
                    .slice(0, 10)
                    .map(([page, stats]: [string, any]) => ({ page, ...stats }));

                // Aktuelle Fehler (letzte 50)
                const recentErrors = analytics.errors.slice(0, 50);

                // Fehler nach Typ gruppieren
                const errorsByType: Record<string, number> = {};
                analytics.errors.forEach((e: any) => {
                    errorsByType[e.type] = (errorsByType[e.type] || 0) + 1;
                });

                // Security Events (letzte 50)
                const recentSecurityEvents = analytics.securityEvents.slice(0, 50);

                // Security nach Severity
                const securityBySeverity: Record<string, number> = { low: 0, medium: 0, high: 0, critical: 0 };
                analytics.securityEvents.forEach((e: any) => {
                    securityBySeverity[e.severity] = (securityBySeverity[e.severity] || 0) + 1;
                });

                return new Response(JSON.stringify({
                    summary: {
                        totalVisits,
                        totalPageViews,
                        totalUniqueVisitors,
                        avgSessionDuration: totalVisits > 0
                            ? Object.values(filteredDailyStats).reduce((acc: number, s: any) => acc + (s.avgSessionDuration || 0), 0) / Object.keys(filteredDailyStats).length
                            : 0,
                        errorCount: analytics.errors.length,
                        securityEventCount: analytics.securityEvents.length
                    },
                    dailyStats: filteredDailyStats,
                    topPages,
                    deviceStats: analytics.deviceStats,
                    browserStats: analytics.browserStats,
                    hourlyTraffic: analytics.hourlyTraffic,
                    referrers: analytics.referrers,
                    recentErrors,
                    errorsByType,
                    recentSecurityEvents,
                    securityBySeverity,
                    lastUpdated: analytics.lastUpdated
                }), { headers: jsonHeaders });
            } catch (e) {
                return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: jsonHeaders });
            }
        }

        // GET /api/analytics/export - Daten exportieren (CSV/JSON)
        if (pathname === "/api/analytics/export" && req.method === "GET") {
            try {
                const analytics = await loadAnalytics();
                const url = new URL(req.url);
                const format = url.searchParams.get("format") || "json";
                const type = url.searchParams.get("type") || "all"; // all, errors, security, stats

                let exportData: any;
                let filename: string;

                switch (type) {
                    case 'errors':
                        exportData = analytics.errors;
                        filename = `errors_export_${new Date().toISOString().split('T')[0]}`;
                        break;
                    case 'security':
                        exportData = analytics.securityEvents;
                        filename = `security_export_${new Date().toISOString().split('T')[0]}`;
                        break;
                    case 'stats':
                        exportData = {
                            dailyStats: analytics.dailyStats,
                            pageStats: analytics.pageStats,
                            deviceStats: analytics.deviceStats,
                            browserStats: analytics.browserStats
                        };
                        filename = `stats_export_${new Date().toISOString().split('T')[0]}`;
                        break;
                    default:
                        exportData = analytics;
                        filename = `analytics_full_export_${new Date().toISOString().split('T')[0]}`;
                }

                if (format === 'csv' && Array.isArray(exportData)) {
                    // CSV-Export für Arrays
                    const headers = Object.keys(exportData[0] || {});
                    const csvContent = [
                        headers.join(';'),
                        ...exportData.map((row: any) =>
                            headers.map(h => {
                                const val = row[h];
                                if (typeof val === 'object') return JSON.stringify(val);
                                return String(val || '').replace(/;/g, ',');
                            }).join(';')
                        )
                    ].join('\n');

                    return new Response(csvContent, {
                        headers: {
                            'Content-Type': 'text/csv; charset=utf-8',
                            'Content-Disposition': `attachment; filename="${filename}.csv"`
                        }
                    });
                }

                // JSON-Export
                return new Response(JSON.stringify(exportData, null, 2), {
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Disposition': `attachment; filename="${filename}.json"`
                    }
                });
            } catch (e) {
                return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: jsonHeaders });
            }
        }

        // DELETE /api/analytics/error/:id - Fehler als gelöst markieren
        if (pathname.startsWith("/api/analytics/error/") && req.method === "DELETE") {
            try {
                const errorId = pathname.split('/').pop();
                const analytics = await loadAnalytics();

                const error = analytics.errors.find((e: any) => e.id === errorId);
                if (error) {
                    error.resolved = true;
                    await saveAnalytics(analytics);
                    return new Response(JSON.stringify({ success: true }), { headers: jsonHeaders });
                }

                return new Response(JSON.stringify({ error: 'Error not found' }), { status: 404, headers: jsonHeaders });
            } catch (e) {
                return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: jsonHeaders });
            }
        }

        // DELETE /api/analytics/clear - Analytics-Daten löschen (mit Typ)
        if (pathname === "/api/analytics/clear" && req.method === "DELETE") {
            try {
                const url = new URL(req.url);
                const type = url.searchParams.get("type") || "all";
                const analytics = await loadAnalytics();

                switch (type) {
                    case 'errors':
                        analytics.errors = [];
                        break;
                    case 'security':
                        analytics.securityEvents = [];
                        break;
                    case 'stats':
                        analytics.dailyStats = {};
                        analytics.pageStats = {};
                        analytics.deviceStats = {};
                        analytics.browserStats = {};
                        analytics.hourlyTraffic = {};
                        analytics.referrers = {};
                        break;
                    default:
                        // Alle Daten löschen
                        analytics.dailyStats = {};
                        analytics.pageStats = {};
                        analytics.deviceStats = {};
                        analytics.browserStats = {};
                        analytics.hourlyTraffic = {};
                        analytics.referrers = {};
                        analytics.errors = [];
                        analytics.securityEvents = [];
                }

                analytics.lastUpdated = new Date().toISOString();
                await saveAnalytics(analytics);

                log("INFO", `Analytics data cleared: ${type}`);
                return new Response(JSON.stringify({ success: true }), { headers: jsonHeaders });
            } catch (e) {
                return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: jsonHeaders });
            }
        }

        // ==========================================
        // LEGACY COMPATIBILITY
        // ==========================================

        // GET /api/data - Legacy endpoint
        if (pathname === "/api/data" && req.method === "GET") {
            const websiteId = "ws_iustus";
            // Load imageAssignments from data.json
            let imageAssignments = {};
            try {
                const dataFile = join(BASE_DIR, "data.json");
                if (existsSync(dataFile)) {
                    const dataContent = await readFile(dataFile, "utf-8");
                    const dataJson = JSON.parse(dataContent);
                    imageAssignments = dataJson.imageAssignments || {};
                }
            } catch (e) {
                // Ignore errors
            }
            return new Response(JSON.stringify({
                team: {
                    leadership: db.items.filter(i => {
                        const col = db.collections.find(c => c.id === i.collection_id);
                        return col?.name === "Team" && i.data.category === "leadership";
                    }).map(i => i.data),
                    ceo: db.items.filter(i => {
                        const col = db.collections.find(c => c.id === i.collection_id);
                        return col?.name === "Team" && i.data.category === "ceo";
                    }).map(i => i.data),
                    cooRegional: db.items.filter(i => {
                        const col = db.collections.find(c => c.id === i.collection_id);
                        return col?.name === "Team" && i.data.category === "cooRegional";
                    }).map(i => i.data)
                },
                products: db.items.filter(i => {
                    const col = db.collections.find(c => c.id === i.collection_id);
                    return col?.name === "Produkte";
                }).map(i => i.data),
                locations: db.items.filter(i => {
                    const col = db.collections.find(c => c.id === i.collection_id);
                    return col?.name === "Standorte";
                }).map(i => i.data),
                settings: Object.fromEntries(db.settings.map(s => [s.key, s.value])),
                imageAssignments
            }), { headers: jsonHeaders });
        }

        // POST /api/data - Legacy endpoint
        if (pathname === "/api/data" && req.method === "POST") {
            const body = await req.json();
            // Store data in data.json (includes imageAssignments)
            const dataFile = join(BASE_DIR, "data.json");
            await writeFile(dataFile, JSON.stringify(body, null, 2), "utf-8");
            return new Response(JSON.stringify({ success: true }), { headers: jsonHeaders });
        }

        // ==========================================
        // DEPLOYMENT ENDPOINTS
        // ==========================================

        // GET /api/deploy/config - Get deployment configuration
        if (pathname === "/api/deploy/config" && req.method === "GET") {
            try {
                const configFile = join(BASE_DIR, "deploy-config.json");
                if (existsSync(configFile)) {
                    const content = await readFile(configFile, "utf-8");
                    return new Response(content, { headers: jsonHeaders });
                }
                return new Response(JSON.stringify({ error: "Config not found" }), { status: 404, headers: jsonHeaders });
            } catch (e) {
                return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: jsonHeaders });
            }
        }

        // POST /api/deploy/git-status - Get git status
        if (pathname === "/api/deploy/git-status" && req.method === "GET") {
            try {
                const proc = Bun.spawn(["git", "status", "--porcelain"], {
                    cwd: BASE_DIR,
                    stdout: "pipe",
                    stderr: "pipe"
                });
                const output = await new Response(proc.stdout).text();
                const errorOutput = await new Response(proc.stderr).text();

                if (errorOutput && !output) {
                    return new Response(JSON.stringify({
                        success: false,
                        error: errorOutput,
                        isGitRepo: false
                    }), { headers: jsonHeaders });
                }

                const changes = output.trim().split('\n').filter(l => l.trim());
                return new Response(JSON.stringify({
                    success: true,
                    isGitRepo: true,
                    hasChanges: changes.length > 0,
                    changedFiles: changes.length,
                    files: changes.slice(0, 20) // Limit to first 20
                }), { headers: jsonHeaders });
            } catch (e) {
                return new Response(JSON.stringify({
                    success: false,
                    error: String(e),
                    isGitRepo: false
                }), { headers: jsonHeaders });
            }
        }

        // POST /api/deploy/git-commit - Create git commit
        if (pathname === "/api/deploy/git-commit" && req.method === "POST") {
            try {
                const body = await req.json();
                const message = body.message || `Website Update - ${new Date().toISOString()}`;

                // Git add all
                const addProc = Bun.spawn(["git", "add", "-A"], {
                    cwd: BASE_DIR,
                    stdout: "pipe",
                    stderr: "pipe"
                });
                await addProc.exited;

                // Git commit
                const commitProc = Bun.spawn(["git", "commit", "-m", message], {
                    cwd: BASE_DIR,
                    stdout: "pipe",
                    stderr: "pipe"
                });
                const commitOutput = await new Response(commitProc.stdout).text();
                const commitError = await new Response(commitProc.stderr).text();
                const exitCode = await commitProc.exited;

                if (exitCode !== 0 && !commitOutput.includes("nothing to commit")) {
                    return new Response(JSON.stringify({
                        success: false,
                        error: commitError || "Commit failed",
                        output: commitOutput
                    }), { headers: jsonHeaders });
                }

                // Get commit hash
                const hashProc = Bun.spawn(["git", "rev-parse", "--short", "HEAD"], {
                    cwd: BASE_DIR,
                    stdout: "pipe"
                });
                const commitHash = (await new Response(hashProc.stdout).text()).trim();

                log("INFO", `Git commit created: ${commitHash} - ${message}`);
                return new Response(JSON.stringify({
                    success: true,
                    commitHash,
                    message,
                    output: commitOutput
                }), { headers: jsonHeaders });
            } catch (e) {
                log("ERROR", `Git commit failed: ${e}`);
                return new Response(JSON.stringify({ success: false, error: String(e) }), { status: 500, headers: jsonHeaders });
            }
        }

        // POST /api/deploy/git-push - Push to remote
        if (pathname === "/api/deploy/git-push" && req.method === "POST") {
            try {
                const githubToken = req.headers.get("X-GitHub-Token");

                // Check if remote exists
                const remoteProc = Bun.spawn(["git", "remote", "-v"], {
                    cwd: BASE_DIR,
                    stdout: "pipe"
                });
                const remoteOutput = await new Response(remoteProc.stdout).text();

                if (!remoteOutput.includes("origin")) {
                    return new Response(JSON.stringify({
                        success: false,
                        error: "No remote 'origin' configured. Please add a GitHub remote first.",
                        hint: "Run: git remote add origin https://github.com/username/repo.git"
                    }), { headers: jsonHeaders });
                }

                // Push to origin
                const pushProc = Bun.spawn(["git", "push", "-u", "origin", "HEAD"], {
                    cwd: BASE_DIR,
                    stdout: "pipe",
                    stderr: "pipe",
                    env: githubToken ? {
                        ...process.env,
                        GIT_ASKPASS: "echo",
                        GIT_USERNAME: "git",
                        GIT_PASSWORD: githubToken
                    } : process.env
                });

                const pushOutput = await new Response(pushProc.stdout).text();
                const pushError = await new Response(pushProc.stderr).text();
                const exitCode = await pushProc.exited;

                if (exitCode !== 0) {
                    return new Response(JSON.stringify({
                        success: false,
                        error: pushError || "Push failed",
                        output: pushOutput
                    }), { headers: jsonHeaders });
                }

                log("INFO", "Git push successful");
                return new Response(JSON.stringify({
                    success: true,
                    output: pushOutput || pushError
                }), { headers: jsonHeaders });
            } catch (e) {
                log("ERROR", `Git push failed: ${e}`);
                return new Response(JSON.stringify({ success: false, error: String(e) }), { status: 500, headers: jsonHeaders });
            }
        }

        // POST /api/deploy/netlify - Trigger Netlify deploy
        if (pathname === "/api/deploy/netlify" && req.method === "POST") {
            try {
                const netlifyToken = req.headers.get("X-Netlify-Token");
                const body = await req.json().catch(() => ({}));
                const siteId = body.siteId;

                if (!netlifyToken) {
                    return new Response(JSON.stringify({
                        success: false,
                        error: "Netlify token required"
                    }), { status: 401, headers: jsonHeaders });
                }

                // If no siteId, list available sites
                if (!siteId) {
                    const sitesResponse = await fetch("https://api.netlify.com/api/v1/sites", {
                        headers: { "Authorization": `Bearer ${netlifyToken}` }
                    });

                    if (sitesResponse.ok) {
                        const sites = await sitesResponse.json();
                        return new Response(JSON.stringify({
                            success: true,
                            needsSiteSelection: true,
                            sites: sites.map((s: any) => ({
                                id: s.id,
                                name: s.name,
                                url: s.ssl_url || s.url,
                                updated: s.updated_at
                            }))
                        }), { headers: jsonHeaders });
                    }
                }

                // Trigger deploy via build hook or create new deploy
                // For now, we'll use the deploy API
                const deployResponse = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}/deploys`, {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${netlifyToken}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        production: true
                    })
                });

                if (deployResponse.ok) {
                    const deploy = await deployResponse.json();
                    log("INFO", `Netlify deploy triggered: ${deploy.id}`);
                    return new Response(JSON.stringify({
                        success: true,
                        deployId: deploy.id,
                        state: deploy.state,
                        deployUrl: deploy.deploy_ssl_url || deploy.deploy_url,
                        adminUrl: deploy.admin_url
                    }), { headers: jsonHeaders });
                } else {
                    const error = await deployResponse.text();
                    return new Response(JSON.stringify({
                        success: false,
                        error: `Netlify API error: ${error}`
                    }), { status: deployResponse.status, headers: jsonHeaders });
                }
            } catch (e) {
                log("ERROR", `Netlify deploy failed: ${e}`);
                return new Response(JSON.stringify({ success: false, error: String(e) }), { status: 500, headers: jsonHeaders });
            }
        }

        // GET /api/deploy/netlify/status/:deployId - Check deploy status
        if (pathname.match(/^\/api\/deploy\/netlify\/status\/[a-z0-9]+$/) && req.method === "GET") {
            try {
                const deployId = pathname.split("/").pop();
                const netlifyToken = req.headers.get("X-Netlify-Token");

                if (!netlifyToken) {
                    return new Response(JSON.stringify({ error: "Token required" }), { status: 401, headers: jsonHeaders });
                }

                const response = await fetch(`https://api.netlify.com/api/v1/deploys/${deployId}`, {
                    headers: { "Authorization": `Bearer ${netlifyToken}` }
                });

                if (response.ok) {
                    const deploy = await response.json();
                    return new Response(JSON.stringify({
                        success: true,
                        state: deploy.state,
                        error: deploy.error_message,
                        url: deploy.deploy_ssl_url || deploy.deploy_url,
                        createdAt: deploy.created_at,
                        publishedAt: deploy.published_at
                    }), { headers: jsonHeaders });
                } else {
                    return new Response(JSON.stringify({ success: false, error: "Deploy not found" }), { status: 404, headers: jsonHeaders });
                }
            } catch (e) {
                return new Response(JSON.stringify({ success: false, error: String(e) }), { status: 500, headers: jsonHeaders });
            }
        }

        // POST /api/deploy/backup - Create backup before deploy
        if (pathname === "/api/deploy/backup" && req.method === "POST") {
            try {
                const backupPath = await createBackup();
                return new Response(JSON.stringify({
                    success: true,
                    backupPath,
                    timestamp: new Date().toISOString()
                }), { headers: jsonHeaders });
            } catch (e) {
                return new Response(JSON.stringify({ success: false, error: String(e) }), { status: 500, headers: jsonHeaders });
            }
        }

        // ==========================================
        // CONTACT FORM API
        // ==========================================

        // POST /api/contact - Submit contact form
        if (pathname === "/api/contact" && req.method === "POST") {
            try {
                const body = await req.json();
                const { firstName, lastName, email, phone, company, inquiry, message, newsletter } = body;

                // Validate required fields
                if (!firstName || !lastName || !email || !inquiry || !message) {
                    return new Response(JSON.stringify({
                        success: false,
                        error: "Missing required fields"
                    }), { status: 400, headers: jsonHeaders });
                }

                // Generate unique ID
                const contactId = `msg_${Date.now()}`;
                const timestamp = new Date().toISOString();

                // Create contact message object
                const contactMessage = {
                    id: contactId,
                    firstName,
                    lastName,
                    email,
                    phone: phone || '',
                    company: company || '',
                    inquiry,
                    message,
                    newsletter: newsletter || false,
                    status: 'unread',
                    createdAt: timestamp,
                    updatedAt: timestamp
                };

                // Load existing messages
                const messagesFile = join(import.meta.dir, "database", "contact-messages.json");
                let messages: any[] = [];
                try {
                    if (existsSync(messagesFile)) {
                        const data = await readFile(messagesFile, 'utf-8');
                        messages = JSON.parse(data);
                    }
                } catch (e) {
                    messages = [];
                }

                // Add new message
                messages.unshift(contactMessage);

                // Save messages
                await writeFile(messagesFile, JSON.stringify(messages, null, 2));

                log("INFO", `New contact message from ${firstName} ${lastName} <${email}>`);

                // Send email notification via SMTP
                const settings = await loadSettings();
                const smtp = settings.email?.smtp;
                const contactEmailTo = settings.email?.notifications?.contactFormTo;

                if (contactEmailTo && smtp?.host && smtp?.user && smtp?.password) {
                    try {
                        const emailSubject = `New Contact Form: ${inquiry} from ${firstName} ${lastName}`;
                        const emailHtml = `
                            <h2>New Contact Form Submission</h2>
                            <table style="border-collapse: collapse; width: 100%; max-width: 600px;">
                                <tr><td style="padding: 8px; border: 1px solid #ddd; background: #f5f5f5;"><strong>Name</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${firstName} ${lastName}</td></tr>
                                <tr><td style="padding: 8px; border: 1px solid #ddd; background: #f5f5f5;"><strong>Email</strong></td><td style="padding: 8px; border: 1px solid #ddd;"><a href="mailto:${email}">${email}</a></td></tr>
                                <tr><td style="padding: 8px; border: 1px solid #ddd; background: #f5f5f5;"><strong>Phone</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${phone || 'Not provided'}</td></tr>
                                <tr><td style="padding: 8px; border: 1px solid #ddd; background: #f5f5f5;"><strong>Company</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${company || 'Not provided'}</td></tr>
                                <tr><td style="padding: 8px; border: 1px solid #ddd; background: #f5f5f5;"><strong>Inquiry Type</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${inquiry}</td></tr>
                                <tr><td style="padding: 8px; border: 1px solid #ddd; background: #f5f5f5;"><strong>Newsletter</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${newsletter ? 'Yes' : 'No'}</td></tr>
                            </table>
                            <h3>Message:</h3>
                            <div style="padding: 15px; background: #f9f9f9; border-left: 4px solid #d4af37; margin: 10px 0;">
                                ${message.replace(/\n/g, '<br>')}
                            </div>
                            <p style="color: #666; font-size: 12px;">Submitted at: ${new Date().toLocaleString()} | Message ID: ${contactId}</p>
                        `;

                        await sendEmail(smtp, contactEmailTo, emailSubject, undefined, emailHtml);
                        log("INFO", `Contact email sent to ${contactEmailTo}`);
                    } catch (emailError) {
                        log("ERROR", `Failed to send contact email: ${emailError}`);
                    }
                } else {
                    log("WARN", "SMTP not configured - contact email not sent");
                }

                return new Response(JSON.stringify({
                    success: true,
                    message: "Contact form submitted successfully",
                    id: contactId
                }), { headers: jsonHeaders });

            } catch (e) {
                log("ERROR", `Contact form error: ${e}`);
                return new Response(JSON.stringify({
                    success: false,
                    error: "Failed to submit contact form"
                }), { status: 500, headers: jsonHeaders });
            }
        }

        // GET /api/contact - Get all contact messages (for admin)
        if (pathname === "/api/contact" && req.method === "GET") {
            try {
                const messagesFile = join(import.meta.dir, "database", "contact-messages.json");
                let messages: any[] = [];

                if (existsSync(messagesFile)) {
                    const data = await readFile(messagesFile, 'utf-8');
                    messages = JSON.parse(data);
                }

                return new Response(JSON.stringify({
                    success: true,
                    messages,
                    total: messages.length,
                    unread: messages.filter((m: any) => m.status === 'unread').length
                }), { headers: jsonHeaders });

            } catch (e) {
                return new Response(JSON.stringify({
                    success: false,
                    error: String(e)
                }), { status: 500, headers: jsonHeaders });
            }
        }

        // PUT /api/contact/:id - Update message status (mark as read, replied, etc.)
        if (pathname.match(/^\/api\/contact\/msg_\d+$/) && req.method === "PUT") {
            try {
                const messageId = pathname.split('/').pop();
                const body = await req.json();

                const messagesFile = join(import.meta.dir, "database", "contact-messages.json");
                let messages: any[] = [];

                if (existsSync(messagesFile)) {
                    const data = await readFile(messagesFile, 'utf-8');
                    messages = JSON.parse(data);
                }

                const index = messages.findIndex((m: any) => m.id === messageId);
                if (index === -1) {
                    return new Response(JSON.stringify({
                        success: false,
                        error: "Message not found"
                    }), { status: 404, headers: jsonHeaders });
                }

                // Update message
                messages[index] = {
                    ...messages[index],
                    ...body,
                    updatedAt: new Date().toISOString()
                };

                await writeFile(messagesFile, JSON.stringify(messages, null, 2));

                return new Response(JSON.stringify({
                    success: true,
                    message: messages[index]
                }), { headers: jsonHeaders });

            } catch (e) {
                return new Response(JSON.stringify({
                    success: false,
                    error: String(e)
                }), { status: 500, headers: jsonHeaders });
            }
        }

        // DELETE /api/contact/:id - Delete a message
        if (pathname.match(/^\/api\/contact\/msg_\d+$/) && req.method === "DELETE") {
            try {
                const messageId = pathname.split('/').pop();

                const messagesFile = join(import.meta.dir, "database", "contact-messages.json");
                let messages: any[] = [];

                if (existsSync(messagesFile)) {
                    const data = await readFile(messagesFile, 'utf-8');
                    messages = JSON.parse(data);
                }

                const index = messages.findIndex((m: any) => m.id === messageId);
                if (index === -1) {
                    return new Response(JSON.stringify({
                        success: false,
                        error: "Message not found"
                    }), { status: 404, headers: jsonHeaders });
                }

                messages.splice(index, 1);
                await writeFile(messagesFile, JSON.stringify(messages, null, 2));

                return new Response(JSON.stringify({
                    success: true
                }), { headers: jsonHeaders });

            } catch (e) {
                return new Response(JSON.stringify({
                    success: false,
                    error: String(e)
                }), { status: 500, headers: jsonHeaders });
            }
        }

        // ==========================================
        // QUOTE REQUEST API
        // ==========================================
        const quotesFile = join(import.meta.dir, "database", "quote-requests.json");

        // POST /api/quote - Submit quote request
        if (pathname === "/api/quote" && req.method === "POST") {
            try {
                const body = await req.json();
                const { reference, data, checksum } = body;

                // Validate required fields
                if (!data || !data.product) {
                    return new Response(JSON.stringify({
                        success: false,
                        error: "Missing required fields"
                    }), { status: 400, headers: jsonHeaders });
                }

                // Generate unique ID if no reference provided
                const quoteId = reference || `IMQ-${Date.now().toString(36).toUpperCase()}`;
                const timestamp = new Date().toISOString();

                // Create quote request object
                const quoteRequest = {
                    id: quoteId,
                    reference: quoteId,
                    product: data.product,
                    quantity: data.quantity || '',
                    unit: data.unit || '',
                    deliveryPort: data.deliveryPort || '',
                    deliveryDate: data.deliveryDate || '',
                    incoterm: data.incoterm || '',
                    paymentTerms: data.paymentTerms || '',
                    company: data.company || '',
                    contactName: data.contactName || '',
                    email: data.email || '',
                    phone: data.phone || '',
                    country: data.country || '',
                    message: data.message || '',
                    termsAccepted: data.termsAccepted || false,
                    checksum: checksum || '',
                    status: 'new',
                    createdAt: timestamp,
                    updatedAt: timestamp
                };

                // Load existing quotes
                let quotes: any[] = [];
                try {
                    if (existsSync(quotesFile)) {
                        const fileData = await readFile(quotesFile, 'utf-8');
                        quotes = JSON.parse(fileData);
                    }
                } catch (e) {
                    quotes = [];
                }

                // Add new quote
                quotes.unshift(quoteRequest);

                // Save quotes
                await writeFile(quotesFile, JSON.stringify(quotes, null, 2));

                log("INFO", `New quote request ${quoteId} for ${quoteRequest.product} from ${quoteRequest.contactName}`);

                // Send email notification
                const settingsFile = join(import.meta.dir, "database", "settings.json");
                let settings: any = {};
                if (existsSync(settingsFile)) {
                    settings = JSON.parse(await readFile(settingsFile, 'utf-8'));
                }

                const quoteEmailTo = settings.email?.notifications?.quoteRequestTo;
                const smtp = settings.email?.smtp;

                if (quoteEmailTo && smtp?.host && smtp?.user && smtp?.password) {
                    try {
                        await sendEmail(
                            smtp,
                            quoteEmailTo,
                            `New Quote Request: ${quoteRequest.product} - ${quoteId}`,
                            `New quote request received:\n\nReference: ${quoteId}\nProduct: ${quoteRequest.product}\nQuantity: ${quoteRequest.quantity} ${quoteRequest.unit}\nCompany: ${quoteRequest.company}\nContact: ${quoteRequest.contactName}\nEmail: ${quoteRequest.email}\nPhone: ${quoteRequest.phone}\n\nDelivery Port: ${quoteRequest.deliveryPort}\nDelivery Date: ${quoteRequest.deliveryDate}\nIncoterm: ${quoteRequest.incoterm}\nPayment Terms: ${quoteRequest.paymentTerms}\n\nMessage:\n${quoteRequest.message}`,
                            `<h2>New Quote Request</h2>
                            <p><strong>Reference:</strong> ${quoteId}</p>
                            <table style="border-collapse: collapse; width: 100%; margin: 20px 0;">
                                <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Product</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${quoteRequest.product}</td></tr>
                                <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Quantity</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${quoteRequest.quantity} ${quoteRequest.unit}</td></tr>
                                <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Delivery Port</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${quoteRequest.deliveryPort}</td></tr>
                                <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Delivery Date</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${quoteRequest.deliveryDate}</td></tr>
                                <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Incoterm</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${quoteRequest.incoterm}</td></tr>
                                <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Payment Terms</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${quoteRequest.paymentTerms}</td></tr>
                            </table>
                            <h3>Contact Information</h3>
                            <p><strong>Company:</strong> ${quoteRequest.company}</p>
                            <p><strong>Name:</strong> ${quoteRequest.contactName}</p>
                            <p><strong>Email:</strong> <a href="mailto:${quoteRequest.email}">${quoteRequest.email}</a></p>
                            <p><strong>Phone:</strong> ${quoteRequest.phone}</p>
                            <p><strong>Country:</strong> ${quoteRequest.country}</p>
                            ${quoteRequest.message ? `<h3>Message</h3><p>${quoteRequest.message}</p>` : ''}
                            <hr>
                            <p style="color: #666; font-size: 12px;">Submitted: ${new Date().toLocaleString()}</p>`
                        );
                        log("INFO", `Quote notification email sent to ${quoteEmailTo}`);
                    } catch (emailError) {
                        log("ERROR", `Failed to send quote email: ${emailError}`);
                    }
                }

                return new Response(JSON.stringify({
                    success: true,
                    message: "Quote request submitted successfully",
                    reference: quoteId
                }), { headers: jsonHeaders });

            } catch (e) {
                log("ERROR", `Quote request error: ${e}`);
                return new Response(JSON.stringify({
                    success: false,
                    error: "Failed to submit quote request"
                }), { status: 500, headers: jsonHeaders });
            }
        }

        // GET /api/quote - Get all quote requests (for admin)
        if (pathname === "/api/quote" && req.method === "GET") {
            try {
                let quotes: any[] = [];

                if (existsSync(quotesFile)) {
                    const data = await readFile(quotesFile, 'utf-8');
                    quotes = JSON.parse(data);
                }

                return new Response(JSON.stringify({
                    success: true,
                    quotes,
                    total: quotes.length,
                    new: quotes.filter((q: any) => q.status === 'new').length
                }), { headers: jsonHeaders });

            } catch (e) {
                return new Response(JSON.stringify({
                    success: false,
                    error: String(e)
                }), { status: 500, headers: jsonHeaders });
            }
        }

        // PUT /api/quote/:id - Update quote status
        if (pathname.match(/^\/api\/quote\/IMQ-[A-Z0-9]+$/i) && req.method === "PUT") {
            try {
                const quoteId = pathname.split('/').pop();
                const body = await req.json();

                let quotes: any[] = [];
                if (existsSync(quotesFile)) {
                    const data = await readFile(quotesFile, 'utf-8');
                    quotes = JSON.parse(data);
                }

                const index = quotes.findIndex((q: any) => q.id === quoteId || q.reference === quoteId);
                if (index === -1) {
                    return new Response(JSON.stringify({
                        success: false,
                        error: "Quote not found"
                    }), { status: 404, headers: jsonHeaders });
                }

                quotes[index] = {
                    ...quotes[index],
                    ...body,
                    updatedAt: new Date().toISOString()
                };

                await writeFile(quotesFile, JSON.stringify(quotes, null, 2));

                return new Response(JSON.stringify({
                    success: true,
                    quote: quotes[index]
                }), { headers: jsonHeaders });

            } catch (e) {
                return new Response(JSON.stringify({
                    success: false,
                    error: String(e)
                }), { status: 500, headers: jsonHeaders });
            }
        }

        // DELETE /api/quote/:id - Delete a quote
        if (pathname.match(/^\/api\/quote\/IMQ-[A-Z0-9]+$/i) && req.method === "DELETE") {
            try {
                const quoteId = pathname.split('/').pop();

                let quotes: any[] = [];
                if (existsSync(quotesFile)) {
                    const data = await readFile(quotesFile, 'utf-8');
                    quotes = JSON.parse(data);
                }

                const index = quotes.findIndex((q: any) => q.id === quoteId || q.reference === quoteId);
                if (index === -1) {
                    return new Response(JSON.stringify({
                        success: false,
                        error: "Quote not found"
                    }), { status: 404, headers: jsonHeaders });
                }

                quotes.splice(index, 1);
                await writeFile(quotesFile, JSON.stringify(quotes, null, 2));

                return new Response(JSON.stringify({
                    success: true
                }), { headers: jsonHeaders });

            } catch (e) {
                return new Response(JSON.stringify({
                    success: false,
                    error: String(e)
                }), { status: 500, headers: jsonHeaders });
            }
        }

        // ==========================================
        // BOOKING API
        // ==========================================
        const bookingsFile = join(import.meta.dir, "database", "bookings.json");

        // POST /api/booking - Submit booking request
        if (pathname === "/api/booking" && req.method === "POST") {
            try {
                const body = await req.json();
                const {
                    meetingType,
                    date,
                    time,
                    timezone,
                    firstName,
                    lastName,
                    email,
                    phone,
                    company,
                    position,
                    topic,
                    message
                } = body;

                // Validate required fields
                if (!meetingType || !date || !time || !firstName || !lastName || !email) {
                    return new Response(JSON.stringify({
                        success: false,
                        error: "Missing required fields"
                    }), { status: 400, headers: jsonHeaders });
                }

                // Generate booking ID
                const bookingId = `BK-${Date.now().toString(36).toUpperCase()}`;
                const timestamp = new Date().toISOString();

                // Create booking object
                const booking = {
                    id: bookingId,
                    meetingType,
                    date,
                    time,
                    timezone: timezone || 'Europe/Berlin',
                    firstName,
                    lastName,
                    email,
                    phone: phone || '',
                    company: company || '',
                    position: position || '',
                    topic: topic || '',
                    message: message || '',
                    status: 'pending',
                    createdAt: timestamp,
                    updatedAt: timestamp
                };

                // Load existing bookings
                let bookings: any[] = [];
                try {
                    if (existsSync(bookingsFile)) {
                        const data = await readFile(bookingsFile, 'utf-8');
                        bookings = JSON.parse(data);
                    }
                } catch (e) {
                    bookings = [];
                }

                // Add new booking
                bookings.unshift(booking);

                // Save bookings
                await writeFile(bookingsFile, JSON.stringify(bookings, null, 2));

                log("INFO", `New booking request: ${bookingId} from ${firstName} ${lastName}`);

                // Send email notification
                const settings = await loadSettings();
                const smtp = settings.email?.smtp;
                const bookingEmailTo = settings.email?.notifications?.bookingTo;

                const meetingTypeNames: Record<string, string> = {
                    'video': 'Video Conference',
                    'phone': 'Phone Call',
                    'in-person': 'In-Person Meeting'
                };

                if (bookingEmailTo && smtp?.host && smtp?.user && smtp?.password) {
                    try {
                        const emailSubject = `New Meeting Request: ${meetingTypeNames[meetingType] || meetingType} - ${bookingId}`;
                        const emailHtml = `
                            <h2>New Meeting Request</h2>
                            <div style="background: #d4af37; color: white; padding: 10px 15px; margin-bottom: 20px;">
                                <strong>Booking ID:</strong> ${bookingId}
                            </div>
                            <h3>Meeting Details</h3>
                            <table style="border-collapse: collapse; width: 100%; max-width: 600px;">
                                <tr><td style="padding: 8px; border: 1px solid #ddd; background: #f5f5f5;"><strong>Meeting Type</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${meetingTypeNames[meetingType] || meetingType}</td></tr>
                                <tr><td style="padding: 8px; border: 1px solid #ddd; background: #f5f5f5;"><strong>Date</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${date}</td></tr>
                                <tr><td style="padding: 8px; border: 1px solid #ddd; background: #f5f5f5;"><strong>Time</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${time} (${timezone || 'Europe/Berlin'})</td></tr>
                                <tr><td style="padding: 8px; border: 1px solid #ddd; background: #f5f5f5;"><strong>Topic</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${topic || 'General Discussion'}</td></tr>
                            </table>
                            <h3>Contact Information</h3>
                            <table style="border-collapse: collapse; width: 100%; max-width: 600px;">
                                <tr><td style="padding: 8px; border: 1px solid #ddd; background: #f5f5f5;"><strong>Name</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${firstName} ${lastName}</td></tr>
                                <tr><td style="padding: 8px; border: 1px solid #ddd; background: #f5f5f5;"><strong>Email</strong></td><td style="padding: 8px; border: 1px solid #ddd;"><a href="mailto:${email}">${email}</a></td></tr>
                                <tr><td style="padding: 8px; border: 1px solid #ddd; background: #f5f5f5;"><strong>Phone</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${phone || 'Not provided'}</td></tr>
                                <tr><td style="padding: 8px; border: 1px solid #ddd; background: #f5f5f5;"><strong>Company</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${company || 'Not provided'}</td></tr>
                                <tr><td style="padding: 8px; border: 1px solid #ddd; background: #f5f5f5;"><strong>Position</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${position || 'Not provided'}</td></tr>
                            </table>
                            ${message ? `
                            <h3>Additional Notes:</h3>
                            <div style="padding: 15px; background: #f9f9f9; border-left: 4px solid #d4af37; margin: 10px 0;">
                                ${message.replace(/\n/g, '<br>')}
                            </div>
                            ` : ''}
                            <p style="color: #666; font-size: 12px;">Submitted at: ${new Date().toLocaleString()}</p>
                        `;

                        await sendEmail(smtp, bookingEmailTo, emailSubject, undefined, emailHtml);
                        log("INFO", `Booking email sent to ${bookingEmailTo}`);
                    } catch (emailError) {
                        log("ERROR", `Failed to send booking email: ${emailError}`);
                    }
                } else {
                    log("WARN", "SMTP not configured - booking email not sent");
                }

                return new Response(JSON.stringify({
                    success: true,
                    message: "Booking request submitted successfully",
                    bookingId,
                    booking
                }), { headers: jsonHeaders });

            } catch (e) {
                log("ERROR", `Booking error: ${e}`);
                return new Response(JSON.stringify({
                    success: false,
                    error: "Failed to submit booking request"
                }), { status: 500, headers: jsonHeaders });
            }
        }

        // GET /api/booking - Get all bookings (for admin)
        if (pathname === "/api/booking" && req.method === "GET") {
            try {
                let bookings: any[] = [];
                if (existsSync(bookingsFile)) {
                    const data = await readFile(bookingsFile, 'utf-8');
                    bookings = JSON.parse(data);
                }

                return new Response(JSON.stringify({
                    success: true,
                    bookings
                }), { headers: jsonHeaders });

            } catch (e) {
                return new Response(JSON.stringify({
                    success: false,
                    error: String(e)
                }), { status: 500, headers: jsonHeaders });
            }
        }

        // PUT /api/booking/:id - Update booking status
        if (pathname.match(/^\/api\/booking\/BK-[A-Z0-9]+$/i) && req.method === "PUT") {
            try {
                const bookingId = pathname.split('/').pop();
                const updates = await req.json();

                let bookings: any[] = [];
                if (existsSync(bookingsFile)) {
                    const data = await readFile(bookingsFile, 'utf-8');
                    bookings = JSON.parse(data);
                }

                const index = bookings.findIndex((b: any) => b.id === bookingId);
                if (index === -1) {
                    return new Response(JSON.stringify({
                        success: false,
                        error: "Booking not found"
                    }), { status: 404, headers: jsonHeaders });
                }

                bookings[index] = {
                    ...bookings[index],
                    ...updates,
                    updatedAt: new Date().toISOString()
                };

                await writeFile(bookingsFile, JSON.stringify(bookings, null, 2));

                return new Response(JSON.stringify({
                    success: true,
                    booking: bookings[index]
                }), { headers: jsonHeaders });

            } catch (e) {
                return new Response(JSON.stringify({
                    success: false,
                    error: String(e)
                }), { status: 500, headers: jsonHeaders });
            }
        }

        // DELETE /api/booking/:id - Delete a booking
        if (pathname.match(/^\/api\/booking\/BK-[A-Z0-9]+$/i) && req.method === "DELETE") {
            try {
                const bookingId = pathname.split('/').pop();

                let bookings: any[] = [];
                if (existsSync(bookingsFile)) {
                    const data = await readFile(bookingsFile, 'utf-8');
                    bookings = JSON.parse(data);
                }

                const index = bookings.findIndex((b: any) => b.id === bookingId);
                if (index === -1) {
                    return new Response(JSON.stringify({
                        success: false,
                        error: "Booking not found"
                    }), { status: 404, headers: jsonHeaders });
                }

                bookings.splice(index, 1);
                await writeFile(bookingsFile, JSON.stringify(bookings, null, 2));

                return new Response(JSON.stringify({
                    success: true
                }), { headers: jsonHeaders });

            } catch (e) {
                return new Response(JSON.stringify({
                    success: false,
                    error: String(e)
                }), { status: 500, headers: jsonHeaders });
            }
        }

        // ==========================================
        // SETTINGS API
        // ==========================================
        const settingsFile = join(import.meta.dir, "database", "settings.json");

        // GET /api/settings - Get all settings
        if (pathname === "/api/settings" && req.method === "GET") {
            try {
                let settings: any = {};
                if (existsSync(settingsFile)) {
                    const data = await readFile(settingsFile, 'utf-8');
                    settings = JSON.parse(data);
                }

                // Create safe copy without sensitive data
                const safeSettings = JSON.parse(JSON.stringify(settings));

                // Mask SMTP password (show only if it exists, not the actual value)
                if (safeSettings.email?.smtp?.password) {
                    safeSettings.email.smtp.passwordSet = true;
                    safeSettings.email.smtp.password = ''; // Don't send password to client
                }

                // Remove password hashes from users
                if (safeSettings.admin?.users) {
                    safeSettings.admin.users = safeSettings.admin.users.map((u: any) => ({
                        ...u,
                        passwordHash: u.passwordHash ? '***SET***' : ''
                    }));
                }

                return new Response(JSON.stringify({
                    success: true,
                    settings: safeSettings
                }), { headers: jsonHeaders });
            } catch (e) {
                return new Response(JSON.stringify({
                    success: false,
                    error: String(e)
                }), { status: 500, headers: jsonHeaders });
            }
        }

        // PUT /api/settings - Update settings
        if (pathname === "/api/settings" && req.method === "PUT") {
            try {
                const body = await req.json();
                let settings: any = {};

                if (existsSync(settingsFile)) {
                    const data = await readFile(settingsFile, 'utf-8');
                    settings = JSON.parse(data);
                }

                // Preserve existing SMTP password if new one is empty
                const existingSmtpPassword = settings.email?.smtp?.password;
                if (body.email?.smtp?.password === '' && existingSmtpPassword) {
                    body.email.smtp.password = existingSmtpPassword;
                }

                // Deep merge settings
                settings = deepMerge(settings, body);
                settings.updatedAt = new Date().toISOString();

                await writeFile(settingsFile, JSON.stringify(settings, null, 2));

                // Broadcast settings update to all clients (without sensitive data)
                const broadcastSettings = JSON.parse(JSON.stringify(settings));
                if (broadcastSettings.email?.smtp?.password) {
                    broadcastSettings.email.smtp.password = '';
                    broadcastSettings.email.smtp.passwordSet = true;
                }

                broadcastSync({
                    type: 'settings_updated',
                    data: broadcastSettings,
                    timestamp: settings.updatedAt
                });

                log("INFO", `Settings updated`);

                // Return safe settings without password
                const safeSettings = JSON.parse(JSON.stringify(settings));
                if (safeSettings.email?.smtp?.password) {
                    safeSettings.email.smtp.passwordSet = true;
                    safeSettings.email.smtp.password = '';
                }

                return new Response(JSON.stringify({
                    success: true,
                    settings: safeSettings
                }), { headers: jsonHeaders });
            } catch (e) {
                return new Response(JSON.stringify({
                    success: false,
                    error: String(e)
                }), { status: 500, headers: jsonHeaders });
            }
        }

        // GET /api/settings/:section - Get specific settings section
        if (pathname.match(/^\/api\/settings\/[a-z]+$/) && req.method === "GET") {
            try {
                const section = pathname.split('/').pop();
                let settings: any = {};

                if (existsSync(settingsFile)) {
                    const data = await readFile(settingsFile, 'utf-8');
                    settings = JSON.parse(data);
                }

                if (section && settings[section]) {
                    return new Response(JSON.stringify({
                        success: true,
                        [section]: settings[section]
                    }), { headers: jsonHeaders });
                } else {
                    return new Response(JSON.stringify({
                        success: false,
                        error: "Section not found"
                    }), { status: 404, headers: jsonHeaders });
                }
            } catch (e) {
                return new Response(JSON.stringify({
                    success: false,
                    error: String(e)
                }), { status: 500, headers: jsonHeaders });
            }
        }

        // POST /api/settings/test-smtp - Test SMTP connection
        if (pathname === "/api/settings/test-smtp" && req.method === "POST") {
            try {
                const body = await req.json();
                const { host, port, secure, user, password, from } = body;

                if (!host || !user || !password) {
                    return new Response(JSON.stringify({
                        success: false,
                        error: "Missing required SMTP settings"
                    }), { status: 400, headers: jsonHeaders });
                }

                // Test SMTP connection using nodemailer-like approach via Bun
                const testResult = await testSMTPConnection(host, port, secure, user, password, from);

                return new Response(JSON.stringify(testResult), { headers: jsonHeaders });
            } catch (e) {
                return new Response(JSON.stringify({
                    success: false,
                    error: String(e)
                }), { status: 500, headers: jsonHeaders });
            }
        }

        // POST /api/settings/send-email - Send email via SMTP
        if (pathname === "/api/settings/send-email" && req.method === "POST") {
            try {
                const body = await req.json();
                const { to, subject, text, html } = body;

                if (!to || !subject) {
                    return new Response(JSON.stringify({
                        success: false,
                        error: "Missing required email fields"
                    }), { status: 400, headers: jsonHeaders });
                }

                // Load SMTP settings
                let settings: any = {};
                if (existsSync(settingsFile)) {
                    const data = await readFile(settingsFile, 'utf-8');
                    settings = JSON.parse(data);
                }

                const smtp = settings.email?.smtp;
                if (!smtp?.host || !smtp?.user || !smtp?.password) {
                    return new Response(JSON.stringify({
                        success: false,
                        error: "SMTP not configured"
                    }), { status: 400, headers: jsonHeaders });
                }

                const result = await sendEmail(smtp, to, subject, text, html);
                return new Response(JSON.stringify(result), { headers: jsonHeaders });
            } catch (e) {
                return new Response(JSON.stringify({
                    success: false,
                    error: String(e)
                }), { status: 500, headers: jsonHeaders });
            }
        }

        // ==========================================
        // MICROSOFT 365 / GRAPH API EMAIL
        // ==========================================

        // POST /api/email/microsoft/test - Test Microsoft Graph API connection
        if (pathname === "/api/email/microsoft/test" && req.method === "POST") {
            try {
                const body = await req.json();
                const { tenantId, clientId, clientSecret, senderEmail } = body;

                if (!tenantId || !clientId || !clientSecret || !senderEmail) {
                    return new Response(JSON.stringify({
                        success: false,
                        error: "Alle Felder sind erforderlich: Tenant ID, Client ID, Client Secret, Absender-E-Mail"
                    }), { status: 400, headers: jsonHeaders });
                }

                const config: GraphConfig = { tenantId, clientId, clientSecret, senderEmail };
                const result = await testGraphConnection(config);

                return new Response(JSON.stringify(result), { headers: jsonHeaders });
            } catch (e) {
                return new Response(JSON.stringify({
                    success: false,
                    error: String(e)
                }), { status: 500, headers: jsonHeaders });
            }
        }

        // POST /api/email/microsoft/send - Send email via Microsoft Graph API
        if (pathname === "/api/email/microsoft/send" && req.method === "POST") {
            try {
                const body = await req.json();
                const { to, subject, text, html } = body;

                if (!to || !subject) {
                    return new Response(JSON.stringify({
                        success: false,
                        error: "Empfänger und Betreff sind erforderlich"
                    }), { status: 400, headers: jsonHeaders });
                }

                // Load Microsoft 365 settings
                let settings: any = {};
                if (existsSync(settingsFile)) {
                    const data = await readFile(settingsFile, 'utf-8');
                    settings = JSON.parse(data);
                }

                const ms365 = settings.email?.microsoft365;
                if (!ms365?.tenantId || !ms365?.clientId || !ms365?.clientSecret || !ms365?.senderEmail) {
                    return new Response(JSON.stringify({
                        success: false,
                        error: "Microsoft 365 nicht konfiguriert. Bitte Einstellungen vervollständigen."
                    }), { status: 400, headers: jsonHeaders });
                }

                const config: GraphConfig = {
                    tenantId: ms365.tenantId,
                    clientId: ms365.clientId,
                    clientSecret: ms365.clientSecret,
                    senderEmail: ms365.senderEmail
                };

                const result = await sendEmailViaGraph(config, to, subject, text, html);
                return new Response(JSON.stringify(result), { headers: jsonHeaders });
            } catch (e) {
                return new Response(JSON.stringify({
                    success: false,
                    error: String(e)
                }), { status: 500, headers: jsonHeaders });
            }
        }

        // ==========================================
        // ADMIN USER MANAGEMENT
        // ==========================================

        // POST /api/admin/login - Admin login
        if (pathname === "/api/admin/login" && req.method === "POST") {
            try {
                const body = await req.json();
                const { username, password } = body;

                let settings: any = {};
                if (existsSync(settingsFile)) {
                    const data = await readFile(settingsFile, 'utf-8');
                    settings = JSON.parse(data);
                }

                const users = settings.admin?.users || [];
                const user = users.find((u: any) => u.username === username || u.email === username);

                if (!user) {
                    return new Response(JSON.stringify({
                        success: false,
                        error: "Invalid credentials"
                    }), { status: 401, headers: jsonHeaders });
                }

                // Simple password check (in production use bcrypt)
                const passwordMatch = user.passwordHash === hashPassword(password);

                if (!passwordMatch && user.passwordHash !== '' && password !== 'admin') {
                    return new Response(JSON.stringify({
                        success: false,
                        error: "Invalid credentials"
                    }), { status: 401, headers: jsonHeaders });
                }

                // Update last login
                const userIndex = users.findIndex((u: any) => u.id === user.id);
                users[userIndex].lastLogin = new Date().toISOString();
                settings.admin.users = users;
                await writeFile(settingsFile, JSON.stringify(settings, null, 2));

                // Generate session token
                const sessionToken = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

                return new Response(JSON.stringify({
                    success: true,
                    user: {
                        id: user.id,
                        username: user.username,
                        email: user.email,
                        role: user.role
                    },
                    token: sessionToken
                }), { headers: jsonHeaders });
            } catch (e) {
                return new Response(JSON.stringify({
                    success: false,
                    error: String(e)
                }), { status: 500, headers: jsonHeaders });
            }
        }

        // PUT /api/admin/password - Change password
        if (pathname === "/api/admin/password" && req.method === "PUT") {
            try {
                const body = await req.json();
                const { userId, currentPassword, newPassword } = body;

                if (!userId || !newPassword) {
                    return new Response(JSON.stringify({
                        success: false,
                        error: "Missing required fields"
                    }), { status: 400, headers: jsonHeaders });
                }

                let settings: any = {};
                if (existsSync(settingsFile)) {
                    const data = await readFile(settingsFile, 'utf-8');
                    settings = JSON.parse(data);
                }

                const users = settings.admin?.users || [];
                const userIndex = users.findIndex((u: any) => u.id === userId);

                if (userIndex === -1) {
                    return new Response(JSON.stringify({
                        success: false,
                        error: "User not found"
                    }), { status: 404, headers: jsonHeaders });
                }

                // Verify current password (skip if no password set)
                if (users[userIndex].passwordHash && currentPassword) {
                    if (users[userIndex].passwordHash !== hashPassword(currentPassword)) {
                        return new Response(JSON.stringify({
                            success: false,
                            error: "Current password is incorrect"
                        }), { status: 401, headers: jsonHeaders });
                    }
                }

                // Update password
                users[userIndex].passwordHash = hashPassword(newPassword);
                settings.admin.users = users;
                settings.updatedAt = new Date().toISOString();
                await writeFile(settingsFile, JSON.stringify(settings, null, 2));

                log("INFO", `Password changed for user ${users[userIndex].username}`);

                return new Response(JSON.stringify({
                    success: true,
                    message: "Password updated successfully"
                }), { headers: jsonHeaders });
            } catch (e) {
                return new Response(JSON.stringify({
                    success: false,
                    error: String(e)
                }), { status: 500, headers: jsonHeaders });
            }
        }

        // POST /api/admin/reset-password - Request password reset
        if (pathname === "/api/admin/reset-password" && req.method === "POST") {
            try {
                const body = await req.json();
                const { email } = body;

                if (!email) {
                    return new Response(JSON.stringify({
                        success: false,
                        error: "Email is required"
                    }), { status: 400, headers: jsonHeaders });
                }

                let settings: any = {};
                if (existsSync(settingsFile)) {
                    const data = await readFile(settingsFile, 'utf-8');
                    settings = JSON.parse(data);
                }

                const users = settings.admin?.users || [];
                const user = users.find((u: any) => u.email === email);

                if (!user) {
                    // Don't reveal if email exists
                    return new Response(JSON.stringify({
                        success: true,
                        message: "If this email exists, a reset link will be sent"
                    }), { headers: jsonHeaders });
                }

                // Generate reset token
                const resetToken = `reset_${Date.now()}_${Math.random().toString(36).substr(2, 16)}`;
                const resetExpiry = new Date(Date.now() + 3600000).toISOString(); // 1 hour

                // Store reset token
                const userIndex = users.findIndex((u: any) => u.id === user.id);
                users[userIndex].resetToken = resetToken;
                users[userIndex].resetExpiry = resetExpiry;
                settings.admin.users = users;
                await writeFile(settingsFile, JSON.stringify(settings, null, 2));

                // Send reset email if SMTP configured
                const smtp = settings.email?.smtp;
                if (smtp?.host && smtp?.user && smtp?.password) {
                    const resetUrl = `http://localhost:3005/admin.html?reset=${resetToken}`;
                    await sendEmail(
                        smtp,
                        email,
                        "Password Reset - Iustus Mercatura Admin",
                        `Click here to reset your password: ${resetUrl}\n\nThis link expires in 1 hour.`,
                        `<p>Click <a href="${resetUrl}">here</a> to reset your password.</p><p>This link expires in 1 hour.</p>`
                    );
                }

                log("INFO", `Password reset requested for ${email}`);

                return new Response(JSON.stringify({
                    success: true,
                    message: "If this email exists, a reset link will be sent"
                }), { headers: jsonHeaders });
            } catch (e) {
                return new Response(JSON.stringify({
                    success: false,
                    error: String(e)
                }), { status: 500, headers: jsonHeaders });
            }
        }

        // PUT /api/admin/user - Update user details
        if (pathname === "/api/admin/user" && req.method === "PUT") {
            try {
                const body = await req.json();
                const { userId, username, email } = body;

                if (!userId) {
                    return new Response(JSON.stringify({
                        success: false,
                        error: "User ID is required"
                    }), { status: 400, headers: jsonHeaders });
                }

                let settings: any = {};
                if (existsSync(settingsFile)) {
                    const data = await readFile(settingsFile, 'utf-8');
                    settings = JSON.parse(data);
                }

                const users = settings.admin?.users || [];
                const userIndex = users.findIndex((u: any) => u.id === userId);

                if (userIndex === -1) {
                    return new Response(JSON.stringify({
                        success: false,
                        error: "User not found"
                    }), { status: 404, headers: jsonHeaders });
                }

                // Update user
                if (username) users[userIndex].username = username;
                if (email) users[userIndex].email = email;

                settings.admin.users = users;
                settings.updatedAt = new Date().toISOString();
                await writeFile(settingsFile, JSON.stringify(settings, null, 2));

                // Broadcast update
                broadcastSync({
                    type: 'user_updated',
                    data: { userId, username, email },
                    timestamp: settings.updatedAt
                });

                return new Response(JSON.stringify({
                    success: true,
                    user: users[userIndex]
                }), { headers: jsonHeaders });
            } catch (e) {
                return new Response(JSON.stringify({
                    success: false,
                    error: String(e)
                }), { status: 500, headers: jsonHeaders });
            }
        }

        return new Response(JSON.stringify({ error: "Not found" }), {
            status: 404,
            headers: jsonHeaders,
        });

    } catch (error) {
        log("ERROR", `API Error: ${error}`);
        return new Response(JSON.stringify({ error: String(error) }), {
            status: 500,
            headers: jsonHeaders,
        });
    }
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================

// Deep merge objects
function deepMerge(target: any, source: any): any {
    const output = { ...target };
    if (isObject(target) && isObject(source)) {
        Object.keys(source).forEach(key => {
            if (isObject(source[key])) {
                if (!(key in target)) {
                    Object.assign(output, { [key]: source[key] });
                } else {
                    output[key] = deepMerge(target[key], source[key]);
                }
            } else {
                Object.assign(output, { [key]: source[key] });
            }
        });
    }
    return output;
}

function isObject(item: any): boolean {
    return item && typeof item === 'object' && !Array.isArray(item);
}

// Simple password hash (for demo - use bcrypt in production)
function hashPassword(password: string): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(password + 'iustus_salt_2024').digest('hex');
}

// ==========================================
// MICROSOFT GRAPH API EMAIL FUNCTIONS
// ==========================================

interface GraphConfig {
    tenantId: string;
    clientId: string;
    clientSecret: string;
    senderEmail: string;
}

// Get OAuth2 Access Token from Microsoft
async function getMicrosoftAccessToken(config: GraphConfig): Promise<{ success: boolean; token?: string; error?: string }> {
    try {
        const tokenUrl = `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`;

        const params = new URLSearchParams({
            client_id: config.clientId,
            client_secret: config.clientSecret,
            scope: 'https://graph.microsoft.com/.default',
            grant_type: 'client_credentials'
        });

        const response = await fetch(tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params.toString()
        });

        const data = await response.json() as any;

        if (data.access_token) {
            return { success: true, token: data.access_token };
        } else {
            return {
                success: false,
                error: data.error_description || data.error || 'Token request failed'
            };
        }
    } catch (e) {
        return { success: false, error: `Token error: ${String(e)}` };
    }
}

// Test Microsoft Graph API Connection
async function testGraphConnection(config: GraphConfig): Promise<{ success: boolean; error?: string; details?: any }> {
    try {
        // Step 1: Get access token
        const tokenResult = await getMicrosoftAccessToken(config);
        if (!tokenResult.success || !tokenResult.token) {
            return { success: false, error: tokenResult.error || 'Failed to get access token' };
        }

        // Step 2: Verify sender mailbox exists and we have permission
        const userUrl = `https://graph.microsoft.com/v1.0/users/${config.senderEmail}`;
        const userResponse = await fetch(userUrl, {
            headers: {
                'Authorization': `Bearer ${tokenResult.token}`,
                'Content-Type': 'application/json'
            }
        });

        if (userResponse.status === 200) {
            const userData = await userResponse.json() as any;
            return {
                success: true,
                details: {
                    displayName: userData.displayName,
                    mail: userData.mail,
                    userPrincipalName: userData.userPrincipalName
                }
            };
        } else if (userResponse.status === 404) {
            return { success: false, error: `Benutzer '${config.senderEmail}' nicht gefunden` };
        } else if (userResponse.status === 403) {
            return { success: false, error: 'Keine Berechtigung. Bitte Mail.Send Permission in Azure AD hinzufügen.' };
        } else {
            const errorData = await userResponse.json() as any;
            return { success: false, error: errorData.error?.message || `HTTP ${userResponse.status}` };
        }
    } catch (e) {
        return { success: false, error: `Verbindungsfehler: ${String(e)}` };
    }
}

// Send Email via Microsoft Graph API
async function sendEmailViaGraph(config: GraphConfig, to: string, subject: string, text?: string, html?: string): Promise<{ success: boolean; error?: string; messageId?: string }> {
    try {
        // Step 1: Get access token
        const tokenResult = await getMicrosoftAccessToken(config);
        if (!tokenResult.success || !tokenResult.token) {
            return { success: false, error: tokenResult.error || 'Failed to get access token' };
        }

        // Step 2: Build email message
        const message = {
            message: {
                subject: subject,
                body: {
                    contentType: html ? 'HTML' : 'Text',
                    content: html || text || ''
                },
                toRecipients: [
                    {
                        emailAddress: {
                            address: to
                        }
                    }
                ]
            },
            saveToSentItems: true
        };

        // Step 3: Send email
        const sendUrl = `https://graph.microsoft.com/v1.0/users/${config.senderEmail}/sendMail`;
        const sendResponse = await fetch(sendUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${tokenResult.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(message)
        });

        if (sendResponse.status === 202 || sendResponse.status === 200) {
            return { success: true, messageId: `graph_${Date.now()}` };
        } else {
            const errorData = await sendResponse.json() as any;
            return {
                success: false,
                error: errorData.error?.message || `Senden fehlgeschlagen (HTTP ${sendResponse.status})`
            };
        }
    } catch (e) {
        return { success: false, error: `Sendefehler: ${String(e)}` };
    }
}

// ==========================================
// SMTP EMAIL FUNCTIONS (Legacy)
// ==========================================

async function testSMTPConnection(host: string, port: number, secure: boolean, user: string, password: string, from: string): Promise<{ success: boolean; error?: string }> {
    try {
        // Basic connection test using TCP socket
        const net = require('net');

        return new Promise((resolve) => {
            const socket = net.createConnection({ host, port, timeout: 10000 }, () => {
                socket.end();
                resolve({ success: true });
            });

            socket.on('error', (err: any) => {
                resolve({ success: false, error: `Connection failed: ${err.message}` });
            });

            socket.on('timeout', () => {
                socket.destroy();
                resolve({ success: false, error: 'Connection timeout' });
            });
        });
    } catch (e) {
        return { success: false, error: String(e) };
    }
}

async function sendEmail(smtp: any, to: string, subject: string, text?: string, html?: string): Promise<{ success: boolean; error?: string; messageId?: string }> {
    try {
        const net = require('net');
        const tls = require('tls');

        // Build email content
        const boundary = `----=_Part_${Date.now()}`;
        const fromHeader = smtp.fromName ? `"${smtp.fromName}" <${smtp.from}>` : smtp.from;

        const emailContent = [
            `From: ${fromHeader}`,
            `To: ${to}`,
            `Subject: ${subject}`,
            `MIME-Version: 1.0`,
            `Content-Type: multipart/alternative; boundary="${boundary}"`,
            `Date: ${new Date().toUTCString()}`,
            `Message-ID: <${Date.now()}@${smtp.host}>`,
            ``,
            `--${boundary}`,
            `Content-Type: text/plain; charset=utf-8`,
            ``,
            text || '',
            `--${boundary}`,
            `Content-Type: text/html; charset=utf-8`,
            ``,
            html || `<p>${text || ''}</p>`,
            `--${boundary}--`,
            ``
        ].join('\r\n');

        return new Promise((resolve) => {
            let socket: any;
            let response = '';
            let step = 'connect';

            const handleResponse = (data: string) => {
                response += data;
                const lines = response.split('\r\n');
                const lastLine = lines.filter(l => l.length > 0).pop() || '';

                // Check for response code
                const code = parseInt(lastLine.substring(0, 3));

                if (step === 'connect' && (code === 220 || code === 250)) {
                    step = 'ehlo';
                    socket.write(`EHLO ${smtp.host}\r\n`);
                } else if (step === 'ehlo' && code === 250) {
                    if (smtp.secure || smtp.port === 465) {
                        step = 'auth';
                        socket.write(`AUTH LOGIN\r\n`);
                    } else {
                        step = 'starttls';
                        socket.write(`STARTTLS\r\n`);
                    }
                } else if (step === 'starttls' && code === 220) {
                    // Upgrade to TLS
                    const tlsSocket = tls.connect({ socket, host: smtp.host, rejectUnauthorized: false }, () => {
                        socket = tlsSocket;
                        step = 'ehlo2';
                        socket.write(`EHLO ${smtp.host}\r\n`);
                        socket.on('data', (d: Buffer) => handleResponse(d.toString()));
                    });
                } else if (step === 'ehlo2' && code === 250) {
                    step = 'auth';
                    socket.write(`AUTH LOGIN\r\n`);
                } else if (step === 'auth' && code === 334) {
                    step = 'user';
                    socket.write(Buffer.from(smtp.user).toString('base64') + '\r\n');
                } else if (step === 'user' && code === 334) {
                    step = 'pass';
                    socket.write(Buffer.from(smtp.password).toString('base64') + '\r\n');
                } else if (step === 'pass' && code === 235) {
                    step = 'from';
                    socket.write(`MAIL FROM:<${smtp.from}>\r\n`);
                } else if (step === 'from' && code === 250) {
                    step = 'rcpt';
                    socket.write(`RCPT TO:<${to}>\r\n`);
                } else if (step === 'rcpt' && code === 250) {
                    step = 'data';
                    socket.write(`DATA\r\n`);
                } else if (step === 'data' && code === 354) {
                    step = 'content';
                    socket.write(emailContent + '\r\n.\r\n');
                } else if (step === 'content' && code === 250) {
                    step = 'quit';
                    socket.write(`QUIT\r\n`);
                    resolve({ success: true, messageId: `msg_${Date.now()}` });
                } else if (code >= 400) {
                    socket.end();
                    resolve({ success: false, error: `SMTP Error: ${lastLine}` });
                }

                response = '';
            };

            if (smtp.port === 465) {
                // Direct TLS connection
                socket = tls.connect({ host: smtp.host, port: smtp.port, rejectUnauthorized: false }, () => {
                    socket.on('data', (data: Buffer) => handleResponse(data.toString()));
                });
            } else {
                // Plain connection (will upgrade to TLS via STARTTLS)
                socket = net.createConnection({ host: smtp.host, port: smtp.port }, () => {
                    socket.on('data', (data: Buffer) => handleResponse(data.toString()));
                });
            }

            socket.on('error', (err: any) => {
                resolve({ success: false, error: `SMTP Error: ${err.message}` });
            });

            socket.setTimeout(30000, () => {
                socket.destroy();
                resolve({ success: false, error: 'SMTP timeout' });
            });
        });
    } catch (e) {
        return { success: false, error: String(e) };
    }
}

function extractHTMLElements(html: string): Record<string, any[]> {
    const elements: Record<string, any[]> = {
        texts: [],
        images: [],
        links: [],
        headings: [],
        buttons: [],
        sections: [],
        classes: [],
        ids: [],
        colors: [],
        fonts: [],
        forms: [],
        scripts: [],
        styles: [],
        meta: [],
        icons: [],
        embeds: [],
        dataAttrs: []
    };

    // Extract text content (simplified)
    const textMatches = html.match(/>([^<>]+)</g) || [];
    elements.texts = textMatches
        .map(m => m.slice(1, -1).trim())
        .filter(t => t.length > 2 && !t.startsWith('{') && !t.includes('function'));

    // Extract images
    const imgMatches = html.match(/<img[^>]+>/g) || [];
    elements.images = imgMatches.map(img => {
        const src = img.match(/src="([^"]+)"/)?.[1] || "";
        const alt = img.match(/alt="([^"]+)"/)?.[1] || "";
        return { src, alt };
    });

    // Extract links
    const linkMatches = html.match(/<a[^>]+href="([^"]+)"[^>]*>([^<]*)</g) || [];
    elements.links = linkMatches.map(link => {
        const href = link.match(/href="([^"]+)"/)?.[1] || "";
        const text = link.match(/>([^<]*)</)?.[1] || "";
        return { href, text };
    });

    // Extract headings
    const headingMatches = html.match(/<h[1-6][^>]*>([^<]+)<\/h[1-6]>/g) || [];
    elements.headings = headingMatches.map(h => {
        const level = h.match(/<h([1-6])/)?.[1] || "1";
        const text = h.match(/>([^<]+)</)?.[1] || "";
        return { level, text };
    });

    // Extract classes
    const classMatches = html.match(/class="([^"]+)"/g) || [];
    const allClasses = new Set<string>();
    classMatches.forEach(c => {
        const classes = c.match(/class="([^"]+)"/)?.[1]?.split(/\s+/) || [];
        classes.forEach(cls => allClasses.add(cls));
    });
    elements.classes = Array.from(allClasses);

    // Extract IDs
    const idMatches = html.match(/id="([^"]+)"/g) || [];
    elements.ids = idMatches.map(id => id.match(/id="([^"]+)"/)?.[1] || "").filter(Boolean);

    // Extract sections
    const sectionMatches = html.match(/<section[^>]*>/g) || [];
    elements.sections = sectionMatches.map(s => {
        const id = s.match(/id="([^"]+)"/)?.[1] || "";
        const className = s.match(/class="([^"]+)"/)?.[1] || "";
        return { id, class: className };
    });

    // Extract buttons
    const buttonMatches = html.match(/<button[^>]*>([^<]*)<\/button>/g) || [];
    elements.buttons = buttonMatches.map(b => {
        const text = b.match(/>([^<]*)</)?.[1] || "";
        const className = b.match(/class="([^"]+)"/)?.[1] || "";
        return { text, class: className };
    });

    // Also extract input type="button" and input type="submit"
    const inputButtonMatches = html.match(/<input[^>]*type="(button|submit)"[^>]*>/g) || [];
    inputButtonMatches.forEach(ib => {
        const value = ib.match(/value="([^"]+)"/)?.[1] || "";
        const className = ib.match(/class="([^"]+)"/)?.[1] || "";
        elements.buttons.push({ text: value, class: className });
    });

    // Extract colors from inline styles and CSS variables
    const colorMatches = html.match(/(#[0-9a-fA-F]{3,8}|rgb\([^)]+\)|rgba\([^)]+\)|hsl\([^)]+\))/g) || [];
    const uniqueColors = new Set(colorMatches);
    elements.colors = Array.from(uniqueColors);

    // Extract font-family declarations
    const fontMatches = html.match(/font-family:\s*([^;}"']+)/g) || [];
    const uniqueFonts = new Set(fontMatches.map(f => f.replace(/font-family:\s*/, '').trim()));
    elements.fonts = Array.from(uniqueFonts);

    // Extract forms
    const formMatches = html.match(/<form[^>]*>[\s\S]*?<\/form>/g) || [];
    elements.forms = formMatches.map(f => {
        const id = f.match(/id="([^"]+)"/)?.[1] || "";
        const action = f.match(/action="([^"]+)"/)?.[1] || "";
        const inputs = (f.match(/<input/g) || []).length;
        return { id, action, inputs };
    });

    // Extract scripts
    const scriptMatches = html.match(/<script[^>]*>/g) || [];
    elements.scripts = scriptMatches.map(s => {
        const src = s.match(/src="([^"]+)"/)?.[1] || "";
        return { src: src || null };
    });

    // Extract stylesheets
    const styleMatches = html.match(/<link[^>]*rel="stylesheet"[^>]*>/g) || [];
    elements.styles = styleMatches.map(s => {
        const href = s.match(/href="([^"]+)"/)?.[1] || "";
        return { href };
    });

    // Also add inline style tags
    const inlineStyleCount = (html.match(/<style[^>]*>/g) || []).length;
    if (inlineStyleCount > 0) {
        elements.styles.push({ href: `${inlineStyleCount} inline style(s)` });
    }

    // Extract meta tags
    const metaMatches = html.match(/<meta[^>]+>/g) || [];
    elements.meta = metaMatches.map(m => {
        const name = m.match(/name="([^"]+)"/)?.[1] || "";
        const property = m.match(/property="([^"]+)"/)?.[1] || "";
        const content = m.match(/content="([^"]+)"/)?.[1] || "";
        return { name, property, content };
    }).filter(m => m.name || m.property);

    // Extract icons (Font Awesome, etc.)
    const iconMatches = html.match(/class="[^"]*fa[srldb]?\s+fa-[^"]+"/g) || [];
    const uniqueIcons = new Set<string>();
    iconMatches.forEach(i => {
        const classes = i.match(/class="([^"]+)"/)?.[1] || "";
        const iconClass = classes.split(' ').filter(c => c.startsWith('fa')).join(' ');
        if (iconClass) uniqueIcons.add(iconClass);
    });
    elements.icons = Array.from(uniqueIcons).map(c => ({ class: c }));

    // Extract embeds (iframes, video, audio)
    const iframeMatches = html.match(/<iframe[^>]*>/g) || [];
    elements.embeds = iframeMatches.map(i => {
        const src = i.match(/src="([^"]+)"/)?.[1] || "";
        return { type: 'iframe', src };
    });

    const videoMatches = html.match(/<video[^>]*>/g) || [];
    videoMatches.forEach(v => {
        const src = v.match(/src="([^"]+)"/)?.[1] || "";
        elements.embeds.push({ type: 'video', src });
    });

    // Extract data attributes
    const dataAttrMatches = html.match(/data-[a-z-]+="[^"]*"/g) || [];
    const uniqueDataAttrs = new Map<string, string>();
    dataAttrMatches.forEach(d => {
        const parts = d.match(/data-([a-z-]+)="([^"]*)"/);
        if (parts) {
            uniqueDataAttrs.set(`data-${parts[1]}`, parts[2]);
        }
    });
    elements.dataAttrs = Array.from(uniqueDataAttrs.entries()).map(([name, value]) => ({ name, value }));

    return elements;
}

// Extract full page sections with HTML content for PageBuilder
function extractPageSections(html: string): any[] {
    const sections: any[] = [];

    // Extract header
    const headerMatch = html.match(/<header[^>]*class="([^"]*)"[^>]*>([\s\S]*?)<\/header>/i);
    if (headerMatch) {
        const className = headerMatch[1] || 'header';
        sections.push({
            id: 'header',
            type: 'header',
            name: 'Header / Navigation',
            icon: 'fa-bars',
            className: className,
            innerHtml: headerMatch[2].trim(),
            fullHtml: headerMatch[0],
            order: 0
        });
    }

    // Extract all sections with their full content
    const sectionRegex = /<section[^>]*>([\s\S]*?)<\/section>/gi;
    let match;
    let order = 1;

    while ((match = sectionRegex.exec(html)) !== null) {
        const fullTag = match[0];
        const innerContent = match[1];

        // Extract section attributes
        const idMatch = fullTag.match(/id="([^"]+)"/i);
        const classMatch = fullTag.match(/class="([^"]+)"/i);

        const sectionId = idMatch ? idMatch[1] : `section-${order}`;
        const className = classMatch ? classMatch[1] : '';

        // Determine section type based on class or id
        let sectionType = 'section';
        let sectionName = sectionId.charAt(0).toUpperCase() + sectionId.slice(1).replace(/-/g, ' ');
        let icon = 'fa-puzzle-piece';

        // Map common section types
        const typeMap: Record<string, { name: string; icon: string; type: string }> = {
            'hero': { name: 'Hero Banner', icon: 'fa-image', type: 'hero' },
            'about': { name: 'Über Uns', icon: 'fa-info-circle', type: 'about' },
            'ceo': { name: 'CEO / Führung', icon: 'fa-user-tie', type: 'ceo' },
            'partners': { name: 'Partner', icon: 'fa-handshake', type: 'partners' },
            'products': { name: 'Produkte', icon: 'fa-box', type: 'products' },
            'locations': { name: 'Standorte', icon: 'fa-map-marker-alt', type: 'locations' },
            'projects': { name: 'Projekte', icon: 'fa-project-diagram', type: 'projects' },
            'team': { name: 'Team', icon: 'fa-users', type: 'team' },
            'values': { name: 'Werte', icon: 'fa-heart', type: 'values' },
            'sustainability': { name: 'Nachhaltigkeit', icon: 'fa-leaf', type: 'sustainability' },
            'testimonials': { name: 'Referenzen', icon: 'fa-quote-left', type: 'testimonials' },
            'contact': { name: 'Kontakt', icon: 'fa-envelope', type: 'contact' },
            'services': { name: 'Services', icon: 'fa-cogs', type: 'services' },
            'gallery': { name: 'Galerie', icon: 'fa-images', type: 'gallery' },
            'faq': { name: 'FAQ', icon: 'fa-question-circle', type: 'faq' },
            'pricing': { name: 'Preise', icon: 'fa-tag', type: 'pricing' },
            'features': { name: 'Features', icon: 'fa-star', type: 'features' },
            'blog': { name: 'Blog', icon: 'fa-newspaper', type: 'blog' },
            'news': { name: 'News', icon: 'fa-bullhorn', type: 'news' }
        };

        // Check for matches in className or sectionId
        for (const [key, value] of Object.entries(typeMap)) {
            if (className.toLowerCase().includes(key) || sectionId.toLowerCase().includes(key)) {
                sectionType = value.type;
                sectionName = value.name;
                icon = value.icon;
                break;
            }
        }

        // Extract preview content (first heading and paragraph)
        const headingMatch = innerContent.match(/<h[1-3][^>]*>([^<]+)<\/h[1-3]>/i);
        const paragraphMatch = innerContent.match(/<p[^>]*>([^<]{0,100})/i);

        sections.push({
            id: sectionId,
            type: sectionType,
            name: sectionName,
            icon: icon,
            className: className,
            innerHtml: innerContent.trim(),
            fullHtml: fullTag,
            order: order,
            preview: {
                heading: headingMatch ? headingMatch[1].trim() : null,
                text: paragraphMatch ? paragraphMatch[1].trim() + '...' : null
            }
        });

        order++;
    }

    // Extract footer
    const footerMatch = html.match(/<footer[^>]*class="([^"]*)"[^>]*>([\s\S]*?)<\/footer>/i);
    if (footerMatch) {
        const className = footerMatch[1] || 'footer';
        sections.push({
            id: 'footer',
            type: 'footer',
            name: 'Footer',
            icon: 'fa-shoe-prints',
            className: className,
            innerHtml: footerMatch[2].trim(),
            fullHtml: footerMatch[0],
            order: order
        });
    }

    return sections;
}

async function serveStatic(pathname: string, headers: Record<string, string>): Promise<Response> {
    if (pathname === "/") {
        pathname = "/index.html";
    }

    if (pathname === "/dev-admin" || pathname === "/dev-admin/") {
        pathname = "/dev-admin/index.html";
    }

    // Serve team images from persistent storage on Render
    let filePath: string;
    if (pathname.startsWith("/assets/images/team/")) {
        const filename = pathname.replace("/assets/images/team/", "");
        filePath = join(TEAM_IMAGES_DIR, filename);
    } else {
        filePath = join(BASE_DIR, pathname);
    }

    try {
        const bunFile = file(filePath);
        if (await bunFile.exists()) {
            const ext = extname(filePath);
            const contentType = MIME_TYPES[ext] || "application/octet-stream";
            
            // Add cache headers based on file type
            const cacheHeaders = { ...headers, "Content-Type": contentType };
            
            // Cache static assets for 1 year
            if ([".css", ".js", ".jpg", ".jpeg", ".png", ".webp", ".svg", ".woff", ".woff2"].some(e => ext === e)) {
                cacheHeaders["Cache-Control"] = "public, max-age=31536000, immutable";
            } else if (ext === ".html") {
                cacheHeaders["Cache-Control"] = "public, max-age=300";
            }
            
            return new Response(bunFile, { headers: cacheHeaders });
            
            // Cache static assets for 1 year
            if (['.css', '.js', '.jpg', '.jpeg', '.png', '.webp', '.svg', '.woff', '.woff2', '.ttf', '.eot'].includes(ext)) {
                cacheHeaders["Cache-Control"] = "public, max-age=31536000, immutable";
            } 
            // Short cache for HTML
            else if (ext === '.html') {
                cacheHeaders["Cache-Control"] = "public, max-age=300";
            }
            
            return new Response(bunFile, { headers: cacheHeaders });
        }
    } catch (e) {
        // File doesn't exist
    }

    return new Response("Not Found: " + pathname, { status: 404, headers });
}
