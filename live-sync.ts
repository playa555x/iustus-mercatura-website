/**
 * Live Sync System - Iustus Mercatura
 *
 * Hierarchie:
 * - Dev Admin (Master) -> Admin Panel -> Website
 * - Bidirektional, aber Dev hat Prioritaet
 * - Dev-Aenderungen werden erst am naechsten Tag um 3:00 Uhr uebernommen
 * - Backup um 23:59 Uhr
 */

import { readFile, writeFile, mkdir, copyFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";

// Types
interface SyncClient {
    id: string;
    type: 'dev_admin' | 'admin_panel' | 'website';
    ws: any; // WebSocket
    lastPing: Date;
    connected: boolean;
}

interface SyncMessage {
    type: 'update' | 'sync_request' | 'sync_response' | 'ping' | 'pong' | 'backup_status' | 'schedule_info';
    source: 'dev_admin' | 'admin_panel' | 'website';
    target?: 'dev_admin' | 'admin_panel' | 'website' | 'all';
    data?: any;
    timestamp: string;
    priority: 'immediate' | 'scheduled' | 'low';
}

interface PendingChange {
    id: string;
    source: string;
    type: string;
    data: any;
    timestamp: string;
    scheduledFor?: string; // ISO date when to apply
    applied: boolean;
}

interface SyncState {
    lastBackup: string | null;
    lastSync: string | null;
    pendingChanges: PendingChange[];
    syncHistory: Array<{
        timestamp: string;
        type: string;
        source: string;
        target: string;
        success: boolean;
    }>;
}

// Globals
const clients: Map<string, SyncClient> = new Map();
const BASE_DIR = process.cwd();
const SYNC_STATE_FILE = join(BASE_DIR, 'database', 'sync-state.json');
const BACKUP_DIR = join(BASE_DIR, 'backups');

let syncState: SyncState = {
    lastBackup: null,
    lastSync: null,
    pendingChanges: [],
    syncHistory: []
};

// Initialize sync state
async function initSyncState(): Promise<void> {
    try {
        if (existsSync(SYNC_STATE_FILE)) {
            const data = await readFile(SYNC_STATE_FILE, 'utf-8');
            syncState = JSON.parse(data);
        } else {
            await saveSyncState();
        }

        // Ensure backup directory exists
        if (!existsSync(BACKUP_DIR)) {
            await mkdir(BACKUP_DIR, { recursive: true });
        }

        console.log('[LiveSync] State initialized');
    } catch (error) {
        console.error('[LiveSync] Error initializing state:', error);
    }
}

async function saveSyncState(): Promise<void> {
    try {
        await writeFile(SYNC_STATE_FILE, JSON.stringify(syncState, null, 2));
    } catch (error) {
        console.error('[LiveSync] Error saving state:', error);
    }
}

// Register a client
function registerClient(ws: any, type: SyncClient['type']): string {
    const id = `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    clients.set(id, {
        id,
        type,
        ws,
        lastPing: new Date(),
        connected: true
    });

    console.log(`[LiveSync] Client registered: ${type} (${id})`);

    // Send current state to new client
    sendToClient(id, {
        type: 'sync_response',
        source: 'dev_admin',
        data: {
            syncState: {
                lastBackup: syncState.lastBackup,
                lastSync: syncState.lastSync,
                pendingChangesCount: syncState.pendingChanges.filter(c => !c.applied).length
            },
            schedule: getScheduleInfo()
        },
        timestamp: new Date().toISOString(),
        priority: 'immediate'
    });

    // Notify all clients about new connection
    broadcastToAll({
        type: 'sync_response',
        source: type,
        data: {
            event: 'client_connected',
            clientType: type,
            connectedClients: getConnectedClientsInfo()
        },
        timestamp: new Date().toISOString(),
        priority: 'low'
    }, id);

    return id;
}

// Unregister a client
function unregisterClient(id: string): void {
    const client = clients.get(id);
    if (client) {
        client.connected = false;
        clients.delete(id);
        console.log(`[LiveSync] Client disconnected: ${client.type} (${id})`);

        // Notify others
        broadcastToAll({
            type: 'sync_response',
            source: client.type,
            data: {
                event: 'client_disconnected',
                clientType: client.type,
                connectedClients: getConnectedClientsInfo()
            },
            timestamp: new Date().toISOString(),
            priority: 'low'
        });
    }
}

// Get connected clients info
function getConnectedClientsInfo(): Array<{ type: string; connected: boolean; lastPing: string }> {
    const info: Array<{ type: string; connected: boolean; lastPing: string }> = [];
    clients.forEach(client => {
        info.push({
            type: client.type,
            connected: client.connected,
            lastPing: client.lastPing.toISOString()
        });
    });
    return info;
}

// Send message to specific client
function sendToClient(clientId: string, message: SyncMessage): void {
    const client = clients.get(clientId);
    if (client && client.connected && client.ws.readyState === 1) {
        try {
            client.ws.send(JSON.stringify(message));
        } catch (error) {
            console.error(`[LiveSync] Error sending to ${clientId}:`, error);
        }
    }
}

// Broadcast to all clients
function broadcastToAll(message: SyncMessage, excludeId?: string): void {
    clients.forEach((client, id) => {
        if (id !== excludeId && client.connected && client.ws.readyState === 1) {
            sendToClient(id, message);
        }
    });
}

// Broadcast to specific client type
function broadcastToType(type: SyncClient['type'], message: SyncMessage): void {
    clients.forEach((client, id) => {
        if (client.type === type && client.connected) {
            sendToClient(id, message);
        }
    });
}

// Handle incoming message
async function handleMessage(clientId: string, rawMessage: string): Promise<void> {
    try {
        const message: SyncMessage = JSON.parse(rawMessage);
        const client = clients.get(clientId);

        if (!client) return;

        client.lastPing = new Date();

        switch (message.type) {
            case 'ping':
                sendToClient(clientId, {
                    type: 'pong',
                    source: 'dev_admin',
                    timestamp: new Date().toISOString(),
                    priority: 'immediate'
                });
                break;

            case 'update':
                await handleUpdate(client, message);
                break;

            case 'sync_request':
                await handleSyncRequest(client, message);
                break;
        }
    } catch (error) {
        console.error('[LiveSync] Error handling message:', error);
    }
}

// Handle update from client
async function handleUpdate(client: SyncClient, message: SyncMessage): Promise<void> {
    const { data, priority } = message;

    console.log(`[LiveSync] Update from ${client.type}:`, data?.type || 'unknown');

    // Dev Admin changes are scheduled for next day at 3:00
    if (client.type === 'dev_admin' && priority !== 'immediate') {
        const tomorrow3AM = getNext3AM();

        const pendingChange: PendingChange = {
            id: `change_${Date.now()}`,
            source: client.type,
            type: data?.type || 'unknown',
            data: data,
            timestamp: new Date().toISOString(),
            scheduledFor: tomorrow3AM.toISOString(),
            applied: false
        };

        syncState.pendingChanges.push(pendingChange);
        await saveSyncState();

        // Notify Dev Admin about scheduled change
        sendToClient(client.id, {
            type: 'schedule_info',
            source: 'dev_admin',
            data: {
                message: 'Aenderung geplant fuer ' + tomorrow3AM.toLocaleString('de-DE'),
                changeId: pendingChange.id,
                scheduledFor: pendingChange.scheduledFor
            },
            timestamp: new Date().toISOString(),
            priority: 'immediate'
        });

        // Also notify Admin Panel about pending change (for info)
        broadcastToType('admin_panel', {
            type: 'sync_response',
            source: 'dev_admin',
            data: {
                event: 'pending_change_added',
                pendingCount: syncState.pendingChanges.filter(c => !c.applied).length
            },
            timestamp: new Date().toISOString(),
            priority: 'low'
        });

    } else {
        // Admin Panel and Website changes are immediate
        // Propagate based on hierarchy

        if (client.type === 'admin_panel') {
            // Admin -> Website (immediate)
            broadcastToType('website', {
                type: 'update',
                source: 'admin_panel',
                data: data,
                timestamp: new Date().toISOString(),
                priority: 'immediate'
            });

            // Admin -> Dev (for info, will be synced at 3:00)
            broadcastToType('dev_admin', {
                type: 'sync_response',
                source: 'admin_panel',
                data: {
                    event: 'update_applied',
                    updateData: data
                },
                timestamp: new Date().toISOString(),
                priority: 'low'
            });
        }

        if (client.type === 'website') {
            // Website -> Admin (immediate)
            broadcastToType('admin_panel', {
                type: 'update',
                source: 'website',
                data: data,
                timestamp: new Date().toISOString(),
                priority: 'immediate'
            });
        }

        // Log sync
        syncState.syncHistory.push({
            timestamp: new Date().toISOString(),
            type: data?.type || 'unknown',
            source: client.type,
            target: client.type === 'admin_panel' ? 'website' : 'admin_panel',
            success: true
        });

        // Keep only last 100 history entries
        if (syncState.syncHistory.length > 100) {
            syncState.syncHistory = syncState.syncHistory.slice(-100);
        }

        syncState.lastSync = new Date().toISOString();
        await saveSyncState();
    }
}

// Handle sync request
async function handleSyncRequest(client: SyncClient, message: SyncMessage): Promise<void> {
    const requestType = message.data?.requestType;

    switch (requestType) {
        case 'full_state':
            // Send full sync state
            sendToClient(client.id, {
                type: 'sync_response',
                source: 'dev_admin',
                data: {
                    syncState: syncState,
                    schedule: getScheduleInfo(),
                    connectedClients: getConnectedClientsInfo()
                },
                timestamp: new Date().toISOString(),
                priority: 'immediate'
            });
            break;

        case 'pending_changes':
            sendToClient(client.id, {
                type: 'sync_response',
                source: 'dev_admin',
                data: {
                    pendingChanges: syncState.pendingChanges.filter(c => !c.applied)
                },
                timestamp: new Date().toISOString(),
                priority: 'immediate'
            });
            break;

        case 'force_sync':
            // Only Dev Admin can force sync
            if (client.type === 'dev_admin') {
                await applyPendingChanges();
            }
            break;
    }
}

// Get next 3:00 AM
function getNext3AM(): Date {
    const now = new Date();
    const next3AM = new Date(now);
    next3AM.setHours(3, 0, 0, 0);

    // If it's already past 3 AM, set for tomorrow
    if (now.getHours() >= 3) {
        next3AM.setDate(next3AM.getDate() + 1);
    }

    return next3AM;
}

// Get schedule info
function getScheduleInfo(): { nextBackup: string; nextSync: string } {
    const now = new Date();

    // Next backup at 23:59
    const nextBackup = new Date(now);
    nextBackup.setHours(23, 59, 0, 0);
    if (now.getHours() === 23 && now.getMinutes() >= 59) {
        nextBackup.setDate(nextBackup.getDate() + 1);
    }

    // Next sync at 3:00
    const nextSync = getNext3AM();

    return {
        nextBackup: nextBackup.toISOString(),
        nextSync: nextSync.toISOString()
    };
}

// Create backup
async function createBackup(): Promise<boolean> {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFolder = join(BACKUP_DIR, `backup_${timestamp}`);

        await mkdir(backupFolder, { recursive: true });

        // Backup database
        const dbFile = join(BASE_DIR, 'database', 'database.json');
        if (existsSync(dbFile)) {
            await copyFile(dbFile, join(backupFolder, 'database.json'));
        }

        // Backup sync state
        if (existsSync(SYNC_STATE_FILE)) {
            await copyFile(SYNC_STATE_FILE, join(backupFolder, 'sync-state.json'));
        }

        // Backup data.json
        const dataFile = join(BASE_DIR, 'data.json');
        if (existsSync(dataFile)) {
            await copyFile(dataFile, join(backupFolder, 'data.json'));
        }

        // Backup index.html
        const indexFile = join(BASE_DIR, 'index.html');
        if (existsSync(indexFile)) {
            await copyFile(indexFile, join(backupFolder, 'index.html'));
        }

        syncState.lastBackup = new Date().toISOString();
        await saveSyncState();

        console.log(`[LiveSync] Backup created: ${backupFolder}`);

        // Notify all clients
        broadcastToAll({
            type: 'backup_status',
            source: 'dev_admin',
            data: {
                success: true,
                backupPath: backupFolder,
                timestamp: syncState.lastBackup
            },
            timestamp: new Date().toISOString(),
            priority: 'low'
        });

        return true;
    } catch (error) {
        console.error('[LiveSync] Backup error:', error);
        return false;
    }
}

// Apply pending changes (at 3:00 AM)
async function applyPendingChanges(): Promise<void> {
    const pendingChanges = syncState.pendingChanges.filter(c => !c.applied);

    if (pendingChanges.length === 0) {
        console.log('[LiveSync] No pending changes to apply');
        return;
    }

    console.log(`[LiveSync] Applying ${pendingChanges.length} pending changes...`);

    for (const change of pendingChanges) {
        try {
            // Broadcast to Admin Panel and Website
            broadcastToType('admin_panel', {
                type: 'update',
                source: 'dev_admin',
                data: change.data,
                timestamp: new Date().toISOString(),
                priority: 'immediate'
            });

            broadcastToType('website', {
                type: 'update',
                source: 'dev_admin',
                data: change.data,
                timestamp: new Date().toISOString(),
                priority: 'immediate'
            });

            change.applied = true;

            syncState.syncHistory.push({
                timestamp: new Date().toISOString(),
                type: change.type,
                source: 'dev_admin',
                target: 'all',
                success: true
            });

        } catch (error) {
            console.error(`[LiveSync] Error applying change ${change.id}:`, error);
        }
    }

    syncState.lastSync = new Date().toISOString();
    await saveSyncState();

    console.log('[LiveSync] All pending changes applied');
}

// Schedule checker (runs every minute)
function startScheduler(): void {
    setInterval(async () => {
        const now = new Date();
        const hours = now.getHours();
        const minutes = now.getMinutes();

        // Backup at 23:59
        if (hours === 23 && minutes === 59) {
            console.log('[LiveSync] Starting scheduled backup...');
            await createBackup();
        }

        // Apply pending changes at 3:00
        if (hours === 3 && minutes === 0) {
            console.log('[LiveSync] Starting scheduled sync...');
            await applyPendingChanges();
        }

    }, 60000); // Check every minute

    console.log('[LiveSync] Scheduler started');
}

// Export functions for server integration
export {
    initSyncState,
    registerClient,
    unregisterClient,
    handleMessage,
    broadcastToAll,
    broadcastToType,
    createBackup,
    applyPendingChanges,
    startScheduler,
    getScheduleInfo,
    getConnectedClientsInfo,
    SyncMessage,
    SyncClient
};
