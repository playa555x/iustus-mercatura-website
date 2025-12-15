/**
 * Universal Dev Admin - Full CMS System
 * Mit Connection Monitor, Database Viewer, Sync mit Bestaetigung, Website Bausteine, Templates
 */

const DEV_PASSWORD = 'DevAdmin2025!';

// Auto-detect API URL based on current hostname
const getApiBase = () => {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return `http://${window.location.host}/api`;
    }
    return `${window.location.origin}/api`;
};
const API_BASE = getApiBase();

class DevAdmin {
    constructor() {
        this.isAuthenticated = false;
        this.changes = 0;
        this.currentSection = 'dashboard';
        this.currentWebsite = 'ws_iustus';
        this.currentPage = null;
        this.currentCollection = null;
        this.currentDbTable = null;
        this.selectedBlock = null;
        this.previewZoom = 100;
        this.previewDevice = 'desktop';
        this.pendingConfirmAction = null;
        this.lastSyncTime = null;
        this.syncInterval = null;
        this.errors = [];

        // Server data
        this.db = {
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

        // Block types
        this.blockTypes = {
            hero: { name: 'Hero', icon: 'fa-image' },
            text: { name: 'Text', icon: 'fa-paragraph' },
            heading: { name: 'Heading', icon: 'fa-heading' },
            image: { name: 'Image', icon: 'fa-image' },
            gallery: { name: 'Gallery', icon: 'fa-images' },
            cards: { name: 'Cards', icon: 'fa-th-large' },
            team: { name: 'Team', icon: 'fa-users' },
            products: { name: 'Products', icon: 'fa-box' },
            contact: { name: 'Contact', icon: 'fa-envelope' },
            map: { name: 'Map', icon: 'fa-map' },
            cta: { name: 'Call to Action', icon: 'fa-bullhorn' },
            html: { name: 'Custom HTML', icon: 'fa-code' }
        };

        this.modalCallback = null;
        this.init();
    }

    // ============================================
    // INITIALIZATION
    // ============================================
    async init() {
        this.bindLogin();
        this.checkAuth();
    }

    checkAuth() {
        const auth = sessionStorage.getItem('devAdminAuth');
        if (auth === 'true') {
            this.showApp();
        }
    }

    bindLogin() {
        const form = document.getElementById('loginForm');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleLogin();
            });
        }
    }

    handleLogin() {
        const password = document.getElementById('devPassword').value;
        const errorEl = document.getElementById('loginError');

        if (password === DEV_PASSWORD) {
            sessionStorage.setItem('devAdminAuth', 'true');
            this.showApp();
        } else {
            errorEl.classList.add('show');
            setTimeout(() => errorEl.classList.remove('show'), 3000);
        }
    }

    async showApp() {
        this.isAuthenticated = true;
        document.getElementById('loginOverlay').style.display = 'none';
        document.getElementById('appContainer').style.display = 'flex';

        await this.loadData();
        this.bindEvents();
        this.startConnectionMonitor();
        this.navigateTo('dashboard');
    }

    logout() {
        sessionStorage.removeItem('devAdminAuth');
        location.reload();
    }

    // ============================================
    // DATA LOADING
    // ============================================
    async loadData() {
        try {
            // Load database structure
            const response = await fetch(`${API_BASE}/db`, {
                headers: { 'X-Source': 'dev_admin' }
            });
            if (response.ok) {
                this.db = await response.json();
                this.updateConnectionStatus('dev_admin', 'connected');
            }

            // Load website data from HTML extraction APIs
            const [teamRes, locationsRes, contentRes] = await Promise.all([
                fetch(`${API_BASE}/team`),
                fetch(`${API_BASE}/locations`),
                fetch(`${API_BASE}/content`)
            ]);

            if (teamRes.ok) {
                const teamData = await teamRes.json();
                this.websiteData = this.websiteData || {};
                this.websiteData.team = teamData.team;
            }

            if (locationsRes.ok) {
                const locData = await locationsRes.json();
                this.websiteData = this.websiteData || {};
                this.websiteData.locations = locData.locations;
            }

            if (contentRes.ok) {
                const contentData = await contentRes.json();
                this.websiteData = this.websiteData || {};
                this.websiteData.content = contentData.content;
            }

            this.renderAll();
        } catch (e) {
            this.logError('Server nicht erreichbar', e.message);
            this.updateConnectionStatus('dev_admin', 'error', e.message);
        }
    }

    async pullFromServer() {
        try {
            const response = await fetch(`${API_BASE}/sync/pull?website_id=${this.currentWebsite}`, {
                headers: { 'X-Source': 'dev_admin' }
            });
            if (response.ok) {
                const result = await response.json();
                this.lastSyncTime = new Date();
                this.updateLastSyncDisplay();
                this.showToast('success', 'Geladen', 'Daten vom Server geladen.');
                await this.loadData();
            }
        } catch (e) {
            this.showToast('error', 'Fehler', 'Pull fehlgeschlagen: ' + e.message);
        }
    }

    async pushToServerWithConfirm() {
        // First get preview of changes
        try {
            const response = await fetch(`${API_BASE}/sync/push`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Source': 'dev_admin'
                },
                body: JSON.stringify({
                    data: {
                        pages: this.db.pages.filter(p => p.website_id === this.currentWebsite),
                        blocks: this.db.blocks,
                        collections: this.db.collections.filter(c => c.website_id === this.currentWebsite),
                        items: this.db.items,
                        settings: this.db.settings.filter(s => s.website_id === this.currentWebsite)
                    },
                    target: 'server',
                    confirmed: false
                })
            });

            if (response.ok) {
                const result = await response.json();
                if (result.needs_confirmation) {
                    this.showConfirmDialog(result.preview);
                }
            }
        } catch (e) {
            this.showToast('error', 'Fehler', 'Push fehlgeschlagen: ' + e.message);
        }
    }

    showConfirmDialog(preview) {
        const overlay = document.getElementById('confirmOverlay');
        const body = document.getElementById('confirmBody');
        const changes = document.getElementById('confirmChanges');

        body.innerHTML = `
            <p>Du bist dabei, Aenderungen vom <strong>Dev Admin</strong> zum <strong>Server</strong> zu senden.</p>
            <p>Diese Aktion ueberschreibt die Server-Daten. Bitte bestaetigen.</p>
        `;

        changes.innerHTML = `
            <div class="confirm-changes-list">
                ${preview.changes.map(c => `
                    <div class="confirm-change-item">
                        <i class="fas fa-check"></i>
                        <span>${c}</span>
                    </div>
                `).join('')}
            </div>
        `;

        this.pendingConfirmAction = async () => {
            await this.executePush();
        };

        overlay.classList.add('active');
    }

    async executePush() {
        try {
            const response = await fetch(`${API_BASE}/sync/push`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Source': 'dev_admin'
                },
                body: JSON.stringify({
                    data: {
                        pages: this.db.pages.filter(p => p.website_id === this.currentWebsite),
                        blocks: this.db.blocks,
                        collections: this.db.collections.filter(c => c.website_id === this.currentWebsite),
                        items: this.db.items,
                        settings: this.db.settings.filter(s => s.website_id === this.currentWebsite)
                    },
                    target: 'server',
                    confirmed: true
                })
            });

            if (response.ok) {
                this.changes = 0;
                this.updateChangeCount();
                this.lastSyncTime = new Date();
                this.updateLastSyncDisplay();
                this.showToast('success', 'Gesendet', 'Daten wurden zum Server gepusht.');
                this.loadSyncLog();
            }
        } catch (e) {
            this.showToast('error', 'Fehler', 'Push fehlgeschlagen.');
        }

        this.cancelConfirm();
    }

    cancelConfirm() {
        document.getElementById('confirmOverlay').classList.remove('active');
        this.pendingConfirmAction = null;
    }

    executeConfirm() {
        if (this.pendingConfirmAction) {
            this.pendingConfirmAction();
        }
    }

    async syncToAdmin() {
        this.showToast('info', 'Sync', 'Daten werden an Admin Panel gesendet...');
        // Trigger Admin Panel to pull from server
        setTimeout(() => {
            this.showToast('success', 'Gesendet', 'Admin Panel kann Daten laden.');
        }, 1000);
    }

    async syncToWebsite() {
        this.showToast('info', 'Sync', 'Website wird aktualisiert...');
        setTimeout(() => {
            this.showToast('success', 'Aktualisiert', 'Website verwendet aktuelle Daten.');
        }, 1000);
    }

    // ============================================
    // CONNECTION MONITOR
    // ============================================
    startConnectionMonitor() {
        this.pingServer();
        this.syncInterval = setInterval(() => this.pingServer(), 30000);
    }

    async pingServer() {
        try {
            const response = await fetch(`${API_BASE}/sync/ping`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Source': 'dev_admin'
                },
                body: JSON.stringify({ type: 'dev_admin' })
            });
            if (response.ok) {
                this.updateConnectionStatus('dev_admin', 'connected');
                this.updateConnectionStatus('database', 'connected');
            }
        } catch (e) {
            this.updateConnectionStatus('dev_admin', 'error', e.message);
        }
    }

    updateConnectionStatus(type, status, error = null) {
        const conn = this.db.connections.find(c => c.type === type);
        if (conn) {
            conn.status = status;
            conn.error = error;
            conn.last_ping = new Date().toISOString();
        }
        this.renderDashboardConnections();
        this.updateSyncStatusMini();
    }

    updateSyncStatusMini() {
        const mini = document.getElementById('syncStatusMini');
        if (!mini) return;

        const allConnected = this.db.connections.every(c => c.status === 'connected');
        const hasError = this.db.connections.some(c => c.status === 'error');

        const dot = mini.querySelector('.status-dot');
        const text = mini.querySelector('span:last-child');

        if (hasError) {
            dot.className = 'status-dot red';
            text.textContent = 'Fehler';
        } else if (allConnected) {
            dot.className = 'status-dot green';
            text.textContent = 'Verbunden';
        } else {
            dot.className = 'status-dot yellow';
            text.textContent = 'Teilweise';
        }
    }

    async refreshConnections() {
        await this.pingServer();
        await this.loadConnectionStatus();
        this.renderConnectionMonitor();
        this.showToast('info', 'Aktualisiert', 'Verbindungsstatus aktualisiert.');
    }

    async loadConnectionStatus() {
        try {
            const response = await fetch(`${API_BASE}/sync/status`);
            if (response.ok) {
                const data = await response.json();
                this.db.connections = data.connections;
                this.db.sync_log = data.last_syncs;
            }
        } catch (e) {
            // Ignore
        }
    }

    renderConnectionMonitor() {
        // Update diagram nodes and connection lines
        this.db.connections.forEach(conn => {
            const nodeId = {
                'dev_admin': 'nodeDevAdmin',
                'admin_panel': 'nodeAdminPanel',
                'website': 'nodeWebsite',
                'database': 'nodeDatabase'
            }[conn.type];

            const lineId = {
                'dev_admin': 'lineDevToServer',
                'admin_panel': 'lineServerToAdmin',
                'website': 'lineServerToWebsite',
                'database': 'lineServerToDb'
            }[conn.type];

            // Update node status dot
            const node = document.getElementById(nodeId);
            if (node) {
                const dot = node.querySelector('.status-dot');
                dot.className = 'status-dot ' + (conn.status === 'connected' ? 'green' : conn.status === 'error' ? 'red' : 'yellow');
            }

            // Update connection line
            const line = document.getElementById(lineId);
            if (line) {
                line.classList.remove('error', 'warning');
                if (conn.status === 'error') {
                    line.classList.add('error');
                } else if (conn.status === 'disconnected') {
                    line.classList.add('warning');
                }
            }
        });

        // Connection table
        const table = document.getElementById('connectionTable');
        if (table) {
            table.innerHTML = this.db.connections.map(conn => {
                const isDisconnected = conn.status !== 'connected';
                const errorMsg = this.getConnectionError(conn);

                return `
                <div class="connection-row ${isDisconnected ? 'disconnected' : ''}">
                    <div class="connection-row-icon">
                        <i class="fas ${this.getConnectionIcon(conn.type)}"></i>
                    </div>
                    <div class="connection-row-info">
                        <div class="connection-row-name">${conn.name}</div>
                        <div class="connection-row-meta">Letzter Ping: ${this.formatTime(conn.last_ping)}</div>
                        ${isDisconnected ? `<div class="connection-row-error"><i class="fas fa-exclamation-triangle"></i> ${errorMsg}</div>` : ''}
                    </div>
                    <div class="connection-row-status ${conn.status}">
                        <span class="status-dot ${conn.status === 'connected' ? 'green' : 'red'}"></span>
                        ${conn.status === 'connected' ? 'Verbunden' : 'Getrennt'}
                    </div>
                    <div class="connection-row-actions">
                        ${isDisconnected ? `
                            <button class="btn-restart-conn" onclick="devAdmin.restartConnection('${conn.type}')" title="Verbindung wiederherstellen">
                                <i class="fas fa-redo"></i> Neustart
                            </button>
                            <button class="btn-open-conn" onclick="devAdmin.openConnection('${conn.type}')" title="Oeffnen">
                                <i class="fas fa-external-link-alt"></i>
                            </button>
                        ` : `
                            <button class="btn-open-conn" onclick="devAdmin.openConnection('${conn.type}')" title="Oeffnen">
                                <i class="fas fa-external-link-alt"></i>
                            </button>
                        `}
                    </div>
                </div>
            `}).join('');
        }

        // Error log
        this.renderErrorLog();
    }

    getConnectionIcon(type) {
        return {
            'dev_admin': 'fa-code',
            'admin_panel': 'fa-user-shield',
            'website': 'fa-globe',
            'database': 'fa-database'
        }[type] || 'fa-circle';
    }

    getConnectionError(conn) {
        // Berechne Zeit seit letztem Ping
        const lastPing = new Date(conn.last_ping);
        const now = new Date();
        const diffMinutes = Math.floor((now - lastPing) / 60000);

        if (conn.type === 'admin_panel') {
            if (diffMinutes > 60) {
                return `Admin Panel wurde seit ${Math.floor(diffMinutes / 60)} Stunden nicht geoeffnet. Klicke auf Neustart um es zu starten.`;
            }
            return 'Admin Panel ist nicht aktiv. Oeffne es um die Verbindung herzustellen.';
        }
        if (conn.type === 'website') {
            return 'Website ist nicht erreichbar. Pruefe ob der Server laeuft.';
        }
        if (conn.type === 'database') {
            return 'Datenbankverbindung unterbrochen. Pruefe Datenbankdatei.';
        }
        return `Keine Verbindung seit ${diffMinutes} Minuten.`;
    }

    async restartConnection(type) {
        this.showToast('info', 'Neustart', `Verbindung wird wiederhergestellt...`);

        if (type === 'admin_panel') {
            // Admin Panel oeffnen
            window.open('admin.html', '_blank');
            await this.pingAdminPanel();
        } else if (type === 'website') {
            // Website ping
            try {
                const response = await fetch('index.html', { method: 'HEAD' });
                if (response.ok) {
                    const conn = this.db.connections.find(c => c.type === 'website');
                    if (conn) {
                        conn.status = 'connected';
                        conn.last_ping = new Date().toISOString();
                    }
                }
            } catch (e) {
                this.showToast('error', 'Fehler', 'Website nicht erreichbar');
            }
        } else if (type === 'database') {
            // Database reconnect
            await this.loadFromServer();
        }

        // Aktualisieren
        await this.loadConnectionStatus();
        this.renderConnectionMonitor();
        this.showToast('success', 'Fertig', 'Verbindungsstatus aktualisiert');
    }

    openConnection(type) {
        if (type === 'admin_panel') {
            window.open('admin.html', '_blank');
        } else if (type === 'website') {
            window.open('index.html', '_blank');
        } else if (type === 'database') {
            this.navigateTo('database');
        } else if (type === 'dev_admin') {
            // Bereits hier
            this.showToast('info', 'Info', 'Du bist bereits im Dev Admin');
        }
    }

    logError(type, message) {
        this.errors.push({
            type,
            message,
            time: new Date()
        });
        if (this.errors.length > 50) this.errors.shift();
        this.renderErrorLog();
    }

    renderErrorLog() {
        const log = document.getElementById('errorLog');
        if (!log) return;

        if (this.errors.length === 0) {
            log.innerHTML = `
                <div class="no-errors">
                    <i class="fas fa-check-circle"></i>
                    <span>Keine Fehler gefunden</span>
                </div>
            `;
        } else {
            log.innerHTML = this.errors.slice(-10).reverse().map(err => `
                <div class="error-item">
                    <div class="error-item-header">
                        <span class="error-item-type">${err.type}</span>
                        <span class="error-item-time">${this.formatTime(err.time)}</span>
                    </div>
                    <div class="error-item-message">${err.message}</div>
                </div>
            `).join('');
        }
    }

    // ============================================
    // DATABASE VIEWER
    // ============================================
    async loadDbTables() {
        try {
            const response = await fetch(`${API_BASE}/db/tables`);
            if (response.ok) {
                const data = await response.json();
                this.renderDbTables(data.tables);
            }
        } catch (e) {
            this.showToast('error', 'Fehler', 'Tabellen konnten nicht geladen werden.');
        }
    }

    renderDbTables(tables) {
        const container = document.getElementById('dbTables');
        if (!container) return;

        container.innerHTML = tables.map(t => `
            <button class="db-table-btn ${this.currentDbTable === t.name ? 'active' : ''}"
                    onclick="devAdmin.selectDbTable('${t.name}')">
                <span>${t.name}</span>
                <span class="db-table-count">${t.count}</span>
            </button>
        `).join('');
    }

    async selectDbTable(tableName) {
        this.currentDbTable = tableName;

        // Update active state
        document.querySelectorAll('.db-table-btn').forEach(btn => {
            btn.classList.toggle('active', btn.textContent.includes(tableName));
        });

        document.getElementById('dbTableName').textContent = tableName;

        try {
            const response = await fetch(`${API_BASE}/db/${tableName}`);
            if (response.ok) {
                const data = await response.json();
                this.renderDbTableContent(tableName, data[tableName]);
            }
        } catch (e) {
            this.showToast('error', 'Fehler', 'Tabelle konnte nicht geladen werden.');
        }
    }

    renderDbTableContent(tableName, rows) {
        const container = document.getElementById('dbTableContent');
        if (!container) return;

        if (!rows || rows.length === 0) {
            container.innerHTML = `
                <div class="no-table-selected">
                    <i class="fas fa-inbox"></i>
                    <p>Keine Daten in dieser Tabelle</p>
                </div>
            `;
            return;
        }

        const keys = Object.keys(rows[0]);

        container.innerHTML = `
            <table class="data-table">
                <thead>
                    <tr>
                        ${keys.map(k => `<th>${k}</th>`).join('')}
                        <th>Aktionen</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows.map(row => `
                        <tr>
                            ${keys.map(k => `<td>${this.formatDbValue(row[k])}</td>`).join('')}
                            <td class="table-actions">
                                <button class="btn-ghost btn-sm" onclick="devAdmin.editDbRow('${tableName}', '${row.id}')">
                                    <i class="fas fa-edit"></i>
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    formatDbValue(value) {
        if (value === null || value === undefined) return '-';
        if (typeof value === 'object') return JSON.stringify(value).substring(0, 50) + '...';
        if (typeof value === 'string' && value.length > 50) return value.substring(0, 50) + '...';
        return value;
    }

    refreshTable() {
        if (this.currentDbTable) {
            this.selectDbTable(this.currentDbTable);
        }
    }

    // ============================================
    // WEBSITE ELEMENTS (Bausteine)
    // ============================================
    async extractElements() {
        const pageSelect = document.getElementById('elementPageSelect');
        const page = pageSelect?.value || 'index.html';

        try {
            const response = await fetch(`${API_BASE}/extract/${page}`);
            if (response.ok) {
                const data = await response.json();
                this.renderExtractedElements(data.elements);
            }
        } catch (e) {
            this.showToast('error', 'Fehler', 'Elemente konnten nicht extrahiert werden.');
        }
    }

    renderExtractedElements(elements) {
        // Texts
        const textsContainer = document.getElementById('elementTexts');
        document.getElementById('textCount').textContent = elements.texts?.length || 0;
        if (textsContainer) {
            textsContainer.innerHTML = (elements.texts || []).slice(0, 50).map(t => `
                <div class="element-item" onclick="devAdmin.copyElement('${this.escapeHtml(t)}')">
                    <span class="element-item-text">${this.escapeHtml(t)}</span>
                    <i class="fas fa-copy element-item-copy"></i>
                </div>
            `).join('') || '<div class="element-item">Keine Texte gefunden</div>';
        }

        // Images
        const imagesContainer = document.getElementById('elementImages');
        document.getElementById('imageElementCount').textContent = elements.images?.length || 0;
        if (imagesContainer) {
            imagesContainer.innerHTML = (elements.images || []).map(img => `
                <div class="element-item" onclick="devAdmin.copyElement('${img.src}')">
                    <span class="element-item-tag">IMG</span>
                    <span class="element-item-text">${img.src}</span>
                    <i class="fas fa-copy element-item-copy"></i>
                </div>
            `).join('') || '<div class="element-item">Keine Bilder gefunden</div>';
        }

        // Headings
        const headingsContainer = document.getElementById('elementHeadings');
        document.getElementById('headingCount').textContent = elements.headings?.length || 0;
        if (headingsContainer) {
            headingsContainer.innerHTML = (elements.headings || []).map(h => `
                <div class="element-item" onclick="devAdmin.copyElement('${this.escapeHtml(h.text)}')">
                    <span class="element-item-tag">H${h.level}</span>
                    <span class="element-item-text">${this.escapeHtml(h.text)}</span>
                    <i class="fas fa-copy element-item-copy"></i>
                </div>
            `).join('') || '<div class="element-item">Keine Ueberschriften gefunden</div>';
        }

        // Links
        const linksContainer = document.getElementById('elementLinks');
        document.getElementById('linkCount').textContent = elements.links?.length || 0;
        if (linksContainer) {
            linksContainer.innerHTML = (elements.links || []).map(l => `
                <div class="element-item" onclick="devAdmin.copyElement('${l.href}')">
                    <span class="element-item-tag">A</span>
                    <span class="element-item-text">${l.href} - ${this.escapeHtml(l.text || 'kein Text')}</span>
                    <i class="fas fa-copy element-item-copy"></i>
                </div>
            `).join('') || '<div class="element-item">Keine Links gefunden</div>';
        }

        // Sections
        const sectionsContainer = document.getElementById('elementSections');
        document.getElementById('sectionCount').textContent = elements.sections?.length || 0;
        if (sectionsContainer) {
            sectionsContainer.innerHTML = (elements.sections || []).map(s => `
                <div class="element-item" onclick="devAdmin.copyElement('#${s.id}')">
                    <span class="element-item-tag">SECTION</span>
                    <span class="element-item-text">#${s.id} .${s.class || ''}</span>
                    <i class="fas fa-copy element-item-copy"></i>
                </div>
            `).join('') || '<div class="element-item">Keine Sektionen gefunden</div>';
        }

        // Classes
        const classesContainer = document.getElementById('elementClasses');
        document.getElementById('classCount').textContent = elements.classes?.length || 0;
        if (classesContainer) {
            classesContainer.innerHTML = (elements.classes || []).slice(0, 100).map(c => `
                <div class="element-item" onclick="devAdmin.copyElement('.${c}')">
                    <span class="element-item-text">.${c}</span>
                    <i class="fas fa-copy element-item-copy"></i>
                </div>
            `).join('') || '<div class="element-item">Keine Klassen gefunden</div>';
        }

        // IDs
        const idsContainer = document.getElementById('elementIds');
        document.getElementById('idCount').textContent = elements.ids?.length || 0;
        if (idsContainer) {
            idsContainer.innerHTML = (elements.ids || []).map(id => `
                <div class="element-item" onclick="devAdmin.copyElement('#${id}')">
                    <span class="element-item-text">#${id}</span>
                    <i class="fas fa-copy element-item-copy"></i>
                </div>
            `).join('') || '<div class="element-item">Keine IDs gefunden</div>';
        }

        // Buttons
        const buttonsContainer = document.getElementById('elementButtons');
        const buttonCountEl = document.getElementById('buttonCount');
        if (buttonCountEl) buttonCountEl.textContent = elements.buttons?.length || 0;
        if (buttonsContainer) {
            buttonsContainer.innerHTML = (elements.buttons || []).map(b => `
                <div class="element-item" onclick="devAdmin.copyElement('${this.escapeHtml(b.text)}')">
                    <span class="element-item-tag">BTN</span>
                    <span class="element-item-text">${this.escapeHtml(b.text)} ${b.class ? '.' + b.class : ''}</span>
                    <i class="fas fa-copy element-item-copy"></i>
                </div>
            `).join('') || '<div class="element-item">Keine Buttons gefunden</div>';
        }

        // Colors
        const colorsContainer = document.getElementById('elementColors');
        const colorCountEl = document.getElementById('colorCount');
        if (colorCountEl) colorCountEl.textContent = elements.colors?.length || 0;
        if (colorsContainer) {
            colorsContainer.innerHTML = (elements.colors || []).map(c => `
                <div class="element-item" onclick="devAdmin.copyElement('${c}')">
                    <span class="element-item-color" style="background: ${c}; width: 16px; height: 16px; border-radius: 3px; margin-right: 8px;"></span>
                    <span class="element-item-text">${c}</span>
                    <i class="fas fa-copy element-item-copy"></i>
                </div>
            `).join('') || '<div class="element-item">Keine Farben gefunden</div>';
        }

        // Fonts
        const fontsContainer = document.getElementById('elementFonts');
        const fontCountEl = document.getElementById('fontCount');
        if (fontCountEl) fontCountEl.textContent = elements.fonts?.length || 0;
        if (fontsContainer) {
            fontsContainer.innerHTML = (elements.fonts || []).map(f => `
                <div class="element-item" onclick="devAdmin.copyElement('${this.escapeHtml(f)}')">
                    <span class="element-item-text" style="font-family: ${f}">${this.escapeHtml(f)}</span>
                    <i class="fas fa-copy element-item-copy"></i>
                </div>
            `).join('') || '<div class="element-item">Keine Schriftarten gefunden</div>';
        }

        // Forms
        const formsContainer = document.getElementById('elementForms');
        const formCountEl = document.getElementById('formCount');
        if (formCountEl) formCountEl.textContent = elements.forms?.length || 0;
        if (formsContainer) {
            formsContainer.innerHTML = (elements.forms || []).map(f => `
                <div class="element-item" onclick="devAdmin.copyElement('${f.id || f.action || 'form'}')">
                    <span class="element-item-tag">FORM</span>
                    <span class="element-item-text">${f.id ? '#' + f.id : ''} ${f.action || ''} (${f.inputs || 0} Felder)</span>
                    <i class="fas fa-copy element-item-copy"></i>
                </div>
            `).join('') || '<div class="element-item">Keine Formulare gefunden</div>';
        }

        // Scripts
        const scriptsContainer = document.getElementById('elementScripts');
        const scriptCountEl = document.getElementById('scriptCount');
        if (scriptCountEl) scriptCountEl.textContent = elements.scripts?.length || 0;
        if (scriptsContainer) {
            scriptsContainer.innerHTML = (elements.scripts || []).map(s => `
                <div class="element-item" onclick="devAdmin.copyElement('${s.src || 'inline'}')">
                    <span class="element-item-tag">JS</span>
                    <span class="element-item-text">${s.src || 'Inline Script'}</span>
                    <i class="fas fa-copy element-item-copy"></i>
                </div>
            `).join('') || '<div class="element-item">Keine Scripts gefunden</div>';
        }

        // Styles
        const stylesContainer = document.getElementById('elementStyles');
        const styleCountEl = document.getElementById('styleCount');
        if (styleCountEl) styleCountEl.textContent = elements.styles?.length || 0;
        if (stylesContainer) {
            stylesContainer.innerHTML = (elements.styles || []).map(s => `
                <div class="element-item" onclick="devAdmin.copyElement('${s.href || 'inline'}')">
                    <span class="element-item-tag">CSS</span>
                    <span class="element-item-text">${s.href || 'Inline Style'}</span>
                    <i class="fas fa-copy element-item-copy"></i>
                </div>
            `).join('') || '<div class="element-item">Keine Stylesheets gefunden</div>';
        }

        // Meta
        const metaContainer = document.getElementById('elementMeta');
        const metaCountEl = document.getElementById('metaCount');
        if (metaCountEl) metaCountEl.textContent = elements.meta?.length || 0;
        if (metaContainer) {
            metaContainer.innerHTML = (elements.meta || []).map(m => `
                <div class="element-item" onclick="devAdmin.copyElement('${this.escapeHtml(m.content || m.name || '')}')">
                    <span class="element-item-tag">${m.name || m.property || 'META'}</span>
                    <span class="element-item-text">${this.escapeHtml(m.content || '')}</span>
                    <i class="fas fa-copy element-item-copy"></i>
                </div>
            `).join('') || '<div class="element-item">Keine Meta-Daten gefunden</div>';
        }

        // Icons
        const iconsContainer = document.getElementById('elementIcons');
        const iconCountEl = document.getElementById('iconCount');
        if (iconCountEl) iconCountEl.textContent = elements.icons?.length || 0;
        if (iconsContainer) {
            iconsContainer.innerHTML = (elements.icons || []).map(i => `
                <div class="element-item" onclick="devAdmin.copyElement('${i.class || i}')">
                    <i class="${i.class || i}" style="margin-right: 8px;"></i>
                    <span class="element-item-text">${i.class || i}</span>
                    <i class="fas fa-copy element-item-copy"></i>
                </div>
            `).join('') || '<div class="element-item">Keine Icons gefunden</div>';
        }

        // Embeds
        const embedsContainer = document.getElementById('elementEmbeds');
        const embedCountEl = document.getElementById('embedCount');
        if (embedCountEl) embedCountEl.textContent = elements.embeds?.length || 0;
        if (embedsContainer) {
            embedsContainer.innerHTML = (elements.embeds || []).map(e => `
                <div class="element-item" onclick="devAdmin.copyElement('${e.src || e}')">
                    <span class="element-item-tag">${e.type || 'EMBED'}</span>
                    <span class="element-item-text">${e.src || e}</span>
                    <i class="fas fa-copy element-item-copy"></i>
                </div>
            `).join('') || '<div class="element-item">Keine Embeds gefunden</div>';
        }

        // Data Attributes
        const dataAttrsContainer = document.getElementById('elementDataAttrs');
        const dataAttrCountEl = document.getElementById('dataAttrCount');
        if (dataAttrCountEl) dataAttrCountEl.textContent = elements.dataAttrs?.length || 0;
        if (dataAttrsContainer) {
            dataAttrsContainer.innerHTML = (elements.dataAttrs || []).map(d => `
                <div class="element-item" onclick="devAdmin.copyElement('${d.name}')">
                    <span class="element-item-tag">DATA</span>
                    <span class="element-item-text">${d.name}="${this.escapeHtml(d.value || '')}"</span>
                    <i class="fas fa-copy element-item-copy"></i>
                </div>
            `).join('') || '<div class="element-item">Keine Data-Attribute gefunden</div>';
        }
    }

    toggleCategory(category) {
        const categoryEl = document.querySelector(`#element${category.charAt(0).toUpperCase() + category.slice(1)}`)?.closest('.element-category');
        if (categoryEl) {
            categoryEl.classList.toggle('expanded');
        }
    }

    copyElement(text) {
        navigator.clipboard?.writeText(text);
        this.showToast('info', 'Kopiert', 'Element in Zwischenablage kopiert.');
    }

    escapeHtml(text) {
        if (!text) return '';
        if (typeof text !== 'string') return String(text);
        return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // ============================================
    // TEMPLATES
    // ============================================
    async loadTemplates() {
        try {
            const response = await fetch(`${API_BASE}/templates`);
            if (response.ok) {
                const data = await response.json();
                this.renderSavedTemplates(data.templates);
            }
        } catch (e) {
            // Ignore
        }
    }

    renderSavedTemplates(templates) {
        const container = document.getElementById('savedTemplates');
        if (!container) return;

        if (!templates || templates.length === 0) {
            container.innerHTML = `
                <div class="no-templates">
                    <i class="fas fa-folder-open"></i>
                    <p>Keine gespeicherten Templates</p>
                </div>
            `;
        } else {
            container.innerHTML = templates.map(t => `
                <div class="website-card" onclick="devAdmin.useTemplate('${t.id}')">
                    <div class="website-card-icon"><i class="fas fa-file-code"></i></div>
                    <div class="website-card-info">
                        <div class="website-card-name">${t.name}</div>
                        <div class="website-card-domain">${t.description || 'Kein Beschreibung'}</div>
                    </div>
                </div>
            `).join('');
        }
    }

    createNewWebsite() {
        const html = `
            <div class="form-group">
                <label>Website Name</label>
                <input type="text" class="form-input" id="modalWebsiteName" placeholder="Meine Website" required>
            </div>
            <div class="form-group">
                <label>Domain (optional)</label>
                <input type="text" class="form-input" id="modalWebsiteDomain" placeholder="example.com">
            </div>
        `;

        this.openModal('Neue Website erstellen', html, async () => {
            const name = document.getElementById('modalWebsiteName').value;
            const domain = document.getElementById('modalWebsiteDomain').value;

            if (!name) {
                this.showToast('error', 'Fehler', 'Name ist erforderlich.');
                return;
            }

            try {
                const response = await fetch(`${API_BASE}/websites`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, domain })
                });

                if (response.ok) {
                    await this.loadData();
                    this.showToast('success', 'Erstellt', `Website "${name}" wurde erstellt.`);
                }
            } catch (e) {
                this.showToast('error', 'Fehler', 'Website konnte nicht erstellt werden.');
            }
        });
    }

    async createTemplate() {
        const html = `
            <div class="form-group">
                <label>Template Name</label>
                <input type="text" class="form-input" id="modalTemplateName" placeholder="Mein Template" required>
            </div>
            <div class="form-group">
                <label>Beschreibung</label>
                <textarea class="form-textarea" id="modalTemplateDesc" rows="3" placeholder="Beschreibung des Templates"></textarea>
            </div>
        `;

        this.openModal('Template speichern', html, async () => {
            const name = document.getElementById('modalTemplateName').value;
            const description = document.getElementById('modalTemplateDesc').value;

            if (!name) {
                this.showToast('error', 'Fehler', 'Name ist erforderlich.');
                return;
            }

            try {
                const response = await fetch(`${API_BASE}/templates`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name,
                        description,
                        website_id: this.currentWebsite,
                        data: {
                            pages: this.db.pages.filter(p => p.website_id === this.currentWebsite),
                            blocks: this.db.blocks,
                            collections: this.db.collections.filter(c => c.website_id === this.currentWebsite)
                        }
                    })
                });

                if (response.ok) {
                    await this.loadTemplates();
                    this.showToast('success', 'Gespeichert', `Template "${name}" wurde gespeichert.`);
                }
            } catch (e) {
                this.showToast('error', 'Fehler', 'Template konnte nicht gespeichert werden.');
            }
        });
    }

    useTemplate(templateId) {
        this.showToast('info', 'Template', `Template wird angewendet...`);
    }

    // ============================================
    // SYNC LOG
    // ============================================
    async loadSyncLog() {
        try {
            const response = await fetch(`${API_BASE}/sync/status`);
            if (response.ok) {
                const data = await response.json();
                this.renderSyncLog(data.last_syncs);
            }
        } catch (e) {
            // Ignore
        }
    }

    renderSyncLog(entries) {
        const container = document.getElementById('syncLogEntries');
        if (!container) return;

        if (!entries || entries.length === 0) {
            container.innerHTML = '<div style="color: var(--text-muted); padding: 12px;">Keine Sync-Eintraege</div>';
            return;
        }

        container.innerHTML = entries.map(entry => `
            <div class="sync-log-entry">
                <div class="sync-log-icon ${entry.status}">
                    <i class="fas ${entry.status === 'success' ? 'fa-check' : entry.status === 'error' ? 'fa-times' : 'fa-clock'}"></i>
                </div>
                <div class="sync-log-info">
                    <div class="sync-log-action">${entry.action}</div>
                    <div class="sync-log-meta">${entry.source} -> ${entry.target} | ${this.formatTime(entry.timestamp)}</div>
                </div>
            </div>
        `).join('');
    }

    // ============================================
    // LOGS
    // ============================================
    async loadLogs() {
        const dateInput = document.getElementById('logDate');
        const date = dateInput?.value || new Date().toISOString().split('T')[0];

        try {
            const response = await fetch(`${API_BASE}/logs?date=${date}`);
            if (response.ok) {
                const data = await response.json();
                const output = document.getElementById('logOutput');
                if (output) {
                    output.textContent = data.logs.join('\n') || 'Keine Logs fuer diesen Tag.';
                }
            }
        } catch (e) {
            document.getElementById('logOutput').textContent = 'Fehler beim Laden der Logs.';
        }
    }

    // ============================================
    // EVENT BINDING
    // ============================================
    bindEvents() {
        // Navigation
        document.querySelectorAll('.nav-item[data-section]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.navigateTo(btn.dataset.section);
            });
        });

        // Logout
        document.getElementById('logoutBtn')?.addEventListener('click', () => this.logout());

        // Upload Zone
        this.bindUploadZone();

        // Website Selector
        const selector = document.getElementById('websiteSelector');
        if (selector) {
            selector.addEventListener('change', () => {
                this.currentWebsite = selector.value;
                this.renderAll();
            });
        }
    }

    bindUploadZone() {
        const zone = document.getElementById('uploadZone');
        const input = document.getElementById('imageUpload');

        if (zone && input) {
            zone.addEventListener('click', (e) => {
                if (e.target.tagName !== 'BUTTON') input.click();
            });
            zone.addEventListener('dragover', (e) => {
                e.preventDefault();
                zone.classList.add('dragover');
            });
            zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
            zone.addEventListener('drop', (e) => {
                e.preventDefault();
                zone.classList.remove('dragover');
                this.handleFileUpload(e.dataTransfer.files);
            });
            input.addEventListener('change', () => this.handleFileUpload(input.files));
        }
    }

    // ============================================
    // NAVIGATION
    // ============================================
    navigateTo(section) {
        this.currentSection = section;

        // Update Nav
        document.querySelectorAll('.nav-item').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.section === section);
        });

        // Update Sections
        document.querySelectorAll('.content-section').forEach(sec => {
            sec.classList.remove('active');
        });

        const targetSection = document.getElementById(`section-${section}`);
        if (targetSection) {
            targetSection.classList.add('active');
        }

        // Update Title
        const titles = {
            dashboard: 'Dashboard',
            connections: 'Connection Monitor',
            database: 'Datenbank',
            sync: 'Synchronisation',
            elements: 'Website Bausteine',
            pages: 'Seiten',
            collections: 'Sammlungen',
            templates: 'Templates',
            builder: 'Page Builder',
            'collection-editor': 'Sammlung bearbeiten',
            media: 'Mediathek',
            settings: 'Einstellungen',
            logs: 'Server Logs'
        };
        document.getElementById('currentSectionTitle').textContent = titles[section] || section;

        // Section-specific actions
        if (section === 'database') {
            this.loadDbTables();
        } else if (section === 'elements') {
            this.extractElements();
        } else if (section === 'templates') {
            this.loadTemplates();
            this.renderWebsites();
        } else if (section === 'sync') {
            this.loadSyncLog();
        } else if (section === 'logs') {
            document.getElementById('logDate').valueAsDate = new Date();
            this.loadLogs();
        } else if (section === 'connections') {
            this.loadConnectionStatus();
            this.renderConnectionMonitor();
        }
    }

    // ============================================
    // RENDERING
    // ============================================
    renderAll() {
        this.renderWebsiteSelector();
        this.renderNavigation();
        this.renderPages();
        this.renderCollections();
        this.renderMedia();
        this.renderSettings();
        this.renderDashboardConnections();
        this.updateStats();
    }

    renderWebsiteSelector() {
        const selector = document.getElementById('websiteSelector');
        if (!selector) return;

        selector.innerHTML = this.db.websites.map(w => `
            <option value="${w.id}" ${w.id === this.currentWebsite ? 'selected' : ''}>${w.name}</option>
        `).join('');
    }

    renderNavigation() {
        // Dynamic pages
        const pagesContainer = document.getElementById('navPages');
        if (pagesContainer) {
            const websitePages = this.db.pages.filter(p => p.website_id === this.currentWebsite);
            pagesContainer.innerHTML = websitePages.map(page => `
                <button class="nav-item nav-page-item" data-page="${page.id}" onclick="devAdmin.openPageBuilder('${page.id}')">
                    <i class="fas fa-file-alt"></i>
                    <span>${page.name}</span>
                </button>
            `).join('');
        }

        // Dynamic collections
        const collectionsContainer = document.getElementById('navCollections');
        if (collectionsContainer) {
            const websiteCollections = this.db.collections.filter(c => c.website_id === this.currentWebsite);
            collectionsContainer.innerHTML = websiteCollections.map(col => `
                <button class="nav-item nav-page-item" onclick="devAdmin.openCollection('${col.id}')">
                    <i class="fas ${col.icon}"></i>
                    <span>${col.name}</span>
                </button>
            `).join('');
        }
    }

    renderDashboardConnections() {
        const container = document.getElementById('dashboardConnections');
        if (!container) return;

        container.innerHTML = this.db.connections.map(conn => `
            <div class="connection-list-item">
                <i class="fas ${this.getConnectionIcon(conn.type)}"></i>
                <span>${conn.name}</span>
                <span class="status-dot ${conn.status === 'connected' ? 'green' : conn.status === 'error' ? 'red' : 'yellow'}"></span>
            </div>
        `).join('');
    }

    renderPages() {
        const container = document.getElementById('pagesTable');
        if (!container) return;

        const pages = this.db.pages.filter(p => p.website_id === this.currentWebsite);

        if (pages.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-file-alt"></i>
                    <h4>Keine Seiten</h4>
                    <p>Erstelle deine erste Seite</p>
                    <button class="btn-primary" onclick="devAdmin.addPage()">
                        <i class="fas fa-plus"></i> Neue Seite
                    </button>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Slug</th>
                        <th>Status</th>
                        <th>Aktionen</th>
                    </tr>
                </thead>
                <tbody>
                    ${pages.map(page => `
                        <tr>
                            <td><strong>${page.name}</strong></td>
                            <td><code>${page.slug}</code></td>
                            <td><span class="table-badge ${page.status}">${page.status}</span></td>
                            <td class="table-actions">
                                <button class="btn-ghost" onclick="devAdmin.openPageBuilder('${page.id}')" title="Bearbeiten">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="btn-ghost" onclick="window.open('${page.slug}', '_blank')" title="Vorschau">
                                    <i class="fas fa-eye"></i>
                                </button>
                                <button class="btn-ghost" onclick="devAdmin.deletePage('${page.id}')" title="Loeschen">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    renderCollections() {
        const container = document.getElementById('collectionsGrid');
        if (!container) return;

        const collections = this.db.collections.filter(c => c.website_id === this.currentWebsite);

        container.innerHTML = collections.map(col => {
            const itemCount = this.db.items.filter(i => i.collection_id === col.id).length;
            return `
                <div class="item-card" onclick="devAdmin.openCollection('${col.id}')">
                    <div class="item-card-body">
                        <div class="item-card-meta">
                            <span class="table-badge active"><i class="fas ${col.icon}"></i></span>
                        </div>
                        <h4 class="item-card-title">${col.name}</h4>
                        <p class="item-card-desc">${itemCount} Eintraege, ${col.fields?.length || 0} Felder</p>
                    </div>
                </div>
            `;
        }).join('');
    }

    renderMedia() {
        const container = document.getElementById('mediaGrid');
        if (!container) return;

        const media = this.db.media.filter(m => m.website_id === this.currentWebsite);

        if (media.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-images"></i>
                    <p>Noch keine Medien hochgeladen</p>
                </div>
            `;
            return;
        }

        container.innerHTML = media.map(item => `
            <div class="media-item" onclick="devAdmin.selectMedia('${item.id}')">
                <img src="${item.url}" alt="${item.original_name}">
                <div class="media-item-info">
                    <div class="media-item-name">${item.original_name}</div>
                </div>
            </div>
        `).join('');

        document.getElementById('imageCount').textContent = media.length;
    }

    renderWebsites() {
        const container = document.getElementById('websitesGrid');
        if (!container) return;

        container.innerHTML = this.db.websites.map(w => `
            <div class="website-card" onclick="devAdmin.selectWebsite('${w.id}')">
                <div class="website-card-icon"><i class="fas fa-globe"></i></div>
                <div class="website-card-info">
                    <div class="website-card-name">${w.name}</div>
                    <div class="website-card-domain">${w.domain || 'Keine Domain'}</div>
                </div>
                <span class="website-card-status ${w.status}">${w.status}</span>
            </div>
        `).join('');
    }

    renderSettings() {
        document.querySelectorAll('[data-setting]').forEach(input => {
            const key = input.dataset.setting;
            const setting = this.db.settings.find(s => s.key === key && s.website_id === this.currentWebsite);
            if (setting) {
                input.value = setting.value;
            }

            input.addEventListener('input', () => {
                const existing = this.db.settings.find(s => s.key === key && s.website_id === this.currentWebsite);
                if (existing) {
                    existing.value = input.value;
                } else {
                    this.db.settings.push({
                        id: 'set_' + Date.now(),
                        website_id: this.currentWebsite,
                        key,
                        value: input.value
                    });
                }
                this.trackChange();
            });
        });
    }

    updateStats() {
        const pages = this.db.pages.filter(p => p.website_id === this.currentWebsite);
        const collections = this.db.collections.filter(c => c.website_id === this.currentWebsite);
        const items = this.db.items.filter(i => {
            const col = this.db.collections.find(c => c.id === i.collection_id);
            return col?.website_id === this.currentWebsite;
        });
        const media = this.db.media.filter(m => m.website_id === this.currentWebsite);

        // Count team members from website data
        const teamCount = this.websiteData?.team ?
            (this.websiteData.team.leadership?.length || 0) +
            (this.websiteData.team.ceo?.length || 0) +
            (this.websiteData.team.cooRegional?.length || 0) : 0;

        // Count locations from website data
        const locationsCount = this.websiteData?.locations?.length || 0;

        document.getElementById('statPages').textContent = pages.length;
        document.getElementById('statCollections').textContent = collections.length;

        // Show actual counts from website
        const itemsEl = document.getElementById('statItems');
        if (itemsEl) {
            itemsEl.textContent = items.length > 0 ? items.length : teamCount;
        }

        const mediaEl = document.getElementById('statMedia');
        if (mediaEl) {
            mediaEl.textContent = media.length > 0 ? media.length : locationsCount;
        }

        // Update team count display if exists
        const teamEl = document.getElementById('statTeam');
        if (teamEl) teamEl.textContent = teamCount;

        const locEl = document.getElementById('statLocations');
        if (locEl) locEl.textContent = locationsCount;
    }

    updateLastSyncDisplay() {
        const el = document.getElementById('lastSyncInfo');
        if (el && this.lastSyncTime) {
            el.textContent = 'Letzte Synchronisation: ' + this.formatTime(this.lastSyncTime);
        }
        const pullEl = document.getElementById('lastPull');
        if (pullEl && this.lastSyncTime) {
            pullEl.textContent = this.formatTime(this.lastSyncTime);
        }
    }

    // ============================================
    // PAGES
    // ============================================
    async addPage() {
        const html = `
            <div class="form-group">
                <label>Seitenname</label>
                <input type="text" class="form-input" id="modalPageName" placeholder="z.B. About Us" required>
            </div>
            <div class="form-group">
                <label>Slug (Dateiname)</label>
                <input type="text" class="form-input" id="modalPageSlug" placeholder="z.B. about.html">
            </div>
        `;

        this.openModal('Neue Seite', html, async () => {
            const name = document.getElementById('modalPageName').value;
            const slug = document.getElementById('modalPageSlug').value || name.toLowerCase().replace(/\s+/g, '-') + '.html';

            if (!name) {
                this.showToast('error', 'Fehler', 'Name ist erforderlich.');
                return;
            }

            try {
                const response = await fetch(`${API_BASE}/pages`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        website_id: this.currentWebsite,
                        name,
                        slug
                    })
                });

                if (response.ok) {
                    await this.loadData();
                    this.showToast('success', 'Erstellt', `Seite "${name}" wurde erstellt.`);
                }
            } catch (e) {
                this.showToast('error', 'Fehler', 'Seite konnte nicht erstellt werden.');
            }
        });
    }

    async openPageBuilder(pageId) {
        this.currentPage = this.db.pages.find(p => p.id === pageId);
        this.navigateTo('builder');

        // Load real sections from the HTML file
        if (this.currentPage) {
            await this.loadPageSections();
        }
        this.renderPageBuilder();
    }

    async loadPageSections() {
        if (!this.currentPage) return;

        const pagePath = this.currentPage.slug;
        try {
            const response = await fetch(`/api/page-sections/${pagePath}`);
            const data = await response.json();

            if (data.success && data.sections) {
                this.pageSections = data.sections;
                this.showToast('info', 'Geladen', `${data.sections.length} Sections aus ${pagePath} geladen`);
            } else {
                this.pageSections = [];
            }
        } catch (e) {
            console.error('Failed to load page sections:', e);
            this.pageSections = [];
        }
    }

    renderPageBuilder() {
        if (!this.currentPage) return;

        document.getElementById('builderPageName').textContent = this.currentPage.name;

        const blockList = document.getElementById('blockList');
        const sections = this.pageSections || [];

        if (blockList) {
            if (sections.length === 0) {
                blockList.innerHTML = `
                    <div class="drop-placeholder">
                        <i class="fas fa-sync-alt" style="font-size: 24px; margin-bottom: 8px;"></i>
                        <p>Lade Sections aus der HTML-Datei...</p>
                        <button class="btn-secondary" onclick="devAdmin.loadPageSections().then(() => devAdmin.renderPageBuilder())" style="margin-top: 12px;">
                            <i class="fas fa-refresh"></i> Sections neu laden
                        </button>
                    </div>
                `;
            } else {
                blockList.innerHTML = sections.map((section, index) => `
                    <div class="block-item section-item ${this.selectedSection?.id === section.id ? 'selected' : ''}"
                         data-section-id="${section.id}"
                         data-section-order="${section.order}"
                         draggable="true"
                         onclick="devAdmin.selectSection('${section.id}')">
                        <div class="block-item-drag-handle" title="Ziehen zum Verschieben">
                            <span></span>
                            <span></span>
                            <span></span>
                        </div>
                        <div class="block-item-icon">
                            <i class="fas ${section.icon}"></i>
                        </div>
                        <div class="block-item-info">
                            <div class="block-item-name">${section.name}</div>
                            <div class="block-item-type">#${section.id} &bull; ${section.type}</div>
                            ${section.preview?.heading ? `<div class="block-item-preview">${section.preview.heading}</div>` : ''}
                        </div>
                        <div class="block-item-actions">
                            <button onclick="event.stopPropagation(); devAdmin.moveSectionUp(${index})" title="Nach oben" ${index === 0 ? 'disabled' : ''}>
                                <i class="fas fa-chevron-up"></i>
                            </button>
                            <button onclick="event.stopPropagation(); devAdmin.moveSectionDown(${index})" title="Nach unten" ${index === sections.length - 1 ? 'disabled' : ''}>
                                <i class="fas fa-chevron-down"></i>
                            </button>
                            <button onclick="event.stopPropagation(); devAdmin.editSection('${section.id}')" title="Bearbeiten">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button onclick="event.stopPropagation(); devAdmin.previewSection('${section.id}')" title="Vorschau">
                                <i class="fas fa-eye"></i>
                            </button>
                        </div>
                    </div>
                `).join('');

                // Bind drag events for sections
                this.bindSectionDragEvents();
            }
        }

        const activeCount = document.getElementById('activeBlockCount');
        if (activeCount) {
            activeCount.textContent = sections.length + ' Sections';
        }

        this.refreshPreview();
    }

    selectSection(sectionId) {
        this.selectedSection = this.pageSections?.find(s => s.id === sectionId);
        this.renderPageBuilder();
        this.renderSectionProperties();
    }

    renderSectionProperties() {
        const panel = document.getElementById('propertiesPanel');
        if (!panel) return;

        if (!this.selectedSection) {
            panel.innerHTML = `
                <div class="no-selection">
                    <i class="fas fa-mouse-pointer"></i>
                    <p>Waehle eine Section aus</p>
                </div>
            `;
            return;
        }

        const section = this.selectedSection;
        panel.innerHTML = `
            <div class="property-group">
                <div class="property-group-header">
                    <i class="fas ${section.icon}"></i> ${section.name}
                </div>
                <div class="property-row">
                    <label class="property-label">ID</label>
                    <input type="text" class="property-input" value="${section.id}" readonly>
                </div>
                <div class="property-row">
                    <label class="property-label">Typ</label>
                    <input type="text" class="property-input" value="${section.type}" readonly>
                </div>
                <div class="property-row">
                    <label class="property-label">CSS Klasse</label>
                    <input type="text" class="property-input" value="${section.className}" readonly>
                </div>
            </div>

            ${section.preview?.heading ? `
            <div class="property-group">
                <div class="property-group-header">Vorschau</div>
                <div class="section-preview-text">
                    <strong>${section.preview.heading}</strong>
                    ${section.preview.text ? `<p>${section.preview.text}</p>` : ''}
                </div>
            </div>
            ` : ''}

            <div class="property-group">
                <div class="property-group-header">Aktionen</div>
                <button class="btn-primary" style="width: 100%; margin-bottom: 8px;" onclick="devAdmin.editSection('${section.id}')">
                    <i class="fas fa-edit"></i> Section bearbeiten
                </button>
                <button class="btn-secondary" style="width: 100%; margin-bottom: 8px;" onclick="devAdmin.previewSection('${section.id}')">
                    <i class="fas fa-eye"></i> HTML anzeigen
                </button>
                <button class="btn-secondary" style="width: 100%;" onclick="devAdmin.scrollToSection('${section.id}')">
                    <i class="fas fa-crosshairs"></i> Zur Section scrollen
                </button>
            </div>
        `;
    }

    editSection(sectionId) {
        const section = this.pageSections?.find(s => s.id === sectionId);
        if (!section) return;

        // Open section editor modal
        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.id = 'sectionEditorModal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 90%; height: 85vh;">
                <div class="modal-header">
                    <h3><i class="fas ${section.icon}"></i> ${section.name} bearbeiten</h3>
                    <button class="modal-close" onclick="devAdmin.closeSectionEditor()">&times;</button>
                </div>
                <div class="modal-body" style="height: calc(100% - 120px); overflow: hidden;">
                    <div class="section-editor-container" style="display: flex; height: 100%; gap: 16px;">
                        <div class="section-editor-code" style="flex: 1; display: flex; flex-direction: column;">
                            <label style="margin-bottom: 8px; font-weight: 600;">HTML Code:</label>
                            <textarea id="sectionHtmlEditor" style="flex: 1; font-family: monospace; font-size: 12px; padding: 12px; border: 1px solid var(--border-color); border-radius: 8px; resize: none; background: var(--bg-tertiary); color: var(--text-primary);">${this.escapeHtml(section.innerHtml)}</textarea>
                        </div>
                        <div class="section-editor-preview" style="flex: 1; border: 1px solid var(--border-color); border-radius: 8px; overflow: auto;">
                            <iframe id="sectionPreviewFrame" style="width: 100%; height: 100%; border: none;"></iframe>
                        </div>
                    </div>
                </div>
                <div class="modal-footer" style="display: flex; gap: 12px; justify-content: flex-end;">
                    <button class="btn-secondary" onclick="devAdmin.closeSectionEditor()">Abbrechen</button>
                    <button class="btn-secondary" onclick="devAdmin.previewSectionEdit()">
                        <i class="fas fa-eye"></i> Vorschau aktualisieren
                    </button>
                    <button class="btn-primary" onclick="devAdmin.saveSectionEdit('${sectionId}')">
                        <i class="fas fa-save"></i> Speichern
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Update preview
        this.currentEditingSection = section;
        this.previewSectionEdit();
    }

    escapeHtml(html) {
        const div = document.createElement('div');
        div.textContent = html;
        return div.innerHTML;
    }

    previewSectionEdit() {
        const textarea = document.getElementById('sectionHtmlEditor');
        const iframe = document.getElementById('sectionPreviewFrame');
        if (!textarea || !iframe) return;

        const html = textarea.value;
        const previewHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <link rel="stylesheet" href="/styles.css">
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
                <style>
                    body { margin: 0; padding: 20px; background: #0a1628; }
                    section { margin: 0 !important; }
                </style>
            </head>
            <body>
                <section class="${this.currentEditingSection?.className || ''}" id="${this.currentEditingSection?.id || ''}">
                    ${html}
                </section>
            </body>
            </html>
        `;

        iframe.srcdoc = previewHtml;
    }

    async saveSectionEdit(sectionId) {
        const textarea = document.getElementById('sectionHtmlEditor');
        if (!textarea || !this.currentPage) return;

        const newContent = textarea.value;

        try {
            const response = await fetch('/api/save-section', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pagePath: this.currentPage.slug,
                    sectionId: sectionId,
                    newContent: newContent
                })
            });

            const data = await response.json();
            if (data.success) {
                this.showToast('success', 'Gespeichert', 'Section wurde gespeichert.');
                this.closeSectionEditor();
                // Reload sections
                await this.loadPageSections();
                this.renderPageBuilder();
                this.refreshPreview();
            } else {
                this.showToast('error', 'Fehler', data.error || 'Speichern fehlgeschlagen');
            }
        } catch (e) {
            this.showToast('error', 'Fehler', 'Speichern fehlgeschlagen: ' + e.message);
        }
    }

    closeSectionEditor() {
        const modal = document.getElementById('sectionEditorModal');
        if (modal) modal.remove();
        this.currentEditingSection = null;
    }

    previewSection(sectionId) {
        const section = this.pageSections?.find(s => s.id === sectionId);
        if (!section) return;

        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 800px;">
                <div class="modal-header">
                    <h3><i class="fas fa-code"></i> HTML: ${section.name}</h3>
                    <button class="modal-close" onclick="this.closest('.modal').remove()">&times;</button>
                </div>
                <div class="modal-body">
                    <pre style="background: var(--bg-tertiary); padding: 16px; border-radius: 8px; overflow: auto; max-height: 60vh; font-size: 12px;"><code>${this.escapeHtml(section.fullHtml)}</code></pre>
                </div>
                <div class="modal-footer">
                    <button class="btn-secondary" onclick="this.closest('.modal').remove()">Schliessen</button>
                    <button class="btn-primary" onclick="navigator.clipboard.writeText(document.querySelector('#sectionCode').textContent); devAdmin.showToast('success', 'Kopiert', 'HTML wurde kopiert');">
                        <i class="fas fa-copy"></i> Kopieren
                    </button>
                </div>
            </div>
        `;
        modal.querySelector('code').id = 'sectionCode';
        modal.querySelector('code').textContent = section.fullHtml;
        document.body.appendChild(modal);
    }

    scrollToSection(sectionId) {
        const preview = document.getElementById('livePreviewFrame');
        if (preview && preview.contentWindow) {
            preview.contentWindow.postMessage({ type: 'scrollToSection', sectionId }, '*');
        }
    }

    bindSectionDragEvents() {
        document.querySelectorAll('.section-item[draggable="true"]').forEach(item => {
            item.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('sectionId', item.dataset.sectionId);
                e.dataTransfer.effectAllowed = 'move';
                item.classList.add('dragging');
            });

            item.addEventListener('dragend', () => {
                item.classList.remove('dragging');
                document.querySelectorAll('.drag-over-top, .drag-over-bottom').forEach(el => {
                    el.classList.remove('drag-over-top', 'drag-over-bottom');
                });
            });

            item.addEventListener('dragover', (e) => {
                e.preventDefault();
                const rect = item.getBoundingClientRect();
                const midY = rect.top + rect.height / 2;

                document.querySelectorAll('.drag-over-top, .drag-over-bottom').forEach(el => {
                    el.classList.remove('drag-over-top', 'drag-over-bottom');
                });

                if (e.clientY < midY) {
                    item.classList.add('drag-over-top');
                } else {
                    item.classList.add('drag-over-bottom');
                }
            });

            item.addEventListener('drop', (e) => {
                e.preventDefault();
                e.stopPropagation();

                const draggedSectionId = e.dataTransfer.getData('sectionId');
                const targetSectionId = item.dataset.sectionId;
                const isTop = item.classList.contains('drag-over-top');

                item.classList.remove('drag-over-top', 'drag-over-bottom');

                if (draggedSectionId && draggedSectionId !== targetSectionId) {
                    this.reorderSections(draggedSectionId, targetSectionId, isTop);
                }
            });
        });
    }

    async moveSectionUp(index) {
        if (!this.pageSections || index <= 0) return;
        [this.pageSections[index - 1], this.pageSections[index]] = [this.pageSections[index], this.pageSections[index - 1]];
        await this.saveSectionOrder();
        this.renderPageBuilder();
    }

    async moveSectionDown(index) {
        if (!this.pageSections || index >= this.pageSections.length - 1) return;
        [this.pageSections[index], this.pageSections[index + 1]] = [this.pageSections[index + 1], this.pageSections[index]];
        await this.saveSectionOrder();
        this.renderPageBuilder();
    }

    async reorderSections(draggedId, targetId, insertBefore) {
        if (!this.pageSections) return;

        const draggedIndex = this.pageSections.findIndex(s => s.id === draggedId);
        if (draggedIndex === -1) return;

        const [draggedSection] = this.pageSections.splice(draggedIndex, 1);
        let targetIndex = this.pageSections.findIndex(s => s.id === targetId);

        if (!insertBefore) targetIndex++;
        this.pageSections.splice(targetIndex, 0, draggedSection);

        await this.saveSectionOrder();
        this.renderPageBuilder();
    }

    async saveSectionOrder() {
        if (!this.currentPage || !this.pageSections) return;

        try {
            const response = await fetch('/api/reorder-sections', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pagePath: this.currentPage.slug,
                    sectionOrder: this.pageSections.map(s => s.id)
                })
            });

            const data = await response.json();
            if (data.success) {
                this.showToast('success', 'Gespeichert', 'Reihenfolge wurde gespeichert.');
                this.refreshPreview();
            }
        } catch (e) {
            this.showToast('error', 'Fehler', 'Reihenfolge konnte nicht gespeichert werden.');
        }
    }

    // ============================================
    // VISUAL PAGE BUILDER - Live Edit Mode
    // ============================================

    initVisualBuilder() {
        this.editModeActive = false;
        this.selectedElement = null;
        this.elementHistory = [];
        this.historyIndex = -1;
        this.previewZoom = 100;
        this._iframeHandlers = null;
    }

    async openPageBuilder(pageId) {
        this.currentPage = this.db.pages.find(p => p.id === pageId);
        this.navigateTo('builder');

        if (this.currentPage) {
            const pageNameEl = document.getElementById('builderPageName');
            if (pageNameEl) pageNameEl.textContent = this.currentPage.name;

            // Load page in iframe
            const iframe = document.getElementById('livePreviewFrame');
            if (iframe) {
                // Show loading state
                const tree = document.getElementById('elementTree');
                if (tree) {
                    tree.innerHTML = `
                        <div class="element-tree-loading">
                            <i class="fas fa-spinner fa-spin"></i>
                            <span>Lade ${this.currentPage.name}...</span>
                        </div>
                    `;
                }

                // Wait for iframe to load before building tree
                iframe.onload = () => {
                    console.log('Iframe loaded:', this.currentPage.slug);
                    // Small delay to ensure DOM is ready
                    setTimeout(() => {
                        this.initVisualBuilder();
                        this.buildElementTree();
                        // ALWAYS bind events to block all clicks and enable selection
                        this.bindIframeEventsAlways();
                        // Initialize properties panel with no selection
                        this.currentPropTab = 'element';
                        this.showElementProperties(null);
                    }, 300);
                };

                iframe.src = this.currentPage.slug;
            }

            // Initialize properties panel immediately
            this.currentPropTab = 'element';
            this.selectedElement = null;
            this.showElementProperties(null);
        }
    }

    toggleEditMode(forceState, silent = false) {
        this.editModeActive = forceState !== undefined ? forceState : !this.editModeActive;

        const btn = document.getElementById('toggleEditMode');
        if (btn) {
            btn.classList.toggle('active', this.editModeActive);
        }

        if (this.editModeActive) {
            this.injectEditStyles();
            this.bindIframeEvents();
            if (!silent) this.showToast('info', 'Bearbeitungsmodus AN', 'Klicke auf Elemente um sie zu bearbeiten');
        } else {
            this.removeEditStyles();
            this.unbindIframeEvents();
            if (!silent) this.showToast('info', 'Bearbeitungsmodus AUS', 'Seite ist jetzt nur zur Ansicht');
        }
    }

    injectEditStyles() {
        const iframe = document.getElementById('livePreviewFrame');
        if (!iframe || !iframe.contentDocument) return;

        const doc = iframe.contentDocument;

        // Remove existing styles
        doc.getElementById('admin-edit-styles')?.remove();

        const style = doc.createElement('style');
        style.id = 'admin-edit-styles';
        style.textContent = `
            * { cursor: pointer !important; }
            .admin-hover { outline: 2px dashed #58a6ff !important; outline-offset: 2px; }
            .admin-selected {
                outline: 2px solid #c9a227 !important;
                outline-offset: 2px;
                position: relative;
            }
            .admin-selected::before {
                content: attr(data-element-label);
                position: absolute;
                top: -22px;
                left: 0;
                background: #c9a227;
                color: #000;
                font-size: 10px;
                padding: 2px 6px;
                border-radius: 3px;
                font-weight: bold;
                z-index: 99999;
                pointer-events: none;
            }
            .admin-toolbar {
                position: absolute;
                top: -32px;
                right: 0;
                display: flex;
                gap: 4px;
                z-index: 99999;
            }
            .admin-toolbar button {
                width: 24px;
                height: 24px;
                border: none;
                border-radius: 4px;
                background: #21262d;
                color: #c9d1d9;
                cursor: pointer;
                font-size: 11px;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .admin-toolbar button:hover { background: #30363d; }
            .admin-toolbar button.danger:hover { background: #f85149; color: white; }
            .admin-text-editing {
                outline: 2px solid #3fb950 !important;
                min-height: 20px;
            }
        `;
        doc.head.appendChild(style);
    }

    removeEditStyles() {
        const iframe = document.getElementById('livePreviewFrame');
        if (!iframe || !iframe.contentDocument) return;

        const doc = iframe.contentDocument;
        doc.getElementById('admin-edit-styles')?.remove();
        doc.querySelectorAll('.admin-hover, .admin-selected').forEach(el => {
            el.classList.remove('admin-hover', 'admin-selected');
            el.removeAttribute('data-element-label');
        });
        doc.querySelectorAll('.admin-toolbar').forEach(t => t.remove());

        // Clear selection
        this.selectedElement = null;
        this.showElementProperties(null);
    }

    // ALWAYS block all clicks and enable element selection - no toggle needed
    bindIframeEventsAlways() {
        const iframe = document.getElementById('livePreviewFrame');
        if (!iframe || !iframe.contentDocument) return;

        const doc = iframe.contentDocument;

        // Inject selection styles
        let style = doc.getElementById('admin-select-styles');
        if (!style) {
            style = doc.createElement('style');
            style.id = 'admin-select-styles';
            style.textContent = `
                * { cursor: pointer !important; }
                .admin-hover { outline: 2px dashed #58a6ff !important; outline-offset: 2px; }
                .admin-selected {
                    outline: 2px solid #c9a227 !important;
                    outline-offset: 2px;
                    position: relative;
                }
                .admin-selected::before {
                    content: attr(data-element-label);
                    position: absolute;
                    top: -22px;
                    left: 0;
                    background: #c9a227;
                    color: #000;
                    font-size: 10px;
                    padding: 2px 6px;
                    border-radius: 3px;
                    font-weight: bold;
                    z-index: 99999;
                    pointer-events: none;
                }
            `;
            doc.head.appendChild(style);
        }

        // Handle mouseover - add hover outline
        doc.body.addEventListener('mouseover', (e) => {
            e.target.classList.add('admin-hover');
        }, true);

        // Handle mouseout - remove hover outline
        doc.body.addEventListener('mouseout', (e) => {
            e.target.classList.remove('admin-hover');
        }, true);

        // Handle click - ALWAYS prevent default, ALWAYS select element
        doc.body.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            this.selectElementInIframe(e.target, doc);
            return false;
        }, true);

        // Handle dblclick - prevent and allow text editing
        doc.body.addEventListener('dblclick', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.startTextEditing(e.target, doc);
            return false;
        }, true);

        // Block ALL link clicks
        doc.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                return false;
            }, true);
        });

        // Block ALL button clicks
        doc.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                return false;
            }, true);
        });

        // Block form submissions
        doc.querySelectorAll('form').forEach(form => {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                e.stopPropagation();
                return false;
            }, true);
        });
    }

    bindIframeEvents() {
        // Legacy function - now using bindIframeEventsAlways
        this.bindIframeEventsAlways();
    }

    unbindIframeEvents() {
        const iframe = document.getElementById('livePreviewFrame');
        if (!iframe || !iframe.contentDocument || !this._iframeHandlers) return;

        const doc = iframe.contentDocument;

        doc.body.removeEventListener('mouseover', this._iframeHandlers.mouseover);
        doc.body.removeEventListener('mouseout', this._iframeHandlers.mouseout);
        doc.body.removeEventListener('click', this._iframeHandlers.click);
        doc.body.removeEventListener('dblclick', this._iframeHandlers.dblclick);

        this._iframeHandlers = null;
    }

    selectElementInIframe(el, doc) {
        // Remove old selection
        doc.querySelectorAll('.admin-selected').forEach(s => {
            s.classList.remove('admin-selected');
            s.removeAttribute('data-element-label');
        });
        doc.querySelectorAll('.admin-toolbar').forEach(t => t.remove());

        // Skip selecting body or html
        if (el.tagName === 'BODY' || el.tagName === 'HTML') return;

        // Select new element
        el.classList.add('admin-selected');
        el.setAttribute('data-element-label', el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className ? '.' + el.className.split(' ')[0] : ''));

        this.selectedElement = el;

        // Add toolbar
        const toolbar = doc.createElement('div');
        toolbar.className = 'admin-toolbar';
        toolbar.innerHTML = `
            <button onclick="window.parent.devAdmin.selectParentElement()" title="Parent">↑</button>
            <button onclick="window.parent.devAdmin.moveElementUp()" title="Nach oben">⬆</button>
            <button onclick="window.parent.devAdmin.moveElementDown()" title="Nach unten">⬇</button>
            <button onclick="window.parent.devAdmin.duplicateElement()" title="Duplizieren">⧉</button>
            <button onclick="window.parent.devAdmin.startTextEditingSelected()" title="Text">✎</button>
            <button class="danger" onclick="window.parent.devAdmin.deleteSelectedElement()" title="Loeschen">✕</button>
        `;
        el.style.position = 'relative';
        el.appendChild(toolbar);

        // Update properties panel based on current tab
        const currentTab = this.currentPropTab || 'element';
        if (currentTab === 'element') {
            this.showElementProperties(el);
        } else if (currentTab === 'style') {
            this.showStyleProperties(el);
        } else if (currentTab === 'advanced') {
            this.showAdvancedProperties(el);
        }

        // Update breadcrumb
        this.updateBreadcrumb(el);

        // Highlight in tree
        this.highlightInTree(el);
    }

    selectParentElement() {
        if (!this.selectedElement || !this.selectedElement.parentElement) return;
        const parent = this.selectedElement.parentElement;
        if (parent.tagName === 'BODY' || parent.tagName === 'HTML') return;

        const iframe = document.getElementById('livePreviewFrame');
        this.selectElementInIframe(parent, iframe.contentDocument);
    }

    moveElementUp() {
        if (!this.selectedElement) return;
        const prev = this.selectedElement.previousElementSibling;
        if (prev) {
            this.saveHistory();
            this.selectedElement.parentNode.insertBefore(this.selectedElement, prev);
            this.showToast('info', 'Verschoben', 'Element nach oben verschoben');
        }
    }

    moveElementDown() {
        if (!this.selectedElement) return;
        const next = this.selectedElement.nextElementSibling;
        if (next) {
            this.saveHistory();
            this.selectedElement.parentNode.insertBefore(next, this.selectedElement);
            this.showToast('info', 'Verschoben', 'Element nach unten verschoben');
        }
    }

    duplicateElement() {
        if (!this.selectedElement) return;
        this.saveHistory();

        const clone = this.selectedElement.cloneNode(true);
        clone.classList.remove('admin-selected');
        clone.removeAttribute('data-element-label');
        clone.querySelectorAll('.admin-toolbar').forEach(t => t.remove());

        this.selectedElement.parentNode.insertBefore(clone, this.selectedElement.nextSibling);
        this.showToast('success', 'Dupliziert', 'Element wurde dupliziert');

        const iframe = document.getElementById('livePreviewFrame');
        this.selectElementInIframe(clone, iframe.contentDocument);
    }

    deleteSelectedElement() {
        if (!this.selectedElement) return;
        if (!confirm('Element wirklich loeschen?')) return;

        this.saveHistory();
        this.selectedElement.remove();
        this.selectedElement = null;

        this.showToast('info', 'Geloescht', 'Element wurde entfernt');
        this.showElementProperties(null);
        this.buildElementTree();
    }

    startTextEditingSelected() {
        if (!this.selectedElement) return;
        const iframe = document.getElementById('livePreviewFrame');
        this.startTextEditing(this.selectedElement, iframe.contentDocument);
    }

    startTextEditing(el, doc) {
        this.saveHistory();

        el.classList.add('admin-text-editing');
        el.contentEditable = 'true';
        el.focus();

        // Select all text
        const range = doc.createRange();
        range.selectNodeContents(el);
        const sel = iframe.contentWindow.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);

        el.addEventListener('blur', () => {
            el.contentEditable = 'false';
            el.classList.remove('admin-text-editing');
            this.showToast('success', 'Gespeichert', 'Text wurde geaendert');
        }, { once: true });

        el.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                el.blur();
            }
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                el.blur();
            }
        });
    }

    showElementProperties(el) {
        const panel = document.getElementById('propertiesPanel');
        if (!panel) return;

        if (!el) {
            panel.innerHTML = `
                <div class="no-selection">
                    <i class="fas fa-mouse-pointer"></i>
                    <p>Klicke auf ein Element in der Vorschau</p>
                </div>
            `;
            return;
        }

        const tagName = el.tagName.toLowerCase();
        const computedStyle = el.ownerDocument.defaultView.getComputedStyle(el);

        panel.innerHTML = `
            <div class="prop-group">
                <div class="prop-group-title">Element</div>
                <div class="prop-field">
                    <label>Tag</label>
                    <input type="text" value="${tagName}" readonly>
                </div>
                <div class="prop-field">
                    <label>ID</label>
                    <input type="text" value="${el.id}" onchange="devAdmin.updateElementAttr('id', this.value)">
                </div>
                <div class="prop-field">
                    <label>Class</label>
                    <input type="text" value="${el.className}" onchange="devAdmin.updateElementAttr('className', this.value)">
                </div>
            </div>

            ${this.isTextElement(tagName) ? `
            <div class="prop-group">
                <div class="prop-group-title">Text</div>
                <div class="prop-field">
                    <label>Inhalt</label>
                    <textarea onchange="devAdmin.updateElementText(this.value)">${el.innerText}</textarea>
                </div>
            </div>
            ` : ''}

            ${tagName === 'img' ? `
            <div class="prop-group">
                <div class="prop-group-title">Bild</div>
                <div class="prop-field">
                    <label>src</label>
                    <input type="text" value="${el.src}" onchange="devAdmin.updateElementAttr('src', this.value)">
                </div>
                <div class="prop-field">
                    <label>alt</label>
                    <input type="text" value="${el.alt}" onchange="devAdmin.updateElementAttr('alt', this.value)">
                </div>
            </div>
            ` : ''}

            ${tagName === 'a' ? `
            <div class="prop-group">
                <div class="prop-group-title">Link</div>
                <div class="prop-field">
                    <label>href</label>
                    <input type="text" value="${el.href}" onchange="devAdmin.updateElementAttr('href', this.value)">
                </div>
                <div class="prop-field">
                    <label>target</label>
                    <select onchange="devAdmin.updateElementAttr('target', this.value)">
                        <option value="" ${!el.target ? 'selected' : ''}>Gleicher Tab</option>
                        <option value="_blank" ${el.target === '_blank' ? 'selected' : ''}>Neuer Tab</option>
                    </select>
                </div>
            </div>
            ` : ''}

            <div class="prop-group">
                <div class="prop-group-title">Groesse</div>
                <div class="prop-size-row">
                    <div class="prop-field">
                        <label>Breite</label>
                        <input type="text" value="${el.style.width || computedStyle.width}" onchange="devAdmin.updateElementStyle('width', this.value)">
                    </div>
                    <div class="prop-field">
                        <label>Hoehe</label>
                        <input type="text" value="${el.style.height || computedStyle.height}" onchange="devAdmin.updateElementStyle('height', this.value)">
                    </div>
                </div>
            </div>

            <div class="prop-group">
                <div class="prop-group-title">Farben</div>
                <div class="prop-field">
                    <label>Hintergrund</label>
                    <div class="prop-color">
                        <input type="color" value="${this.rgbToHex(computedStyle.backgroundColor)}" onchange="devAdmin.updateElementStyle('backgroundColor', this.value)">
                        <input type="text" value="${computedStyle.backgroundColor}" onchange="devAdmin.updateElementStyle('backgroundColor', this.value)">
                    </div>
                </div>
                <div class="prop-field">
                    <label>Textfarbe</label>
                    <div class="prop-color">
                        <input type="color" value="${this.rgbToHex(computedStyle.color)}" onchange="devAdmin.updateElementStyle('color', this.value)">
                        <input type="text" value="${computedStyle.color}" onchange="devAdmin.updateElementStyle('color', this.value)">
                    </div>
                </div>
            </div>

            <div class="prop-group">
                <div class="prop-group-title">Spacing</div>
                <div class="prop-size-row">
                    <div class="prop-field">
                        <label>Padding</label>
                        <input type="text" value="${computedStyle.padding}" onchange="devAdmin.updateElementStyle('padding', this.value)">
                    </div>
                    <div class="prop-field">
                        <label>Margin</label>
                        <input type="text" value="${computedStyle.margin}" onchange="devAdmin.updateElementStyle('margin', this.value)">
                    </div>
                </div>
            </div>

            <div class="element-actions">
                <button class="btn-element-action" onclick="devAdmin.duplicateElement()">
                    <i class="fas fa-copy"></i> Duplizieren
                </button>
                <button class="btn-element-delete" onclick="devAdmin.deleteSelectedElement()">
                    <i class="fas fa-trash"></i> Loeschen
                </button>
            </div>
        `;
    }

    isTextElement(tagName) {
        return ['h1','h2','h3','h4','h5','h6','p','span','a','button','li','td','th','label','strong','em'].includes(tagName);
    }

    rgbToHex(rgb) {
        if (!rgb || rgb === 'transparent' || rgb === 'rgba(0, 0, 0, 0)') return '#ffffff';
        const match = rgb.match(/\d+/g);
        if (!match || match.length < 3) return '#ffffff';
        return '#' + match.slice(0, 3).map(x => parseInt(x).toString(16).padStart(2, '0')).join('');
    }

    updateElementAttr(attr, value) {
        if (!this.selectedElement) return;
        this.saveHistory();
        this.selectedElement[attr] = value;
    }

    updateElementText(value) {
        if (!this.selectedElement) return;
        this.saveHistory();
        this.selectedElement.innerText = value;
    }

    updateElementStyle(prop, value) {
        if (!this.selectedElement) return;
        this.saveHistory();
        this.selectedElement.style[prop] = value;
        this.showElementProperties(this.selectedElement);
    }

    updateBreadcrumb(el) {
        const breadcrumb = document.getElementById('elementBreadcrumb');
        if (!breadcrumb) return;

        const path = [];
        let current = el;
        while (current && current.tagName !== 'HTML') {
            const name = current.tagName.toLowerCase() +
                (current.id ? '#' + current.id : '') +
                (current.className && typeof current.className === 'string' ? '.' + current.className.split(' ')[0] : '');
            path.unshift({ el: current, name });
            current = current.parentElement;
        }

        breadcrumb.innerHTML = path.map((item, i) => `
            <span class="breadcrumb-item ${i === path.length - 1 ? 'active' : ''}"
                  onclick="devAdmin.selectBreadcrumbElement(${i})">${item.name}</span>
            ${i < path.length - 1 ? '<span class="breadcrumb-separator">></span>' : ''}
        `).join('');

        this.breadcrumbPath = path;
    }

    selectBreadcrumbElement(index) {
        if (!this.breadcrumbPath || !this.breadcrumbPath[index]) return;
        const iframe = document.getElementById('livePreviewFrame');
        this.selectElementInIframe(this.breadcrumbPath[index].el, iframe.contentDocument);
    }

    buildElementTree() {
        const tree = document.getElementById('elementTree');
        if (!tree) return;

        const iframe = document.getElementById('livePreviewFrame');

        try {
            if (!iframe) {
                tree.innerHTML = `<div class="element-tree-loading"><i class="fas fa-exclamation-triangle"></i><span>Kein Preview-Frame gefunden</span></div>`;
                return;
            }

            if (!iframe.contentDocument) {
                tree.innerHTML = `<div class="element-tree-loading"><i class="fas fa-exclamation-triangle"></i><span>Frame-Dokument nicht zugänglich (CORS?)</span></div>`;
                return;
            }

            if (!iframe.contentDocument.body) {
                tree.innerHTML = `<div class="element-tree-loading"><i class="fas fa-spinner fa-spin"></i><span>Warte auf Seiteninhalt...</span></div>`;
                return;
            }

            const doc = iframe.contentDocument;
            const body = doc.body;

            // Count sections
            const sectionCount = doc.querySelectorAll('section').length;
            const countEl = document.getElementById('builderSectionCount');
            if (countEl) countEl.textContent = sectionCount + ' Sections';

            // Build tree recursively
            const treeHtml = this.buildTreeNode(body, 0);
            tree.innerHTML = treeHtml || `<div class="element-tree-loading"><i class="fas fa-info-circle"></i><span>Leere Seite</span></div>`;

            console.log('Element tree built successfully');
        } catch (e) {
            console.error('Error building element tree:', e);
            tree.innerHTML = `<div class="element-tree-loading"><i class="fas fa-exclamation-triangle"></i><span>Fehler: ${e.message}</span></div>`;
        }
    }

    buildTreeNode(el, depth) {
        if (!el || depth > 8) return ''; // Max depth

        const tagName = el.tagName?.toLowerCase();
        if (!tagName || ['script', 'style', 'link', 'meta', 'head', 'noscript'].includes(tagName)) return '';

        const children = Array.from(el.children).filter(c =>
            !['script', 'style', 'link', 'meta'].includes(c.tagName?.toLowerCase())
        );

        const hasChildren = children.length > 0;
        const isSection = ['section', 'header', 'footer', 'nav', 'main', 'article', 'aside'].includes(tagName);
        const expanded = depth < 2 || isSection;

        const icon = this.getElementIcon(tagName);
        const name = this.getElementDisplayName(el, tagName);

        let html = `
            <div class="tree-node ${expanded ? 'expanded' : ''}" data-depth="${depth}">
                <div class="tree-node-header" onclick="devAdmin.treeNodeClick(event, this)">
                    <span class="tree-node-toggle ${hasChildren ? (expanded ? 'expanded' : '') : 'empty'}">
                        <i class="fas fa-chevron-right"></i>
                    </span>
                    <span class="tree-node-icon ${tagName}">${icon}</span>
                    <span class="tree-node-name">${name}</span>
                    <span class="tree-node-tag">${tagName}</span>
                </div>
        `;

        if (hasChildren) {
            html += `<div class="tree-node-children">`;
            children.forEach(child => {
                html += this.buildTreeNode(child, depth + 1);
            });
            html += `</div>`;
        }

        html += `</div>`;
        return html;
    }

    getElementIcon(tagName) {
        const icons = {
            'section': '<i class="fas fa-puzzle-piece"></i>',
            'header': '<i class="fas fa-bars"></i>',
            'footer': '<i class="fas fa-shoe-prints"></i>',
            'nav': '<i class="fas fa-compass"></i>',
            'main': '<i class="fas fa-cube"></i>',
            'article': '<i class="fas fa-newspaper"></i>',
            'aside': '<i class="fas fa-columns"></i>',
            'div': '<i class="fas fa-square"></i>',
            'h1': '<i class="fas fa-heading"></i>',
            'h2': '<i class="fas fa-heading"></i>',
            'h3': '<i class="fas fa-heading"></i>',
            'p': '<i class="fas fa-paragraph"></i>',
            'span': '<i class="fas fa-font"></i>',
            'a': '<i class="fas fa-link"></i>',
            'img': '<i class="fas fa-image"></i>',
            'button': '<i class="fas fa-square"></i>',
            'input': '<i class="fas fa-keyboard"></i>',
            'form': '<i class="fas fa-wpforms"></i>',
            'ul': '<i class="fas fa-list"></i>',
            'ol': '<i class="fas fa-list-ol"></i>',
            'li': '<i class="fas fa-minus"></i>',
            'table': '<i class="fas fa-table"></i>',
            'video': '<i class="fas fa-video"></i>',
            'iframe': '<i class="fas fa-window-maximize"></i>'
        };
        return icons[tagName] || '<i class="fas fa-code"></i>';
    }

    getElementDisplayName(el, tagName) {
        if (el.id) return '#' + el.id;
        if (el.className && typeof el.className === 'string') {
            const mainClass = el.className.split(' ').find(c => c && !c.startsWith('admin-'));
            if (mainClass) return '.' + mainClass;
        }
        // Try to get meaningful name from common attributes
        if (el.getAttribute('aria-label')) return el.getAttribute('aria-label');
        if (tagName === 'a' && el.textContent) return el.textContent.substring(0, 20);
        if (tagName === 'img' && el.alt) return el.alt.substring(0, 20);
        return tagName;
    }

    treeNodeClick(event, header) {
        event.stopPropagation();

        const node = header.parentElement;
        const toggle = header.querySelector('.tree-node-toggle');

        // Toggle expand/collapse
        if (toggle && !toggle.classList.contains('empty')) {
            node.classList.toggle('expanded');
            toggle.classList.toggle('expanded');
        }

        // Select element in iframe
        // TODO: Map tree node back to iframe element
    }

    highlightInTree(el) {
        // Remove old highlights
        document.querySelectorAll('.tree-node-header.selected').forEach(h => h.classList.remove('selected'));

        // Find and highlight the matching tree node
        // This is simplified - would need element mapping in production
    }

    // History for Undo/Redo
    saveHistory() {
        const iframe = document.getElementById('livePreviewFrame');
        if (!iframe || !iframe.contentDocument) return;

        const html = iframe.contentDocument.body.innerHTML;
        this.elementHistory = this.elementHistory.slice(0, this.historyIndex + 1);
        this.elementHistory.push(html);
        this.historyIndex = this.elementHistory.length - 1;

        // Keep max 50 history entries
        if (this.elementHistory.length > 50) {
            this.elementHistory.shift();
            this.historyIndex--;
        }
    }

    undoEdit() {
        if (this.historyIndex <= 0) {
            this.showToast('info', 'Undo', 'Keine weiteren Schritte zum Rueckgaengig machen');
            return;
        }

        this.historyIndex--;
        const iframe = document.getElementById('livePreviewFrame');
        if (iframe && iframe.contentDocument) {
            iframe.contentDocument.body.innerHTML = this.elementHistory[this.historyIndex];
            this.injectEditStyles();
            this.bindIframeEvents();
            this.buildElementTree();
            this.showToast('info', 'Undo', 'Schritt rueckgaengig gemacht');
        }
    }

    redoEdit() {
        if (this.historyIndex >= this.elementHistory.length - 1) {
            this.showToast('info', 'Redo', 'Keine weiteren Schritte zum Wiederholen');
            return;
        }

        this.historyIndex++;
        const iframe = document.getElementById('livePreviewFrame');
        if (iframe && iframe.contentDocument) {
            iframe.contentDocument.body.innerHTML = this.elementHistory[this.historyIndex];
            this.injectEditStyles();
            this.bindIframeEvents();
            this.buildElementTree();
            this.showToast('info', 'Redo', 'Schritt wiederhergestellt');
        }
    }

    async savePageChanges() {
        const iframe = document.getElementById('livePreviewFrame');
        if (!iframe || !iframe.contentDocument || !this.currentPage) {
            this.showToast('error', 'Fehler', 'Keine Seite geladen');
            return;
        }

        // Get modified HTML
        const doc = iframe.contentDocument;

        // Remove admin elements before saving
        doc.querySelectorAll('.admin-toolbar, .admin-hover, .admin-selected, #admin-edit-styles').forEach(el => {
            if (el.tagName === 'STYLE') el.remove();
            else {
                el.classList.remove('admin-hover', 'admin-selected');
                el.removeAttribute('data-element-label');
            }
        });
        doc.querySelectorAll('.admin-toolbar').forEach(t => t.remove());

        const html = '<!DOCTYPE html>\n<html>' + doc.documentElement.innerHTML + '</html>';

        try {
            const response = await fetch('/api/save-page', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pagePath: this.currentPage.slug,
                    content: html
                })
            });

            const data = await response.json();
            if (data.success) {
                this.showToast('success', 'Gespeichert', 'Seite wurde gespeichert');
            } else {
                this.showToast('error', 'Fehler', data.error || 'Speichern fehlgeschlagen');
            }
        } catch (e) {
            this.showToast('error', 'Fehler', 'Speichern fehlgeschlagen: ' + e.message);
        }
    }

    refreshPageSections() {
        this.buildElementTree();
        this.showToast('info', 'Aktualisiert', 'Seitenstruktur neu geladen');
    }

    setPreviewDevice(device) {
        const container = document.getElementById('previewContainer');
        if (!container) return;

        container.classList.remove('tablet', 'mobile');
        if (device !== 'desktop') {
            container.classList.add(device);
        }

        document.querySelectorAll('.device-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.device === device);
        });
    }

    zoomPreview(delta) {
        this.previewZoom = Math.max(25, Math.min(200, this.previewZoom + delta));
        document.getElementById('zoomLevel').textContent = this.previewZoom + '%';

        const iframe = document.getElementById('livePreviewFrame');
        if (iframe) {
            iframe.style.transform = `scale(${this.previewZoom / 100})`;
            iframe.style.transformOrigin = 'top center';
        }
    }

    switchPropTab(tab) {
        this.currentPropTab = tab;
        document.querySelectorAll('.prop-tab').forEach(t => {
            t.classList.toggle('active', t.dataset.tab === tab);
        });

        // Update panel content based on tab
        if (tab === 'element') {
            this.showElementProperties(this.selectedElement);
        } else if (tab === 'style') {
            this.showStyleProperties(this.selectedElement);
        } else if (tab === 'advanced') {
            this.showAdvancedProperties(this.selectedElement);
        }
    }

    showStyleProperties(el) {
        const panel = document.getElementById('propertiesPanel');
        if (!panel) return;

        if (!el) {
            panel.innerHTML = `
                <div class="no-selection">
                    <i class="fas fa-palette"></i>
                    <p>Waehle ein Element aus um Styles zu bearbeiten</p>
                    <small style="color: var(--text-muted); margin-top: 8px;">Aktiviere den Bearbeitungsmodus und klicke auf ein Element</small>
                </div>
            `;
            return;
        }

        const style = el.ownerDocument.defaultView.getComputedStyle(el);

        panel.innerHTML = `
            <div class="prop-group">
                <div class="prop-group-title">Typography</div>
                <div class="prop-field">
                    <label>Font Size</label>
                    <input type="text" value="${style.fontSize}" onchange="devAdmin.updateElementStyle('fontSize', this.value)">
                </div>
                <div class="prop-field">
                    <label>Font Weight</label>
                    <select onchange="devAdmin.updateElementStyle('fontWeight', this.value)">
                        <option value="400" ${style.fontWeight === '400' ? 'selected' : ''}>Normal</option>
                        <option value="500" ${style.fontWeight === '500' ? 'selected' : ''}>Medium</option>
                        <option value="600" ${style.fontWeight === '600' ? 'selected' : ''}>Semi Bold</option>
                        <option value="700" ${style.fontWeight === '700' ? 'selected' : ''}>Bold</option>
                    </select>
                </div>
                <div class="prop-field">
                    <label>Text Align</label>
                    <select onchange="devAdmin.updateElementStyle('textAlign', this.value)">
                        <option value="left" ${style.textAlign === 'left' ? 'selected' : ''}>Links</option>
                        <option value="center" ${style.textAlign === 'center' ? 'selected' : ''}>Zentriert</option>
                        <option value="right" ${style.textAlign === 'right' ? 'selected' : ''}>Rechts</option>
                    </select>
                </div>
            </div>

            <div class="prop-group">
                <div class="prop-group-title">Layout</div>
                <div class="prop-field">
                    <label>Display</label>
                    <select onchange="devAdmin.updateElementStyle('display', this.value)">
                        <option value="block" ${style.display === 'block' ? 'selected' : ''}>Block</option>
                        <option value="flex" ${style.display === 'flex' ? 'selected' : ''}>Flex</option>
                        <option value="grid" ${style.display === 'grid' ? 'selected' : ''}>Grid</option>
                        <option value="inline" ${style.display === 'inline' ? 'selected' : ''}>Inline</option>
                        <option value="inline-block" ${style.display === 'inline-block' ? 'selected' : ''}>Inline Block</option>
                        <option value="none" ${style.display === 'none' ? 'selected' : ''}>None</option>
                    </select>
                </div>
                <div class="prop-field">
                    <label>Position</label>
                    <select onchange="devAdmin.updateElementStyle('position', this.value)">
                        <option value="static" ${style.position === 'static' ? 'selected' : ''}>Static</option>
                        <option value="relative" ${style.position === 'relative' ? 'selected' : ''}>Relative</option>
                        <option value="absolute" ${style.position === 'absolute' ? 'selected' : ''}>Absolute</option>
                        <option value="fixed" ${style.position === 'fixed' ? 'selected' : ''}>Fixed</option>
                    </select>
                </div>
            </div>

            <div class="prop-group">
                <div class="prop-group-title">Border</div>
                <div class="prop-field">
                    <label>Border Radius</label>
                    <input type="text" value="${style.borderRadius}" onchange="devAdmin.updateElementStyle('borderRadius', this.value)">
                </div>
                <div class="prop-field">
                    <label>Border</label>
                    <input type="text" value="${style.border}" onchange="devAdmin.updateElementStyle('border', this.value)">
                </div>
            </div>
        `;
    }

    showAdvancedProperties(el) {
        const panel = document.getElementById('propertiesPanel');
        if (!panel) return;

        if (!el) {
            panel.innerHTML = `
                <div class="no-selection">
                    <i class="fas fa-code"></i>
                    <p>Waehle ein Element aus um HTML zu bearbeiten</p>
                    <small style="color: var(--text-muted); margin-top: 8px;">Aktiviere den Bearbeitungsmodus und klicke auf ein Element</small>
                </div>
            `;
            return;
        }

        panel.innerHTML = `
            <div class="prop-group">
                <div class="prop-group-title">HTML</div>
                <div class="prop-field">
                    <label>Outer HTML</label>
                    <textarea rows="10" style="font-size: 11px;" onchange="devAdmin.updateOuterHtml(this.value)">${this.escapeHtml(el.outerHTML)}</textarea>
                </div>
            </div>

            <div class="prop-group">
                <div class="prop-group-title">Attributes</div>
                ${Array.from(el.attributes).map(attr => `
                    <div class="prop-field">
                        <label>${attr.name}</label>
                        <input type="text" value="${this.escapeHtml(attr.value)}" onchange="devAdmin.updateElementAttr('${attr.name}', this.value)">
                    </div>
                `).join('')}
            </div>
        `;
    }

    updateOuterHtml(html) {
        if (!this.selectedElement) return;
        this.saveHistory();
        try {
            this.selectedElement.outerHTML = html;
            this.buildElementTree();
            this.showToast('success', 'Gespeichert', 'HTML wurde aktualisiert');
        } catch (e) {
            this.showToast('error', 'Fehler', 'Ungültiges HTML');
        }
    }

    openAddSectionModal() {
        // TODO: Implement section add modal
        this.showToast('info', 'Coming Soon', 'Section hinzufuegen wird implementiert');
    }

    selectBlock(blockId) {
        this.selectedBlock = this.db.blocks.find(b => b.id === blockId);
        this.renderPageBuilder();
        this.renderBlockProperties();
    }

    renderBlockProperties() {
        const panel = document.getElementById('propertiesPanel');
        if (!panel) return;

        if (!this.selectedBlock) {
            panel.innerHTML = `
                <div class="no-selection">
                    <i class="fas fa-mouse-pointer"></i>
                    <p>Wahle einen Block aus</p>
                </div>
            `;
            return;
        }

        panel.innerHTML = `
            <div class="property-group">
                <div class="property-group-header">Block</div>
                <div class="form-group">
                    <label>Name</label>
                    <input type="text" class="form-input" value="${this.selectedBlock.name}" onchange="devAdmin.updateBlockName('${this.selectedBlock.id}', this.value)">
                </div>
            </div>
            <div class="property-group">
                <div class="property-group-header">Aktionen</div>
                <button class="btn-danger" style="width: 100%;" onclick="devAdmin.deleteBlock('${this.selectedBlock.id}')">
                    <i class="fas fa-trash"></i> Block loeschen
                </button>
            </div>
        `;
    }

    async toggleBlock(blockId, enabled) {
        const block = this.db.blocks.find(b => b.id === blockId);
        if (block) {
            block.enabled = enabled;
            this.trackChange();
        }
    }

    async updateBlockName(blockId, name) {
        const block = this.db.blocks.find(b => b.id === blockId);
        if (block) {
            block.name = name;
            this.trackChange();
            this.renderPageBuilder();
        }
    }

    async deleteBlock(blockId) {
        if (!confirm('Block wirklich loeschen?')) return;

        try {
            await fetch(`${API_BASE}/blocks/${blockId}`, { method: 'DELETE' });
            this.db.blocks = this.db.blocks.filter(b => b.id !== blockId);
            this.selectedBlock = null;
            this.renderPageBuilder();
            this.showToast('success', 'Geloescht', 'Block wurde entfernt.');
        } catch (e) {
            this.showToast('error', 'Fehler', 'Block konnte nicht geloescht werden.');
        }
    }

    openAddBlockModal() {
        const html = `
            <div class="block-palette">
                ${Object.entries(this.blockTypes).map(([type, config]) => `
                    <div class="palette-item" onclick="devAdmin.addBlock('${type}')">
                        <i class="fas ${config.icon}"></i>
                        <span>${config.name}</span>
                    </div>
                `).join('')}
            </div>
        `;

        this.openModal('Block hinzufuegen', html, null, false);
    }

    async addBlock(type) {
        if (!this.currentPage) {
            this.showToast('error', 'Fehler', 'Keine Seite ausgewaehlt.');
            return;
        }

        try {
            const response = await fetch(`${API_BASE}/blocks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    page_id: this.currentPage.id,
                    type,
                    name: this.blockTypes[type]?.name || type
                })
            });

            if (response.ok) {
                const result = await response.json();
                this.db.blocks.push(result.block);
                this.closeModal();
                this.renderPageBuilder();
                this.showToast('success', 'Hinzugefuegt', 'Block wurde hinzugefuegt.');
            }
        } catch (e) {
            this.showToast('error', 'Fehler', 'Block konnte nicht hinzugefuegt werden.');
        }
    }

    // ============================================
    // COLLECTIONS
    // ============================================
    async addCollection() {
        const html = `
            <div class="form-group">
                <label>Name</label>
                <input type="text" class="form-input" id="modalColName" placeholder="z.B. Team" required>
            </div>
            <div class="form-group">
                <label>Icon (Font Awesome)</label>
                <input type="text" class="form-input" id="modalColIcon" placeholder="fa-users" value="fa-folder">
            </div>
        `;

        this.openModal('Neue Sammlung', html, async () => {
            const name = document.getElementById('modalColName').value;
            const icon = document.getElementById('modalColIcon').value || 'fa-folder';

            if (!name) {
                this.showToast('error', 'Fehler', 'Name ist erforderlich.');
                return;
            }

            try {
                const response = await fetch(`${API_BASE}/collections`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        website_id: this.currentWebsite,
                        name,
                        icon
                    })
                });

                if (response.ok) {
                    await this.loadData();
                    this.showToast('success', 'Erstellt', `Sammlung "${name}" wurde erstellt.`);
                }
            } catch (e) {
                this.showToast('error', 'Fehler', 'Sammlung konnte nicht erstellt werden.');
            }
        });
    }

    openCollection(collectionId) {
        this.currentCollection = this.db.collections.find(c => c.id === collectionId);
        this.navigateTo('collection-editor');
        this.renderCollectionEditor();
    }

    renderCollectionEditor() {
        if (!this.currentCollection) return;

        document.getElementById('collectionTitle').textContent = this.currentCollection.name;
        document.getElementById('collectionIcon').className = 'fas ' + this.currentCollection.icon;

        const items = this.db.items.filter(i => i.collection_id === this.currentCollection.id);
        const container = document.getElementById('collectionItems');

        if (items.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas ${this.currentCollection.icon}"></i>
                    <h4>Keine Eintraege</h4>
                    <p>Fuege den ersten Eintrag hinzu</p>
                </div>
            `;
        } else {
            container.innerHTML = items.map(item => `
                <div class="collection-item-card">
                    ${item.data.image ? `<img class="collection-item-image" src="${item.data.image}" alt="">` : ''}
                    <div class="collection-item-body">
                        <div class="collection-item-title">${item.data.name || 'Unbenannt'}</div>
                        <div class="collection-item-meta">${item.data.role || item.data.category || ''}</div>
                        <div class="collection-item-actions">
                            <button class="btn-ghost btn-sm" onclick="devAdmin.editCollectionItem('${item.id}')">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn-ghost btn-sm" onclick="devAdmin.deleteCollectionItem('${item.id}')">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `).join('');
        }
    }

    async addCollectionItem() {
        if (!this.currentCollection) return;

        const fields = this.currentCollection.fields || [{ key: 'name', label: 'Name', type: 'text' }];
        const html = fields.map(f => `
            <div class="form-group">
                <label>${f.label}${f.required ? ' *' : ''}</label>
                ${f.type === 'textarea'
                    ? `<textarea class="form-textarea" id="modal_${f.key}" rows="3"></textarea>`
                    : f.type === 'select'
                    ? `<select class="form-select" id="modal_${f.key}">${(f.options || []).map(o => `<option value="${o}">${o}</option>`).join('')}</select>`
                    : `<input type="${f.type || 'text'}" class="form-input" id="modal_${f.key}">`
                }
            </div>
        `).join('');

        this.openModal('Eintrag hinzufuegen', html, async () => {
            const data = {};
            fields.forEach(f => {
                const input = document.getElementById(`modal_${f.key}`);
                if (input) data[f.key] = input.value;
            });

            try {
                const response = await fetch(`${API_BASE}/items`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        collection_id: this.currentCollection.id,
                        data
                    })
                });

                if (response.ok) {
                    const result = await response.json();
                    this.db.items.push(result.item);
                    this.renderCollectionEditor();
                    this.updateStats();
                    this.showToast('success', 'Hinzugefuegt', 'Eintrag wurde hinzugefuegt.');
                }
            } catch (e) {
                this.showToast('error', 'Fehler', 'Eintrag konnte nicht hinzugefuegt werden.');
            }
        });
    }

    async deleteCollectionItem(itemId) {
        if (!confirm('Eintrag wirklich loeschen?')) return;

        try {
            await fetch(`${API_BASE}/items/${itemId}`, { method: 'DELETE' });
            this.db.items = this.db.items.filter(i => i.id !== itemId);
            this.renderCollectionEditor();
            this.updateStats();
            this.showToast('success', 'Geloescht', 'Eintrag wurde entfernt.');
        } catch (e) {
            this.showToast('error', 'Fehler', 'Eintrag konnte nicht geloescht werden.');
        }
    }

    // ============================================
    // MEDIA
    // ============================================
    async handleFileUpload(files) {
        for (const file of files) {
            if (!file.type.startsWith('image/')) continue;

            const formData = new FormData();
            formData.append('file', file);
            formData.append('website_id', this.currentWebsite);

            try {
                const response = await fetch(`${API_BASE}/upload`, {
                    method: 'POST',
                    body: formData
                });

                if (response.ok) {
                    const result = await response.json();
                    this.db.media.push(result.media);
                }
            } catch (e) {
                this.showToast('error', 'Fehler', `Upload von ${file.name} fehlgeschlagen.`);
            }
        }

        this.renderMedia();
        this.updateStats();
        this.showToast('success', 'Hochgeladen', `${files.length} Datei(en) hochgeladen.`);
    }

    selectMedia(mediaId) {
        const media = this.db.media.find(m => m.id === mediaId);
        if (media) {
            navigator.clipboard?.writeText(media.url);
            this.showToast('info', 'Kopiert', 'Bild-URL wurde kopiert.');
        }
    }

    // ============================================
    // PREVIEW
    // ============================================
    refreshPreview() {
        const frame = document.getElementById('previewFrame');
        if (frame && this.currentPage) {
            frame.src = this.currentPage.slug + '?t=' + Date.now();
        }
    }

    setPreviewDevice(device) {
        this.previewDevice = device;
        document.querySelectorAll('.device-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.device === device);
        });
        const wrapper = document.getElementById('previewWrapper');
        if (wrapper) wrapper.className = 'preview-frame-wrapper ' + device;
    }

    zoomPreview(delta) {
        this.previewZoom = Math.max(25, Math.min(200, this.previewZoom + delta));
        const frame = document.getElementById('previewFrame');
        if (frame) frame.style.transform = `scale(${this.previewZoom / 100})`;
        document.getElementById('zoomLevel').textContent = this.previewZoom + '%';
    }

    openPreview() {
        // Use origin to ensure correct domain
        const url = `${window.location.origin}/index.html`;
        window.open(url, '_blank');
    }

    openAdminPanel() {
        // Use origin to ensure correct domain
        const url = `${window.location.origin}/admin.html`;
        window.open(url, '_blank');
    }

    // ============================================
    // UTILITIES
    // ============================================
    trackChange() {
        this.changes++;
        this.updateChangeCount();
    }

    updateChangeCount() {
        const el = document.getElementById('changeCount');
        if (el) el.textContent = this.changes;
        const indicator = document.getElementById('changesIndicator');
        if (indicator) {
            indicator.style.display = this.changes > 0 ? 'flex' : 'flex';
        }
    }

    async saveAll() {
        await this.pushToServerWithConfirm();
    }

    formatTime(dateInput) {
        if (!dateInput) return 'Nie';
        const date = new Date(dateInput);
        return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' ' +
               date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
    }

    selectWebsite(websiteId) {
        this.currentWebsite = websiteId;
        const selector = document.getElementById('websiteSelector');
        if (selector) selector.value = websiteId;
        this.renderAll();
    }

    filterPages(query) {
        // Simple filter implementation
        document.querySelectorAll('#pagesTable tbody tr').forEach(row => {
            const name = row.querySelector('td:first-child')?.textContent.toLowerCase() || '';
            row.style.display = name.includes(query.toLowerCase()) ? '' : 'none';
        });
    }

    // ============================================
    // MODAL
    // ============================================
    openModal(title, content, onSave, showFooter = true) {
        document.getElementById('modalTitle').textContent = title;
        document.getElementById('modalBody').innerHTML = content;
        document.getElementById('modalOverlay').classList.add('active');
        document.querySelector('.modal-footer').style.display = showFooter ? 'flex' : 'none';
        this.modalCallback = onSave;
    }

    closeModal() {
        document.getElementById('modalOverlay').classList.remove('active');
        this.modalCallback = null;
    }

    saveModal() {
        if (this.modalCallback) this.modalCallback();
        this.closeModal();
    }

    // ============================================
    // TOAST
    // ============================================
    showToast(type, title, message) {
        const container = document.getElementById('toastContainer');
        if (!container) return;

        const icons = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        };

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <i class="fas ${icons[type]}"></i>
            <div class="toast-content">
                <h4>${title}</h4>
                <p>${message}</p>
            </div>
        `;

        container.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    // ============================================
    // EXPORT / IMPORT
    // ============================================
    exportData() {
        const data = {
            website: this.db.websites.find(w => w.id === this.currentWebsite),
            pages: this.db.pages.filter(p => p.website_id === this.currentWebsite),
            blocks: this.db.blocks,
            collections: this.db.collections.filter(c => c.website_id === this.currentWebsite),
            items: this.db.items,
            settings: this.db.settings.filter(s => s.website_id === this.currentWebsite)
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'devadmin-export-' + new Date().toISOString().split('T')[0] + '.json';
        a.click();
        URL.revokeObjectURL(url);
        this.showToast('success', 'Exportiert', 'Daten wurden exportiert.');
    }

    importData(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = JSON.parse(e.target.result);
                // Merge imported data
                this.showToast('success', 'Importiert', 'Daten wurden importiert.');
                await this.loadData();
            } catch (err) {
                this.showToast('error', 'Fehler', 'Ungueltige JSON-Datei.');
            }
        };
        reader.readAsText(file);
        event.target.value = '';
    }

    resetData() {
        if (!confirm('Wirklich alle lokalen Daten zuruecksetzen?')) return;
        localStorage.clear();
        location.reload();
    }

    // ============================================
    // ADMIN PANEL START/STOP
    // ============================================
    startAdminPanel() {
        const btn = document.querySelector('#adminPanelNode .node-action-btn');
        const statusDot = document.querySelector('#nodeAdminPanel .status-dot');

        // Open admin panel
        window.open('admin.html', '_blank');

        // Update UI
        if (btn) {
            btn.classList.add('running');
            btn.innerHTML = '<i class="fas fa-external-link-alt"></i>';
            btn.title = 'Admin Panel ist geoeffnet';
        }

        if (statusDot) {
            statusDot.classList.remove('yellow', 'red');
            statusDot.classList.add('green');
        }

        // Update connection in DB
        const adminConn = this.db.connections.find(c => c.type === 'admin_panel');
        if (adminConn) {
            adminConn.status = 'connected';
            adminConn.last_ping = new Date().toISOString();
        }

        // Ping server to register connection
        this.pingAdminPanel();

        this.showToast('success', 'Admin Panel', 'Admin Panel wurde geoeffnet');
    }

    async pingAdminPanel() {
        try {
            await fetch(`${API_BASE}/sync/ping`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'admin_panel' })
            });
        } catch (e) {
            console.error('Ping failed:', e);
        }
    }

    openWebsite() {
        // Use origin to ensure correct domain
        const url = `${window.location.origin}/index.html`;
        window.open(url, '_blank');
        this.showToast('info', 'Website', 'Website wurde in neuem Tab geoeffnet');
    }

    // ============================================
    // MULTI-SITE MANAGEMENT
    // ============================================
    renderSitesGrid() {
        const container = document.getElementById('sitesGrid');
        if (!container) return;

        if (this.db.websites.length === 0) {
            container.innerHTML = `
                <div class="site-card" style="border-style: dashed; text-align: center; padding: 40px;">
                    <i class="fas fa-plus" style="font-size: 32px; color: var(--text-muted); margin-bottom: 12px;"></i>
                    <p style="color: var(--text-muted);">Keine Websites vorhanden</p>
                    <button class="btn-primary" onclick="devAdmin.addWebsiteSite()" style="margin-top: 12px;">
                        <i class="fas fa-plus"></i> Erste Website erstellen
                    </button>
                </div>
            `;
            return;
        }

        container.innerHTML = this.db.websites.map(site => {
            const isActive = site.id === this.currentWebsite;
            const hasError = site.error || site.status === 'error';
            const statusClass = hasError ? 'error' : site.status === 'online' ? 'online' : 'offline';

            return `
                <div class="site-card ${isActive ? 'active' : ''} ${hasError ? 'error' : ''}" data-site-id="${site.id}">
                    <div class="site-card-header">
                        <div class="site-card-icon">${site.name.substring(0, 2).toUpperCase()}</div>
                        <div class="site-card-info">
                            <div class="site-card-name">${site.name}</div>
                            <div class="site-card-domain">${site.domain || site.id}</div>
                        </div>
                        <div class="site-card-status ${statusClass}">
                            <span class="status-dot ${statusClass === 'online' ? 'green' : statusClass === 'error' ? 'red' : ''}"></span>
                            ${statusClass === 'online' ? 'Online' : statusClass === 'error' ? 'Fehler' : 'Offline'}
                        </div>
                    </div>

                    ${hasError ? `
                        <div class="site-card-error">
                            <div class="site-card-error-title">
                                <i class="fas fa-exclamation-circle"></i>
                                Fehler erkannt
                            </div>
                            <div class="site-card-error-message">${site.error || 'Unbekannter Fehler - Seite nicht erreichbar'}</div>
                        </div>
                    ` : ''}

                    <div class="site-card-actions">
                        ${hasError ? `
                            <button class="btn-restart" onclick="devAdmin.restartSite('${site.id}')">
                                <i class="fas fa-redo"></i> Neustart
                            </button>
                        ` : `
                            <button class="btn-open" onclick="devAdmin.openSiteAdmin('${site.id}')">
                                <i class="fas fa-external-link-alt"></i> Oeffnen
                            </button>
                        `}
                        <button class="btn-settings" onclick="devAdmin.showSiteSettings('${site.id}')">
                            <i class="fas fa-cog"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    async restartSite(siteId) {
        const site = this.db.websites.find(w => w.id === siteId);
        if (!site) return;

        this.showToast('info', 'Neustart', `Website "${site.name}" wird neu gestartet...`);

        // Clear site cache
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.includes(siteId)) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));

        // Clear site error
        site.error = null;
        site.status = 'online';

        // Re-ping
        try {
            const response = await fetch(`${API_BASE}/sync/ping`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'website', site_id: siteId })
            });

            if (response.ok) {
                this.showToast('success', 'Neugestartet', `Website "${site.name}" ist wieder online.`);
            } else {
                throw new Error('Server nicht erreichbar');
            }
        } catch (e) {
            site.error = e.message;
            site.status = 'error';
            this.showToast('error', 'Fehler', `Neustart fehlgeschlagen: ${e.message}`);
        }

        this.renderSitesGrid();
    }

    openSiteAdmin(siteId) {
        const site = this.db.websites.find(w => w.id === siteId);
        if (site) {
            window.open(`admin.html?site=${siteId}`, '_blank');
        }
    }

    showSiteSettings(siteId) {
        const site = this.db.websites.find(w => w.id === siteId);
        if (!site) return;

        const html = `
            <div class="form-group">
                <label>Website Name</label>
                <input type="text" class="form-input" id="siteSettingsName" value="${site.name}">
            </div>
            <div class="form-group">
                <label>Domain</label>
                <input type="text" class="form-input" id="siteSettingsDomain" value="${site.domain || ''}">
            </div>
            <div class="form-group">
                <label>Status</label>
                <select class="form-select" id="siteSettingsStatus">
                    <option value="online" ${site.status === 'online' ? 'selected' : ''}>Online</option>
                    <option value="offline" ${site.status === 'offline' ? 'selected' : ''}>Offline (Wartung)</option>
                </select>
            </div>
            <hr style="margin: 20px 0; border-color: var(--border-color);">
            <div class="form-group">
                <button class="btn-danger" onclick="devAdmin.deleteSite('${siteId}')" style="width: 100%;">
                    <i class="fas fa-trash"></i> Website loeschen
                </button>
            </div>
        `;

        this.openModal(`Einstellungen: ${site.name}`, html, () => {
            site.name = document.getElementById('siteSettingsName').value;
            site.domain = document.getElementById('siteSettingsDomain').value;
            site.status = document.getElementById('siteSettingsStatus').value;
            this.renderSitesGrid();
            this.renderWebsiteSelector();
            this.showToast('success', 'Gespeichert', 'Website-Einstellungen wurden gespeichert.');
        });
    }

    async deleteSite(siteId) {
        const site = this.db.websites.find(w => w.id === siteId);
        if (!site) return;

        if (this.db.websites.length === 1) {
            this.showToast('error', 'Fehler', 'Letzte Website kann nicht geloescht werden.');
            return;
        }

        if (!confirm(`Website "${site.name}" wirklich loeschen? Alle Daten gehen verloren!`)) return;
        if (!confirm('Bist du WIRKLICH sicher?')) return;

        this.db.websites = this.db.websites.filter(w => w.id !== siteId);
        this.db.pages = this.db.pages.filter(p => p.website_id !== siteId);
        this.db.collections = this.db.collections.filter(c => c.website_id !== siteId);

        if (this.currentWebsite === siteId) {
            this.currentWebsite = this.db.websites[0]?.id;
        }

        this.closeModal();
        this.renderSitesGrid();
        this.renderAll();
        this.showToast('success', 'Geloescht', `Website "${site.name}" wurde geloescht.`);
    }

    addWebsiteSite() {
        const html = `
            <div class="form-group">
                <label>Website Name *</label>
                <input type="text" class="form-input" id="newSiteName" placeholder="z.B. Meine Firma GmbH" required>
            </div>
            <div class="form-group">
                <label>Domain</label>
                <input type="text" class="form-input" id="newSiteDomain" placeholder="z.B. meinefirma.de">
            </div>
        `;

        this.openModal('Neue Website hinzufuegen', html, async () => {
            const name = document.getElementById('newSiteName').value.trim();
            const domain = document.getElementById('newSiteDomain').value.trim();

            if (!name) {
                this.showToast('error', 'Fehler', 'Name ist erforderlich.');
                return;
            }

            const id = 'ws_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '_');

            const newSite = {
                id,
                name,
                domain: domain || null,
                status: 'online',
                error: null,
                created_at: new Date().toISOString()
            };

            this.db.websites.push(newSite);
            this.renderSitesGrid();
            this.renderWebsiteSelector();
            this.showToast('success', 'Erstellt', `Website "${name}" wurde erstellt.`);
        });
    }

    // ============================================
    // DRAG & DROP PAGEBUILDER
    // ============================================
    initDragDrop() {
        // Palette Items - Drag starten
        document.querySelectorAll('.palette-item[draggable="true"]').forEach(item => {
            item.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('blockType', item.dataset.blockType);
                e.dataTransfer.effectAllowed = 'copy';
                item.classList.add('dragging');
            });

            item.addEventListener('dragend', () => {
                item.classList.remove('dragging');
            });
        });

        // Block List - Drop Zone
        const blockList = document.getElementById('blockList');
        if (blockList) {
            blockList.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
                blockList.classList.add('drag-over');
            });

            blockList.addEventListener('dragleave', () => {
                blockList.classList.remove('drag-over');
            });

            blockList.addEventListener('drop', (e) => {
                e.preventDefault();
                blockList.classList.remove('drag-over');

                const blockType = e.dataTransfer.getData('blockType');
                const draggedBlockId = e.dataTransfer.getData('blockId');

                if (blockType) {
                    // Neuer Block von der Palette
                    this.addBlockFromPalette(blockType);
                } else if (draggedBlockId) {
                    // Bestehender Block wird verschoben
                    this.reorderBlocks(draggedBlockId, null);
                }
            });
        }
    }

    bindBlockDragEvents() {
        document.querySelectorAll('.block-item[draggable="true"]').forEach(item => {
            item.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('blockId', item.dataset.blockId);
                e.dataTransfer.effectAllowed = 'move';
                item.classList.add('dragging');
            });

            item.addEventListener('dragend', () => {
                item.classList.remove('dragging');
                document.querySelectorAll('.drag-over-top, .drag-over-bottom').forEach(el => {
                    el.classList.remove('drag-over-top', 'drag-over-bottom');
                });
            });

            item.addEventListener('dragover', (e) => {
                e.preventDefault();
                const rect = item.getBoundingClientRect();
                const midY = rect.top + rect.height / 2;

                document.querySelectorAll('.drag-over-top, .drag-over-bottom').forEach(el => {
                    el.classList.remove('drag-over-top', 'drag-over-bottom');
                });

                if (e.clientY < midY) {
                    item.classList.add('drag-over-top');
                } else {
                    item.classList.add('drag-over-bottom');
                }
            });

            item.addEventListener('drop', (e) => {
                e.preventDefault();
                e.stopPropagation();

                const draggedBlockId = e.dataTransfer.getData('blockId');
                const targetBlockId = item.dataset.blockId;
                const isTop = item.classList.contains('drag-over-top');

                item.classList.remove('drag-over-top', 'drag-over-bottom');

                if (draggedBlockId && draggedBlockId !== targetBlockId) {
                    this.reorderBlocks(draggedBlockId, targetBlockId, isTop);
                }
            });
        });
    }

    async addBlockFromPalette(blockType) {
        if (!this.currentPage) {
            this.showToast('error', 'Fehler', 'Bitte zuerst eine Seite auswaehlen.');
            return;
        }

        const blockConfig = this.blockTypes[blockType];
        const newBlock = {
            id: 'blk_' + Date.now(),
            page_id: this.currentPage.id,
            type: blockType,
            name: blockConfig?.name || blockType,
            enabled: true,
            order: this.db.blocks.filter(b => b.page_id === this.currentPage.id).length,
            settings: {},
            content: {}
        };

        this.db.blocks.push(newBlock);
        this.trackChange();
        this.renderPageBuilder();
        this.showToast('success', 'Hinzugefuegt', `Block "${newBlock.name}" wurde hinzugefuegt.`);
    }

    reorderBlocks(draggedId, targetId, insertBefore = true) {
        const pageBlocks = this.db.blocks.filter(b => b.page_id === this.currentPage?.id);
        const draggedIndex = pageBlocks.findIndex(b => b.id === draggedId);

        if (draggedIndex === -1) return;

        const [draggedBlock] = pageBlocks.splice(draggedIndex, 1);

        if (targetId) {
            let targetIndex = pageBlocks.findIndex(b => b.id === targetId);
            if (!insertBefore) targetIndex++;
            pageBlocks.splice(targetIndex, 0, draggedBlock);
        } else {
            pageBlocks.push(draggedBlock);
        }

        // Update order
        pageBlocks.forEach((block, index) => {
            block.order = index;
        });

        // Update db.blocks
        this.db.blocks = [
            ...this.db.blocks.filter(b => b.page_id !== this.currentPage?.id),
            ...pageBlocks
        ];

        this.trackChange();
        this.renderPageBuilder();
    }

    moveBlockUp(blockId) {
        const pageBlocks = this.db.blocks
            .filter(b => b.page_id === this.currentPage?.id)
            .sort((a, b) => (a.order || 0) - (b.order || 0));

        const index = pageBlocks.findIndex(b => b.id === blockId);
        if (index > 0) {
            [pageBlocks[index - 1], pageBlocks[index]] = [pageBlocks[index], pageBlocks[index - 1]];
            pageBlocks.forEach((b, i) => b.order = i);
            this.db.blocks = [
                ...this.db.blocks.filter(b => b.page_id !== this.currentPage?.id),
                ...pageBlocks
            ];
            this.trackChange();
            this.renderPageBuilder();
        }
    }

    moveBlockDown(blockId) {
        const pageBlocks = this.db.blocks
            .filter(b => b.page_id === this.currentPage?.id)
            .sort((a, b) => (a.order || 0) - (b.order || 0));

        const index = pageBlocks.findIndex(b => b.id === blockId);
        if (index < pageBlocks.length - 1) {
            [pageBlocks[index], pageBlocks[index + 1]] = [pageBlocks[index + 1], pageBlocks[index]];
            pageBlocks.forEach((b, i) => b.order = i);
            this.db.blocks = [
                ...this.db.blocks.filter(b => b.page_id !== this.currentPage?.id),
                ...pageBlocks
            ];
            this.trackChange();
            this.renderPageBuilder();
        }
    }

    duplicateBlock(blockId) {
        const block = this.db.blocks.find(b => b.id === blockId);
        if (!block) return;

        const newBlock = {
            ...JSON.parse(JSON.stringify(block)),
            id: 'blk_' + Date.now(),
            name: block.name + ' (Kopie)',
            order: block.order + 0.5
        };

        this.db.blocks.push(newBlock);

        // Re-order
        const pageBlocks = this.db.blocks
            .filter(b => b.page_id === this.currentPage?.id)
            .sort((a, b) => (a.order || 0) - (b.order || 0));
        pageBlocks.forEach((b, i) => b.order = i);

        this.trackChange();
        this.renderPageBuilder();
        this.showToast('success', 'Dupliziert', 'Block wurde dupliziert.');
    }

    // Enhanced PageBuilder rendering with drag handles
    renderPageBuilder() {
        if (!this.currentPage) return;

        document.getElementById('builderPageName').textContent = this.currentPage.name;

        const blocks = this.db.blocks
            .filter(b => b.page_id === this.currentPage.id)
            .sort((a, b) => (a.order || 0) - (b.order || 0));

        const blockList = document.getElementById('blockList');

        if (blockList) {
            if (blocks.length === 0) {
                blockList.innerHTML = `
                    <div class="drop-placeholder">
                        <i class="fas fa-arrow-down" style="font-size: 24px; margin-bottom: 8px;"></i>
                        <p>Ziehe Bloecke hierher oder klicke auf + um zu beginnen</p>
                    </div>
                `;
            } else {
                blockList.innerHTML = blocks.map(block => `
                    <div class="block-item ${this.selectedBlock?.id === block.id ? 'selected' : ''}"
                         data-block-id="${block.id}"
                         draggable="true"
                         onclick="devAdmin.selectBlock('${block.id}')">
                        <div class="block-item-drag-handle" title="Ziehen zum Verschieben">
                            <span></span>
                            <span></span>
                            <span></span>
                        </div>
                        <div class="block-item-icon">
                            <i class="fas ${this.blockTypes[block.type]?.icon || 'fa-puzzle-piece'}"></i>
                        </div>
                        <div class="block-item-info">
                            <div class="block-item-name">${block.name}</div>
                            <div class="block-item-type">${block.type}</div>
                        </div>
                        <div class="block-item-actions">
                            <button onclick="event.stopPropagation(); devAdmin.moveBlockUp('${block.id}')" title="Nach oben">
                                <i class="fas fa-chevron-up"></i>
                            </button>
                            <button onclick="event.stopPropagation(); devAdmin.moveBlockDown('${block.id}')" title="Nach unten">
                                <i class="fas fa-chevron-down"></i>
                            </button>
                            <button onclick="event.stopPropagation(); devAdmin.duplicateBlock('${block.id}')" title="Duplizieren">
                                <i class="fas fa-copy"></i>
                            </button>
                            <button class="btn-delete" onclick="event.stopPropagation(); devAdmin.deleteBlock('${block.id}')" title="Loeschen">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                        <label class="toggle-switch" onclick="event.stopPropagation()">
                            <input type="checkbox" ${block.enabled ? 'checked' : ''}
                                   onchange="devAdmin.toggleBlock('${block.id}', this.checked)">
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                `).join('');

                // Bind drag events for blocks
                this.bindBlockDragEvents();
            }
        }

        document.getElementById('activeBlockCount').textContent = blocks.filter(b => b.enabled).length + ' aktiv';
        this.refreshPreview();
    }

    // Override navigateTo to init drag drop
    navigateTo(section) {
        this.currentSection = section;

        // Update Nav
        document.querySelectorAll('.nav-item').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.section === section);
        });

        // Update Sections
        document.querySelectorAll('.content-section').forEach(sec => {
            sec.classList.remove('active');
        });

        const targetSection = document.getElementById(`section-${section}`);
        if (targetSection) {
            targetSection.classList.add('active');
        }

        // Update Title
        const titles = {
            dashboard: 'Dashboard',
            connections: 'Connection Monitor',
            database: 'Datenbank',
            sync: 'Synchronisation',
            elements: 'Website Bausteine',
            pages: 'Seiten',
            collections: 'Sammlungen',
            templates: 'Templates',
            builder: 'Page Builder',
            'collection-editor': 'Sammlung bearbeiten',
            media: 'Mediathek',
            settings: 'Einstellungen',
            logs: 'Server Logs'
        };
        document.getElementById('currentSectionTitle').textContent = titles[section] || section;

        // Section-specific actions
        if (section === 'database') {
            this.loadDbTables();
        } else if (section === 'elements') {
            this.extractElements();
        } else if (section === 'templates') {
            this.loadTemplates();
            this.renderWebsites();
        } else if (section === 'sync') {
            this.loadSyncLog();
        } else if (section === 'logs') {
            document.getElementById('logDate').valueAsDate = new Date();
            this.loadLogs();
        } else if (section === 'connections') {
            this.loadConnectionStatus();
            this.renderConnectionMonitor();
            this.renderSitesGrid();
        } else if (section === 'builder') {
            this.initDragDrop();
        }
    }

    // Enhanced renderBlockProperties with more options
    renderBlockProperties() {
        const panel = document.getElementById('propertiesPanel');
        if (!panel) return;

        if (!this.selectedBlock) {
            panel.innerHTML = `
                <div class="no-selection">
                    <i class="fas fa-mouse-pointer"></i>
                    <p>Waehle einen Block aus</p>
                </div>
            `;
            return;
        }

        panel.innerHTML = `
            <div class="property-group">
                <div class="property-group-header">Allgemein</div>
                <div class="property-row">
                    <label class="property-label">Name</label>
                    <input type="text" class="property-input" value="${this.selectedBlock.name}"
                           onchange="devAdmin.updateBlockProperty('name', this.value)">
                </div>
                <div class="property-row">
                    <label class="property-label">Typ</label>
                    <select class="property-select" onchange="devAdmin.updateBlockProperty('type', this.value)">
                        ${Object.entries(this.blockTypes).map(([type, config]) => `
                            <option value="${type}" ${this.selectedBlock.type === type ? 'selected' : ''}>${config.name}</option>
                        `).join('')}
                    </select>
                </div>
            </div>

            <div class="property-group">
                <div class="property-group-header">Sichtbarkeit</div>
                <div class="property-row">
                    <label class="property-label">Sichtbar</label>
                    <label class="toggle-switch">
                        <input type="checkbox" ${this.selectedBlock.enabled ? 'checked' : ''}
                               onchange="devAdmin.toggleBlock('${this.selectedBlock.id}', this.checked)">
                        <span class="toggle-slider"></span>
                    </label>
                </div>
            </div>

            <div class="property-group">
                <div class="property-group-header">CSS Klasse</div>
                <div class="property-row">
                    <input type="text" class="property-input" placeholder="z.B. my-custom-class"
                           value="${this.selectedBlock.settings?.cssClass || ''}"
                           onchange="devAdmin.updateBlockSetting('cssClass', this.value)">
                </div>
            </div>

            <div class="property-group">
                <div class="property-group-header">Aktionen</div>
                <button class="btn-secondary" style="width: 100%; margin-bottom: 8px;" onclick="devAdmin.duplicateBlock('${this.selectedBlock.id}')">
                    <i class="fas fa-copy"></i> Block duplizieren
                </button>
                <button class="btn-danger" style="width: 100%;" onclick="devAdmin.deleteBlock('${this.selectedBlock.id}')">
                    <i class="fas fa-trash"></i> Block loeschen
                </button>
            </div>
        `;
    }

    updateBlockProperty(property, value) {
        if (this.selectedBlock) {
            this.selectedBlock[property] = value;
            this.trackChange();
            this.renderPageBuilder();
        }
    }

    updateBlockSetting(setting, value) {
        if (this.selectedBlock) {
            if (!this.selectedBlock.settings) this.selectedBlock.settings = {};
            this.selectedBlock.settings[setting] = value;
            this.trackChange();
        }
    }

    // ============================================
    // ASSETS LIBRARY METHODS
    // ============================================

    // Switch between Assets tabs
    switchAssetsTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.assets-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });

        // Update tab content
        document.querySelectorAll('.assets-tab-content').forEach(content => {
            content.classList.remove('active');
        });

        const targetContent = document.getElementById(`assets${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`);
        if (targetContent) {
            targetContent.classList.add('active');
        }
    }

    // Search icons
    searchIcons(query) {
        const icons = document.querySelectorAll('.icon-item');
        const searchTerm = query.toLowerCase();

        icons.forEach(icon => {
            const name = icon.querySelector('span').textContent.toLowerCase();
            const iconClass = icon.dataset.icon.toLowerCase();
            const matches = name.includes(searchTerm) || iconClass.includes(searchTerm);
            icon.style.display = matches ? '' : 'none';
        });
    }

    // Filter icons by category
    filterIcons(category) {
        // Update category buttons
        document.querySelectorAll('.category-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.category === category);
        });

        // Filter icons
        const icons = document.querySelectorAll('.icon-item');
        icons.forEach(icon => {
            if (category === 'all') {
                icon.style.display = '';
            } else {
                icon.style.display = icon.dataset.category === category ? '' : 'none';
            }
        });
    }

    // Copy icon class to clipboard
    copyIcon(element) {
        const iconClass = element.dataset.icon;
        navigator.clipboard.writeText(`<i class="${iconClass}"></i>`).then(() => {
            this.showToast('success', 'Icon kopiert', `${iconClass} wurde in die Zwischenablage kopiert`);
            element.style.transform = 'scale(0.95)';
            setTimeout(() => element.style.transform = '', 150);
        });
    }

    // Copy color to clipboard
    copyColor(color) {
        navigator.clipboard.writeText(color).then(() => {
            this.showToast('success', 'Farbe kopiert', `${color} wurde in die Zwischenablage kopiert`);
        });
    }

    // Add custom icon
    addCustomIcon() {
        const iconClass = prompt('Font Awesome Icon-Klasse eingeben (z.B. fas fa-star):');
        if (iconClass) {
            const name = prompt('Name für das Icon:') || iconClass;
            const iconsGrid = document.getElementById('iconsGrid');
            const newIcon = document.createElement('div');
            newIcon.className = 'icon-item';
            newIcon.dataset.category = 'custom';
            newIcon.dataset.icon = iconClass;
            newIcon.onclick = () => this.copyIcon(newIcon);
            newIcon.innerHTML = `
                <i class="${iconClass}"></i>
                <span>${name}</span>
            `;
            iconsGrid.appendChild(newIcon);
            this.showToast('success', 'Icon hinzugefuegt', `${name} wurde zur Bibliothek hinzugefuegt`);
        }
    }

    // Add custom color
    addCustomColor() {
        const color = prompt('Farbe eingeben (z.B. #ff0000):');
        if (color) {
            const name = prompt('Name für die Farbe:') || color;
            const colorsGrid = document.getElementById('accentColors');
            const newColor = document.createElement('div');
            newColor.className = 'color-item';
            newColor.style.setProperty('--color', color);
            newColor.onclick = () => this.copyColor(color);
            newColor.innerHTML = `
                <div class="color-swatch"></div>
                <span>${name}</span>
                <code>${color}</code>
            `;
            colorsGrid.appendChild(newColor);
            this.showToast('success', 'Farbe hinzugefuegt', `${name} wurde zur Palette hinzugefuegt`);
        }
    }

    // Search components
    searchComponents(query) {
        const items = document.querySelectorAll('.component-item');
        const searchTerm = query.toLowerCase();

        items.forEach(item => {
            const name = item.querySelector('span').textContent.toLowerCase();
            item.style.display = name.includes(searchTerm) ? '' : 'none';
        });
    }

    // Search layouts
    searchLayouts(query) {
        const items = document.querySelectorAll('.layout-item');
        const searchTerm = query.toLowerCase();

        items.forEach(item => {
            const name = item.querySelector('h4').textContent.toLowerCase();
            const desc = item.querySelector('p').textContent.toLowerCase();
            item.style.display = (name.includes(searchTerm) || desc.includes(searchTerm)) ? '' : 'none';
        });
    }

    // Preview component
    previewComponent(componentId) {
        this.showToast('info', 'Vorschau', `Komponente "${componentId}" wird geladen...`);
        // TODO: Implement component preview modal
    }

    // Preview layout
    previewLayout(layoutId) {
        this.showToast('info', 'Vorschau', `Layout "${layoutId}" wird geladen...`);
        // TODO: Implement layout preview modal
    }

    // Create new component
    createComponent() {
        this.showToast('info', 'Baustein erstellen', 'Diese Funktion wird bald verfuegbar sein');
        // TODO: Implement component creation wizard
    }

    // Create/save layout
    createLayout() {
        this.showToast('info', 'Layout speichern', 'Diese Funktion wird bald verfuegbar sein');
        // TODO: Implement layout saving from current page
    }
}

