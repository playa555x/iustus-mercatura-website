/**
 * Admin Error Handler - Iustus Mercatura CMS
 * Robustes Fehlerhandling mit Recovery-Optionen
 * Multi-Site freundliche Architektur
 */

// ============================================
// ADMIN ERROR HANDLER
// ============================================
class AdminErrorHandler {
    static instance = null;
    static safeMode = false;
    static connectionStatus = 'online';
    static reconnectAttempts = 0;
    static maxReconnectAttempts = 5;
    static reconnectInterval = null;
    static errors = [];

    /**
     * Initialisiert den Error Handler
     */
    static init() {
        if (this.instance) return this.instance;

        // Safe Mode Check
        this.safeMode = sessionStorage.getItem('admin_safe_mode') === 'true';

        // Globale Error Handler
        window.onerror = (msg, src, line, col, error) => {
            this.handleError(error || new Error(msg), { source: src, line, col });
            return false; // Lasse den Fehler weiter propagieren
        };

        window.addEventListener('unhandledrejection', (event) => {
            this.handleError(event.reason, { type: 'unhandledrejection' });
        });

        // Verbindungsüberwachung
        window.addEventListener('online', () => this.setConnectionStatus('online'));
        window.addEventListener('offline', () => this.setConnectionStatus('offline'));

        // Server-Verbindung prüfen
        this.startConnectionMonitor();

        console.log('[AdminErrorHandler] Initialized', { safeMode: this.safeMode });
        this.instance = this;
        return this;
    }

    /**
     * Behandelt Fehler
     */
    static handleError(error, context = {}) {
        const errorInfo = {
            message: error?.message || String(error),
            stack: error?.stack || '',
            timestamp: new Date().toISOString(),
            context,
            siteId: window.CMS_SITE_ID || 'unknown',
            url: window.location.href
        };

        // Fehler speichern
        this.errors.push(errorInfo);
        if (this.errors.length > 50) this.errors.shift();

        // In localStorage für Debugging
        try {
            const storedErrors = JSON.parse(localStorage.getItem('admin_errors') || '[]');
            storedErrors.push(errorInfo);
            if (storedErrors.length > 20) storedErrors.shift();
            localStorage.setItem('admin_errors', JSON.stringify(storedErrors));
        } catch (e) { }

        console.error('[AdminErrorHandler] Error caught:', errorInfo);

        // Kritische Fehler zeigen Error Screen
        if (this.isCriticalError(error)) {
            this.showErrorScreen(errorInfo);
        }
    }

    /**
     * Prüft ob ein Fehler kritisch ist
     */
    static isCriticalError(error) {
        if (!error) return false;

        const criticalPatterns = [
            /TypeError.*undefined/i,
            /ReferenceError/i,
            /SyntaxError/i,
            /Maximum call stack/i,
            /out of memory/i,
            /AdminPanel.*init/i,
            /Failed to fetch/i
        ];

        const msg = error.message || String(error);
        return criticalPatterns.some(pattern => pattern.test(msg));
    }

    /**
     * Zeigt den Error Screen
     */
    static showErrorScreen(errorInfo) {
        const errorScreen = document.getElementById('errorScreen');
        const errorMessage = document.getElementById('errorMessage');
        const errorStack = document.getElementById('errorStack');
        const serverUrl = document.getElementById('serverUrl');

        if (errorScreen) {
            errorMessage.textContent = errorInfo.message;
            errorStack.textContent = errorInfo.stack || 'Kein Stack-Trace verfügbar';
            serverUrl.textContent = window.CMS_API_URL || 'https://iustus-mercatura-eu.onrender.com';
            errorScreen.style.display = 'flex';
        }
    }

    /**
     * Versteckt den Error Screen
     */
    static hideErrorScreen() {
        const errorScreen = document.getElementById('errorScreen');
        if (errorScreen) {
            errorScreen.style.display = 'none';
        }
    }

    /**
     * Cache leeren und Neustart
     */
    static clearAndRestart() {
        try {
            // LocalStorage für diese Site leeren
            const siteId = window.CMS_SITE_ID || 'iustus-mercatura';
            const keysToRemove = [];

            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key.includes(siteId) || key.includes('iustus_admin') || key.includes('cms_')) {
                    keysToRemove.push(key);
                }
            }

            keysToRemove.forEach(key => localStorage.removeItem(key));

