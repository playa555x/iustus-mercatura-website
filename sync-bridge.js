/**
 * Sync Bridge - Verbindet Website, Kunden-Admin und Dev-Admin
 * Ermöglicht bidirektionale Synchronisation aller Daten und Strukturen
 */

const SyncBridge = {
    // Storage Keys
    KEYS: {
        WEBSITE_DATA: 'iustus_website_content',
        ADMIN_DATA: 'iustus_admin_data',
        STRUCTURE: 'iustus_page_structure',
        SYNC_LOG: 'iustus_sync_log',
        DEV_PROJECTS: 'dev_admin_tool_data'
    },

    // Standard-Seitenstruktur
    defaultStructure: {
        sections: [
            { id: 'hero', type: 'hero', enabled: true, order: 0, config: { fullHeight: true, overlay: true } },
            { id: 'about', type: 'about', enabled: true, order: 1, config: { columns: 2, imagePosition: 'left' } },
            { id: 'ceo', type: 'ceo-message', enabled: true, order: 2, config: {} },
            { id: 'products', type: 'products', enabled: true, order: 3, config: { columns: 4, showSpecs: true } },
            { id: 'services', type: 'services', enabled: true, order: 4, config: { layout: 'timeline' } },
            { id: 'team', type: 'team', enabled: true, order: 5, config: { columns: 4, showBio: true } },
            { id: 'locations', type: 'locations', enabled: true, order: 6, config: { showMap: true } },
            { id: 'contact', type: 'contact', enabled: true, order: 7, config: { showForm: true } },
            { id: 'footer', type: 'footer', enabled: true, order: 8, config: {} }
        ],
        version: '1.0.0',
        lastModified: null
    },

    // ============================================
    // INITIALIZATION
    // ============================================
    init() {
        this.ensureStructureExists();
        this.setupStorageListener();
        console.log('[SyncBridge] Initialized');
    },

    ensureStructureExists() {
        if (!localStorage.getItem(this.KEYS.STRUCTURE)) {
            this.defaultStructure.lastModified = new Date().toISOString();
            localStorage.setItem(this.KEYS.STRUCTURE, JSON.stringify(this.defaultStructure));
        }
    },

    setupStorageListener() {
        // Reagiere auf Änderungen von anderen Tabs/Fenstern
        window.addEventListener('storage', (e) => {
            if (e.key === this.KEYS.ADMIN_DATA || e.key === this.KEYS.STRUCTURE) {
                this.onDataChanged(e.key, e.newValue);
            }
        });
    },

    onDataChanged(key, newValue) {
        const event = new CustomEvent('syncbridge:datachanged', {
            detail: { key, data: newValue ? JSON.parse(newValue) : null }
        });
        window.dispatchEvent(event);
    },

    // ============================================
    // DATA OPERATIONS
    // ============================================

    // Hole alle Website-Daten
    getWebsiteData() {
        const data = localStorage.getItem(this.KEYS.WEBSITE_DATA);
        return data ? JSON.parse(data) : null;
    },

    // Hole Admin-Daten
    getAdminData() {
        const data = localStorage.getItem(this.KEYS.ADMIN_DATA);
        return data ? JSON.parse(data) : null;
    },

    // Hole Seitenstruktur
    getStructure() {
        const data = localStorage.getItem(this.KEYS.STRUCTURE);
        if (data) {
            return JSON.parse(data);
        }
        this.ensureStructureExists();
        return JSON.parse(localStorage.getItem(this.KEYS.STRUCTURE));
    },

    // Speichere Seitenstruktur
    saveStructure(structure) {
        structure.lastModified = new Date().toISOString();
        localStorage.setItem(this.KEYS.STRUCTURE, JSON.stringify(structure));
        this.logSync('structure', 'save');
        this.triggerSync();

        // Speichere auch zum Server
        this.saveStructureToServer(structure);
    },

    // Speichere Struktur zum Server (persistente Speicherung)
    async saveStructureToServer(structure) {
        try {
            const response = await fetch('/api/data', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Source': 'admin_panel'
                },
                body: JSON.stringify({
                    ...this.getAdminData(),
                    pageStructure: structure
                })
            });

            if (response.ok) {
                console.log('[SyncBridge] Structure saved to server');
            } else {
                console.warn('[SyncBridge] Server save failed:', response.status);
            }
        } catch (error) {
            console.warn('[SyncBridge] Server save error:', error.message);
        }
    },

    // Sektion hinzufügen
    addSection(sectionType, afterId = null) {
        const structure = this.getStructure();
        const newSection = {
            id: `section_${Date.now()}`,
            type: sectionType,
            enabled: true,
            order: structure.sections.length,
            config: this.getDefaultConfigForType(sectionType)
        };

        if (afterId) {
            const index = structure.sections.findIndex(s => s.id === afterId);
            if (index > -1) {
                structure.sections.splice(index + 1, 0, newSection);
                // Neuberechnung der Order
                structure.sections.forEach((s, i) => s.order = i);
            } else {
                structure.sections.push(newSection);
            }
        } else {
            structure.sections.push(newSection);
        }

        this.saveStructure(structure);
        return newSection;
    },

    // Sektion entfernen
    removeSection(sectionId) {
        const structure = this.getStructure();
        const index = structure.sections.findIndex(s => s.id === sectionId);
        if (index > -1) {
            structure.sections.splice(index, 1);
            structure.sections.forEach((s, i) => s.order = i);
            this.saveStructure(structure);
            return true;
        }
        return false;
    },

    // Sektion verschieben
    moveSection(sectionId, direction) {
        const structure = this.getStructure();
        const index = structure.sections.findIndex(s => s.id === sectionId);
        if (index === -1) return false;

        const newIndex = direction === 'up' ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= structure.sections.length) return false;

        // Swap
        [structure.sections[index], structure.sections[newIndex]] =
        [structure.sections[newIndex], structure.sections[index]];

        // Update order
        structure.sections.forEach((s, i) => s.order = i);
        this.saveStructure(structure);
        return true;
    },

    // Sektionen neu anordnen (Drag & Drop)
    reorderSections(orderedIds) {
        const structure = this.getStructure();
        const reordered = [];

        orderedIds.forEach((id, index) => {
            const section = structure.sections.find(s => s.id === id);
            if (section) {
                section.order = index;
                reordered.push(section);
            }
        });

        structure.sections = reordered;
        this.saveStructure(structure);
    },

    // Sektion aktivieren/deaktivieren
    toggleSection(sectionId, enabled) {
        const structure = this.getStructure();
        const section = structure.sections.find(s => s.id === sectionId);
        if (section) {
            section.enabled = enabled;
            this.saveStructure(structure);
            return true;
        }
        return false;
    },

    // Sektion-Konfiguration aktualisieren
    updateSectionConfig(sectionId, config) {
        const structure = this.getStructure();
        const section = structure.sections.find(s => s.id === sectionId);
        if (section) {
            section.config = { ...section.config, ...config };
            this.saveStructure(structure);
            return true;
        }
        return false;
    },

    // Standard-Konfiguration für Sektionstyp
    getDefaultConfigForType(type) {
        const configs = {
            'hero': { fullHeight: true, overlay: true, overlayOpacity: 0.5, textAlign: 'center' },
            'about': { columns: 2, imagePosition: 'left', showFeatures: true },
            'ceo-message': { showQuote: true, showImage: true },
            'products': { columns: 4, showSpecs: true, showCategory: true },
            'services': { layout: 'timeline', columns: 3 },
            'team': { columns: 4, showBio: true, showSocial: true },
            'locations': { showMap: true, mapStyle: 'dark', columns: 3 },
            'contact': { showForm: true, showInfo: true, columns: 2 },
            'footer': { columns: 4, showSocial: true, showNewsletter: false },
            'gallery': { columns: 3, lightbox: true },
            'testimonials': { layout: 'slider', autoplay: true },
            'stats': { columns: 4, animated: true },
            'features': { columns: 3, showIcons: true },
            'cta': { style: 'banner', showButton: true },
            'divider': { style: 'line', height: '1px' },
            'spacer': { height: '60px' },
            'custom': {}
        };
        return configs[type] || {};
    },

    // ============================================
    // SYNC MIT DEV-ADMIN
    // ============================================

    // Hole Dev-Admin Projekte
    getDevProjects() {
        const data = localStorage.getItem(this.KEYS.DEV_PROJECTS);
        return data ? JSON.parse(data) : { projects: [] };
    },

    // Synchronisiere aktuelles Projekt mit Dev-Admin
    syncToDevAdmin(projectId = null) {
        const adminData = this.getAdminData();
        const structure = this.getStructure();
        const devData = this.getDevProjects();

        if (!adminData) return false;

        // Erstelle oder aktualisiere das Projekt im Dev-Admin
        const projectData = {
            id: projectId || Date.now(),
            name: adminData.settings?.siteName || 'Iustus Mercatura',
            client: 'Iustus Mercatura Holding Inc.',
            url: window.location.origin,
            path: window.location.pathname.replace(/\/[^/]*$/, ''),
            primaryColor: adminData.settings?.primaryColor || '#0a1628',
            accentColor: adminData.settings?.accentColor || '#c9a227',
            status: 'active',
            adminPassword: 'Blümchen88!',
            storageKey: this.KEYS.ADMIN_DATA,
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
            // Vollständige Admin-Daten
            adminData: {
                content: adminData.content,
                team: adminData.team,
                locations: adminData.locations,
                products: adminData.products,
                settings: adminData.settings
            },
            // Seitenstruktur für Visual Editor
            editorSections: structure.sections.map(s => ({
                id: s.id,
                type: s.type,
                config: s.config,
                enabled: s.enabled,
                content: this.getContentForSection(s.type, adminData)
            }))
        };

        // Finde existierendes Projekt oder füge neues hinzu
        const existingIndex = devData.projects.findIndex(p =>
            p.storageKey === this.KEYS.ADMIN_DATA || p.id === projectId
        );

        if (existingIndex > -1) {
            devData.projects[existingIndex] = { ...devData.projects[existingIndex], ...projectData };
        } else {
            devData.projects.push(projectData);
        }

        localStorage.setItem(this.KEYS.DEV_PROJECTS, JSON.stringify(devData));
        this.logSync('dev-admin', 'sync-to');
        return projectData.id;
    },

    // Synchronisiere von Dev-Admin zurück
    syncFromDevAdmin(projectId) {
        const devData = this.getDevProjects();
        const project = devData.projects.find(p => p.id === projectId);

        if (!project) return false;

        // Aktualisiere Admin-Daten
        if (project.adminData) {
            localStorage.setItem(this.KEYS.ADMIN_DATA, JSON.stringify(project.adminData));

            // Auch Website-Daten aktualisieren
            const websiteData = {
                content: project.adminData.content,
                team: project.adminData.team,
                locations: project.adminData.locations,
                products: project.adminData.products,
                settings: project.adminData.settings,
                lastUpdated: new Date().toISOString()
            };
            localStorage.setItem(this.KEYS.WEBSITE_DATA, JSON.stringify(websiteData));
        }

        // Aktualisiere Struktur wenn vorhanden
        if (project.editorSections) {
            const structure = this.getStructure();
            structure.sections = project.editorSections.map((s, i) => ({
                id: s.id,
                type: s.type,
                enabled: s.enabled !== false,
                order: i,
                config: s.config || {}
            }));
            this.saveStructure(structure);
        }

        this.logSync('dev-admin', 'sync-from');
        return true;
    },

    // Hole Content für eine bestimmte Sektion
    getContentForSection(type, adminData) {
        const content = adminData?.content || {};
        const mapping = {
            'hero': content.hero || {},
            'about': content.about || {},
            'ceo-message': content.ceo || {},
            'products': {
                ...content.products,
                items: adminData?.products || []
            },
            'services': content.services || {},
            'team': {
                ...content.team,
                members: [
                    ...(adminData?.team?.leadership || []),
                    ...(adminData?.team?.ceo || []),
                    ...(adminData?.team?.cooRegional || [])
                ]
            },
            'locations': {
                items: adminData?.locations || []
            },
            'contact': content.contact || {},
            'footer': content.footer || {}
        };
        return mapping[type] || {};
    },

    // ============================================
    // LOGGING & UTILITIES
    // ============================================

    logSync(target, action) {
        const log = JSON.parse(localStorage.getItem(this.KEYS.SYNC_LOG) || '[]');
        log.push({
            timestamp: new Date().toISOString(),
            target,
            action,
            source: window.location.pathname
        });
        // Behalte nur die letzten 100 Einträge
        if (log.length > 100) log.shift();
        localStorage.setItem(this.KEYS.SYNC_LOG, JSON.stringify(log));
    },

    triggerSync() {
        // Dispatch event für andere Komponenten
        window.dispatchEvent(new CustomEvent('syncbridge:updated'));
    },

    // Export für Backup
    exportAll() {
        return {
            adminData: this.getAdminData(),
            structure: this.getStructure(),
            websiteData: this.getWebsiteData(),
            exportDate: new Date().toISOString(),
            version: '1.0.0'
        };
    },

    // Import von Backup
    importAll(data) {
        if (data.adminData) {
            localStorage.setItem(this.KEYS.ADMIN_DATA, JSON.stringify(data.adminData));
        }
        if (data.structure) {
            localStorage.setItem(this.KEYS.STRUCTURE, JSON.stringify(data.structure));
        }
        if (data.websiteData) {
            localStorage.setItem(this.KEYS.WEBSITE_DATA, JSON.stringify(data.websiteData));
        }
        this.triggerSync();
    }
};

// Auto-Initialize
if (typeof window !== 'undefined') {
    window.SyncBridge = SyncBridge;
    SyncBridge.init();
}