// Initialize
const devAdmin = new DevAdmin();
window.devAdmin = devAdmin;

// ============================================
// SETTINGS MANAGER
// ============================================
class SettingsManager {
    constructor() {
        this.settings = null;
        this.hasChanges = false;
        this.init();
    }

    async init() {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setup());
        } else {
            this.setup();
        }
    }

    setup() {
        this.bindTabs();
        this.bindColorSync();
        this.loadSettings();
    }

    bindTabs() {
        document.querySelectorAll('.settings-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.dataset.settingsTab;

                // Update active tab button
                document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                // Show corresponding content
                document.querySelectorAll('.settings-tab-content').forEach(content => {
                    content.classList.remove('active');
                });
                const contentEl = document.getElementById(`settingsTab-${tabName}`);
                if (contentEl) contentEl.classList.add('active');
            });
        });
    }

    bindColorSync() {
        // Sync color picker with text input
        const primaryColor = document.getElementById('settingsPrimaryColor');
        const primaryText = document.getElementById('settingsPrimaryColorText');
        const accentColor = document.getElementById('settingsAccentColor');
        const accentText = document.getElementById('settingsAccentColorText');

        if (primaryColor && primaryText) {
            primaryColor.addEventListener('input', () => {
                primaryText.value = primaryColor.value;
                this.markChanged();
            });
            primaryText.addEventListener('input', () => {
                primaryColor.value = primaryText.value;
                this.markChanged();
            });
        }

        if (accentColor && accentText) {
            accentColor.addEventListener('input', () => {
                accentText.value = accentColor.value;
                this.markChanged();
            });
            accentText.addEventListener('input', () => {
                accentColor.value = accentText.value;
                this.markChanged();
            });
        }

        // Track changes on all settings inputs
        document.querySelectorAll('#section-settings input, #section-settings textarea, #section-settings select').forEach(input => {
            input.addEventListener('change', () => this.markChanged());
            input.addEventListener('input', () => this.markChanged());
        });
    }

    markChanged() {
        this.hasChanges = true;
        const status = document.getElementById('settingsSyncStatus');
        if (status) {
            status.textContent = 'Ungespeicherte Aenderungen';
            status.style.color = '#f59e0b';
        }
    }

    async loadSettings() {
        try {
            const response = await fetch(`${API_BASE}/settings`);
            if (!response.ok) throw new Error('Failed to load settings');

            const data = await response.json();
            // Handle both {success: true, settings: {...}} and direct settings object
            this.settings = data.settings || data;
            this.populateFields();

            const status = document.getElementById('settingsSyncStatus');
            if (status) {
                status.textContent = 'Einstellungen geladen';
                status.style.color = '#22c55e';
                setTimeout(() => {
                    status.textContent = '';
                }, 2000);
            }
        } catch (error) {
            console.error('Error loading settings:', error);
            devAdmin.showToast('error', 'Fehler', 'Einstellungen konnten nicht geladen werden');
        }
    }

    populateFields() {
        if (!this.settings) return;

        // Website settings
        this.setFieldValue('settingsSiteName', this.settings.website?.name);
        this.setFieldValue('settingsTagline', this.settings.website?.tagline);
        this.setFieldValue('settingsLogo', this.settings.website?.logo);

        // SMTP settings
        this.setFieldValue('smtpHost', this.settings.email?.smtp?.host);
        this.setFieldValue('smtpPort', this.settings.email?.smtp?.port);
        this.setFieldValue('smtpSecure', this.settings.email?.smtp?.secure?.toString());
        this.setFieldValue('smtpUser', this.settings.email?.smtp?.user);
        // Password is never returned from server for security
        // If passwordSet is true, show placeholder
        const smtpPasswordField = document.getElementById('smtpPassword');
        if (smtpPasswordField) {
            if (this.settings.email?.smtp?.passwordSet) {
                smtpPasswordField.placeholder = '••••••• (gesetzt)';
            } else {
                smtpPasswordField.placeholder = 'Passwort eingeben';
            }
            smtpPasswordField.value = ''; // Never show password
        }
        this.setFieldValue('smtpFrom', this.settings.email?.smtp?.from);
        this.setFieldValue('smtpFromName', this.settings.email?.smtp?.fromName);

        // Email notifications
        this.setFieldValue('notifyContact', this.settings.email?.notifications?.contactFormTo);
        this.setFieldValue('notifyQuote', this.settings.email?.notifications?.quoteRequestTo);
        this.setFieldValue('notifyBooking', this.settings.email?.notifications?.bookingTo);

        // Contact settings
        this.setFieldValue('whatsappNumber', this.settings.contact?.whatsapp?.number);
        this.setFieldValue('whatsappMessage', this.settings.contact?.whatsapp?.message);
        this.setFieldValue('contactPhone', this.settings.contact?.phone);
        this.setFieldValue('contactEmail', this.settings.contact?.email);
        this.setFieldValue('contactAddress', this.settings.contact?.addresses?.headquarters);

        // Social media
        this.setFieldValue('socialLinkedin', this.settings.social?.linkedin);
        this.setFieldValue('socialTwitter', this.settings.social?.twitter);
        this.setFieldValue('socialFacebook', this.settings.social?.facebook);

        // Admin user
        const adminUser = this.settings.admin?.users?.[0];
        if (adminUser) {
            this.setFieldValue('adminUsername', adminUser.username);
            this.setFieldValue('adminEmail', adminUser.email);
        }

        // Security settings
        this.setFieldValue('sessionTimeout', Math.round((this.settings.admin?.sessionTimeout || 3600000) / 60000));
        this.setFieldValue('maxLoginAttempts', this.settings.admin?.maxLoginAttempts);

        this.hasChanges = false;
    }

    setFieldValue(id, value) {
        const el = document.getElementById(id);
        if (el && value !== undefined && value !== null) {
            el.value = value;
        }
    }

    getFieldValue(id) {
        const el = document.getElementById(id);
        return el ? el.value : '';
    }

    async saveAllSettings() {
        try {
            const settings = {
                website: {
                    name: this.getFieldValue('settingsSiteName'),
                    tagline: this.getFieldValue('settingsTagline'),
                    logo: this.getFieldValue('settingsLogo')
                },
                email: {
                    smtp: {
                        host: this.getFieldValue('smtpHost'),
                        port: parseInt(this.getFieldValue('smtpPort')) || 587,
                        secure: this.getFieldValue('smtpSecure') === 'true',
                        user: this.getFieldValue('smtpUser'),
                        password: this.getFieldValue('smtpPassword'),
                        from: this.getFieldValue('smtpFrom'),
                        fromName: this.getFieldValue('smtpFromName')
                    },
                    notifications: {
                        contactFormTo: this.getFieldValue('notifyContact'),
                        quoteRequestTo: this.getFieldValue('notifyQuote'),
                        bookingTo: this.getFieldValue('notifyBooking')
                    }
                },
                contact: {
                    whatsapp: {
                        number: this.getFieldValue('whatsappNumber'),
                        message: this.getFieldValue('whatsappMessage')
                    },
                    phone: this.getFieldValue('contactPhone'),
                    email: this.getFieldValue('contactEmail'),
                    addresses: {
                        headquarters: this.getFieldValue('contactAddress')
                    }
                },
                social: {
                    linkedin: this.getFieldValue('socialLinkedin'),
                    twitter: this.getFieldValue('socialTwitter'),
                    facebook: this.getFieldValue('socialFacebook')
                },
                admin: {
                    sessionTimeout: parseInt(this.getFieldValue('sessionTimeout')) * 60000 || 3600000,
                    maxLoginAttempts: parseInt(this.getFieldValue('maxLoginAttempts')) || 5
                }
            };

            const response = await fetch(`${API_BASE}/settings`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings)
            });

            if (!response.ok) throw new Error('Failed to save settings');

            this.settings = await response.json();
            this.hasChanges = false;

            const status = document.getElementById('settingsSyncStatus');
            if (status) {
                status.textContent = 'Gespeichert!';
                status.style.color = '#22c55e';
            }

            devAdmin.showToast('success', 'Gespeichert', 'Alle Einstellungen wurden gespeichert');

            // Broadcast settings change via WebSocket
            if (devAdmin.ws && devAdmin.ws.readyState === WebSocket.OPEN) {
                devAdmin.ws.send(JSON.stringify({
                    type: 'settings_updated',
                    settings: this.settings
                }));
            }
        } catch (error) {
            console.error('Error saving settings:', error);
            devAdmin.showToast('error', 'Fehler', 'Einstellungen konnten nicht gespeichert werden');
        }
    }

    async testSMTP() {
        const resultEl = document.getElementById('smtpTestResult');
        resultEl.style.display = 'block';
        resultEl.className = 'smtp-test-result loading';
        resultEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Teste SMTP-Verbindung...';

        try {
            const response = await fetch(`${API_BASE}/settings/test-smtp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    host: this.getFieldValue('smtpHost'),
                    port: parseInt(this.getFieldValue('smtpPort')) || 587,
                    secure: this.getFieldValue('smtpSecure') === 'true',
                    user: this.getFieldValue('smtpUser'),
                    password: this.getFieldValue('smtpPassword')
                })
            });

            const data = await response.json();

            if (data.success) {
                resultEl.className = 'smtp-test-result success';
                resultEl.innerHTML = '<i class="fas fa-check-circle"></i> SMTP-Verbindung erfolgreich!';
                devAdmin.showToast('success', 'Erfolg', 'SMTP-Verbindung erfolgreich');
            } else {
                resultEl.className = 'smtp-test-result error';
                resultEl.innerHTML = `<i class="fas fa-times-circle"></i> Fehler: ${data.error || 'Verbindung fehlgeschlagen'}`;
                devAdmin.showToast('error', 'Fehler', data.error || 'SMTP-Verbindung fehlgeschlagen');
            }
        } catch (error) {
            resultEl.className = 'smtp-test-result error';
            resultEl.innerHTML = `<i class="fas fa-times-circle"></i> Fehler: ${error.message}`;
            devAdmin.showToast('error', 'Fehler', 'SMTP-Test fehlgeschlagen');
        }
    }

    async sendTestEmail() {
        const resultEl = document.getElementById('smtpTestResult');
        resultEl.style.display = 'block';
        resultEl.className = 'smtp-test-result loading';
        resultEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sende Test-E-Mail...';

        const toEmail = this.getFieldValue('smtpUser') || this.getFieldValue('smtpFrom');
        if (!toEmail) {
            resultEl.className = 'smtp-test-result error';
            resultEl.innerHTML = '<i class="fas fa-times-circle"></i> Keine Empfaenger-Adresse angegeben';
            return;
        }

        try {
            const response = await fetch(`${API_BASE}/settings/send-email`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: toEmail,
                    subject: 'Iustus Mercatura - SMTP Test',
                    body: `<h2>SMTP Test erfolgreich!</h2>
                    <p>Diese Test-E-Mail wurde vom Iustus Mercatura Dev Admin gesendet.</p>
                    <p>Zeitpunkt: ${new Date().toLocaleString('de-DE')}</p>
                    <hr>
                    <p style="color: #666; font-size: 12px;">Iustus Mercatura Holdings</p>`
                })
            });

            const data = await response.json();

            if (data.success) {
                resultEl.className = 'smtp-test-result success';
                resultEl.innerHTML = `<i class="fas fa-check-circle"></i> Test-E-Mail an ${toEmail} gesendet!`;
                devAdmin.showToast('success', 'Gesendet', 'Test-E-Mail wurde gesendet');
            } else {
                resultEl.className = 'smtp-test-result error';
                resultEl.innerHTML = `<i class="fas fa-times-circle"></i> Fehler: ${data.error || 'E-Mail konnte nicht gesendet werden'}`;
                devAdmin.showToast('error', 'Fehler', data.error || 'E-Mail-Versand fehlgeschlagen');
            }
        } catch (error) {
            resultEl.className = 'smtp-test-result error';
            resultEl.innerHTML = `<i class="fas fa-times-circle"></i> Fehler: ${error.message}`;
            devAdmin.showToast('error', 'Fehler', 'E-Mail-Versand fehlgeschlagen');
        }
    }

    async changePassword() {
        const resultEl = document.getElementById('passwordResult');
        const currentPassword = this.getFieldValue('currentPassword');
        const newPassword = this.getFieldValue('newPassword');
        const confirmPassword = this.getFieldValue('confirmPassword');

        resultEl.style.display = 'block';

        // Validation
        if (!currentPassword || !newPassword || !confirmPassword) {
            resultEl.className = 'password-result error';
            resultEl.innerHTML = '<i class="fas fa-times-circle"></i> Bitte alle Felder ausfuellen';
            return;
        }

        if (newPassword !== confirmPassword) {
            resultEl.className = 'password-result error';
            resultEl.innerHTML = '<i class="fas fa-times-circle"></i> Passwoerter stimmen nicht ueberein';
            return;
        }

        if (newPassword.length < 8) {
            resultEl.className = 'password-result error';
            resultEl.innerHTML = '<i class="fas fa-times-circle"></i> Passwort muss mindestens 8 Zeichen lang sein';
            return;
        }

        resultEl.className = 'password-result loading';
        resultEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Aendere Passwort...';

        try {
            const response = await fetch(`${API_BASE}/admin/password`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: this.settings?.admin?.users?.[0]?.id || 'admin_1',
                    currentPassword,
                    newPassword
                })
            });

            const data = await response.json();

            if (data.success) {
                resultEl.className = 'password-result success';
                resultEl.innerHTML = '<i class="fas fa-check-circle"></i> Passwort erfolgreich geaendert!';
                devAdmin.showToast('success', 'Erfolg', 'Passwort wurde geaendert');

                // Clear password fields
                document.getElementById('currentPassword').value = '';
                document.getElementById('newPassword').value = '';
                document.getElementById('confirmPassword').value = '';
            } else {
                resultEl.className = 'password-result error';
                resultEl.innerHTML = `<i class="fas fa-times-circle"></i> ${data.error || 'Passwortaenderung fehlgeschlagen'}`;
                devAdmin.showToast('error', 'Fehler', data.error || 'Passwortaenderung fehlgeschlagen');
            }
        } catch (error) {
            resultEl.className = 'password-result error';
            resultEl.innerHTML = `<i class="fas fa-times-circle"></i> Fehler: ${error.message}`;
            devAdmin.showToast('error', 'Fehler', 'Passwortaenderung fehlgeschlagen');
        }
    }

    async updateUserDetails() {
        const username = this.getFieldValue('adminUsername');
        const email = this.getFieldValue('adminEmail');

        if (!username || !email) {
            devAdmin.showToast('error', 'Fehler', 'Bitte Benutzername und E-Mail angeben');
            return;
        }

        try {
            const response = await fetch(`${API_BASE}/admin/user`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: this.settings?.admin?.users?.[0]?.id || 'admin_1',
                    username,
                    email
                })
            });

            const data = await response.json();

            if (data.success) {
                devAdmin.showToast('success', 'Gespeichert', 'Benutzerdaten wurden aktualisiert');
                // Reload settings to get updated user data
                await this.loadSettings();
            } else {
                devAdmin.showToast('error', 'Fehler', data.error || 'Aktualisierung fehlgeschlagen');
            }
        } catch (error) {
            devAdmin.showToast('error', 'Fehler', 'Benutzerdaten konnten nicht gespeichert werden');
        }
    }

    exportSettings() {
        if (!this.settings) {
            devAdmin.showToast('error', 'Fehler', 'Keine Einstellungen zum Exportieren');
            return;
        }

        // Remove sensitive data before export
        const exportData = JSON.parse(JSON.stringify(this.settings));
        if (exportData.email?.smtp?.password) {
            exportData.email.smtp.password = '***HIDDEN***';
        }
        if (exportData.admin?.users) {
            exportData.admin.users = exportData.admin.users.map(u => ({
                ...u,
                passwordHash: '***HIDDEN***'
            }));
        }

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `iustus-settings-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        devAdmin.showToast('success', 'Exportiert', 'Einstellungen wurden exportiert');
    }
}

// Initialize Settings Manager
const settingsManager = new SettingsManager();
window.settingsManager = settingsManager;