            // SessionStorage leeren
            sessionStorage.clear();

            // Error-Log löschen
            localStorage.removeItem('admin_errors');

            console.log('[AdminErrorHandler] Cache cleared, restarting...');
            window.location.reload();

        } catch (e) {
            console.error('[AdminErrorHandler] Error clearing cache:', e);
            window.location.reload();
        }
    }

    /**
     * Abgesicherter Modus starten
     */
    static startSafeMode() {
        sessionStorage.setItem('admin_safe_mode', 'true');
        console.log('[AdminErrorHandler] Starting safe mode...');
        window.location.reload();
    }

    /**
     * Safe Mode verlassen
     */
    static exitSafeMode() {
        sessionStorage.removeItem('admin_safe_mode');
        window.location.reload();
    }

    /**
     * Verbindungsstatus setzen
     */
    static setConnectionStatus(status) {
        const previousStatus = this.connectionStatus;
        this.connectionStatus = status;

        const banner = document.getElementById('connectionBanner');
        const headerEl = document.querySelector('.admin-header');

        if (status === 'offline' || status === 'error') {
            if (banner) {
                banner.style.display = 'flex';
            }
            // Header nach unten verschieben
            if (headerEl) {
                headerEl.style.marginTop = '56px';
            }

            // Auto-Reconnect starten
            if (!this.reconnectInterval) {
                this.startReconnect();
            }
        } else {
            if (banner) {
                banner.style.display = 'none';
            }
            if (headerEl) {
                headerEl.style.marginTop = '0';
            }

            // Reconnect stoppen
            if (this.reconnectInterval) {
                clearInterval(this.reconnectInterval);
                this.reconnectInterval = null;
            }
            this.reconnectAttempts = 0;

            // Toast bei Wiederverbindung
            if (previousStatus !== 'online' && previousStatus !== null) {
                this.showReconnectedToast();
            }
        }

        console.log('[AdminErrorHandler] Connection status:', status);
    }

    /**
     * Verbindungsüberwachung starten
     */
    static startConnectionMonitor() {
        // Initiale Prüfung
        this.checkServerConnection();

        // Periodische Prüfung alle 30 Sekunden
        setInterval(() => {
            if (this.connectionStatus === 'online') {
                this.checkServerConnection();
            }
        }, 30000);
    }

    /**
     * Server-Verbindung prüfen
     */
    static async checkServerConnection() {
        const apiUrl = window.CMS_API_URL || 'https://iustus-mercatura-eu.onrender.com';

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            const response = await fetch(`${apiUrl}/api/health`, {
                method: 'GET',
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (response.ok) {
                this.setConnectionStatus('online');
                return true;
            } else {
                this.setConnectionStatus('error');
                return false;
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('[AdminErrorHandler] Connection check timeout');
            }
            this.setConnectionStatus('error');
            return false;
        }
    }

    /**
     * Erneut verbinden
     */
    static async reconnect() {
        const banner = document.getElementById('connectionBanner');
        const reconnectBtn = banner?.querySelector('button');

        if (reconnectBtn) {
            reconnectBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verbinde...';
            reconnectBtn.disabled = true;
        }

        const success = await this.checkServerConnection();

        if (reconnectBtn) {
            reconnectBtn.innerHTML = '<i class="fas fa-sync"></i> Erneut verbinden';
            reconnectBtn.disabled = false;
        }

        if (!success) {
            this.showToast('error', 'Verbindung fehlgeschlagen', 'Server nicht erreichbar');
        }

        return success;
    }

    /**
     * Auto-Reconnect starten
     */
    static startReconnect() {
        this.reconnectAttempts = 0;

        this.reconnectInterval = setInterval(async () => {
            if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                clearInterval(this.reconnectInterval);
                this.reconnectInterval = null;
                console.log('[AdminErrorHandler] Max reconnect attempts reached');
                return;
            }

            this.reconnectAttempts++;
            console.log(`[AdminErrorHandler] Reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);

            const success = await this.checkServerConnection();
            if (success) {
                clearInterval(this.reconnectInterval);
                this.reconnectInterval = null;
            }
        }, 10000); // Alle 10 Sekunden versuchen
    }

    /**
     * Toast-Benachrichtigung
     */
    static showToast(type, title, message) {
        // Verwende AdminPanel.showToast falls verfügbar
        if (window.adminPanel?.showToast) {
            window.adminPanel.showToast(type, title, message);
            return;
        }

        // Fallback: Eigene Toast-Implementation
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
        setTimeout(() => toast.remove(), 5000);
    }

    /**
     * Wiederverbunden Toast
     */
    static showReconnectedToast() {
        this.showToast('success', 'Verbunden', 'Verbindung zum Server wiederhergestellt');
    }

    /**
     * Fehlerprotokoll exportieren
     */
    static exportErrorLog() {
        const errors = JSON.parse(localStorage.getItem('admin_errors') || '[]');
        const data = {
            exportedAt: new Date().toISOString(),
            siteId: window.CMS_SITE_ID,
            errors: errors,
            currentErrors: this.errors,
            browserInfo: {
                userAgent: navigator.userAgent,
                platform: navigator.platform,
                language: navigator.language
            }
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `error-log-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }
}

// ============================================
// MULTI-SITE MANAGER
// ============================================
class MultiSiteManager {
    static sites = [];
    static currentSite = null;
    static storageKey = 'cms_multi_sites';

    /**
     * Initialisiert den Multi-Site Manager
     */
    static init() {
        this.loadSites();
        this.currentSite = window.CMS_SITE_ID || 'iustus-mercatura';

        // Site-Selector rendern falls Container existiert
        const selectorContainer = document.getElementById('siteSelectorContainer');
        if (selectorContainer) {
            this.renderSiteSelector(selectorContainer);
        }

        console.log('[MultiSiteManager] Initialized', {
            currentSite: this.currentSite,
            totalSites: this.sites.length
        });
    }

    /**
     * Lädt alle Sites aus dem Storage
     */
    static loadSites() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (stored) {
                this.sites = JSON.parse(stored);
            } else {
                // Default-Site erstellen
                this.sites = [{
                    id: 'iustus-mercatura',
                    name: 'Iustus Mercatura',
                    domain: 'imh-bvi.com',
                    status: 'online',
                    icon: 'IM',
                    createdAt: new Date().toISOString()
                }];
                this.saveSites();
            }
        } catch (e) {
            console.error('[MultiSiteManager] Error loading sites:', e);
            this.sites = [];
        }
    }

    /**
     * Speichert alle Sites
     */
    static saveSites() {
        localStorage.setItem(this.storageKey, JSON.stringify(this.sites));
    }

    /**
     * Site hinzufügen
     */
    static addSite(siteData) {
        const newSite = {
            id: siteData.id || this.generateSiteId(siteData.name),
            name: siteData.name,
            domain: siteData.domain || '',
            status: 'offline',
            icon: siteData.icon || siteData.name.substring(0, 2).toUpperCase(),
            createdAt: new Date().toISOString(),
            ...siteData
        };

        // Prüfen ob Site-ID bereits existiert
        if (this.sites.find(s => s.id === newSite.id)) {
            throw new Error(`Site mit ID "${newSite.id}" existiert bereits`);
        }

        this.sites.push(newSite);
        this.saveSites();

        // Isolierten Speicherbereich erstellen
        this.createSiteStorage(newSite.id);

        console.log('[MultiSiteManager] Site added:', newSite);
        return newSite;
    }

    /**
     * Site entfernen
     */
    static removeSite(siteId) {
        if (siteId === this.currentSite) {
            throw new Error('Kann die aktive Site nicht löschen');
        }

        const index = this.sites.findIndex(s => s.id === siteId);
        if (index === -1) {
            throw new Error(`Site "${siteId}" nicht gefunden`);
        }

        this.sites.splice(index, 1);
        this.saveSites();

        // Site-Speicher löschen
        this.deleteSiteStorage(siteId);

        console.log('[MultiSiteManager] Site removed:', siteId);
    }

    /**
     * Site wechseln
     */
    static switchSite(siteId) {
        const site = this.sites.find(s => s.id === siteId);
        if (!site) {
            throw new Error(`Site "${siteId}" nicht gefunden`);
        }

        // Aktuelle Änderungen speichern
        if (window.adminPanel && window.adminPanel.changes > 0) {
            if (!confirm('Es gibt ungespeicherte Änderungen. Trotzdem wechseln?')) {
                return false;
            }
        }

        // Site-ID in URL-Parameter setzen und neu laden
        const url = new URL(window.location.href);
        url.searchParams.set('site', siteId);
        window.location.href = url.toString();

        return true;
    }

    /**
     * Site-ID generieren
     */
    static generateSiteId(name) {
        return name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
    }

    /**
     * Isolierten Speicherbereich für Site erstellen
     */
    static createSiteStorage(siteId) {
        const storageKey = `cms_site_${siteId}`;
        if (!localStorage.getItem(storageKey)) {
            localStorage.setItem(storageKey, JSON.stringify({
                content: {},
                team: { leadership: [], ceo: [], cooRegional: [] },
                locations: [],
                products: [],
                settings: {},
                structure: [],
                media: [],
                createdAt: new Date().toISOString()
            }));
        }
    }

    /**
     * Site-Speicher löschen
     */
    static deleteSiteStorage(siteId) {
        // Alle Keys für diese Site finden und löschen
        const prefix = `cms_site_${siteId}`;
        const keysToDelete = [];

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith(prefix) || key.includes(siteId)) {
                keysToDelete.push(key);
            }
        }

        keysToDelete.forEach(key => localStorage.removeItem(key));
    }

    /**
     * Site-Daten laden
     */
    static getSiteData(siteId = null) {
        const id = siteId || this.currentSite;
        const storageKey = `cms_site_${id}`;

        try {
            const data = localStorage.getItem(storageKey);
            return data ? JSON.parse(data) : null;
        } catch (e) {
            console.error('[MultiSiteManager] Error loading site data:', e);
            return null;
        }
    }

    /**
     * Site-Daten speichern
     */
    static saveSiteData(data, siteId = null) {
        const id = siteId || this.currentSite;
        const storageKey = `cms_site_${id}`;

        try {
            localStorage.setItem(storageKey, JSON.stringify({
                ...data,
                updatedAt: new Date().toISOString()
            }));

            // Site-Status aktualisieren
            const site = this.sites.find(s => s.id === id);
            if (site) {
                site.lastModified = new Date().toISOString();
                this.saveSites();
            }

            return true;
        } catch (e) {
            console.error('[MultiSiteManager] Error saving site data:', e);
            return false;
        }
    }

    /**
     * Site-Selector rendern
     */
    static renderSiteSelector(container) {
        const currentSiteData = this.sites.find(s => s.id === this.currentSite);

        container.innerHTML = `
            <div class="site-selector">
                <button class="site-selector-btn" onclick="MultiSiteManager.toggleDropdown()">
                    <span class="site-icon">${currentSiteData?.icon || 'IM'}</span>
                    <span class="site-name">${currentSiteData?.name || this.currentSite}</span>
                    <i class="fas fa-chevron-down dropdown-arrow"></i>
                </button>
                <div class="site-dropdown" id="siteDropdown">
                    <div class="site-dropdown-header">
                        <h4>Websites</h4>
                        <span class="site-count">${this.sites.length} Sites</span>
                    </div>
                    <div class="site-search">
                        <input type="text" placeholder="Suchen..." oninput="MultiSiteManager.filterSites(this.value)">
                    </div>
                    <div class="site-list" id="siteList">
                        ${this.sites.map(site => `
                            <div class="site-item ${site.id === this.currentSite ? 'active' : ''}"
                                 onclick="MultiSiteManager.switchSite('${site.id}')">
                                <span class="site-icon">${site.icon}</span>
                                <div class="site-info">
                                    <h5>${site.name}</h5>
                                    <span>${site.domain || site.id}</span>
                                </div>
                                <span class="site-status ${site.status}"></span>
                            </div>
                        `).join('')}
                    </div>
                    <div class="site-dropdown-footer">
                        <button class="btn-add-site" onclick="MultiSiteManager.showAddSiteModal()">
                            <i class="fas fa-plus"></i> Neue Site
                        </button>
                        <button class="btn-manage-sites" onclick="MultiSiteManager.showManageSitesModal()">
                            <i class="fas fa-cog"></i> Verwalten
                        </button>
                    </div>
                </div>
            </div>
        `;

        // Click-Outside Handler
        document.addEventListener('click', (e) => {
            const dropdown = document.getElementById('siteDropdown');
            const selector = container.querySelector('.site-selector');
            if (dropdown && !selector?.contains(e.target)) {
                dropdown.classList.remove('active');
            }
        });
    }

    /**
     * Dropdown umschalten
     */
    static toggleDropdown() {
        const dropdown = document.getElementById('siteDropdown');
        if (dropdown) {
            dropdown.classList.toggle('active');
        }
    }

    /**
     * Sites filtern
     */
    static filterSites(query) {
        const lowerQuery = query.toLowerCase();
        const items = document.querySelectorAll('.site-item');

        items.forEach(item => {
            const name = item.querySelector('h5')?.textContent.toLowerCase() || '';
            const domain = item.querySelector('.site-info span')?.textContent.toLowerCase() || '';

            if (name.includes(lowerQuery) || domain.includes(lowerQuery)) {
                item.style.display = 'flex';
            } else {
                item.style.display = 'none';
            }
        });
    }

    /**
     * Modal für neue Site anzeigen
     */
    static showAddSiteModal() {
        const modal = document.getElementById('modalOverlay');
        const modalTitle = document.getElementById('modalTitle');
        const modalBody = document.getElementById('modalBody');

        if (!modal) return;

        modalTitle.textContent = 'Neue Website hinzufügen';
        modalBody.innerHTML = `
            <div class="form-group">
                <label>Website-Name *</label>
                <input type="text" class="form-input" id="newSiteName" placeholder="z.B. Meine Firma GmbH">
            </div>
            <div class="form-group">
                <label>Domain</label>
                <input type="text" class="form-input" id="newSiteDomain" placeholder="z.B. meinefirma.de">
            </div>
            <div class="form-group">
                <label>Icon (2 Buchstaben)</label>
                <input type="text" class="form-input" id="newSiteIcon" maxlength="2" placeholder="z.B. MF">
            </div>
            <div class="form-group">
                <label>Passwort für Admin-Zugang *</label>
                <input type="password" class="form-input" id="newSitePassword" placeholder="Sicheres Passwort">
            </div>
        `;

        // Modal-Footer aktualisieren
        const modalFooter = modal.querySelector('.modal-footer');
        if (modalFooter) {
            modalFooter.innerHTML = `
                <button class="btn-secondary" onclick="adminPanel.closeModal()">Abbrechen</button>
                <button class="btn-primary" onclick="MultiSiteManager.createNewSite()">
                    <i class="fas fa-plus"></i> Site erstellen
                </button>
            `;
        }

        modal.classList.add('active');
    }

    /**
     * Neue Site erstellen
     */
    static createNewSite() {
        const name = document.getElementById('newSiteName')?.value?.trim();
        const domain = document.getElementById('newSiteDomain')?.value?.trim();
        const icon = document.getElementById('newSiteIcon')?.value?.trim();
        const password = document.getElementById('newSitePassword')?.value;

        if (!name) {
            AdminErrorHandler.showToast('error', 'Fehler', 'Bitte Website-Namen eingeben');
            return;
        }

        if (!password || password.length < 6) {
            AdminErrorHandler.showToast('error', 'Fehler', 'Passwort muss mindestens 6 Zeichen haben');
            return;
        }

        try {
            const newSite = this.addSite({
                name,
                domain,
                icon: icon || name.substring(0, 2).toUpperCase(),
                password // In Produktion: Passwort hashen!
            });

            // Modal schließen
            if (window.adminPanel) {
                window.adminPanel.closeModal();
            }

            AdminErrorHandler.showToast('success', 'Site erstellt', `"${name}" wurde erfolgreich erstellt`);

            // Dropdown neu rendern
            const container = document.getElementById('siteSelectorContainer');
            if (container) {
                this.renderSiteSelector(container);
            }

            // Zur neuen Site wechseln?
            if (confirm(`Möchtest du zur neuen Site "${name}" wechseln?`)) {
                this.switchSite(newSite.id);
            }

        } catch (error) {
            AdminErrorHandler.showToast('error', 'Fehler', error.message);
        }
    }

    /**
     * Sites verwalten Modal
     */
    static showManageSitesModal() {
        const modal = document.getElementById('modalOverlay');
        const modalTitle = document.getElementById('modalTitle');
        const modalBody = document.getElementById('modalBody');

        if (!modal) return;

        modalTitle.textContent = 'Websites verwalten';
        modalBody.innerHTML = `
            <div class="site-manage-list">
                ${this.sites.map(site => `
                    <div class="site-manage-item" data-site-id="${site.id}">
                        <span class="site-icon">${site.icon}</span>
                        <div class="site-manage-info">
                            <h5>${site.name}</h5>
                            <span>${site.domain || site.id}</span>
                            <small>Erstellt: ${new Date(site.createdAt).toLocaleDateString('de-DE')}</small>
                        </div>
                        <div class="site-manage-actions">
                            <button class="btn-sm" onclick="MultiSiteManager.editSite('${site.id}')" title="Bearbeiten">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn-sm" onclick="MultiSiteManager.exportSite('${site.id}')" title="Exportieren">
                                <i class="fas fa-download"></i>
                            </button>
                            ${site.id !== this.currentSite ? `
                                <button class="btn-sm danger" onclick="MultiSiteManager.confirmDeleteSite('${site.id}')" title="Löschen">
                                    <i class="fas fa-trash"></i>
                                </button>
                            ` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
            <style>
                .site-manage-list { display: flex; flex-direction: column; gap: 12px; }
                .site-manage-item { display: flex; align-items: center; gap: 12px; padding: 12px; background: var(--gray-100); border-radius: 8px; }
                .site-manage-item .site-icon { width: 40px; height: 40px; background: var(--navy); color: var(--gold); border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: bold; }
                .site-manage-info { flex: 1; }
                .site-manage-info h5 { margin: 0 0 4px; font-size: 14px; }
                .site-manage-info span { font-size: 12px; color: var(--gray-600); }
                .site-manage-info small { display: block; font-size: 11px; color: var(--gray-500); margin-top: 4px; }
                .site-manage-actions { display: flex; gap: 8px; }
                .site-manage-actions .btn-sm { width: 32px; height: 32px; border: none; border-radius: 6px; background: var(--white); cursor: pointer; }
                .site-manage-actions .btn-sm:hover { background: var(--navy); color: var(--gold); }
                .site-manage-actions .btn-sm.danger:hover { background: var(--danger); color: white; }
            </style>
        `;

        const modalFooter = modal.querySelector('.modal-footer');
        if (modalFooter) {
            modalFooter.innerHTML = `
                <button class="btn-secondary" onclick="adminPanel.closeModal()">Schließen</button>
            `;
        }

        modal.classList.add('active');
    }

    /**
     * Site exportieren
     */
    static exportSite(siteId) {
        const siteData = this.getSiteData(siteId);
        const siteInfo = this.sites.find(s => s.id === siteId);

        if (!siteData) {
            AdminErrorHandler.showToast('error', 'Fehler', 'Site-Daten nicht gefunden');
            return;
        }

        const exportData = {
            meta: {
                exportedAt: new Date().toISOString(),
                version: '1.0',
                siteId: siteId
            },
            site: siteInfo,
            data: siteData
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${siteId}-export-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);

        AdminErrorHandler.showToast('success', 'Exportiert', `Site "${siteInfo?.name}" wurde exportiert`);
    }

    /**
     * Site-Löschung bestätigen
     */
    static confirmDeleteSite(siteId) {
        const site = this.sites.find(s => s.id === siteId);
        if (!site) return;

        if (confirm(`ACHTUNG: Die Site "${site.name}" wird unwiderruflich gelöscht!\n\nAlle Daten gehen verloren. Fortfahren?`)) {
            if (confirm(`Bist du WIRKLICH sicher? Diese Aktion kann nicht rückgängig gemacht werden.`)) {
                try {
                    this.removeSite(siteId);
                    AdminErrorHandler.showToast('success', 'Gelöscht', `Site "${site.name}" wurde gelöscht`);

                    // Modal aktualisieren
                    this.showManageSitesModal();
                } catch (error) {
                    AdminErrorHandler.showToast('error', 'Fehler', error.message);
                }
            }
        }
    }
}

// ============================================
// AUTO-INIT
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    // Error Handler initialisieren
    AdminErrorHandler.init();

    // Multi-Site Manager initialisieren
    MultiSiteManager.init();

    // Site-ID aus URL lesen
    const urlParams = new URLSearchParams(window.location.search);
    const siteFromUrl = urlParams.get('site');
    if (siteFromUrl && siteFromUrl !== window.CMS_SITE_ID) {
        window.CMS_SITE_ID = siteFromUrl;
    }
});

// Globale Verfügbarkeit
window.AdminErrorHandler = AdminErrorHandler;
window.MultiSiteManager = MultiSiteManager;
