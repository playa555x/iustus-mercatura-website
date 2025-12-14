/**
 * Live Sync Client - Iustus Mercatura
 * WebSocket-basierte Echtzeit-Synchronisation
 *
 * Hierarchie:
 * - Dev Admin (Master) -> Admin Panel -> Website
 * - Bidirektional
 * - Dev-Aenderungen werden um 3:00 Uhr uebernommen
 * - Backup um 23:59 Uhr
 */

class LiveSyncClient {
    constructor(clientType = 'admin_panel') {
        this.clientType = clientType; // 'dev_admin', 'admin_panel', 'website'
        this.ws = null;
        this.clientId = null;
        this.connected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectDelay = 2000;
        this.pingInterval = null;
        this.listeners = new Map();
        this.syncState = {
            lastBackup: null,
            lastSync: null,
            pendingCount: 0,
            schedule: {
                nextBackup: null,
                nextSync: null
            }
        };
        this.connectedClients = [];
    }

    /**
     * Connect to WebSocket server
     */
    connect() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/sync?type=${this.clientType}`;

        console.log(`[LiveSync] Connecting as ${this.clientType}...`);

        try {
            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                console.log('[LiveSync] Connected');
                this.connected = true;
                this.reconnectAttempts = 0;
                this.startPing();
                this.emit('connected');
            };

            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleMessage(data);
                } catch (e) {
                    console.error('[LiveSync] Invalid message:', e);
                }
            };

            this.ws.onclose = () => {
                console.log('[LiveSync] Disconnected');
                this.connected = false;
                this.stopPing();
                this.emit('disconnected');
                this.attemptReconnect();
            };

            this.ws.onerror = (error) => {
                console.error('[LiveSync] Error:', error);
                this.emit('error', error);
            };

        } catch (e) {
            console.error('[LiveSync] Connection error:', e);
            this.attemptReconnect();
        }
    }

    /**
     * Handle incoming messages
     */
    handleMessage(data) {
        const { type } = data;

        switch (type) {
            case 'connected':
                this.clientId = data.clientId;
                this.syncState = data.syncState || this.syncState;
                this.connectedClients = data.connectedClients || [];
                console.log(`[LiveSync] Registered as ${this.clientId}`);
                this.emit('sync_state', this.syncState);
                this.emit('clients_updated', this.connectedClients);
                break;

            case 'pong':
                // Ping response received
                break;

            case 'client_connected':
            case 'client_disconnected':
                this.connectedClients = data.connectedClients || [];
                console.log(`[LiveSync] Client ${type === 'client_connected' ? 'connected' : 'disconnected'}: ${data.clientType}`);
                this.emit('clients_updated', this.connectedClients);
                break;

            case 'sync_update':
                console.log(`[LiveSync] Update from ${data.source}:`, data.data?.changeType || 'unknown');
                this.emit('update', {
                    source: data.source,
                    data: data.data,
                    timestamp: data.timestamp
                });
                break;

            case 'update_notification':
                // Info about changes from other clients (for Dev Admin)
                console.log(`[LiveSync] Notification from ${data.source}`);
                this.emit('notification', {
                    source: data.source,
                    data: data.data,
                    timestamp: data.timestamp
                });
                break;

            case 'change_scheduled':
                console.log(`[LiveSync] Change scheduled for ${data.scheduledFor}`);
                this.emit('change_scheduled', {
                    changeId: data.changeId,
                    scheduledFor: data.scheduledFor
                });
                break;

            case 'backup_complete':
            case 'backup_created':
                console.log(`[LiveSync] Backup created: ${data.path || data.timestamp}`);
                this.syncState.lastBackup = data.timestamp;
                this.emit('backup_complete', data);
                break;

            case 'force_sync_complete':
                console.log('[LiveSync] Force sync completed');
                this.emit('sync_complete');
                break;

            case 'full_sync':
                this.syncState = data.syncState || this.syncState;
                this.connectedClients = data.connectedClients || [];
                this.emit('full_sync', data);
                break;

            default:
                console.log(`[LiveSync] Unknown message type: ${type}`, data);
        }
    }

    /**
     * Send update to server
     * @param {object} payload - The data to sync
     * @param {string} priority - 'immediate' or 'scheduled' (for Dev Admin)
     */
    sendUpdate(payload, priority = 'scheduled') {
        if (!this.connected) {
            console.warn('[LiveSync] Not connected, update queued');
            return false;
        }

        this.send({
            type: 'update',
            payload,
            priority
        });

        return true;
    }

    /**
     * Request full sync from server
     */
    requestSync() {
        this.send({ type: 'request_sync' });
    }

    /**
     * Force apply all pending changes (Dev Admin only)
     */
    forceSync() {
        if (this.clientType !== 'dev_admin') {
            console.warn('[LiveSync] Only Dev Admin can force sync');
            return;
        }
        this.send({ type: 'force_sync' });
    }

    /**
     * Create backup (Dev Admin only)
     */
    createBackup() {
        if (this.clientType !== 'dev_admin') {
            console.warn('[LiveSync] Only Dev Admin can create backups');
            return;
        }
        this.send({ type: 'create_backup' });
    }

    /**
     * Send message to server
     */
    send(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
    }

    /**
     * Start ping interval
     */
    startPing() {
        this.pingInterval = setInterval(() => {
            if (this.connected) {
                this.send({ type: 'ping' });
            }
        }, 30000);
    }

    /**
     * Stop ping interval
     */
    stopPing() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }

    /**
     * Attempt to reconnect
     */
    attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('[LiveSync] Max reconnect attempts reached');
            this.emit('reconnect_failed');
            return;
        }

        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.min(this.reconnectAttempts, 5);

        console.log(`[LiveSync] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

        setTimeout(() => {
            this.connect();
        }, delay);
    }

    /**
     * Disconnect from server
     */
    disconnect() {
        this.stopPing();
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.connected = false;
    }

    /**
     * Add event listener
     */
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }

    /**
     * Remove event listener
     */
    off(event, callback) {
        if (this.listeners.has(event)) {
            const callbacks = this.listeners.get(event);
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }
    }

    /**
     * Emit event
     */
    emit(event, data) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (e) {
                    console.error(`[LiveSync] Error in ${event} listener:`, e);
                }
            });
        }
    }

    /**
     * Get connection status
     */
    getStatus() {
        return {
            connected: this.connected,
            clientId: this.clientId,
            clientType: this.clientType,
            syncState: this.syncState,
            connectedClients: this.connectedClients
        };
    }

    /**
     * Get formatted schedule info
     */
    getScheduleInfo() {
        const formatDate = (isoString) => {
            if (!isoString) return 'N/A';
            const d = new Date(isoString);
            return d.toLocaleString('de-DE', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        };

        return {
            nextBackup: formatDate(this.syncState.schedule?.nextBackup),
            nextSync: formatDate(this.syncState.schedule?.nextSync),
            lastBackup: formatDate(this.syncState.lastBackup),
            lastSync: formatDate(this.syncState.lastSync),
            pendingChanges: this.syncState.pendingCount || 0
        };
    }
}

// Export for use in different contexts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LiveSyncClient;
}
if (typeof window !== 'undefined') {
    window.LiveSyncClient = LiveSyncClient;
}
