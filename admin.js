/**
 * Admin Panel - Iustus Mercatura
 * Content Management System - API-basiert
 * Nutzt CmsApi für alle Datenoperationen
 */

// ============================================
// CONFIGURATION
// ============================================
// Auto-detect API URL based on current hostname
const getApiUrl = () => {
    // If explicitly set, use that
    if (window.CMS_API_URL) return window.CMS_API_URL;

    // On localhost, use localhost
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return `http://${window.location.host}`;
    }

    // On production, use same origin (relative URLs work)
    return window.location.origin;
};

const ADMIN_CONFIG = {
    API_URL: getApiUrl(),
    SITE_ID: window.CMS_SITE_ID || 'iustus-mercatura',
    FALLBACK_TO_LOCALSTORAGE: true,
    STORAGE_KEY: 'iustus_admin_data',
    DEBUG: window.location.hostname === 'localhost'
};

// ============================================
// EMPTY DATA STRUCTURE
// ============================================
const emptyDataStructure = {
    content: {
        hero: {
            label: '', titleLine1: '', titleLine2: '', titleLine3: '',
            description: '', button1: '', button2: '',
            stat1Value: '', stat1Suffix: '', stat1Label: '',
            stat2Value: '', stat2Suffix: '', stat2Label: '',
            stat3Value: '', stat3Suffix: '', stat3Label: ''
        },
        about: {
            sectionLabel: '', title: '', leadText: '', description: '',
            feature1Title: '', feature1Desc: '',
            feature2Title: '', feature2Desc: '',
            feature3Title: '', feature3Desc: '',
            cardYear: '', cardTitle: '', cardDesc: ''
        },
        ceo: {
            sectionLabel: '', title: '', name: '', role: '', quote: '', message: ''
        },
        products: { sectionLabel: '', title: '', description: '' },
        services: { sectionLabel: '', title: '', description: '' },
        contact: { sectionLabel: '', title: '', description: '', email: '', phone: '' },
        footer: { tagline: '', copyright: '' }
    },
    team: { leadership: [], ceo: [], cooRegional: [] },
    locations: [],
    products: [],
    settings: {
        siteName: '', tagline: '',
        primaryColor: '#0a1628', accentColor: '#c9a227',
        contactEmail: '', contactPhone: '',
        linkedin: '', instagram: '', facebook: '', twitter: '',
        defaultLanguage: 'en'
    }
};

const defaultData = emptyDataStructure;

// ============================================
// ADMIN PANEL CLASS
// ============================================
class AdminPanel {
    constructor() {
        this.data = null;
        this.changes = 0;
        this.changesList = []; // Track change descriptions for tooltip
        this.initialized = false;
        this.draggedSection = null;
        this.apiAvailable = false;
        this.siteId = ADMIN_CONFIG.SITE_ID;
        this.liveSync = null;

        // Undo/Redo System
        this.undoStack = [];
        this.redoStack = [];
        this.maxUndoSteps = 50;
    }

    async init() {
        if (this.initialized) return;

        // CmsApi initialisieren
        if (window.CmsApi) {
            CmsApi.init({
                baseUrl: ADMIN_CONFIG.API_URL,
                siteId: this.siteId
            });
        }

        // Daten laden (API oder Fallback)
        await this.loadData();

        // Check if data is empty
        if (this.isDataEmpty()) {
            this.showImportFromWebsitePrompt();
        }

        this.bindNavigation();
        this.bindTabs();
        this.bindFormInputs();
        this.bindAddButtons();
        this.bindStructureEditor();
        this.renderAll();
        this.renderStructure();
        this.initVisualBuilder();
        this.initMediathek();
        this.updateStats();
        this.initialized = true;

        // Listen for sync events
        window.addEventListener('syncbridge:updated', () => {
            this.renderStructure();
            this.renderVisualBuilder();
        });

        // Initialize Live Sync
        this.initLiveSync();

        // Initialize session timer
        this.initSessionTimer();

        // Auto-save reminder
        window.addEventListener('beforeunload', (e) => {
            if (this.changes > 0) {
                e.preventDefault();
                e.returnValue = 'Du hast ungespeicherte Änderungen. Wirklich verlassen?';
            }
        });

        this.log('Admin Panel initialized', { apiAvailable: this.apiAvailable, siteId: this.siteId });
    }

    log(...args) {
        if (ADMIN_CONFIG.DEBUG) {
            console.log('[AdminPanel]', ...args);
        }
    }

    // ============================================
    // AUTHENTICATION
    // ============================================
    async login(password) {
        // Versuche API Login
        if (window.CmsApi) {
            try {
                const result = await CmsApi.loginSite(this.siteId, password);
                if (result.token) {
                    sessionStorage.setItem('iustus_admin_auth', 'true');
                    sessionStorage.setItem('iustus_admin_token', result.token);
                    this.apiAvailable = true;
                    return { success: true };
                }
            } catch (error) {
                this.log('API login failed, trying fallback:', error.message);
            }
        }

        // Fallback: Lokale Passwort-Prüfung
        if (password === 'Blümchen88!') {
            sessionStorage.setItem('iustus_admin_auth', 'true');
            return { success: true };
        }

        return { success: false, error: 'Falsches Passwort' };
    }

    logout() {
        if (window.CmsApi) {
            CmsApi.logout();
        }
        sessionStorage.removeItem('iustus_admin_auth');
        sessionStorage.removeItem('iustus_admin_token');
        window.location.reload();
    }

    // ============================================
    // DATA MANAGEMENT
    // ============================================
    async loadData() {
        // Initialize with default structure
        this.data = JSON.parse(JSON.stringify(defaultData));

        // 1. Lade Content direkt aus der Website (extrahiert aus HTML)
        try {
            const contentResponse = await fetch('/api/content');
            if (contentResponse.ok) {
                const contentData = await contentResponse.json();
                if (contentData.content) {
                    this.data.content = this.mergeDeep(this.data.content, contentData.content);
                }
                this.log('Content data loaded from website HTML');
            }
        } catch (error) {
            this.log('Content API load failed:', error.message);
        }

        // 2. Lade Team-Daten direkt aus der Website (extrahiert aus HTML)
        try {
            const teamResponse = await fetch('/api/team');
            if (teamResponse.ok) {
                const teamData = await teamResponse.json();
                if (teamData.team) {
                    this.data.team = teamData.team;
                }
                this.log('Team data loaded from website HTML');
            }
        } catch (error) {
            this.log('Team API load failed:', error.message);
        }

        // 3. Lade Locations direkt aus der Website (extrahiert aus HTML)
        try {
            const locationsResponse = await fetch('/api/locations');
            if (locationsResponse.ok) {
                const locationsData = await locationsResponse.json();
                if (locationsData.locations) {
                    this.data.locations = locationsData.locations;
                }
                this.log('Locations data loaded from website HTML');
            }
        } catch (error) {
            this.log('Locations API load failed:', error.message);
        }

        // 4. Lade zusätzliche Daten von /api/data (products, settings, imageAssignments)
        try {
            const dataResponse = await fetch('/api/data');
            if (dataResponse.ok) {
                const apiData = await dataResponse.json();
                if (apiData.products) this.data.products = apiData.products;
                if (apiData.settings) this.data.settings = { ...this.data.settings, ...apiData.settings };
                if (apiData.imageAssignments) this.data.imageAssignments = apiData.imageAssignments;
                this.log('Additional data loaded from API');
            }
        } catch (error) {
            this.log('Data API load failed:', error.message);
        }

        // 4b. Lade zentrale Settings aus /api/settings (SMTP, WhatsApp, Contact)
        try {
            const settingsResponse = await fetch('/api/settings');
            if (settingsResponse.ok) {
                const settingsData = await settingsResponse.json();
                const centralSettings = settingsData.settings || settingsData;

                // Mapping von zentralen Settings zu Admin-Panel Settings
                if (centralSettings.contact) {
                    if (centralSettings.contact.whatsapp?.number) {
                        this.data.settings.whatsappNumber = centralSettings.contact.whatsapp.number;
                    }
                    if (centralSettings.contact.whatsapp?.message) {
                        this.data.settings.whatsappMessage = centralSettings.contact.whatsapp.message;
                    }
                    if (centralSettings.contact.phone) {
                        this.data.settings.contactPhone = centralSettings.contact.phone;
                    }
                    if (centralSettings.contact.email) {
                        this.data.settings.contactEmail = centralSettings.contact.email;
                    }
                }
                if (centralSettings.social) {
                    if (centralSettings.social.linkedin) this.data.settings.socialLinkedin = centralSettings.social.linkedin;
                    if (centralSettings.social.twitter) this.data.settings.socialTwitter = centralSettings.social.twitter;
                    if (centralSettings.social.facebook) this.data.settings.socialFacebook = centralSettings.social.facebook;
                    if (centralSettings.social.instagram) this.data.settings.socialInstagram = centralSettings.social.instagram;
                }
                if (centralSettings.email?.notifications) {
                    // Nur setzen wenn nicht bereits von contact.email gesetzt
                    if (centralSettings.email.notifications.contactFormTo && !this.data.settings.contactEmail) {
                        this.data.settings.contactEmail = centralSettings.email.notifications.contactFormTo;
                    }
                    if (centralSettings.email.notifications.quoteRequestTo) {
                        this.data.settings.quoteEmail = centralSettings.email.notifications.quoteRequestTo;
                    }
                    if (centralSettings.email.notifications.bookingTo) {
                        this.data.settings.bookingEmail = centralSettings.email.notifications.bookingTo;
                    }
                }
                // Load SMTP settings
                if (centralSettings.email?.smtp) {
                    const smtp = centralSettings.email.smtp;
                    if (smtp.host) this.data.settings.smtpHost = smtp.host;
                    if (smtp.port) this.data.settings.smtpPort = smtp.port;
                    if (smtp.user) this.data.settings.smtpUser = smtp.user;
                    // Don't load password - it's masked, show placeholder instead
                    if (smtp.passwordSet) this.data.settings.smtpPasswordSet = true;
                    if (smtp.from) this.data.settings.smtpFrom = smtp.from;
                    if (smtp.fromName) this.data.settings.smtpFromName = smtp.fromName;
                    if (smtp.secure) {
                        this.data.settings.smtpSecure = 'ssl';
                    } else if (smtp.starttls) {
                        this.data.settings.smtpSecure = 'starttls';
                    }
                }
                this.centralSettings = centralSettings;
                this.log('Central settings loaded from /api/settings');
            }
        } catch (error) {
            this.log('Central settings API load failed:', error.message);
        }

        // 5. Fallback zu LocalStorage für andere Daten (nur wenn keine API-Daten)
        if (ADMIN_CONFIG.FALLBACK_TO_LOCALSTORAGE) {
            const saved = localStorage.getItem(ADMIN_CONFIG.STORAGE_KEY);
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    // Settings aus LocalStorage ergänzen, nicht überschreiben
                    if (parsed.settings && !this.data.settings.siteName) {
                        this.data.settings = this.mergeDeep(this.data.settings, parsed.settings);
                    }
                    this.log('Settings loaded from LocalStorage (fallback)');
                } catch (e) {
                    this.log('LocalStorage parse error:', e);
                }
            }
        }

        return this.data;
    }

    // Transform API-Datenformat zu lokalem Format
    transformApiToLocal(apiData) {
        return {
            content: apiData.content || emptyDataStructure.content,
            team: apiData.team || emptyDataStructure.team,
            locations: apiData.locations || [],
            products: apiData.products || [],
            settings: {
                siteName: apiData.name || '',
                tagline: apiData.config?.tagline || '',
                primaryColor: apiData.config?.primaryColor || '#0a1628',
                accentColor: apiData.config?.accentColor || '#c9a227',
                contactEmail: apiData.config?.contact?.email || '',
                contactPhone: apiData.config?.contact?.phone || '',
                linkedin: apiData.config?.social?.linkedin || '',
                instagram: apiData.config?.social?.instagram || '',
                facebook: apiData.config?.social?.facebook || '',
                twitter: apiData.config?.social?.twitter || '',
                defaultLanguage: 'de'
            }
        };
    }

    // Transform lokales Format zu API-Format
    transformLocalToApi(localData) {
        return {
            content: localData.content,
            team: localData.team,
            products: localData.products,
            locations: localData.locations,
            config: {
                primaryColor: localData.settings?.primaryColor,
                accentColor: localData.settings?.accentColor,
                contact: {
                    email: localData.settings?.contactEmail,
                    phone: localData.settings?.contactPhone
                },
                social: {
                    linkedin: localData.settings?.linkedin,
                    instagram: localData.settings?.instagram,
                    facebook: localData.settings?.facebook,
                    twitter: localData.settings?.twitter
                }
            }
        };
    }

    async saveData() {
        try {
            // 1. Direkt zum lokalen Server speichern
            try {
                const response = await fetch('/api/data', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Source': 'admin_panel'
                    },
                    body: JSON.stringify({
                        ...this.data,
                        lastUpdated: new Date().toISOString()
                    })
                });

                if (response.ok) {
                    this.log('Data saved to server');
                    this.apiAvailable = true;
                } else {
                    throw new Error(`Server responded with ${response.status}`);
                }
            } catch (apiError) {
                this.log('Server save failed:', apiError.message);
                this.apiAvailable = false;
            }

            // 1b. Sync zentrale Settings zu /api/settings
            await this.syncCentralSettings();

            // 2. LocalStorage als Backup/Fallback
            if (ADMIN_CONFIG.FALLBACK_TO_LOCALSTORAGE) {
                localStorage.setItem(ADMIN_CONFIG.STORAGE_KEY, JSON.stringify(this.data));
                localStorage.setItem('iustus_admin_lastSaved', new Date().toISOString());
            }

            // 3. Website-Format für direkten Zugriff
            this.publishToWebsite();

            this.changes = 0;
            this.changesList = [];
            this.updateChangeCount();
            this.updateChangesTooltip();
            this.updateLastSaved();
            this.showToast('success', 'Gespeichert', 'Alle Änderungen wurden gespeichert.');

        } catch (error) {
            console.error('Error saving data:', error);
            this.showToast('error', 'Fehler', 'Speichern fehlgeschlagen: ' + error.message);
        }
    }

    // Sync Settings to central settings.json via /api/settings
    async syncCentralSettings() {
        try {
            const centralSettings = {
                contact: {
                    whatsapp: {
                        number: this.data.settings.whatsappNumber || '',
                        message: this.data.settings.whatsappMessage || 'Hello, I would like to inquire about your products'
                    },
                    phone: this.data.settings.contactPhone || '',
                    email: this.data.settings.contactEmail || '',
                    addresses: {
                        headquarters: this.data.settings.address || ''
                    }
                },
                social: {
                    linkedin: this.data.settings.socialLinkedin || this.data.settings.linkedin || '',
                    twitter: this.data.settings.socialTwitter || this.data.settings.twitter || '',
                    facebook: this.data.settings.socialFacebook || this.data.settings.facebook || '',
                    instagram: this.data.settings.socialInstagram || this.data.settings.instagram || ''
                },
                email: {
                    smtp: {
                        host: this.data.settings.smtpHost || 'smtp.office365.com',
                        port: parseInt(this.data.settings.smtpPort) || 587,
                        secure: this.data.settings.smtpSecure === 'ssl',
                        starttls: this.data.settings.smtpSecure === 'starttls',
                        user: this.data.settings.smtpUser || '',
                        password: this.data.settings.smtpPassword || '',
                        from: this.data.settings.smtpFrom || '',
                        fromName: this.data.settings.smtpFromName || 'Iustus Mercatura'
                    },
                    notifications: {
                        contactFormTo: this.data.settings.contactEmail || '',
                        quoteRequestTo: this.data.settings.quoteEmail || '',
                        bookingTo: this.data.settings.bookingEmail || ''
                    }
                }
            };

            const response = await fetch('/api/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(centralSettings)
            });

            if (response.ok) {
                this.log('Central settings synced to /api/settings');
            } else {
                this.log('Failed to sync central settings');
            }
        } catch (error) {
            this.log('Central settings sync error:', error.message);
        }
    }

    // Test SMTP Connection
    async testSmtpConnection() {
        const host = this.data.settings.smtpHost;
        const port = this.data.settings.smtpPort || 587;
        const user = this.data.settings.smtpUser;
        const password = this.data.settings.smtpPassword;

        if (!host || !user || !password) {
            this.showToast('warning', 'Fehlende Daten', 'Bitte füllen Sie alle SMTP-Felder aus.');
            return;
        }

        this.showToast('info', 'Teste...', 'SMTP-Verbindung wird getestet...');

        try {
            const response = await fetch('/api/email/test-connection', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    host,
                    port: parseInt(port),
                    secure: this.data.settings.smtpSecure === 'ssl',
                    user,
                    password,
                    from: this.data.settings.smtpFrom || user
                })
            });

            const result = await response.json();

            if (result.success) {
                this.showToast('success', 'Verbindung OK', 'SMTP-Server ist erreichbar und Anmeldedaten sind korrekt.');
            } else {
                this.showToast('error', 'Verbindung fehlgeschlagen', result.error || 'SMTP-Verbindung konnte nicht hergestellt werden.');
            }
        } catch (error) {
            this.showToast('error', 'Fehler', 'Verbindungstest fehlgeschlagen: ' + error.message);
        }
    }

    // Send Test Email
    async sendTestEmail() {
        const to = this.data.settings.contactEmail || this.data.settings.smtpUser;

        if (!to) {
            this.showToast('warning', 'Keine E-Mail', 'Bitte geben Sie eine Kontakt-E-Mail oder SMTP-Benutzer an.');
            return;
        }

        this.showToast('info', 'Sende...', 'Test-E-Mail wird gesendet...');

        try {
            const response = await fetch('/api/email/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to,
                    subject: 'Test E-Mail - Iustus Mercatura Admin',
                    html: `
                        <h2>Test E-Mail erfolgreich!</h2>
                        <p>Diese E-Mail wurde vom Iustus Mercatura Admin Panel gesendet.</p>
                        <p>Wenn Sie diese E-Mail erhalten, ist Ihre SMTP-Konfiguration korrekt.</p>
                        <hr>
                        <p style="color: #666; font-size: 12px;">Gesendet am: ${new Date().toLocaleString('de-DE')}</p>
                    `
                })
            });

            const result = await response.json();

            if (result.success) {
                this.showToast('success', 'E-Mail gesendet', `Test-E-Mail wurde an ${to} gesendet.`);
            } else {
                this.showToast('error', 'Senden fehlgeschlagen', result.error || 'E-Mail konnte nicht gesendet werden.');
            }
        } catch (error) {
            this.showToast('error', 'Fehler', 'E-Mail senden fehlgeschlagen: ' + error.message);
        }
    }

    publishToWebsite() {
        // Website-kompatibles Format für LocalStorage
        const websiteData = {
            content: this.data.content,
            team: this.data.team,
            locations: this.data.locations,
            products: this.data.products,
            settings: this.data.settings,
            lastUpdated: new Date().toISOString()
        };
        localStorage.setItem('iustus_website_content', JSON.stringify(websiteData));

        // SyncBridge Event und Structure-Speicherung
        if (window.SyncBridge) {
            SyncBridge.triggerSync();
            // Speichere auch die Struktur zum Server
            const structure = SyncBridge.getStructure();
            if (structure) {
                SyncBridge.saveStructureToServer(structure);
            }
        }
    }

    mergeDeep(target, source) {
        for (const key in source) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                if (!target[key]) target[key] = {};
                this.mergeDeep(target[key], source[key]);
            } else {
                target[key] = source[key];
            }
        }
        return target;
    }

    isDataEmpty() {
        return !this.data.content?.hero?.titleLine1 &&
               this.data.team?.leadership?.length === 0 &&
               this.data.locations?.length === 0;
    }

    showImportFromWebsitePrompt() {
        const shouldImport = confirm(
            'Keine Daten gefunden.\n\n' +
            'Möchtest du die Daten von der Website (index.html) importieren?\n\n' +
            'Klicke OK um die aktuellen Website-Inhalte zu laden.'
        );

        if (shouldImport) {
            this.parseWebsiteData();
        }
    }

    async parseWebsiteData() {
        try {
            const response = await fetch('index.html');
            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            // Hero Section
            this.data.content.hero = {
                label: this.getTextContent(doc, '.hero-label') || '',
                titleLine1: this.getTextContent(doc, '.hero-title .title-line:nth-child(1)') || '',
                titleLine2: this.getTextContent(doc, '.hero-title .title-line:nth-child(2)') || '',
                titleLine3: this.getTextContent(doc, '.hero-title .title-line:nth-child(3)') || '',
                description: this.getTextContent(doc, '.hero-description') || '',
                button1: this.getTextContent(doc, '.hero-buttons .btn-primary') || '',
                button2: this.getTextContent(doc, '.hero-buttons .btn-secondary') || '',
                stat1Value: this.getTextContent(doc, '.hero-stat:nth-child(1) .stat-value') || '',
                stat1Label: this.getTextContent(doc, '.hero-stat:nth-child(1) .stat-label') || '',
                stat2Value: this.getTextContent(doc, '.hero-stat:nth-child(2) .stat-value') || '',
                stat2Label: this.getTextContent(doc, '.hero-stat:nth-child(2) .stat-label') || '',
                stat3Value: this.getTextContent(doc, '.hero-stat:nth-child(3) .stat-value') || '',
                stat3Label: this.getTextContent(doc, '.hero-stat:nth-child(3) .stat-label') || ''
            };

            // About Section
            this.data.content.about = {
                sectionLabel: this.getTextContent(doc, '#about .section-label') || '',
                title: this.getTextContent(doc, '#about .section-title') || '',
                leadText: this.getTextContent(doc, '#about .about-text .lead') || '',
                description: this.getTextContent(doc, '#about .about-text p:not(.lead)') || '',
                feature1Title: this.getTextContent(doc, '.about-features .feature-item:nth-child(1) h4') || '',
                feature1Desc: this.getTextContent(doc, '.about-features .feature-item:nth-child(1) p') || '',
                feature2Title: this.getTextContent(doc, '.about-features .feature-item:nth-child(2) h4') || '',
                feature2Desc: this.getTextContent(doc, '.about-features .feature-item:nth-child(2) p') || '',
                feature3Title: this.getTextContent(doc, '.about-features .feature-item:nth-child(3) h4') || '',
                feature3Desc: this.getTextContent(doc, '.about-features .feature-item:nth-child(3) p') || ''
            };

            // CEO Section
            this.data.content.ceo = {
                sectionLabel: this.getTextContent(doc, '#ceo-message .section-label') || '',
                title: this.getTextContent(doc, '#ceo-message .section-title') || '',
                name: this.getTextContent(doc, '.ceo-name') || '',
                role: this.getTextContent(doc, '.ceo-role') || '',
                quote: this.getTextContent(doc, '.ceo-quote') || '',
                message: this.getTextContent(doc, '.ceo-message-text') || ''
            };

            // Contact Section
            this.data.content.contact = {
                sectionLabel: this.getTextContent(doc, '#contact .section-label') || '',
                title: this.getTextContent(doc, '#contact .section-title') || '',
                description: this.getTextContent(doc, '#contact .section-description') || '',
                email: this.getTextContent(doc, '.contact-item[href^="mailto:"]')?.replace('mailto:', '') || '',
                phone: this.getTextContent(doc, '.contact-item[href^="tel:"]')?.replace('tel:', '') || ''
            };

            // Team Members
            this.data.team = { leadership: [], ceo: [], cooRegional: [] };
            doc.querySelectorAll('.team-member').forEach((member, index) => {
                const memberData = {
                    id: index + 1,
                    name: this.getTextContent(member, '.member-name') || '',
                    role: this.getTextContent(member, '.member-role') || '',
                    description: this.getTextContent(member, '.member-bio') || '',
                    image: member.querySelector('.member-image img')?.src || '',
                    initials: this.getInitials(this.getTextContent(member, '.member-name') || ''),
                    linkedin: member.querySelector('a[href*="linkedin"]')?.href || ''
                };

                const role = memberData.role.toLowerCase();
                if (role.includes('ceo') && role.includes('founder')) {
                    this.data.team.leadership.push(memberData);
                } else if (role.includes('ceo')) {
                    this.data.team.ceo.push(memberData);
                } else {
                    this.data.team.cooRegional.push(memberData);
                }
            });

            // Locations
            this.data.locations = [];
            doc.querySelectorAll('.location-card').forEach((loc, index) => {
                this.data.locations.push({
                    id: index + 1,
                    country: this.getTextContent(loc, '.location-country') || '',
                    city: this.getTextContent(loc, '.location-city') || '',
                    type: this.getTextContent(loc, '.location-type') || '',
                    address: this.getTextContent(loc, '.location-address') || '',
                    flag: loc.querySelector('.location-flag')?.textContent || ''
                });
            });

            // Products
            this.data.products = [];
            doc.querySelectorAll('.product-card').forEach((prod, index) => {
                this.data.products.push({
                    id: index + 1,
                    name: this.getTextContent(prod, '.product-name') || '',
                    category: this.getTextContent(prod, '.product-category') || '',
                    description: this.getTextContent(prod, '.product-description') || '',
                    image: prod.querySelector('.product-image img')?.src || ''
                });
            });

            // Footer
            this.data.content.footer = {
                tagline: this.getTextContent(doc, '.footer-tagline') || '',
                copyright: this.getTextContent(doc, '.footer-copyright') || ''
            };

            await this.saveData();
            this.renderAll();
            this.showToast('success', 'Importiert', 'Website-Daten wurden erfolgreich geladen.');

        } catch (error) {
            console.error('Error parsing website:', error);
            this.showToast('error', 'Fehler', 'Konnte Website nicht parsen: ' + error.message);
        }
    }

    getTextContent(doc, selector) {
        const el = doc.querySelector(selector);
        return el ? el.textContent.trim() : '';
    }

    getInitials(name) {
        return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }

    exportData() {
        const dataStr = JSON.stringify(this.data, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `admin-backup-${new Date().toISOString().slice(0,10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        this.showToast('success', 'Exportiert', 'Backup wurde heruntergeladen.');
    }

    importData(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const imported = JSON.parse(e.target.result);
                this.data = this.mergeDeep(JSON.parse(JSON.stringify(defaultData)), imported);
                await this.saveData();
                this.renderAll();
                this.updateStats();
                this.showToast('success', 'Importiert', 'Daten wurden erfolgreich importiert.');
            } catch (err) {
                this.showToast('error', 'Fehler', 'Ungültige JSON-Datei.');
            }
        };
        reader.readAsText(file);
        event.target.value = '';
    }

    async resetToDefaults() {
        if (confirm('Wirklich alle Inhalte zurücksetzen? Dies kann nicht rückgängig gemacht werden.')) {
            this.data = JSON.parse(JSON.stringify(defaultData));
            await this.saveData();
            this.renderAll();
            this.updateStats();
            this.showToast('info', 'Zurückgesetzt', 'Alle Inhalte wurden zurückgesetzt.');
        }
    }

    // ============================================
    // NAVIGATION
    // ============================================
    bindNavigation() {
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const section = btn.dataset.section;
                this.navigateTo(section);
            });
        });

        document.getElementById('saveAllBtn')?.addEventListener('click', () => {
            this.saveData();
        });

        document.getElementById('logoutBtn')?.addEventListener('click', () => {
            this.logout();
        });
    }

    navigateTo(section) {
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.section === section);
        });

        document.querySelectorAll('.admin-section').forEach(sec => {
            sec.classList.toggle('active', sec.id === `section-${section}`);
        });

        // Update mobile navigation state
        this.updateMobileNavState(section);

        // Disable/Enable hover trigger system based on section
        const iframe = document.getElementById('websitePreview');
        if (iframe && iframe.contentDocument) {
            if (section === 'structure') {
                // Disable hover effects when entering structure section
                iframe.contentDocument.body.classList.add('admin-edit-mode');
                if (iframe.contentWindow && iframe.contentWindow.hoverTriggerSystem) {
                    iframe.contentWindow.hoverTriggerSystem.setEnabled(false);
                }
                console.log('Hover-Trigger deaktiviert (Struktur-Ansicht)');
            } else {
                // Re-enable hover effects when leaving structure section
                iframe.contentDocument.body.classList.remove('admin-edit-mode');
                if (iframe.contentWindow && iframe.contentWindow.hoverTriggerSystem) {
                    iframe.contentWindow.hoverTriggerSystem.setEnabled(true);
                }
                console.log('Hover-Trigger aktiviert');
            }
        }
    }

    // Mobile Navigation Functions
    toggleMobileNav() {
        const dropdown = document.getElementById('mobileNavDropdown');
        if (dropdown) {
            dropdown.classList.toggle('open');
        }
    }

    navigateToMobile(section) {
        // Navigate to the section
        this.navigateTo(section);

        // Close the dropdown
        const dropdown = document.getElementById('mobileNavDropdown');
        if (dropdown) {
            dropdown.classList.remove('open');
        }
    }

    updateMobileNavState(section) {
        // Update active state in mobile nav items
        document.querySelectorAll('.mobile-nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.section === section);
        });

        // Update dropdown toggle text and icon
        const activeItem = document.querySelector(`.mobile-nav-item[data-section="${section}"]`);
        if (activeItem) {
            const icon = activeItem.querySelector('i');
            const text = activeItem.textContent.trim();

            const mobileNavIcon = document.getElementById('mobileNavIcon');
            const mobileNavText = document.getElementById('mobileNavText');

            if (mobileNavIcon && icon) {
                mobileNavIcon.className = icon.className;
            }
            if (mobileNavText) {
                mobileNavText.textContent = text;
            }
        }
    }

    // ============================================
    // TABS
    // ============================================
    bindTabs() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab;
                const parent = btn.closest('.content-tabs') || btn.closest('.card-type-tabs');

                parent.querySelectorAll('.tab-btn, .card-tab').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                const tabContents = btn.closest('.admin-section').querySelectorAll('.tab-content');
                tabContents.forEach(content => {
                    content.classList.toggle('active', content.id === `tab-${tab}`);
                });
            });
        });

        document.querySelectorAll('.card-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                const type = btn.dataset.cardtype;
                document.querySelectorAll('.card-tab').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentCardType = type;
                this.renderCards();
            });
        });
    }

    // ============================================
    // FORM INPUTS
    // ============================================
    bindFormInputs() {
        document.querySelectorAll('[data-field]').forEach(input => {
            input.addEventListener('input', (e) => {
                this.updateField(e.target.dataset.field, e.target.value);
            });
        });

        document.querySelectorAll('[data-setting]').forEach(input => {
            input.addEventListener('input', (e) => {
                this.updateSetting(e.target.dataset.setting, e.target.value);
            });
        });

        // Sync color inputs with text inputs
        document.querySelectorAll('.form-color[data-setting]').forEach(colorInput => {
            const settingKey = colorInput.dataset.setting;
            const textInput = document.querySelector(`[data-color-text="${settingKey}"]`);

            if (textInput) {
                colorInput.addEventListener('input', (e) => {
                    textInput.value = e.target.value;
                    this.updateSetting(settingKey, e.target.value);
                });

                textInput.addEventListener('input', (e) => {
                    const value = e.target.value;
                    if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
                        colorInput.value = value;
                        this.updateSetting(settingKey, value);
                    }
                });
            }
        });
    }

    // Default color values
    defaultColors = {
        colorPrimaryNavy: '#0a1628',
        colorPrimaryNavyLight: '#152238',
        colorAccentGold: '#c9a227',
        colorAccentGoldLight: '#e8c547',
        colorAccentGoldDark: '#9a7b1c',
        colorSugarWhite: '#fafafa',
        colorSugarCream: '#f5f0e8',
        colorGreenAgriculture: '#4a7c59',
        colorBrownEarth: '#8b6914',
        colorBlueOcean: '#1e4d6b',
        colorTextDark: '#1a1a1a',
        colorTextGray: '#6b7280',
        colorTextLight: '#9ca3af'
    };

    // Map settings keys to CSS variable names
    colorVariableMap = {
        colorPrimaryNavy: '--primary-navy',
        colorPrimaryNavyLight: '--primary-navy-light',
        colorAccentGold: '--accent-gold',
        colorAccentGoldLight: '--accent-gold-light',
        colorAccentGoldDark: '--accent-gold-dark',
        colorSugarWhite: '--sugar-white',
        colorSugarCream: '--sugar-cream',
        colorGreenAgriculture: '--green-agriculture',
        colorBrownEarth: '--brown-earth',
        colorBlueOcean: '--blue-ocean',
        colorTextDark: '--text-dark',
        colorTextGray: '--text-gray',
        colorTextLight: '--text-light'
    };

    resetColors() {
        Object.entries(this.defaultColors).forEach(([key, value]) => {
            const colorInput = document.querySelector(`.form-color[data-setting="${key}"]`);
            const textInput = document.querySelector(`[data-color-text="${key}"]`);

            if (colorInput) colorInput.value = value;
            if (textInput) textInput.value = value;

            this.data.settings[key] = value;
        });

        this.trackChange('Farben zurückgesetzt');
        this.showToast('info', 'Zurückgesetzt', 'Standardfarben wurden wiederhergestellt.');
    }

    applyColors() {
        // Save current colors to settings
        Object.keys(this.colorVariableMap).forEach(key => {
            const colorInput = document.querySelector(`.form-color[data-setting="${key}"]`);
            if (colorInput) {
                this.data.settings[key] = colorInput.value;
            }
        });

        // Apply to CSS (preview)
        this.applyCssColors();

        this.trackChange('Farben angewendet');
        this.showToast('success', 'Farben angewendet', 'Die Farben wurden aktualisiert. Speichern Sie, um die Änderungen zu übernehmen.');
    }

    applyCssColors() {
        const root = document.documentElement;
        Object.entries(this.colorVariableMap).forEach(([settingKey, cssVar]) => {
            const value = this.data.settings[settingKey];
            if (value) {
                root.style.setProperty(cssVar, value);
            }
        });
    }

    updateField(path, value) {
        const parts = path.split('.');
        let obj = this.data.content;

        for (let i = 0; i < parts.length - 1; i++) {
            if (!obj[parts[i]]) obj[parts[i]] = {};
            obj = obj[parts[i]];
        }

        obj[parts[parts.length - 1]] = value;
        this.trackChange('Inhalt geändert');
    }

    updateSetting(key, value) {
        this.data.settings[key] = value;
        this.trackChange('Einstellung geändert');
    }

    trackChange(description = 'Änderung') {
        this.changes++;
        // Add to changes list (max 20 items)
        if (this.changesList.length >= 20) {
            this.changesList.shift();
        }
        this.changesList.push({
            description,
            timestamp: new Date()
        });
        this.updateChangeCount();
        this.updateChangesTooltip();
    }

    updateChangeCount() {
        const el = document.getElementById('changeCount');
        if (el) el.textContent = this.changes;
    }

    updateChangesTooltip() {
        const list = document.getElementById('changesList');
        if (!list) return;

        if (this.changesList.length === 0) {
            list.innerHTML = '<li class="no-changes">Keine Änderungen</li>';
            return;
        }

        list.innerHTML = this.changesList.map(change => {
            const timeAgo = this.getTimeAgo(change.timestamp);
            return `<li><span class="change-desc">${change.description}</span><span class="change-time">${timeAgo}</span></li>`;
        }).reverse().join('');
    }

    getTimeAgo(date) {
        const seconds = Math.floor((new Date() - date) / 1000);
        if (seconds < 60) return 'gerade eben';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `vor ${minutes} Min.`;
        const hours = Math.floor(minutes / 60);
        return `vor ${hours} Std.`;
    }

    updateLastSaved() {
        const lastSaved = localStorage.getItem('iustus_admin_lastSaved');
        const el = document.getElementById('lastSaved');
        if (el && lastSaved) {
            const date = new Date(lastSaved);
            el.textContent = date.toLocaleString('de-DE');
        }
    }

    // ============================================
    // ADD BUTTONS
    // ============================================
    bindAddButtons() {
        document.getElementById('addTeamBtn')?.addEventListener('click', () => {
            this.openAddTeamModal();
        });

        document.getElementById('addLocationBtn')?.addEventListener('click', () => {
            this.openAddLocationModal();
        });

        document.getElementById('addProductBtn')?.addEventListener('click', () => {
            this.openAddProductModal();
        });
    }

    // ============================================
    // RENDERING
    // ============================================
    renderAll() {
        this.populateFormFields();
        this.renderTeam();
        this.renderLocations();
        this.renderProducts();
        this.renderCards();
        this.updateLastSaved();
    }

    async renderCards() {
        try {
            const response = await fetch('/api/cards');
            if (!response.ok) throw new Error('Failed to fetch cards');
            const data = await response.json();

            // Render Features
            const featuresGrid = document.getElementById('featuresGrid');
            if (featuresGrid && data.features) {
                featuresGrid.innerHTML = data.features.map(card => this.renderCardItem(card, 'feature')).join('');
            }

            // Render Values
            const valuesGrid = document.getElementById('valuesGrid');
            if (valuesGrid && data.values) {
                valuesGrid.innerHTML = data.values.map(card => this.renderCardItem(card, 'value')).join('');
            }

            // Render Sustainability
            const sustainabilityGrid = document.getElementById('sustainabilityGrid');
            if (sustainabilityGrid && data.sustainability) {
                sustainabilityGrid.innerHTML = data.sustainability.map(card => this.renderCardItem(card, 'sustainability')).join('');
            }
        } catch (error) {
            console.error('Error loading cards:', error);
        }
    }

    renderCardItem(card, type) {
        const iconClass = card.icon || 'fa-star';
        const cardNumber = card.number ? `<span class="card-number">${card.number}</span>` : '';
        return `
            <div class="card-item" data-type="${type}" data-id="${card.id || ''}">
                <div class="card-icon">
                    ${cardNumber}
                    <i class="fas ${iconClass}"></i>
                </div>
                <div class="card-content">
                    <h4 class="card-title">${card.title || ''}</h4>
                    <p class="card-description">${card.description || ''}</p>
                </div>
                <div class="card-actions">
                    <button class="card-action-btn edit" onclick="adminPanel.editCard('${type}', ${card.id})" title="Bearbeiten">
                        <i class="fas fa-edit"></i>
                    </button>
                </div>
            </div>
        `;
    }

    editCard(type, cardId) {
        // Lade Daten für diese Card
        fetch('/api/cards')
            .then(res => res.json())
            .then(data => {
                let cards;
                let typeName;
                switch(type) {
                    case 'feature':
                        cards = data.features;
                        typeName = 'Feature';
                        break;
                    case 'value':
                        cards = data.values;
                        typeName = 'Wert';
                        break;
                    case 'sustainability':
                        cards = data.sustainability;
                        typeName = 'Nachhaltigkeit';
                        break;
                    default:
                        cards = [];
                        typeName = 'Card';
                }

                const card = cards.find(c => c.id === cardId);
                if (!card) {
                    this.showToast('error', 'Fehler', 'Card nicht gefunden');
                    return;
                }

                this.showCardEditModal(card, type, typeName);
            })
            .catch(err => {
                console.error('Error loading card:', err);
                this.showToast('error', 'Fehler', 'Konnte Card-Daten nicht laden');
            });
    }

    showCardEditModal(card, type, typeName) {
        const iconOptions = [
            'fa-star', 'fa-check', 'fa-heart', 'fa-leaf', 'fa-globe', 'fa-handshake',
            'fa-shield-alt', 'fa-users', 'fa-chart-line', 'fa-seedling', 'fa-recycle',
            'fa-water', 'fa-sun', 'fa-tree', 'fa-balance-scale', 'fa-award',
            'fa-lightbulb', 'fa-cog', 'fa-bolt', 'fa-gem', 'fa-crown'
        ].map(icon => `<option value="${icon}" ${card.icon === icon ? 'selected' : ''}>${icon.replace('fa-', '')}</option>`).join('');

        this.showModal(`${typeName} bearbeiten`, `
            <div class="edit-card-form">
                <input type="hidden" id="editCardId" value="${card.id}">
                <input type="hidden" id="editCardType" value="${type}">

                ${type === 'value' ? `
                <div class="form-group">
                    <label>Nummer</label>
                    <input type="text" class="form-input" id="editCardNumber" value="${card.number || ''}" placeholder="z.B. 01">
                </div>
                ` : ''}

                <div class="form-group">
                    <label>Titel</label>
                    <input type="text" class="form-input" id="editCardTitle" value="${card.title || ''}" placeholder="Titel eingeben">
                </div>

                <div class="form-group">
                    <label>Beschreibung</label>
                    <textarea class="form-textarea" id="editCardDescription" rows="3" placeholder="Beschreibung eingeben">${card.description || ''}</textarea>
                </div>

                <div class="form-group">
                    <label>Icon</label>
                    <div class="icon-selector">
                        <select class="form-input" id="editCardIcon" onchange="adminPanel.previewCardIcon(this.value)">
                            ${iconOptions}
                        </select>
                        <div class="icon-preview" id="iconPreview">
                            <i class="fas ${card.icon || 'fa-star'}"></i>
                        </div>
                    </div>
                </div>
            </div>
        `, () => this.saveCardEdit());
    }

    previewCardIcon(iconClass) {
        const preview = document.getElementById('iconPreview');
        if (preview) {
            preview.innerHTML = `<i class="fas ${iconClass}"></i>`;
        }
    }

    async saveCardEdit() {
        const cardId = parseInt(document.getElementById('editCardId').value);
        const cardType = document.getElementById('editCardType').value;
        const title = document.getElementById('editCardTitle').value.trim();
        const description = document.getElementById('editCardDescription').value.trim();
        const icon = document.getElementById('editCardIcon').value;
        const numberEl = document.getElementById('editCardNumber');
        const number = numberEl ? numberEl.value.trim() : null;

        if (!title) {
            this.showToast('error', 'Fehler', 'Bitte geben Sie einen Titel ein');
            return;
        }

        try {
            // Lade aktuelle index.html
            const iframe = document.getElementById('websitePreview');
            if (!iframe || !iframe.contentDocument) {
                throw new Error('Website Preview nicht verfügbar');
            }

            const doc = iframe.contentDocument;

            // Finde die richtige Sektion basierend auf dem Typ
            let selector;
            switch(cardType) {
                case 'feature':
                    selector = '.about-features .feature-item';
                    break;
                case 'value':
                    selector = '.value-card';
                    break;
                case 'sustainability':
                    selector = '.sustainability-card';
                    break;
            }

            const cards = doc.querySelectorAll(selector);
            const cardEl = cards[cardId - 1]; // cardId ist 1-basiert

            if (cardEl) {
                // Speichere Undo-State
                this.saveUndoState(`${cardType} Card bearbeitet`);

                // Update die Card im DOM
                if (cardType === 'feature') {
                    const h4 = cardEl.querySelector('h4');
                    const p = cardEl.querySelector('p');
                    if (h4) h4.textContent = title;
                    if (p) p.textContent = description;
                } else if (cardType === 'value') {
                    const numEl = cardEl.querySelector('.value-number');
                    const h3 = cardEl.querySelector('h3');
                    const p = cardEl.querySelector('p');
                    if (numEl && number) numEl.textContent = number;
                    if (h3) h3.textContent = title;
                    if (p) p.textContent = description;
                } else if (cardType === 'sustainability') {
                    const iconEl = cardEl.querySelector('.sustainability-icon i, .card-icon i');
                    const h3 = cardEl.querySelector('h3');
                    const p = cardEl.querySelector('p');
                    if (iconEl) iconEl.className = `fas ${icon}`;
                    if (h3) h3.textContent = title;
                    if (p) p.textContent = description;
                }

                this.closeModal();
                this.renderCards(); // Refresh die Anzeige im Admin
                this.showToast('success', 'Gespeichert', `${cardType === 'feature' ? 'Feature' : cardType === 'value' ? 'Wert' : 'Nachhaltigkeitskarte'} wurde aktualisiert`);
            } else {
                throw new Error('Card-Element nicht gefunden');
            }

        } catch (error) {
            console.error('Error saving card:', error);
            this.showToast('error', 'Fehler', 'Änderungen konnten nicht gespeichert werden: ' + error.message);
        }
    }

    populateFormFields() {
        document.querySelectorAll('[data-field]').forEach(input => {
            const path = input.dataset.field.split('.');
            let value = this.data.content;
            for (const part of path) {
                if (value && value[part] !== undefined) {
                    value = value[part];
                } else {
                    value = '';
                    break;
                }
            }
            if (typeof value === 'string' || typeof value === 'number') {
                input.value = value;
            }
        });

        document.querySelectorAll('[data-setting]').forEach(input => {
            const value = this.data.settings?.[input.dataset.setting];
            if (value !== undefined) {
                input.value = value;
            }
        });
    }

    renderTeam() {
        const leadershipGrid = document.getElementById('leadershipGrid');
        if (leadershipGrid && this.data.team?.leadership) {
            leadershipGrid.innerHTML = this.data.team.leadership.map(member => this.renderTeamCard(member, 'leadership')).join('');
        }

        const ceoGrid = document.getElementById('ceoGrid');
        if (ceoGrid && this.data.team?.ceo) {
            ceoGrid.innerHTML = this.data.team.ceo.map(member => this.renderTeamCard(member, 'ceo')).join('');
        }

        const cooRegionalGrid = document.getElementById('cooRegionalGrid');
        if (cooRegionalGrid && this.data.team?.cooRegional) {
            cooRegionalGrid.innerHTML = this.data.team.cooRegional.map(member => this.renderTeamCard(member, 'cooRegional')).join('');
        }
    }

    renderTeamCard(member, category) {
        // Generate initials from name
        const initials = member.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        const hasImage = member.image && member.image.trim() !== '';

        const imageContent = hasImage
            ? `<img src="${member.image}" alt="${member.name}" class="team-member-image" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
               <div class="team-member-initials" style="display:none;">${initials}</div>`
            : `<div class="team-member-initials">${initials}</div>`;

        return `
            <div class="team-member-card" data-id="${member.id}">
                <div class="team-member-image-wrapper">
                    ${imageContent}
                </div>
                <div class="team-member-info">
                    <h4>${member.name}</h4>
                    <p class="role">${member.role}</p>
                    <p class="description">${member.description}</p>
                </div>
                <div class="team-member-actions">
                    <button class="card-action-btn" onclick="adminPanel.editTeamMember(${member.id}, '${category}')">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="card-action-btn delete" onclick="adminPanel.deleteTeamMember(${member.id}, '${category}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    }

    renderLocations() {
        const grid = document.getElementById('locationsGrid');
        if (!grid || !this.data.locations) return;

        grid.innerHTML = this.data.locations.map(loc => {
            // Get flag - prioritize SVG flag path, then emoji, then default
            const flagSvg = loc.flag && loc.flag.includes('.svg') ? loc.flag : null;
            const flagEmoji = loc.flagEmoji || loc.flag || '🏳️';
            const countryName = loc.countryName || loc.country || loc.name || '';
            const locationType = loc.locationType || loc.type || '';
            const cityName = loc.city || loc.companyName || '';

            return `
            <div class="location-card-admin" data-id="${loc.id}">
                ${loc.image ? `
                    <div class="location-image">
                        <img src="${loc.image}" alt="${cityName}" onerror="this.parentElement.innerHTML='<div class=\\'location-flag-large\\'>${flagEmoji}</div>'">
                        <div class="location-image-overlay">
                            <button class="btn-change-image" onclick="event.stopPropagation(); adminPanel.changeLocationImage('${loc.id}')" title="Bild aendern">
                                <i class="fas fa-camera"></i>
                            </button>
                        </div>
                    </div>
                ` : `
                    <div class="location-flag-large" onclick="event.stopPropagation(); adminPanel.addLocationImage('${loc.id}')" title="Bild hinzufuegen" style="cursor:pointer;">
                        ${flagSvg ? `<img src="${flagSvg}" alt="${countryName}" class="flag-svg">` : `<span class="flag-emoji">${flagEmoji}</span>`}
                        <div class="add-image-hint"><i class="fas fa-camera"></i> Bild</div>
                    </div>
                `}
                <div class="location-info">
                    <h4>${countryName}</h4>
                    <p class="city">${cityName}</p>
                    <span class="type-badge">${locationType}</span>
                    ${loc.address ? `<p class="address"><i class="fas fa-map-marker-alt"></i> ${loc.address}</p>` : ''}
                </div>
                <div class="location-actions">
                    <button class="card-action-btn" onclick="event.stopPropagation(); adminPanel.editLocation('${loc.id}')" title="Bearbeiten">
                        <i class="fas fa-edit"></i> Bearbeiten
                    </button>
                    ${loc.image ? `
                        <button class="card-action-btn" onclick="event.stopPropagation(); adminPanel.removeLocationImage('${loc.id}')" title="Bild entfernen">
                            <i class="fas fa-image"></i>
                        </button>
                    ` : ''}
                    <button class="card-action-btn delete" onclick="event.stopPropagation(); adminPanel.deleteLocation('${loc.id}')" title="Loeschen">
                        <i class="fas fa-trash"></i> Loeschen
                    </button>
                </div>
            </div>
        `}).join('');
    }

    // Location Image Functions
    addLocationImage(id) {
        this._pendingLocationImageId = id;
        this.openLocationImagePicker(id);
    }

    changeLocationImage(id) {
        this._pendingLocationImageId = id;
        this.openLocationImagePicker(id);
    }

    openLocationImagePicker(locationId) {
        const loc = this.data.locations?.find(l => l.id === locationId);
        if (!loc) return;

        this.openModal('Standortbild waehlen', `
            <div class="location-image-picker">
                <p style="margin-bottom:16px;color:var(--gray-600);">Waehle ein Bild fuer <strong>${loc.city}, ${loc.country}</strong></p>

                <!-- Upload neues Bild -->
                <div class="upload-new-section" style="margin-bottom:24px;">
                    <h4 style="margin-bottom:12px;font-size:14px;"><i class="fas fa-upload"></i> Neues Bild hochladen</h4>
                    <div class="mediathek-upload-zone mini" id="locationImageUploadZone" style="padding:20px;border:2px dashed var(--gray-300);border-radius:8px;text-align:center;cursor:pointer;">
                        <i class="fas fa-cloud-upload-alt" style="font-size:32px;color:var(--gray-400);margin-bottom:8px;display:block;"></i>
                        <span style="font-size:13px;color:var(--gray-500);">Klicken oder Bild hierher ziehen</span>
                        <input type="file" id="locationImageInput" accept="image/*" style="display:none;">
                    </div>
                </div>

                <!-- Aus Mediathek waehlen -->
                <div class="choose-from-mediathek">
                    <h4 style="margin-bottom:12px;font-size:14px;"><i class="fas fa-images"></i> Aus Mediathek waehlen</h4>
                    <div class="mediathek-picker-grid" id="locationMediathekGrid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;max-height:200px;overflow-y:auto;">
                        <p style="grid-column:1/-1;text-align:center;color:var(--gray-400);padding:20px;">Lade Bilder...</p>
                    </div>
                </div>

                <!-- Aktuelles Bild -->
                ${loc.image ? `
                    <div class="current-image-section" style="margin-top:24px;padding-top:16px;border-top:1px solid var(--gray-200);">
                        <h4 style="margin-bottom:12px;font-size:14px;">Aktuelles Bild</h4>
                        <div style="display:flex;align-items:center;gap:12px;">
                            <img src="${loc.image}" style="width:80px;height:60px;object-fit:cover;border-radius:8px;">
                            <button class="btn-secondary" onclick="adminPanel.removeLocationImage(${locationId}); adminPanel.closeModal();" style="font-size:12px;">
                                <i class="fas fa-trash"></i> Entfernen
                            </button>
                        </div>
                    </div>
                ` : ''}
            </div>
        `, null, { hideFooter: true });

        // Setup upload zone
        setTimeout(() => {
            const uploadZone = document.getElementById('locationImageUploadZone');
            const fileInput = document.getElementById('locationImageInput');

            if (uploadZone && fileInput) {
                uploadZone.onclick = () => fileInput.click();

                uploadZone.ondragover = (e) => {
                    e.preventDefault();
                    uploadZone.style.borderColor = 'var(--gold)';
                };

                uploadZone.ondragleave = () => {
                    uploadZone.style.borderColor = 'var(--gray-300)';
                };

                uploadZone.ondrop = (e) => {
                    e.preventDefault();
                    uploadZone.style.borderColor = 'var(--gray-300)';
                    if (e.dataTransfer.files.length > 0) {
                        this.uploadLocationImage(e.dataTransfer.files[0], locationId);
                    }
                };

                fileInput.onchange = (e) => {
                    if (e.target.files.length > 0) {
                        this.uploadLocationImage(e.target.files[0], locationId);
                    }
                };
            }

            // Load mediathek images
            this.loadMediathekForLocationPicker(locationId);
        }, 100);
    }

    async loadMediathekForLocationPicker(locationId) {
        const grid = document.getElementById('locationMediathekGrid');
        if (!grid) return;

        try {
            const response = await fetch('/api/images');
            const data = await response.json();

            if (!data.images || data.images.length === 0) {
                grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--gray-400);padding:20px;">Keine Bilder in der Mediathek</p>';
                return;
            }

            grid.innerHTML = data.images.map(img => `
                <div class="picker-image" onclick="adminPanel.selectLocationImage('${img.url}', ${locationId})"
                     style="aspect-ratio:4/3;border-radius:6px;overflow:hidden;cursor:pointer;border:2px solid transparent;transition:all 0.2s;">
                    <img src="${img.url}" style="width:100%;height:100%;object-fit:cover;">
                </div>
            `).join('');

            // Add hover effects
            grid.querySelectorAll('.picker-image').forEach(el => {
                el.onmouseenter = () => el.style.borderColor = 'var(--gold)';
                el.onmouseleave = () => el.style.borderColor = 'transparent';
            });
        } catch (e) {
            grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--gray-400);padding:20px;">Fehler beim Laden</p>';
        }
    }

    async uploadLocationImage(file, locationId) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('website_id', 'ws_iustus');

        try {
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                const result = await response.json();
                this.selectLocationImage(result.media.url, locationId);
            } else {
                this.showToast('error', 'Fehler', 'Bild konnte nicht hochgeladen werden.');
            }
        } catch (e) {
            this.showToast('error', 'Fehler', 'Upload fehlgeschlagen.');
        }
    }

    selectLocationImage(imageUrl, locationId) {
        const loc = this.data.locations?.find(l => l.id === locationId);
        if (!loc) return;

        loc.image = imageUrl;
        this.trackChange('Standortbild gesetzt');
        this.closeModal();
        this.renderLocations();
        this.showToast('success', 'Bild gesetzt', 'Standortbild wurde aktualisiert.');
    }

    removeLocationImage(id) {
        const loc = this.data.locations?.find(l => l.id === id);
        if (!loc) return;

        delete loc.image;
        this.trackChange('Standortbild entfernt');
        this.renderLocations();
        this.showToast('success', 'Entfernt', 'Standortbild wurde entfernt.');
    }

    renderProducts() {
        const grid = document.getElementById('productsGrid');
        if (!grid || !this.data.products) return;

        grid.innerHTML = this.data.products.map(product => `
            <div class="product-card-admin" data-id="${product.id}">
                <img src="${product.image}" alt="${product.name}" class="product-image" onerror="this.src='assets/images/placeholder.jpg'">
                <div class="product-info">
                    <span class="product-category">${product.category}</span>
                    <h4>${product.name}</h4>
                    <p>${product.description}</p>
                </div>
                <div class="product-actions">
                    <button class="card-action-btn" onclick="adminPanel.editProduct(${product.id})">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="card-action-btn delete" onclick="adminPanel.deleteProduct(${product.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');
    }

    // ============================================
    // LIVE SYNC
    // ============================================
    initLiveSync() {
        if (typeof LiveSyncClient === 'undefined') {
            console.warn('[Admin] LiveSyncClient not loaded');
            return;
        }

        this.liveSync = new LiveSyncClient('admin_panel');

        // Event handlers
        this.liveSync.on('connected', () => {
            this.updateSyncUI(true);
            this.log('Live Sync connected');
        });

        this.liveSync.on('disconnected', () => {
            this.updateSyncUI(false);
            this.log('Live Sync disconnected');
        });

        this.liveSync.on('sync_state', (state) => {
            this.updateSyncSchedule(state);
        });

        this.liveSync.on('clients_updated', (clients) => {
            this.updateSyncClients(clients);
        });

        this.liveSync.on('update', (update) => {
            this.handleSyncUpdate(update);
        });

        this.liveSync.on('notification', (notification) => {
            this.showToast(`Update von ${notification.source}`, 'info');
        });

        // Connect
        this.liveSync.connect();
    }

    updateSyncUI(connected) {
        const dot = document.getElementById('syncDot');
        const text = document.getElementById('syncText');
        const statusText = document.getElementById('syncStatusText');

        if (dot) {
            dot.className = 'sync-dot ' + (connected ? 'connected' : 'disconnected');
        }
        if (text) {
            text.textContent = connected ? 'Live' : 'Offline';
        }
        if (statusText) {
            statusText.textContent = connected ? 'Verbunden' : 'Getrennt';
        }
    }

    updateSyncSchedule(state) {
        const schedule = this.liveSync?.getScheduleInfo() || {};

        const setEl = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value || '-';
        };

        setEl('syncLastBackup', schedule.lastBackup);
        setEl('syncNextBackup', schedule.nextBackup);
        setEl('syncNextSync', schedule.nextSync);
        setEl('syncClientsCount', this.liveSync?.connectedClients?.length || 0);
    }

    updateSyncClients(clients) {
        const container = document.getElementById('syncClientsList');
        if (!container) return;

        const clientTypeNames = {
            'dev_admin': 'Dev Admin',
            'admin_panel': 'Admin Panel',
            'website': 'Website'
        };

        container.innerHTML = `
            <h4>Verbundene Clients</h4>
            ${clients.map(c => `
                <div class="sync-client-item ${c.type}">
                    <span class="client-dot"></span>
                    <span class="client-type">${clientTypeNames[c.type] || c.type}</span>
                </div>
            `).join('')}
        `;

        // Update count
        const countEl = document.getElementById('syncClientsCount');
        if (countEl) countEl.textContent = clients.length;
    }

    handleSyncUpdate(update) {
        this.log(`Sync update from ${update.source}:`, update.data);

        // Handle different update types
        if (update.data?.changeType === 'content') {
            // Reload content
            this.loadData();
        } else if (update.data?.changeType === 'team') {
            this.loadData();
            this.renderTeam();
        } else if (update.data?.changeType === 'locations') {
            this.loadData();
            this.renderLocations();
        } else if (update.data?.changeType === 'images') {
            this.loadMediathek();
        }

        this.showToast('Daten aktualisiert', 'success');
    }

    // Send update through Live Sync
    sendSyncUpdate(changeType, data) {
        if (this.liveSync && this.liveSync.connected) {
            this.liveSync.sendUpdate({
                changeType,
                data,
                timestamp: new Date().toISOString()
            }, 'immediate');
        }
    }

    // ============================================
    // STATISTICS
    // ============================================
    updateStats() {
        const setCount = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        };

        // Team counts
        const teamTotal = (this.data.team?.leadership?.length || 0) +
                         (this.data.team?.ceo?.length || 0) +
                         (this.data.team?.cooRegional?.length || 0);

        // Location counts
        const locationTotal = this.data.locations?.length || 0;

        // Content sections count (count unique section keys in content)
        const contentKeys = Object.keys(this.data.content || {});
        const contentSections = contentKeys.length > 0 ? contentKeys.length : 7;

        // Calculate unique continents from locations
        const continentMap = {
            'VG': 'North America', 'US': 'North America',
            'BR': 'South America',
            'GB': 'Europe',
            'AE': 'Asia',
            'UG': 'Africa', 'KE': 'Africa'
        };
        const continents = new Set();
        (this.data.locations || []).forEach(loc => {
            const code = loc.countryCode || loc.flag?.match(/([A-Z]{2})/)?.[1];
            if (code && continentMap[code]) continents.add(continentMap[code]);
        });

        // Dashboard stats (cards will be updated separately)
        setCount('teamCount', teamTotal);
        setCount('locationCount', locationTotal);
        setCount('contentCount', contentSections);

        // Section banner stats
        setCount('totalTeamCount', teamTotal);
        setCount('totalLocationsCount', locationTotal);
        setCount('totalContinentsCount', continents.size || 5);
        setCount('totalSectionsCount', contentSections);

        // Structure stats
        if (window.SyncBridge) {
            const structure = SyncBridge.getStructure();
            const activeSections = structure?.sections?.filter(s => s.enabled !== false)?.length || 0;
            setCount('activeSectionsCount', activeSections);
        }

        // Update cards count from API
        this.updateCardsCount();

        // Image count
        this.updateImageCount();
    }

    async updateCardsCount() {
        const setCount = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        };

        try {
            const response = await fetch('/api/cards');
            if (response.ok) {
                const data = await response.json();
                const featuresCount = data.features?.length || 0;
                const valuesCount = data.values?.length || 0;
                const sustainabilityCount = data.sustainability?.length || 0;
                const cardsTotal = featuresCount + valuesCount + sustainabilityCount;

                setCount('cardsCount', cardsTotal);
                setCount('totalCardsCount', cardsTotal);
                setCount('featuresCount', featuresCount);
                setCount('valuesCount', valuesCount);
                setCount('sustainabilityCount', sustainabilityCount);
            }
        } catch (e) {
            console.log('Could not fetch cards count');
        }
    }

    async updateImageCount() {
        try {
            const response = await fetch('/api/images');
            if (response.ok) {
                const data = await response.json();
                const images = data.images || [];
                const videos = data.videos || [];
                const logos = images.filter(img => img.folder === 'logos' || img.folder === 'flags');
                const docs = data.documents || [];

                const setCount = (id, value) => {
                    const el = document.getElementById(id);
                    if (el) el.textContent = value;
                };

                setCount('imageCount', images.length);
                setCount('mediathekImageCount', images.filter(i => !['logos', 'flags'].includes(i.folder)).length);
                setCount('mediathekVideoCount', videos.length);
                setCount('mediathekLogoCount', logos.length);
                setCount('mediathekDocCount', docs.length);
            }
        } catch (e) {
            console.log('Could not fetch image count');
        }
    }

    initSessionTimer() {
        this.updateServerUptime();
        setInterval(() => this.updateServerUptime(), 30000); // Update every 30 seconds
    }

    async updateServerUptime() {
        const el = document.getElementById('serverUptime');
        if (!el) return;

        try {
            const response = await fetch('/api/health');
            if (response.ok) {
                const data = await response.json();
                const seconds = Math.floor(data.uptime || 0);
                const minutes = Math.floor(seconds / 60);
                const hours = Math.floor(minutes / 60);
                const days = Math.floor(hours / 24);

                if (days > 0) {
                    el.textContent = `${days}d ${hours % 24}h`;
                } else if (hours > 0) {
                    el.textContent = `${hours}h ${minutes % 60}m`;
                } else {
                    el.textContent = `${minutes}m`;
                }
            }
        } catch (e) {
            el.textContent = '--';
        }
    }

    // ============================================
    // MODALS
    // ============================================
    openModal(title, content, onSave) {
        document.getElementById('modalTitle').textContent = title;
        document.getElementById('modalBody').innerHTML = content;
        document.getElementById('modalOverlay').classList.add('active');
        this.modalCallback = onSave;
    }

    closeModal() {
        document.getElementById('modalOverlay').classList.remove('active');
        this.modalCallback = null;
    }

    saveModalData() {
        if (this.modalCallback) {
            this.modalCallback();
        }
        this.closeModal();
    }

    // Team Member Modals
    openAddTeamModal() {
        this.openModal('Team-Mitglied hinzufügen', `
            <div class="form-group">
                <label>Kategorie</label>
                <select class="form-input" id="modalTeamCategory">
                    <option value="leadership">Leadership</option>
                    <option value="ceo">CEO</option>
                    <option value="cooRegional">COO & Regional Heads</option>
                </select>
            </div>
            <div class="form-group">
                <label>Name</label>
                <input type="text" class="form-input" id="modalTeamName" required>
            </div>
            <div class="form-group">
                <label>Rolle / Titel</label>
                <input type="text" class="form-input" id="modalTeamRole" required>
            </div>
            <div class="form-group">
                <label>Beschreibung</label>
                <textarea class="form-textarea" id="modalTeamDesc" rows="3"></textarea>
            </div>
            <div class="form-group">
                <label>Bild-Pfad</label>
                <input type="text" class="form-input" id="modalTeamImage" placeholder="assets/images/team/...">
            </div>
            <div class="form-group">
                <label>LinkedIn URL</label>
                <input type="url" class="form-input" id="modalTeamLinkedin" placeholder="https://linkedin.com/in/...">
            </div>
        `, () => {
            const category = document.getElementById('modalTeamCategory').value;
            const name = document.getElementById('modalTeamName').value;
            const role = document.getElementById('modalTeamRole').value;

            if (!name || !role) {
                this.showToast('error', 'Fehler', 'Name und Rolle sind erforderlich.');
                return;
            }

            if (!this.data.team[category]) this.data.team[category] = [];

            this.data.team[category].push({
                id: Date.now(),
                name: name,
                role: role,
                description: document.getElementById('modalTeamDesc').value,
                image: document.getElementById('modalTeamImage').value || 'assets/images/placeholder.jpg',
                linkedin: document.getElementById('modalTeamLinkedin').value
            });

            this.trackChange('Team-Mitglied hinzugefügt');
            this.renderTeam();
            this.updateStats();
            this.showToast('success', 'Hinzugefügt', 'Team-Mitglied wurde hinzugefügt.');
        });
    }

    editTeamMember(id, category) {
        const member = this.data.team[category]?.find(m => m.id === id);
        if (!member) return;

        this.openModal('Team-Mitglied bearbeiten', `
            <div class="form-group">
                <label>Name</label>
                <input type="text" class="form-input" id="modalTeamName" value="${member.name}" required>
            </div>
            <div class="form-group">
                <label>Rolle / Titel</label>
                <input type="text" class="form-input" id="modalTeamRole" value="${member.role}" required>
            </div>
            <div class="form-group">
                <label>Beschreibung</label>
                <textarea class="form-textarea" id="modalTeamDesc" rows="3">${member.description || ''}</textarea>
            </div>
            <div class="form-group">
                <label>Bild-Pfad</label>
                <input type="text" class="form-input" id="modalTeamImage" value="${member.image || ''}">
            </div>
            <div class="form-group">
                <label>LinkedIn URL</label>
                <input type="url" class="form-input" id="modalTeamLinkedin" value="${member.linkedin || ''}">
            </div>
        `, () => {
            member.name = document.getElementById('modalTeamName').value;
            member.role = document.getElementById('modalTeamRole').value;
            member.description = document.getElementById('modalTeamDesc').value;
            member.image = document.getElementById('modalTeamImage').value;
            member.linkedin = document.getElementById('modalTeamLinkedin').value;

            this.trackChange('Team-Mitglied bearbeitet');
            this.renderTeam();
            this.showToast('success', 'Aktualisiert', 'Team-Mitglied wurde aktualisiert.');
        });
    }

    deleteTeamMember(id, category) {
        if (!confirm('Team-Mitglied wirklich entfernen?')) return;

        const index = this.data.team[category]?.findIndex(m => m.id === id);
        if (index > -1) {
            this.data.team[category].splice(index, 1);
            this.trackChange('Team-Mitglied gelöscht');
            this.renderTeam();
            this.updateStats();
            this.showToast('success', 'Gelöscht', 'Team-Mitglied wurde entfernt.');
        }
    }

    // Location Modals
    openAddLocationModal() {
        this.openModal('Standort hinzufügen', `
            <div class="form-group">
                <label>Land</label>
                <input type="text" class="form-input" id="modalLocCountry" required>
            </div>
            <div class="form-group">
                <label>Stadt</label>
                <input type="text" class="form-input" id="modalLocCity" required>
            </div>
            <div class="form-group">
                <label>Typ (z.B. Headquarters, Regional Office)</label>
                <input type="text" class="form-input" id="modalLocType" required>
            </div>
            <div class="form-group">
                <label>Adresse</label>
                <textarea class="form-textarea" id="modalLocAddress" rows="2"></textarea>
            </div>
            <div class="form-group">
                <label>Flaggen-Emoji</label>
                <input type="text" class="form-input" id="modalLocFlag" placeholder="🇺🇸">
            </div>
        `, () => {
            const country = document.getElementById('modalLocCountry').value;
            const city = document.getElementById('modalLocCity').value;
            const type = document.getElementById('modalLocType').value;

            if (!country || !city || !type) {
                this.showToast('error', 'Fehler', 'Bitte alle Pflichtfelder ausfüllen.');
                return;
            }

            this.data.locations.push({
                id: Date.now(),
                country: country,
                city: city,
                type: type,
                address: document.getElementById('modalLocAddress').value || '',
                flag: document.getElementById('modalLocFlag').value || '🏳️'
            });

            this.trackChange('Standort hinzugefügt');
            this.renderLocations();
            this.updateStats();
            this.showToast('success', 'Hinzugefügt', 'Standort wurde hinzugefügt.');
        });
    }

    editLocation(id) {
        const loc = this.data.locations?.find(l => l.id === id);
        if (!loc) return;

        this.openModal('Standort bearbeiten', `
            <div class="form-group">
                <label>Land</label>
                <input type="text" class="form-input" id="modalLocCountry" value="${loc.country}" required>
            </div>
            <div class="form-group">
                <label>Stadt</label>
                <input type="text" class="form-input" id="modalLocCity" value="${loc.city}" required>
            </div>
            <div class="form-group">
                <label>Typ</label>
                <input type="text" class="form-input" id="modalLocType" value="${loc.type}" required>
            </div>
            <div class="form-group">
                <label>Adresse</label>
                <textarea class="form-textarea" id="modalLocAddress" rows="2">${loc.address || ''}</textarea>
            </div>
            <div class="form-group">
                <label>Flaggen-Emoji</label>
                <input type="text" class="form-input" id="modalLocFlag" value="${loc.flag || ''}">
            </div>
        `, () => {
            loc.country = document.getElementById('modalLocCountry').value;
            loc.city = document.getElementById('modalLocCity').value;
            loc.type = document.getElementById('modalLocType').value;
            loc.address = document.getElementById('modalLocAddress').value;
            loc.flag = document.getElementById('modalLocFlag').value;

            this.trackChange('Standort bearbeitet');
            this.renderLocations();
            this.showToast('success', 'Aktualisiert', 'Standort wurde aktualisiert.');
        });
    }

    deleteLocation(id) {
        if (!confirm('Standort wirklich entfernen?')) return;

        const index = this.data.locations?.findIndex(l => l.id === id);
        if (index > -1) {
            this.data.locations.splice(index, 1);
            this.trackChange('Standort gelöscht');
            this.renderLocations();
            this.updateStats();
            this.showToast('success', 'Gelöscht', 'Standort wurde entfernt.');
        }
    }

    // Product Modals
    openAddProductModal() {
        this.openModal('Produkt hinzufügen', `
            <div class="form-group">
                <label>Produktname</label>
                <input type="text" class="form-input" id="modalProdName" required>
            </div>
            <div class="form-group">
                <label>Kategorie</label>
                <select class="form-input" id="modalProdCategory">
                    <option value="Sugar">Zucker</option>
                    <option value="Grains">Getreide</option>
                    <option value="Other">Sonstiges</option>
                </select>
            </div>
            <div class="form-group">
                <label>Beschreibung</label>
                <textarea class="form-textarea" id="modalProdDesc" rows="2"></textarea>
            </div>
            <div class="form-group">
                <label>Bild-Pfad</label>
                <input type="text" class="form-input" id="modalProdImage" placeholder="assets/images/products/...">
            </div>
        `, () => {
            const name = document.getElementById('modalProdName').value;
            if (!name) {
                this.showToast('error', 'Fehler', 'Produktname ist erforderlich.');
                return;
            }

            this.data.products.push({
                id: Date.now(),
                name: name,
                category: document.getElementById('modalProdCategory').value,
                description: document.getElementById('modalProdDesc').value,
                image: document.getElementById('modalProdImage').value || 'assets/images/placeholder.jpg'
            });

            this.trackChange('Produkt hinzugefügt');
            this.renderProducts();
            this.updateStats();
            this.showToast('success', 'Hinzugefügt', 'Produkt wurde hinzugefügt.');
        });
    }

    editProduct(id) {
        const product = this.data.products?.find(p => p.id === id);
        if (!product) return;

        this.openModal('Produkt bearbeiten', `
            <div class="form-group">
                <label>Produktname</label>
                <input type="text" class="form-input" id="modalProdName" value="${product.name}" required>
            </div>
            <div class="form-group">
                <label>Kategorie</label>
                <select class="form-input" id="modalProdCategory">
                    <option value="Sugar" ${product.category === 'Sugar' ? 'selected' : ''}>Zucker</option>
                    <option value="Grains" ${product.category === 'Grains' ? 'selected' : ''}>Getreide</option>
                    <option value="Other" ${product.category === 'Other' ? 'selected' : ''}>Sonstiges</option>
                </select>
            </div>
            <div class="form-group">
                <label>Beschreibung</label>
                <textarea class="form-textarea" id="modalProdDesc" rows="2">${product.description || ''}</textarea>
            </div>
            <div class="form-group">
                <label>Bild-Pfad</label>
                <input type="text" class="form-input" id="modalProdImage" value="${product.image || ''}">
            </div>
        `, () => {
            product.name = document.getElementById('modalProdName').value;
            product.category = document.getElementById('modalProdCategory').value;
            product.description = document.getElementById('modalProdDesc').value;
            product.image = document.getElementById('modalProdImage').value;

            this.trackChange('Produkt bearbeitet');
            this.renderProducts();
            this.showToast('success', 'Aktualisiert', 'Produkt wurde aktualisiert.');
        });
    }

    deleteProduct(id) {
        if (!confirm('Produkt wirklich entfernen?')) return;

        const index = this.data.products?.findIndex(p => p.id === id);
        if (index > -1) {
            this.data.products.splice(index, 1);
            this.trackChange('Produkt gelöscht');
            this.renderProducts();
            this.updateStats();
            this.showToast('success', 'Gelöscht', 'Produkt wurde entfernt.');
        }
    }

    // ============================================
    // TOAST NOTIFICATIONS
    // ============================================
    showToast(type, title, message) {
        const container = document.getElementById('toastContainer');
        if (!container) return;

        const icons = {
            success: 'fas fa-check-circle',
            error: 'fas fa-exclamation-circle',
            warning: 'fas fa-exclamation-triangle',
            info: 'fas fa-info-circle'
        };

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <i class="${icons[type]}"></i>
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

    // Spezieller Toast mit Rückgängig-Button
    showUndoToast(message, undoCallback) {
        const container = document.getElementById('toastContainer');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = 'toast info undo-toast';
        toast.innerHTML = `
            <i class="fas fa-trash"></i>
            <div class="toast-content">
                <h4>${message}</h4>
                <p>Klicke "Rückgängig" zum Wiederherstellen</p>
            </div>
            <button class="undo-btn" style="
                background: var(--gold, #c9a227);
                color: var(--navy-dark, #0a1628);
                border: none;
                padding: 8px 16px;
                border-radius: 6px;
                cursor: pointer;
                font-weight: 600;
                font-size: 13px;
                margin-left: 12px;
                white-space: nowrap;
            ">
                <i class="fas fa-undo"></i> Rückgängig
            </button>
        `;

        const undoBtn = toast.querySelector('.undo-btn');
        undoBtn.addEventListener('click', () => {
            if (undoCallback) undoCallback();
            toast.remove();
        });

        container.appendChild(toast);

        // Längere Zeit für Undo-Toast (8 Sekunden)
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => toast.remove(), 300);
        }, 8000);
    }

    // ============================================
    // UNDO/REDO SYSTEM
    // ============================================
    saveUndoState(actionName = 'Änderung') {
        const iframe = document.getElementById('websitePreview');
        if (!iframe || !iframe.contentDocument) return;

        const doc = iframe.contentDocument;

        // Speichere den aktuellen HTML-Zustand
        const state = {
            action: actionName,
            timestamp: Date.now(),
            html: doc.body.innerHTML,
            scrollTop: doc.documentElement.scrollTop
        };

        this.undoStack.push(state);

        // Begrenze Stack-Größe
        if (this.undoStack.length > this.maxUndoSteps) {
            this.undoStack.shift();
        }

        // Redo-Stack leeren bei neuer Aktion
        this.redoStack = [];

        // Update UI
        this.updateUndoRedoButtons();

        console.log(`[Undo] Saved state: ${actionName} (${this.undoStack.length} states)`);
    }

    undo() {
        if (this.undoStack.length === 0) {
            this.showToast('warning', 'Nichts rückgängig', 'Keine weiteren Aktionen zum Rückgängig machen');
            return;
        }

        const iframe = document.getElementById('websitePreview');
        if (!iframe || !iframe.contentDocument) return;

        const doc = iframe.contentDocument;

        // Speichere aktuellen Zustand für Redo
        this.redoStack.push({
            action: 'Redo',
            timestamp: Date.now(),
            html: doc.body.innerHTML,
            scrollTop: doc.documentElement.scrollTop
        });

        // Hole letzten Zustand
        const state = this.undoStack.pop();

        // Stelle wieder her
        doc.body.innerHTML = state.html;
        doc.documentElement.scrollTop = state.scrollTop;

        // Re-initialisiere Editor
        this.injectDragHandlesIntoIframe();

        this.showToast('info', 'Rückgängig', `"${state.action}" wurde rückgängig gemacht`);
        this.updateUndoRedoButtons();
    }

    redo() {
        if (this.redoStack.length === 0) {
            this.showToast('warning', 'Nichts wiederholen', 'Keine Aktionen zum Wiederholen');
            return;
        }

        const iframe = document.getElementById('websitePreview');
        if (!iframe || !iframe.contentDocument) return;

        const doc = iframe.contentDocument;

        // Speichere aktuellen Zustand für Undo
        this.undoStack.push({
            action: 'Undo',
            timestamp: Date.now(),
            html: doc.body.innerHTML,
            scrollTop: doc.documentElement.scrollTop
        });

        // Hole Redo-Zustand
        const state = this.redoStack.pop();

        // Stelle wieder her
        doc.body.innerHTML = state.html;
        doc.documentElement.scrollTop = state.scrollTop;

        // Re-initialisiere Editor
        this.injectDragHandlesIntoIframe();

        this.showToast('info', 'Wiederholt', 'Aktion wurde wiederholt');
        this.updateUndoRedoButtons();
    }

    updateUndoRedoButtons() {
        const undoBtn = document.getElementById('undoBtn');
        const redoBtn = document.getElementById('redoBtn');

        if (undoBtn) {
            undoBtn.disabled = this.undoStack.length === 0;
            undoBtn.title = this.undoStack.length > 0
                ? `Rückgängig: ${this.undoStack[this.undoStack.length - 1]?.action || 'Letzte Aktion'}`
                : 'Nichts rückgängig zu machen';
        }

        if (redoBtn) {
            redoBtn.disabled = this.redoStack.length === 0;
            redoBtn.title = this.redoStack.length > 0
                ? 'Wiederholen'
                : 'Nichts zu wiederholen';
        }
    }

    // ============================================
    // STRUCTURE EDITOR
    // ============================================
    bindStructureEditor() {
        document.querySelectorAll('.palette-item').forEach(item => {
            item.addEventListener('dragstart', (e) => {
                this.draggedSection = { type: item.dataset.type, isNew: true };
                item.classList.add('dragging');
            });

            item.addEventListener('dragend', () => {
                item.classList.remove('dragging');
                this.draggedSection = null;
            });

            item.addEventListener('click', () => {
                this.addSectionOfType(item.dataset.type);
            });
        });

        const structureList = document.getElementById('structureList');
        if (structureList) {
            structureList.addEventListener('dragover', (e) => {
                e.preventDefault();
                structureList.classList.add('drag-over');
            });

            structureList.addEventListener('dragleave', () => {
                structureList.classList.remove('drag-over');
            });

            structureList.addEventListener('drop', (e) => {
                e.preventDefault();
                structureList.classList.remove('drag-over');
                if (this.draggedSection && this.draggedSection.isNew) {
                    this.addSectionOfType(this.draggedSection.type);
                }
            });
        }
    }

    renderStructure() {
        const container = document.getElementById('structureList');
        if (!container || !window.SyncBridge) return;

        const structure = SyncBridge.getStructure();
        if (!structure || !structure.sections) return;

        const sectionNames = {
            'hero': 'Hero Section', 'about': 'Über uns', 'ceo-message': 'CEO Message',
            'products': 'Produkte', 'services': 'Services', 'team': 'Team',
            'locations': 'Standorte', 'contact': 'Kontakt', 'footer': 'Footer',
            'gallery': 'Galerie', 'testimonials': 'Testimonials', 'stats': 'Statistiken',
            'features': 'Features', 'cta': 'Call to Action', 'divider': 'Trenner', 'spacer': 'Abstand'
        };

        const sectionIcons = {
            'hero': 'fas fa-image', 'about': 'fas fa-info-circle', 'ceo-message': 'fas fa-quote-right',
            'products': 'fas fa-box', 'services': 'fas fa-cogs', 'team': 'fas fa-users',
            'locations': 'fas fa-map-marker-alt', 'contact': 'fas fa-envelope', 'footer': 'fas fa-window-minimize',
            'gallery': 'fas fa-images', 'testimonials': 'fas fa-star', 'stats': 'fas fa-chart-bar',
            'features': 'fas fa-check-circle', 'cta': 'fas fa-bullhorn', 'divider': 'fas fa-minus', 'spacer': 'fas fa-arrows-alt-v'
        };

        container.innerHTML = structure.sections.map((section, index) => `
            <div class="structure-item ${section.enabled ? '' : 'disabled'}"
                 data-id="${section.id}" data-index="${index}" draggable="true">
                <div class="structure-item-drag"><i class="fas fa-grip-vertical"></i></div>
                <div class="structure-item-icon"><i class="${sectionIcons[section.type] || 'fas fa-puzzle-piece'}"></i></div>
                <div class="structure-item-info">
                    <h4>${sectionNames[section.type] || section.type}</h4>
                    <span class="structure-item-type">${section.type}</span>
                </div>
                <div class="structure-item-toggle">
                    <label class="toggle-switch">
                        <input type="checkbox" ${section.enabled ? 'checked' : ''}
                               onchange="adminPanel.toggleSectionEnabled('${section.id}', this.checked)">
                        <span class="toggle-slider"></span>
                    </label>
                </div>
                <div class="structure-item-actions">
                    <button class="structure-btn" onclick="adminPanel.moveSectionUp('${section.id}')" title="Nach oben">
                        <i class="fas fa-arrow-up"></i>
                    </button>
                    <button class="structure-btn" onclick="adminPanel.moveSectionDown('${section.id}')" title="Nach unten">
                        <i class="fas fa-arrow-down"></i>
                    </button>
                    <button class="structure-btn" onclick="adminPanel.editSectionConfig('${section.id}')" title="Konfigurieren">
                        <i class="fas fa-cog"></i>
                    </button>
                    <button class="structure-btn danger" onclick="adminPanel.removeSection('${section.id}')" title="Entfernen">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');

        this.bindStructureItemDrag();
        this.renderStructurePreview();
    }

    bindStructureItemDrag() {
        document.querySelectorAll('.structure-item[draggable="true"]').forEach(item => {
            item.addEventListener('dragstart', (e) => {
                this.draggedSection = { id: item.dataset.id, index: parseInt(item.dataset.index), isNew: false };
                item.classList.add('dragging');
            });

            item.addEventListener('dragend', () => {
                item.classList.remove('dragging');
                document.querySelectorAll('.structure-item').forEach(i => {
                    i.classList.remove('drag-over-top', 'drag-over-bottom');
                });
            });

            item.addEventListener('dragover', (e) => {
                e.preventDefault();
                if (this.draggedSection && !this.draggedSection.isNew) {
                    const rect = item.getBoundingClientRect();
                    const midY = rect.top + rect.height / 2;
                    item.classList.remove('drag-over-top', 'drag-over-bottom');
                    item.classList.add(e.clientY < midY ? 'drag-over-top' : 'drag-over-bottom');
                }
            });

            item.addEventListener('drop', (e) => {
                e.preventDefault();
                if (this.draggedSection && !this.draggedSection.isNew) {
                    const fromIndex = this.draggedSection.index;
                    let toIndex = parseInt(item.dataset.index);
                    const rect = item.getBoundingClientRect();
                    if (e.clientY > rect.top + rect.height / 2) toIndex++;
                    if (fromIndex !== toIndex) {
                        this.reorderStructureSections(fromIndex, toIndex);
                    }
                }
                item.classList.remove('drag-over-top', 'drag-over-bottom');
            });
        });
    }

    reorderStructureSections(fromIndex, toIndex) {
        const structure = SyncBridge.getStructure();
        const sections = structure.sections;
        const [moved] = sections.splice(fromIndex, 1);
        sections.splice(toIndex > fromIndex ? toIndex - 1 : toIndex, 0, moved);
        sections.forEach((s, i) => s.order = i);
        SyncBridge.saveStructure(structure);
        this.renderStructure();
        this.trackChange('Sektion verschoben');
        this.showToast('success', 'Verschoben', 'Sektion wurde neu angeordnet.');
    }

    renderStructurePreview() {
        const preview = document.getElementById('previewFrame');
        if (!preview || !window.SyncBridge) return;

        const structure = SyncBridge.getStructure();
        if (!structure) return;

        const colors = {
            'hero': '#4a90d9', 'about': '#50c878', 'ceo-message': '#9b59b6',
            'products': '#e67e22', 'services': '#3498db', 'team': '#1abc9c',
            'locations': '#e74c3c', 'contact': '#f39c12', 'footer': '#34495e',
            'gallery': '#8e44ad', 'testimonials': '#d35400', 'stats': '#16a085',
            'features': '#27ae60', 'cta': '#c0392b', 'divider': '#95a5a6', 'spacer': '#bdc3c7'
        };

        preview.innerHTML = structure.sections.map(section => `
            <div class="preview-section ${section.enabled ? '' : 'disabled'}"
                 style="background: ${colors[section.type] || '#7f8c8d'}">
                <span>${section.type}</span>
            </div>
        `).join('');
    }

    addSectionOfType(type) {
        if (!window.SyncBridge) return;
        SyncBridge.addSection(type);
        this.renderStructure();
        this.trackChange('Sektion hinzugefügt');
        this.showToast('success', 'Hinzugefügt', `${type} Sektion wurde hinzugefügt.`);
    }

    toggleSectionEnabled(sectionId, enabled) {
        if (!window.SyncBridge) return;
        SyncBridge.toggleSection(sectionId, enabled);
        this.renderStructure();
        this.trackChange(enabled ? 'Sektion aktiviert' : 'Sektion deaktiviert');
    }

    moveSectionUp(sectionId) {
        if (!window.SyncBridge) return;
        if (SyncBridge.moveSection(sectionId, 'up')) {
            this.renderStructure();
            this.trackChange('Sektion nach oben verschoben');
        }
    }

    moveSectionDown(sectionId) {
        if (!window.SyncBridge) return;
        if (SyncBridge.moveSection(sectionId, 'down')) {
            this.renderStructure();
            this.trackChange('Sektion nach unten verschoben');
        }
    }

    removeSection(sectionId) {
        if (!confirm('Sektion wirklich entfernen?')) return;
        if (!window.SyncBridge) return;
        if (SyncBridge.removeSection(sectionId)) {
            this.renderStructure();
            this.trackChange('Sektion entfernt');
            this.showToast('success', 'Entfernt', 'Sektion wurde entfernt.');
        }
    }

    editSectionConfig(sectionId) {
        if (!window.SyncBridge) return;

        const structure = SyncBridge.getStructure();
        const section = structure.sections.find(s => s.id === sectionId);
        if (!section) return;

        const config = section.config || {};
        let configFields = '';

        switch (section.type) {
            case 'hero':
                configFields = `
                    <div class="form-group">
                        <label>Volle Höhe</label>
                        <select class="form-input" id="configFullHeight">
                            <option value="true" ${config.fullHeight ? 'selected' : ''}>Ja</option>
                            <option value="false" ${!config.fullHeight ? 'selected' : ''}>Nein</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Textausrichtung</label>
                        <select class="form-input" id="configTextAlign">
                            <option value="left" ${config.textAlign === 'left' ? 'selected' : ''}>Links</option>
                            <option value="center" ${config.textAlign === 'center' ? 'selected' : ''}>Zentriert</option>
                            <option value="right" ${config.textAlign === 'right' ? 'selected' : ''}>Rechts</option>
                        </select>
                    </div>
                `;
                break;
            case 'products':
            case 'team':
            case 'locations':
                configFields = `
                    <div class="form-group">
                        <label>Spalten</label>
                        <select class="form-input" id="configColumns">
                            ${[2, 3, 4, 5, 6].map(n => `<option value="${n}" ${config.columns == n ? 'selected' : ''}>${n}</option>`).join('')}
                        </select>
                    </div>
                `;
                break;
            case 'spacer':
                configFields = `
                    <div class="form-group">
                        <label>Höhe</label>
                        <input type="text" class="form-input" id="configHeight" value="${config.height || '60px'}">
                    </div>
                `;
                break;
            default:
                configFields = '<p>Keine Konfigurationsoptionen für diese Sektion verfügbar.</p>';
        }

        this.openModal(`${section.type} konfigurieren`, configFields, () => {
            const newConfig = {};
            const fields = ['fullHeight', 'textAlign', 'columns', 'height'];
            fields.forEach(field => {
                const el = document.getElementById(`config${field.charAt(0).toUpperCase() + field.slice(1)}`);
                if (el) {
                    if (el.value === 'true') newConfig[field] = true;
                    else if (el.value === 'false') newConfig[field] = false;
                    else if (!isNaN(el.value) && el.value !== '') newConfig[field] = parseInt(el.value);
                    else newConfig[field] = el.value;
                }
            });

            SyncBridge.updateSectionConfig(sectionId, newConfig);
            this.renderStructure();
            this.renderVisualBuilder();
            this.trackChange('Sektionskonfiguration geändert');
            this.showToast('success', 'Gespeichert', 'Konfiguration wurde aktualisiert.');
        });
    }

    previewStructure() {
        window.open('index.html', '_blank');
    }

    // ============================================
    // VISUAL PAGE BUILDER
    // ============================================
    setBuilderMode(mode) {
        // Update buttons
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });

        // Toggle containers
        const visualContainer = document.getElementById('visualBuilderContainer');
        const listContainer = document.getElementById('listModeContainer');

        if (mode === 'visual') {
            visualContainer.style.display = 'grid';
            listContainer.style.display = 'none';
            this.renderVisualBuilder();
        } else {
            visualContainer.style.display = 'none';
            listContainer.style.display = 'grid';
            this.renderStructure();
        }
    }

    initVisualBuilder() {
        this.previewZoom = 100;
        this.selectedSection = null;
        this.dragModeActive = false;
        this.sectionVisibility = {};
        this.sectionOrder = null;

        // Warte auf iframe load und scanne dann automatisch
        const iframe = document.getElementById('websitePreview');
        if (iframe) {
            // Prüfe ob iframe bereits geladen
            if (iframe.contentDocument && iframe.contentDocument.body && iframe.contentDocument.body.children.length > 0) {
                console.log('iframe already loaded - scanning now');
                this._scannedSections = null;
                this.renderLiveBuilder();
                // Aktiviere Bearbeitungsmodus automatisch
                setTimeout(() => this.activateEditMode(), 500);
            }

            iframe.onload = () => {
                console.log('Website preview loaded - scanning sections...');
                // Cache löschen für neuen Scan
                this._scannedSections = null;
                // Längere Wartezeit bis DOM und CSS vollständig geladen
                setTimeout(() => {
                    this._scannedSections = null;
                    const sections = this.getWebsiteSections();
                    console.log(`Found ${sections.length} sections:`, sections.map(s => s.name));
                    this.renderLiveBuilder();
                    // Aktiviere Bearbeitungsmodus automatisch
                    setTimeout(() => this.activateEditMode(), 500);
                    // Initialisiere Upload-Zonen
                    this.initAllUploadZones();
                }, 1000);
            };
        }

        // Initial render (zeigt "Laden..." wenn noch keine Sektionen)
        this.renderLiveBuilder();
    }

    // Bearbeitungsmodus aktivieren (ohne Toggle)
    activateEditMode() {
        if (this.dragModeActive) return; // Schon aktiv

        this.dragModeActive = true;
        const toggleBtn = document.getElementById('toggleDragMode');
        if (toggleBtn) {
            toggleBtn.classList.add('active');
            toggleBtn.innerHTML = '<i class="fas fa-check"></i>';
            toggleBtn.title = 'Bearbeitungsmodus beenden';
        }
        this.injectDragHandlesIntoIframe();

        // Disable hover trigger system in iframe
        const iframe = document.getElementById('websitePreview');
        if (iframe && iframe.contentDocument) {
            iframe.contentDocument.body.classList.add('admin-edit-mode');
            // Also set global flag if HoverTriggerSystem exists
            if (iframe.contentWindow && iframe.contentWindow.hoverTriggerSystem) {
                iframe.contentWindow.hoverTriggerSystem.setEnabled(false);
            }
        }

        console.log('Bearbeitungsmodus automatisch aktiviert');

        // Wähle automatisch das erste sichtbare Element aus
        setTimeout(() => {
            const iframe = document.getElementById('websitePreview');
            if (iframe && iframe.contentDocument) {
                const firstSection = iframe.contentDocument.querySelector('section');
                if (firstSection) {
                    this.selectElement(firstSection, iframe.contentDocument);
                    console.log('Erstes Element automatisch ausgewählt:', firstSection.className);
                }
            }
        }, 300);
    }

    renderVisualBuilder() {
        this.renderLiveBuilder();
    }

    renderLiveBuilder() {
        const sectionList = document.getElementById('builderSectionList');
        const sectionCount = document.getElementById('sectionCount');
        if (!sectionList) return;

        // Get sections from website HTML
        const sections = this.getWebsiteSections();

        // Wenn keine Sektionen gefunden, zeige Ladehinweis
        if (sections.length === 0) {
            sectionList.innerHTML = `
                <div style="padding: 20px; text-align: center; color: var(--gray-500);">
                    <i class="fas fa-spinner fa-spin" style="font-size: 24px; margin-bottom: 10px;"></i>
                    <p>Sektionen werden geladen...</p>
                </div>
                <button class="add-section-btn" onclick="adminPanel.openSectionModal()">
                    <i class="fas fa-plus"></i>
                    Neue Sektion hinzufügen
                </button>
            `;
            return;
        }

        // Update count
        const activeCount = sections.filter(s => s.visible !== false).length;
        if (sectionCount) {
            sectionCount.textContent = `${activeCount} aktiv`;
        }

        const sectionIcons = {
            'hero': 'fa-image', 'about': 'fa-info-circle', 'ceo': 'fa-quote-right',
            'products': 'fa-box', 'partners': 'fa-handshake', 'services': 'fa-cogs',
            'team': 'fa-users', 'locations': 'fa-map-marker-alt', 'projects': 'fa-briefcase',
            'contact': 'fa-envelope', 'footer': 'fa-window-minimize', 'values': 'fa-heart',
            'sustainability': 'fa-leaf', 'testimonials': 'fa-star', 'portfolio': 'fa-briefcase'
        };

        sectionList.innerHTML = sections.map((section, index) => `
            <div class="section-list-item ${section.visible === false ? 'disabled' : ''} ${this.selectedSection === section.id ? 'active' : ''}"
                 data-id="${section.id}"
                 data-index="${index}"
                 draggable="true"
                 onclick="adminPanel.selectSection('${section.id}')">
                <div class="section-list-icon ${section.type}">
                    <i class="fas ${sectionIcons[section.type] || 'fa-square'}"></i>
                </div>
                <div class="section-list-info">
                    <h4>${section.name}</h4>
                    <span>${section.visible === false ? 'Versteckt' : 'Sichtbar'}</span>
                </div>
                <div class="section-list-actions">
                    <button onclick="event.stopPropagation(); adminPanel.scrollToSection('${section.id}')" title="Zur Sektion scrollen">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button onclick="event.stopPropagation(); adminPanel.toggleSectionVisibility('${section.id}')" title="${section.visible === false ? 'Einblenden' : 'Ausblenden'}">
                        <i class="fas fa-${section.visible === false ? 'eye' : 'eye-slash'}"></i>
                    </button>
                </div>
            </div>
        `).join('');

        // Add "+" Button am Ende der Sektionsliste (nur goldener Button)
        sectionList.innerHTML += `
            <button class="add-section-btn" onclick="adminPanel.openSectionModal()">
                <i class="fas fa-plus"></i>
                Neue Sektion hinzufügen
            </button>
        `;

        this.bindSectionListDrag();
    }

    // Modal für Sektionsauswahl öffnen
    openSectionModal() {
        const modal = document.getElementById('sectionAddModal');
        if (modal) {
            modal.classList.add('active');
        }
    }

    // Modal schließen
    closeSectionModal() {
        const modal = document.getElementById('sectionAddModal');
        if (modal) {
            modal.classList.remove('active');
        }
    }

    // Sektion hinzufügen
    addSection(type) {
        // Schließe Modal
        this.closeSectionModal();

        // Generiere Sektions-HTML basierend auf Typ
        const sectionTemplates = {
            'hero': `
                <section id="hero-new" class="hero-section" style="min-height: 60vh; background: linear-gradient(135deg, #0a1628 0%, #1a3a5c 100%); display: flex; align-items: center; justify-content: center; color: white; text-align: center;">
                    <div style="padding: 40px;">
                        <h1 style="font-size: 48px; margin-bottom: 20px;">Ihre Überschrift</h1>
                        <p style="font-size: 20px; opacity: 0.9;">Ihre Beschreibung hier</p>
                        <button style="margin-top: 30px; padding: 15px 40px; background: #c9a227; border: none; color: #0a1628; font-size: 16px; font-weight: bold; border-radius: 8px; cursor: pointer;">Jetzt starten</button>
                    </div>
                </section>
            `,
            'about': `
                <section id="about-new" class="about-section" style="padding: 80px 5%; background: #f8f9fa;">
                    <div style="max-width: 1200px; margin: 0 auto;">
                        <h2 style="font-size: 36px; color: #0a1628; margin-bottom: 20px; text-align: center;">Über uns</h2>
                        <p style="font-size: 18px; color: #6c757d; text-align: center; max-width: 800px; margin: 0 auto;">Beschreiben Sie hier Ihr Unternehmen, Ihre Mission und Ihre Werte.</p>
                    </div>
                </section>
            `,
            'ceo-message': `
                <section id="ceo-new" class="ceo-section" style="padding: 80px 5%; background: #0a1628; color: white;">
                    <div style="max-width: 1000px; margin: 0 auto; text-align: center;">
                        <div style="width: 120px; height: 120px; border-radius: 50%; background: #1a3a5c; margin: 0 auto 30px; display: flex; align-items: center; justify-content: center;">
                            <i class="fas fa-user" style="font-size: 48px; color: #c9a227;"></i>
                        </div>
                        <blockquote style="font-size: 24px; font-style: italic; margin-bottom: 30px;">"Ihre inspirierende Nachricht hier"</blockquote>
                        <p style="font-size: 18px; color: #c9a227;">Name, Position</p>
                    </div>
                </section>
            `,
            'products': `
                <section id="products-new" class="products-section" style="padding: 80px 5%; background: white;">
                    <div style="max-width: 1200px; margin: 0 auto;">
                        <h2 style="font-size: 36px; color: #0a1628; margin-bottom: 40px; text-align: center;">Unsere Produkte</h2>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 30px;">
                            <div style="background: #f8f9fa; padding: 30px; border-radius: 12px; text-align: center;">
                                <i class="fas fa-box" style="font-size: 48px; color: #c9a227; margin-bottom: 20px;"></i>
                                <h3 style="font-size: 22px; color: #0a1628; margin-bottom: 10px;">Produkt 1</h3>
                                <p style="color: #6c757d;">Produktbeschreibung</p>
                            </div>
                            <div style="background: #f8f9fa; padding: 30px; border-radius: 12px; text-align: center;">
                                <i class="fas fa-box" style="font-size: 48px; color: #c9a227; margin-bottom: 20px;"></i>
                                <h3 style="font-size: 22px; color: #0a1628; margin-bottom: 10px;">Produkt 2</h3>
                                <p style="color: #6c757d;">Produktbeschreibung</p>
                            </div>
                            <div style="background: #f8f9fa; padding: 30px; border-radius: 12px; text-align: center;">
                                <i class="fas fa-box" style="font-size: 48px; color: #c9a227; margin-bottom: 20px;"></i>
                                <h3 style="font-size: 22px; color: #0a1628; margin-bottom: 10px;">Produkt 3</h3>
                                <p style="color: #6c757d;">Produktbeschreibung</p>
                            </div>
                        </div>
                    </div>
                </section>
            `,
            'services': `
                <section id="services-new" class="services-section" style="padding: 80px 5%; background: #f8f9fa;">
                    <div style="max-width: 1200px; margin: 0 auto;">
                        <h2 style="font-size: 36px; color: #0a1628; margin-bottom: 40px; text-align: center;">Unsere Leistungen</h2>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 30px;">
                            <div style="background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
                                <i class="fas fa-cog" style="font-size: 36px; color: #c9a227; margin-bottom: 20px;"></i>
                                <h3 style="font-size: 20px; color: #0a1628; margin-bottom: 10px;">Service 1</h3>
                                <p style="color: #6c757d;">Service-Beschreibung</p>
                            </div>
                            <div style="background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
                                <i class="fas fa-cog" style="font-size: 36px; color: #c9a227; margin-bottom: 20px;"></i>
                                <h3 style="font-size: 20px; color: #0a1628; margin-bottom: 10px;">Service 2</h3>
                                <p style="color: #6c757d;">Service-Beschreibung</p>
                            </div>
                        </div>
                    </div>
                </section>
            `,
            'features': `
                <section id="features-new" class="features-section" style="padding: 80px 5%; background: white;">
                    <div style="max-width: 1200px; margin: 0 auto;">
                        <h2 style="font-size: 36px; color: #0a1628; margin-bottom: 40px; text-align: center;">Unsere Vorteile</h2>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 30px;">
                            <div style="text-align: center; padding: 20px;">
                                <i class="fas fa-check-circle" style="font-size: 48px; color: #28a745; margin-bottom: 15px;"></i>
                                <h4 style="color: #0a1628; margin-bottom: 10px;">Feature 1</h4>
                                <p style="color: #6c757d;">Beschreibung</p>
                            </div>
                            <div style="text-align: center; padding: 20px;">
                                <i class="fas fa-check-circle" style="font-size: 48px; color: #28a745; margin-bottom: 15px;"></i>
                                <h4 style="color: #0a1628; margin-bottom: 10px;">Feature 2</h4>
                                <p style="color: #6c757d;">Beschreibung</p>
                            </div>
                            <div style="text-align: center; padding: 20px;">
                                <i class="fas fa-check-circle" style="font-size: 48px; color: #28a745; margin-bottom: 15px;"></i>
                                <h4 style="color: #0a1628; margin-bottom: 10px;">Feature 3</h4>
                                <p style="color: #6c757d;">Beschreibung</p>
                            </div>
                        </div>
                    </div>
                </section>
            `,
            'pricing': `
                <section id="pricing-new" class="pricing-section" style="padding: 80px 5%; background: #f8f9fa;">
                    <div style="max-width: 1200px; margin: 0 auto;">
                        <h2 style="font-size: 36px; color: #0a1628; margin-bottom: 40px; text-align: center;">Unsere Preise</h2>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 30px;">
                            <div style="background: white; padding: 40px; border-radius: 12px; text-align: center; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
                                <h3 style="color: #0a1628; margin-bottom: 10px;">Basic</h3>
                                <p style="font-size: 48px; color: #c9a227; font-weight: bold; margin: 20px 0;">€99</p>
                                <ul style="list-style: none; padding: 0; margin: 20px 0;">
                                    <li style="padding: 8px 0; color: #6c757d;">Feature 1</li>
                                    <li style="padding: 8px 0; color: #6c757d;">Feature 2</li>
                                </ul>
                                <button style="padding: 12px 30px; background: #0a1628; color: white; border: none; border-radius: 6px; cursor: pointer;">Auswählen</button>
                            </div>
                        </div>
                    </div>
                </section>
            `,
            'team': `
                <section id="team-new" class="team-section" style="padding: 80px 5%; background: white;">
                    <div style="max-width: 1200px; margin: 0 auto;">
                        <h2 style="font-size: 36px; color: #0a1628; margin-bottom: 40px; text-align: center;">Unser Team</h2>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 30px;">
                            <div style="text-align: center;">
                                <div style="width: 150px; height: 150px; border-radius: 50%; background: #e9ecef; margin: 0 auto 20px;"></div>
                                <h4 style="color: #0a1628; margin-bottom: 5px;">Name</h4>
                                <p style="color: #c9a227;">Position</p>
                            </div>
                        </div>
                    </div>
                </section>
            `,
            'locations': `
                <section id="locations-new" class="locations-section" style="padding: 80px 5%; background: #0a1628; color: white;">
                    <div style="max-width: 1200px; margin: 0 auto; text-align: center;">
                        <h2 style="font-size: 36px; margin-bottom: 40px;">Unsere Standorte</h2>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 30px;">
                            <div>
                                <i class="fas fa-map-marker-alt" style="font-size: 36px; color: #c9a227; margin-bottom: 15px;"></i>
                                <h4>Standort 1</h4>
                                <p style="opacity: 0.8;">Adresse hier</p>
                            </div>
                        </div>
                    </div>
                </section>
            `,
            'contact': `
                <section id="contact-new" class="contact-section" style="padding: 80px 5%; background: #f8f9fa;">
                    <div style="max-width: 800px; margin: 0 auto;">
                        <h2 style="font-size: 36px; color: #0a1628; margin-bottom: 40px; text-align: center;">Kontakt</h2>
                        <form style="display: grid; gap: 20px;">
                            <input type="text" placeholder="Ihr Name" style="padding: 15px; border: 1px solid #dee2e6; border-radius: 8px; font-size: 16px;">
                            <input type="email" placeholder="Ihre E-Mail" style="padding: 15px; border: 1px solid #dee2e6; border-radius: 8px; font-size: 16px;">
                            <textarea placeholder="Ihre Nachricht" rows="5" style="padding: 15px; border: 1px solid #dee2e6; border-radius: 8px; font-size: 16px;"></textarea>
                            <button type="submit" style="padding: 15px 40px; background: #c9a227; border: none; color: #0a1628; font-size: 16px; font-weight: bold; border-radius: 8px; cursor: pointer;">Absenden</button>
                        </form>
                    </div>
                </section>
            `,
            'testimonials': `
                <section id="testimonials-new" class="testimonials-section" style="padding: 80px 5%; background: white;">
                    <div style="max-width: 1000px; margin: 0 auto; text-align: center;">
                        <h2 style="font-size: 36px; color: #0a1628; margin-bottom: 40px;">Kundenstimmen</h2>
                        <div style="background: #f8f9fa; padding: 40px; border-radius: 12px;">
                            <p style="font-size: 20px; font-style: italic; color: #495057; margin-bottom: 20px;">"Großartiger Service und exzellente Zusammenarbeit!"</p>
                            <p style="color: #c9a227; font-weight: bold;">- Kunde Name, Firma</p>
                        </div>
                    </div>
                </section>
            `,
            'partners': `
                <section id="partners-new" class="partners-section" style="padding: 60px 5%; background: #f8f9fa;">
                    <div style="max-width: 1200px; margin: 0 auto; text-align: center;">
                        <h3 style="font-size: 24px; color: #6c757d; margin-bottom: 30px;">Unsere Partner</h3>
                        <div style="display: flex; justify-content: center; gap: 50px; flex-wrap: wrap; opacity: 0.6;">
                            <div style="width: 120px; height: 60px; background: #dee2e6; border-radius: 8px;"></div>
                            <div style="width: 120px; height: 60px; background: #dee2e6; border-radius: 8px;"></div>
                            <div style="width: 120px; height: 60px; background: #dee2e6; border-radius: 8px;"></div>
                        </div>
                    </div>
                </section>
            `,
            'stats': `
                <section id="stats-new" class="stats-section" style="padding: 60px 5%; background: #0a1628; color: white;">
                    <div style="max-width: 1200px; margin: 0 auto;">
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 30px; text-align: center;">
                            <div>
                                <p style="font-size: 48px; font-weight: bold; color: #c9a227;">100+</p>
                                <p style="opacity: 0.8;">Kunden</p>
                            </div>
                            <div>
                                <p style="font-size: 48px; font-weight: bold; color: #c9a227;">50</p>
                                <p style="opacity: 0.8;">Projekte</p>
                            </div>
                            <div>
                                <p style="font-size: 48px; font-weight: bold; color: #c9a227;">10</p>
                                <p style="opacity: 0.8;">Jahre Erfahrung</p>
                            </div>
                        </div>
                    </div>
                </section>
            `,
            'gallery': `
                <section id="gallery-new" class="gallery-section" style="padding: 80px 5%; background: white;">
                    <div style="max-width: 1200px; margin: 0 auto;">
                        <h2 style="font-size: 36px; color: #0a1628; margin-bottom: 40px; text-align: center;">Galerie</h2>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px;">
                            <div style="height: 200px; background: #e9ecef; border-radius: 12px;"></div>
                            <div style="height: 200px; background: #e9ecef; border-radius: 12px;"></div>
                            <div style="height: 200px; background: #e9ecef; border-radius: 12px;"></div>
                        </div>
                    </div>
                </section>
            `,
            'video': `
                <section id="video-new" class="video-section" style="padding: 80px 5%; background: #0a1628;">
                    <div style="max-width: 1000px; margin: 0 auto; text-align: center;">
                        <h2 style="font-size: 36px; color: white; margin-bottom: 30px;">Video</h2>
                        <div style="aspect-ratio: 16/9; background: #1a3a5c; border-radius: 12px; display: flex; align-items: center; justify-content: center;">
                            <i class="fas fa-play-circle" style="font-size: 72px; color: #c9a227;"></i>
                        </div>
                    </div>
                </section>
            `,
            'blog': `
                <section id="blog-new" class="blog-section" style="padding: 80px 5%; background: #f8f9fa;">
                    <div style="max-width: 1200px; margin: 0 auto;">
                        <h2 style="font-size: 36px; color: #0a1628; margin-bottom: 40px; text-align: center;">Blog & News</h2>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 30px;">
                            <div style="background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
                                <div style="height: 180px; background: #e9ecef;"></div>
                                <div style="padding: 20px;">
                                    <p style="color: #c9a227; font-size: 12px; margin-bottom: 10px;">01. Januar 2024</p>
                                    <h4 style="color: #0a1628; margin-bottom: 10px;">Blog Titel</h4>
                                    <p style="color: #6c757d;">Kurze Beschreibung...</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
            `,
            'cta': `
                <section id="cta-new" class="cta-section" style="padding: 80px 5%; background: linear-gradient(135deg, #c9a227 0%, #a88a1f 100%); text-align: center;">
                    <div style="max-width: 800px; margin: 0 auto;">
                        <h2 style="font-size: 36px; color: #0a1628; margin-bottom: 20px;">Bereit loszulegen?</h2>
                        <p style="font-size: 18px; color: #0a1628; opacity: 0.9; margin-bottom: 30px;">Kontaktieren Sie uns noch heute</p>
                        <button style="padding: 15px 40px; background: #0a1628; border: none; color: white; font-size: 16px; font-weight: bold; border-radius: 8px; cursor: pointer;">Jetzt kontaktieren</button>
                    </div>
                </section>
            `,
            'faq': `
                <section id="faq-new" class="faq-section" style="padding: 80px 5%; background: white;">
                    <div style="max-width: 800px; margin: 0 auto;">
                        <h2 style="font-size: 36px; color: #0a1628; margin-bottom: 40px; text-align: center;">Häufige Fragen</h2>
                        <div style="border: 1px solid #dee2e6; border-radius: 12px; overflow: hidden;">
                            <div style="padding: 20px; background: #f8f9fa; border-bottom: 1px solid #dee2e6;">
                                <h4 style="color: #0a1628; display: flex; justify-content: space-between; align-items: center;">
                                    Frage 1? <i class="fas fa-chevron-down"></i>
                                </h4>
                            </div>
                            <div style="padding: 20px;">
                                <p style="color: #6c757d;">Antwort auf die Frage...</p>
                            </div>
                        </div>
                    </div>
                </section>
            `,
            'divider': `
                <div id="divider-new" style="width: 100%; height: 2px; background: linear-gradient(90deg, transparent 0%, #c9a227 50%, transparent 100%); margin: 40px 0;"></div>
            `,
            'spacer': `
                <div id="spacer-new" style="width: 100%; height: 80px;"></div>
            `
        };

        const template = sectionTemplates[type];
        if (!template) {
            this.showToast('error', 'Fehler', `Template für "${type}" nicht gefunden`);
            return;
        }

        // Füge Sektion in die Website ein
        const iframe = document.getElementById('websitePreview');
        if (!iframe || !iframe.contentDocument) {
            this.showToast('error', 'Fehler', 'Website-Vorschau nicht verfügbar');
            return;
        }

        const doc = iframe.contentDocument;

        // Finde Footer oder füge am Ende des body ein
        const footer = doc.querySelector('footer');
        const main = doc.querySelector('main') || doc.body;

        // Erstelle temporäres Element zum Parsen
        const tempDiv = doc.createElement('div');
        tempDiv.innerHTML = template.trim();
        const newSection = tempDiv.firstChild;

        // Generiere eindeutige ID
        const timestamp = Date.now();
        newSection.id = `${type}-${timestamp}`;

        if (footer) {
            main.insertBefore(newSection, footer);
        } else {
            main.appendChild(newSection);
        }

        // Cache löschen und neu scannen
        this._scannedSections = null;
        this.renderLiveBuilder();

        // Scrolle zur neuen Sektion
        newSection.scrollIntoView({ behavior: 'smooth', block: 'center' });

        this.showToast('success', 'Sektion hinzugefügt', `"${type}" wurde erfolgreich hinzugefügt`);

        // Wähle die neue Sektion aus
        setTimeout(() => {
            this.selectElement(newSection, doc);
        }, 500);
    }

    getWebsiteSections() {
        // DYNAMISCH: Scanne die Website automatisch nach Sektionen
        // Funktioniert mit JEDER Website!

        // Wenn bereits gescannt, verwende Cache
        if (this._scannedSections && this._scannedSections.length > 0) {
            return this._applySectionOrder(this._scannedSections);
        }

        const iframe = document.getElementById('websitePreview');
        if (!iframe || !iframe.contentDocument || !iframe.contentDocument.body) {
            // Fallback: Leere Liste, wird beim iframe load gefüllt
            return [];
        }

        const doc = iframe.contentDocument;
        const sections = [];

        // Bekannte Sektions-Keywords für automatische Typ-Erkennung
        const typeKeywords = {
            'hero': ['hero', 'banner', 'jumbotron', 'intro', 'splash', 'landing', 'header-main'],
            'about': ['about', 'über', 'ueber', 'who-we-are', 'company', 'firma', 'unternehmen'],
            'services': ['services', 'service', 'dienstleistungen', 'leistungen', 'angebot'],
            'products': ['products', 'product', 'produkte', 'produkt', 'shop', 'store'],
            'team': ['team', 'staff', 'mitarbeiter', 'people', 'crew', 'employees'],
            'contact': ['contact', 'kontakt', 'reach', 'get-in-touch', 'anfrage'],
            'partners': ['partners', 'partner', 'clients', 'kunden', 'trusted'],
            'testimonials': ['testimonials', 'reviews', 'feedback', 'referenzen', 'kundenstimmen', 'bewertungen'],
            'portfolio': ['portfolio', 'work', 'projects', 'projekte', 'gallery', 'showcase', 'arbeiten'],
            'blog': ['blog', 'news', 'articles', 'aktuelles', 'neuigkeiten', 'posts'],
            'faq': ['faq', 'questions', 'hilfe', 'help', 'support'],
            'pricing': ['pricing', 'preise', 'plans', 'packages', 'tarife'],
            'features': ['features', 'funktionen', 'benefits', 'vorteile', 'highlights'],
            'cta': ['cta', 'call-to-action', 'action', 'signup', 'register'],
            'footer': ['footer', 'site-footer', 'main-footer', 'bottom'],
            'locations': ['locations', 'standorte', 'offices', 'map', 'address', 'adresse'],
            'values': ['values', 'werte', 'mission', 'vision', 'philosophy', 'kultur'],
            'sustainability': ['sustainability', 'nachhaltigkeit', 'green', 'eco', 'environment', 'umwelt'],
            'ceo': ['ceo', 'founder', 'gründer', 'message', 'letter', 'grußwort', 'geschäftsführer'],
            'gallery': ['gallery', 'galerie', 'images', 'bilder', 'photos', 'fotos'],
            'stats': ['stats', 'statistics', 'numbers', 'zahlen', 'facts', 'fakten'],
            'process': ['process', 'prozess', 'steps', 'schritte', 'how-it-works', 'ablauf']
        };

        // PRIMÄR: Alle <section> Elemente im Dokument finden
        const allSections = doc.querySelectorAll('section');
        const addedSelectors = new Set();

        console.log('Gefundene section-Elemente im iframe:', allSections.length);

        allSections.forEach((el, idx) => {
            // Überspringe Elemente in der Navigation
            if (el.closest('nav')) return;

            const elId = el.id || '';
            const elClass = el.className && typeof el.className === 'string' ? el.className : '';
            const combined = `${elId} ${elClass}`.toLowerCase();

            console.log(`Section ${idx}:`, { id: elId, class: elClass, height: el.offsetHeight });

            // Erkenne den Typ automatisch
            let detectedType = 'section';
            let detectedName = '';

            for (const [type, keywords] of Object.entries(typeKeywords)) {
                for (const keyword of keywords) {
                    if (combined.includes(keyword)) {
                        detectedType = type;
                        detectedName = this._formatSectionName(type);
                        break;
                    }
                }
                if (detectedName) break;
            }

            // Fallback Name
            if (!detectedName) {
                if (elId) {
                    detectedName = this._formatSectionName(elId);
                } else if (elClass) {
                    const mainClass = elClass.split(' ')[0];
                    detectedName = this._formatSectionName(mainClass.replace(/-section|section-|Section/gi, ''));
                } else {
                    detectedName = `Sektion ${sections.length + 1}`;
                }
            }

            // Erstelle Selector - bevorzuge ID, dann spezifische Klassen
            let selector = '';
            if (elId) {
                selector = `#${elId}`;
            } else if (elClass) {
                const classes = elClass.split(' ').filter(c => c.trim() && !c.includes(':'));
                // Suche nach einer Klasse die "-section" enthält
                for (const cls of classes) {
                    if (cls.includes('-section') || cls.includes('section-')) {
                        selector = `section.${cls}`;
                        break;
                    }
                }
                // Fallback: Erste Klasse
                if (!selector && classes.length > 0) {
                    selector = `section.${classes[0]}`;
                }
            }

            // Fallback für Sektionen ohne ID und ohne Klasse: nth-child
            if (!selector) {
                const parent = el.parentElement;
                if (parent) {
                    const siblings = Array.from(parent.querySelectorAll(':scope > section'));
                    const index = siblings.indexOf(el);
                    if (index !== -1) {
                        selector = `section:nth-of-type(${index + 1})`;
                    }
                }
            }

            if (selector && !addedSelectors.has(selector)) {
                const sectionId = elId || `section-${sections.length}`;
                // Prüfe gespeicherte Sichtbarkeit oder ob Element versteckt ist
                const isHidden = el.style.display === 'none' || el.style.visibility === 'hidden';
                const savedVisibility = this.sectionVisibility[sectionId];
                const isVisible = savedVisibility !== undefined ? savedVisibility : !isHidden;

                sections.push({
                    id: sectionId,
                    type: detectedType,
                    name: detectedName,
                    selector: selector,
                    visible: isVisible
                });
                addedSelectors.add(selector);
            }
        });

        // Füge Footer hinzu wenn vorhanden
        const footer = doc.querySelector('footer');
        if (footer && !addedSelectors.has('footer')) {
            const footerVisible = this.sectionVisibility['footer'] !== undefined ? this.sectionVisibility['footer'] : true;
            sections.push({
                id: 'footer',
                type: 'footer',
                name: 'Footer',
                selector: 'footer',
                visible: footerVisible
            });
            addedSelectors.add('footer');
        }

        // Sortiere nach Position im DOM
        sections.sort((a, b) => {
            try {
                const elA = doc.querySelector(a.selector);
                const elB = doc.querySelector(b.selector);
                if (!elA || !elB) return 0;
                return elA.getBoundingClientRect().top - elB.getBoundingClientRect().top;
            } catch(e) {
                return 0;
            }
        });

        // Cache die Ergebnisse
        this._scannedSections = sections;
        console.log('Gefundene Sektionen:', sections.length, sections.map(s => s.name));

        return this._applySectionOrder(sections);
    }

    _applySectionOrder(sections) {
        // Wende gespeicherte Reihenfolge an
        let result = sections;
        if (this.sectionOrder && this.sectionOrder.length > 0) {
            result = this.sectionOrder
                .map(id => sections.find(s => s.id === id))
                .filter(Boolean);

            // Füge fehlende Sektionen am Ende hinzu
            sections.forEach(s => {
                if (!result.find(existing => existing.id === s.id)) {
                    result.push(s);
                }
            });
        }

        // Füge Visibility-Status hinzu
        return result.map(s => ({
            ...s,
            visible: this.sectionVisibility ? (this.sectionVisibility[s.id] !== false) : true
        }));
    }

    _formatSectionName(str) {
        // Konvertiert "about-us" oder "aboutUs" zu "About Us"
        if (!str) return 'Sektion';
        return str
            .replace(/[-_]/g, ' ')
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            .split(' ')
            .filter(w => w.length > 0)
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ')
            .substring(0, 30); // Max 30 Zeichen
    }

    refreshSections() {
        // Cache löschen und Website neu scannen
        this._scannedSections = null;
        this.sectionOrder = null;

        // Prüfe ob iframe geladen
        const iframe = document.getElementById('websitePreview');
        if (iframe && iframe.contentDocument) {
            const doc = iframe.contentDocument;
            const sectionCount = doc.querySelectorAll('section').length;
            console.log('Manual refresh - sections in iframe:', sectionCount);

            if (sectionCount === 0) {
                // iframe möglicherweise noch nicht geladen - reload
                iframe.src = iframe.src;
                this.showToast('info', 'Neu laden', 'Website wird neu geladen...');
                return;
            }
        }

        this.renderLiveBuilder();
        this.showToast('info', 'Aktualisiert', 'Website-Sektionen wurden neu gescannt');
    }

    bindSectionListDrag() {
        const list = document.getElementById('builderSectionList');
        const items = list.querySelectorAll('.section-list-item');

        items.forEach(item => {
            item.addEventListener('dragstart', (e) => {
                if (!this.dragModeActive) {
                    e.preventDefault();
                    return;
                }
                this.draggedSection = {
                    id: item.dataset.id,
                    index: parseInt(item.dataset.index),
                    isNew: false
                };
                item.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';

                // Verzögerung für bessere visuelle Rückmeldung
                setTimeout(() => {
                    item.style.opacity = '0.4';
                }, 0);
            });

            item.addEventListener('dragend', () => {
                item.classList.remove('dragging');
                item.style.opacity = '';
                items.forEach(i => {
                    i.classList.remove('drag-over-top', 'drag-over-bottom');
                });
                this.draggedSection = null;
            });

            item.addEventListener('dragover', (e) => {
                e.preventDefault();
                if (!this.draggedSection || this.draggedSection.id === item.dataset.id) return;

                e.dataTransfer.dropEffect = 'move';

                const rect = item.getBoundingClientRect();
                const midY = rect.top + rect.height / 2;

                items.forEach(i => i.classList.remove('drag-over-top', 'drag-over-bottom'));

                if (e.clientY < midY) {
                    item.classList.add('drag-over-top');
                } else {
                    item.classList.add('drag-over-bottom');
                }
            });

            item.addEventListener('dragleave', () => {
                item.classList.remove('drag-over-top', 'drag-over-bottom');
            });

            item.addEventListener('drop', (e) => {
                e.preventDefault();
                e.stopPropagation();

                items.forEach(i => i.classList.remove('drag-over-top', 'drag-over-bottom'));

                if (!this.draggedSection || this.draggedSection.id === item.dataset.id) return;

                const fromId = this.draggedSection.id;
                const toId = item.dataset.id;
                const rect = item.getBoundingClientRect();
                const insertBefore = e.clientY < rect.top + rect.height / 2;

                // Reihenfolge aktualisieren
                this.reorderSections(fromId, toId, insertBefore);
            });
        });
    }

    reorderSections(fromId, toId, insertBefore) {
        // Initialisiere sectionOrder wenn nötig
        if (!this.sectionOrder) {
            this.sectionOrder = this.getWebsiteSections().map(s => s.id);
        }

        const fromIndex = this.sectionOrder.indexOf(fromId);
        if (fromIndex === -1) return;

        // Entferne aus alter Position
        this.sectionOrder.splice(fromIndex, 1);

        // Finde neue Position
        let toIndex = this.sectionOrder.indexOf(toId);
        if (toIndex === -1) return;

        // Füge an neuer Position ein
        if (!insertBefore) {
            toIndex++;
        }
        this.sectionOrder.splice(toIndex, 0, fromId);

        // Aktualisiere die Liste
        this.renderLiveBuilder();

        // Wende auf Website an (live preview)
        this.applySectionOrderToWebsite();

        const fromSection = this.getWebsiteSections().find(s => s.id === fromId);
        this.showToast('success', 'Verschoben', `"${fromSection?.name || fromId}" wurde verschoben`);
    }

    selectSection(sectionId) {
        this.selectedSection = sectionId;
        this.renderLiveBuilder();
        this.showSectionProperties(sectionId);
        this.scrollToSection(sectionId);
    }

    scrollToSection(sectionId) {
        const iframe = document.getElementById('websitePreview');
        if (!iframe || !iframe.contentWindow) return;

        try {
            // Finde die Sektion mit dem korrekten Selektor
            const sectionData = this.getWebsiteSections().find(s => s.id === sectionId);
            if (!sectionData) return;

            const section = iframe.contentDocument.querySelector(sectionData.selector);
            if (section) {
                section.scrollIntoView({ behavior: 'smooth', block: 'start' });
                // Highlight die Sektion kurz
                section.style.outline = '3px solid #c9a227';
                section.style.outlineOffset = '-3px';
                setTimeout(() => {
                    section.style.outline = '';
                    section.style.outlineOffset = '';
                }, 2000);
            }
        } catch (e) {
            console.log('Cannot access iframe content - same origin policy');
        }
    }

    toggleSectionVisibility(sectionId) {
        const iframe = document.getElementById('websitePreview');
        if (!iframe || !iframe.contentWindow) return;

        try {
            const sectionData = this.getWebsiteSections().find(s => s.id === sectionId);
            if (!sectionData) return;

            const section = iframe.contentDocument.querySelector(sectionData.selector);
            if (section) {
                const isVisible = section.style.display !== 'none';
                section.style.display = isVisible ? 'none' : '';

                // Speichere Visibility-Status
                if (!this.sectionVisibility) this.sectionVisibility = {};
                this.sectionVisibility[sectionId] = !isVisible;

                this.showToast('success', 'Erfolg', `Sektion "${sectionData.name}" ${isVisible ? 'ausgeblendet' : 'eingeblendet'}`);
                this.renderLiveBuilder();
            }
        } catch (e) {
            this.showToast('error', 'Fehler', 'Konnte Sichtbarkeit nicht ändern');
        }
    }

    showSectionProperties(sectionId) {
        const content = document.getElementById('propertiesContent');
        if (!content) return;

        const section = this.getWebsiteSections().find(s => s.id === sectionId);
        if (!section) return;

        content.innerHTML = `
            <div class="property-group">
                <label>Sektion</label>
                <input type="text" value="${section.name}" readonly style="background: var(--gray-100);">
            </div>
            <div class="property-group">
                <label>Sichtbar</label>
                <select onchange="adminPanel.toggleSectionVisibility('${sectionId}')">
                    <option value="true" ${section.visible ? 'selected' : ''}>Ja - Sichtbar</option>
                    <option value="false" ${!section.visible ? 'selected' : ''}>Nein - Versteckt</option>
                </select>
            </div>
            <div class="property-group">
                <label>Hintergrund</label>
                <input type="color" value="#0a1628">
            </div>
            <div class="property-group">
                <label>Padding</label>
                <select>
                    <option>Klein (40px)</option>
                    <option selected>Normal (80px)</option>
                    <option>Groß (120px)</option>
                </select>
            </div>
            <hr style="border: none; border-top: 1px solid var(--gray-200); margin: 20px 0;">
            <button class="btn-primary btn-sm" style="width: 100%;" onclick="adminPanel.editSectionContent('${sectionId}')">
                <i class="fas fa-edit"></i> Inhalt bearbeiten
            </button>
        `;
    }

    editSectionContent(sectionId) {
        // Navigate to the appropriate content section in admin
        const sectionMap = {
            'hero': 'content',
            'about': 'content',
            'team': 'team',
            'products': 'cards',
            'locations': 'locations',
            'contact': 'content'
        };
        const targetSection = sectionMap[sectionId] || 'content';
        this.showToast('info', 'Navigation', `Wechsle zu ${targetSection}...`);
        // Switch to that section
        document.querySelector(`.nav-btn[data-section="${targetSection}"]`)?.click();
    }

    setPreviewDevice(device) {
        const frame = document.getElementById('livePreviewFrame');
        const buttons = document.querySelectorAll('.device-btn');

        buttons.forEach(btn => btn.classList.toggle('active', btn.dataset.device === device));

        frame.classList.remove('desktop', 'tablet', 'mobile');
        if (device !== 'desktop') {
            frame.classList.add(device);
        }
    }

    zoomPreview(delta) {
        this.previewZoom = Math.max(50, Math.min(150, this.previewZoom + delta));
        document.getElementById('zoomLevel').textContent = `${this.previewZoom}%`;

        const iframe = document.getElementById('websitePreview');
        if (iframe) {
            iframe.style.transform = `scale(${this.previewZoom / 100})`;
            iframe.style.transformOrigin = 'top center';
        }
    }

    openPreviewInNewTab() {
        window.open('index.html', '_blank');
    }

    // ========================================
    // DRAG MODE - Sektionen DIREKT auf der Website verschieben
    // ========================================

    toggleDragMode() {
        this.dragModeActive = !this.dragModeActive;
        const toggleBtn = document.getElementById('toggleDragMode');
        const iframe = document.getElementById('websitePreview');

        if (this.dragModeActive) {
            if (toggleBtn) {
                toggleBtn.classList.add('active');
                toggleBtn.innerHTML = '<i class="fas fa-check"></i>';
                toggleBtn.title = 'Bearbeitungsmodus beenden';
            }
            this.injectDragHandlesIntoIframe();

            // Disable hover trigger system in iframe
            if (iframe && iframe.contentDocument) {
                iframe.contentDocument.body.classList.add('admin-edit-mode');
                if (iframe.contentWindow && iframe.contentWindow.hoverTriggerSystem) {
                    iframe.contentWindow.hoverTriggerSystem.setEnabled(false);
                }
            }

            this.showToast('info', 'Bearbeitungsmodus aktiv', 'Klicke auf Elemente um sie zu bearbeiten, ziehe sie um sie zu verschieben');
        } else {
            if (toggleBtn) {
                toggleBtn.classList.remove('active');
                toggleBtn.innerHTML = '<i class="fas fa-arrows-alt"></i>';
                toggleBtn.title = 'Elemente auf der Website bearbeiten';
            }
            this.removeDragHandlesFromIframe();

            // Re-enable hover trigger system in iframe
            if (iframe && iframe.contentDocument) {
                iframe.contentDocument.body.classList.remove('admin-edit-mode');
                if (iframe.contentWindow && iframe.contentWindow.hoverTriggerSystem) {
                    iframe.contentWindow.hoverTriggerSystem.setEnabled(true);
                }
            }

            this.showToast('success', 'Fertig', 'Änderungen wurden angewendet');
        }
    }

    injectDragHandlesIntoIframe() {
        const iframe = document.getElementById('websitePreview');
        if (!iframe || !iframe.contentDocument) {
            setTimeout(() => this.injectDragHandlesIntoIframe(), 300);
            return;
        }

        const doc = iframe.contentDocument;
        const win = iframe.contentWindow;

        // WICHTIG: Hover-Trigger-System deaktivieren im Drag-Mode
        doc.body.classList.add('admin-edit-mode');
        if (win && win.hoverTriggerSystem) {
            win.hoverTriggerSystem.setEnabled(false);
            console.log('Hover-Trigger deaktiviert (Drag-Mode)');
        }

        // CSS für den Visual Editor - VOLLSTÄNDIG
        let style = doc.getElementById('adminEditorStyles');
        if (!style) {
            style = doc.createElement('style');
            style.id = 'adminEditorStyles';
            style.textContent = `
                /* =============================================
                   DEAKTIVIERE ALLE WEBSITE HOVER-EFFEKTE IM EDIT MODE
                   ============================================= */

                /* Location Cards - ALLE Hover deaktivieren */
                body.admin-edit-mode .location-card,
                body.admin-edit-mode .location-card:hover,
                body.admin-edit-mode .location-card:focus,
                body.admin-edit-mode .location-card:active {
                    transform: none !important;
                    box-shadow: 0 15px 40px rgba(0, 0, 0, 0.2) !important;
                    filter: none !important;
                    transition: none !important;
                }

                body.admin-edit-mode .location-card .location-flag,
                body.admin-edit-mode .location-card:hover .location-flag {
                    transform: none !important;
                    box-shadow: none !important;
                    transition: none !important;
                }

                /* Location Markers auf der Map */
                body.admin-edit-mode .location-marker,
                body.admin-edit-mode .location-marker:hover {
                    transform: none !important;
                    transition: none !important;
                }

                body.admin-edit-mode .location-marker .marker-dot,
                body.admin-edit-mode .location-marker:hover .marker-dot,
                body.admin-edit-mode .location-marker .marker-pulse,
                body.admin-edit-mode .location-marker:hover .marker-pulse {
                    transform: none !important;
                    filter: none !important;
                    animation: none !important;
                    transition: none !important;
                }

                /* Hover-Trigger System komplett deaktivieren */
                body.admin-edit-mode [data-hover-trigger],
                body.admin-edit-mode [data-hover-trigger]:hover,
                body.admin-edit-mode [data-hover-target],
                body.admin-edit-mode [data-hover-target]:hover,
                body.admin-edit-mode .hover-triggered {
                    transform: none !important;
                    box-shadow: inherit !important;
                    filter: none !important;
                    opacity: 1 !important;
                    transition: none !important;
                }

                body.admin-edit-mode .hover-connector-line {
                    display: none !important;
                }

                /* Alle anderen Karten/Cards */
                body.admin-edit-mode .card:hover,
                body.admin-edit-mode .team-card:hover,
                body.admin-edit-mode .product-card:hover,
                body.admin-edit-mode .service-card:hover,
                body.admin-edit-mode .feature-item:hover {
                    transform: none !important;
                    transition: none !important;
                }

                /* DEAKTIVIERE BUTTONS, LINKS, FORM-ELEMENTE IM EDIT MODE */
                body.admin-edit-mode a,
                body.admin-edit-mode button,
                body.admin-edit-mode input[type="submit"],
                body.admin-edit-mode input[type="button"],
                body.admin-edit-mode .btn,
                body.admin-edit-mode [onclick],
                body.admin-edit-mode [href] {
                    pointer-events: auto !important; /* Ermöglicht Auswahl */
                    cursor: pointer !important;
                }

                /* Verhindere Navigation bei Links */
                body.admin-edit-mode a::before,
                body.admin-edit-mode button::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    z-index: 1;
                }

                /* Füge kleines Bearbeiten-Icon zu Buttons hinzu */
                body.admin-edit-mode button:not(.admin-element-toolbar button)::after,
                body.admin-edit-mode .btn::after,
                body.admin-edit-mode a.btn::after {
                    content: '✎';
                    position: absolute;
                    top: -8px;
                    right: -8px;
                    background: #c9a227;
                    color: #0a1628;
                    font-size: 10px;
                    width: 18px;
                    height: 18px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    opacity: 0;
                    transition: opacity 0.2s;
                    z-index: 10;
                }

                /* Click-to-activate statt hover - Klasse wird per JS hinzugefügt */
                body.admin-edit-mode button:not(.admin-element-toolbar button).admin-click-active::after,
                body.admin-edit-mode .btn.admin-click-active::after,
                body.admin-edit-mode a.btn.admin-click-active::after,
                body.admin-edit-mode .admin-editable.admin-click-active::after {
                    opacity: 1;
                }

                /* Drag-Hilfe Info Box */
                .admin-drag-help {
                    position: fixed !important;
                    bottom: 20px !important;
                    left: 50% !important;
                    transform: translateX(-50%) !important;
                    background: linear-gradient(135deg, #0a1628 0%, #1a2d4a 100%) !important;
                    color: white !important;
                    padding: 12px 24px !important;
                    border-radius: 10px !important;
                    font-family: -apple-system, BlinkMacSystemFont, sans-serif !important;
                    font-size: 13px !important;
                    z-index: 999999 !important;
                    box-shadow: 0 8px 32px rgba(0,0,0,0.4) !important;
                    display: flex !important;
                    gap: 20px !important;
                    align-items: center !important;
                    border: 1px solid rgba(201, 162, 39, 0.3) !important;
                    pointer-events: none !important;
                }
                .admin-drag-help .help-item {
                    display: flex !important;
                    align-items: center !important;
                    gap: 8px !important;
                }
                .admin-drag-help .help-key {
                    background: rgba(201, 162, 39, 0.2) !important;
                    color: #c9a227 !important;
                    padding: 4px 8px !important;
                    border-radius: 4px !important;
                    font-weight: 600 !important;
                    font-size: 11px !important;
                }
                .admin-drag-help .help-text {
                    color: rgba(255,255,255,0.8) !important;
                }

                /* Drag-Drop Zone Highlight */
                .admin-drop-zone {
                    position: relative !important;
                }
                .admin-drop-zone::before {
                    content: '' !important;
                    position: absolute !important;
                    inset: -4px !important;
                    border: 2px dashed rgba(201, 162, 39, 0.5) !important;
                    border-radius: 8px !important;
                    pointer-events: none !important;
                    opacity: 0 !important;
                    transition: opacity 0.2s !important;
                }
                .admin-drop-zone.admin-drop-active::before {
                    opacity: 1 !important;
                    border-color: #c9a227 !important;
                    background: rgba(201, 162, 39, 0.1) !important;
                }

                /* Grid-Overlay für präzise Positionierung */
                .admin-grid-overlay {
                    position: fixed !important;
                    inset: 0 !important;
                    pointer-events: none !important;
                    z-index: 999985 !important;
                    opacity: 0.15 !important;
                    background-image:
                        linear-gradient(rgba(201, 162, 39, 0.3) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(201, 162, 39, 0.3) 1px, transparent 1px) !important;
                    background-size: 20px 20px !important;
                    display: none !important;
                }
                .admin-grid-overlay.visible {
                    display: block !important;
                }

                /* Alle interaktiven Elemente müssen position relative haben für ::after */
                body.admin-edit-mode button:not(.admin-element-toolbar button),
                body.admin-edit-mode .btn,
                body.admin-edit-mode a.btn {
                    position: relative !important;
                }

                /* Alle Elemente editierbar machen */
                .admin-editable {
                    outline: 1px dashed rgba(52, 152, 219, 0.3) !important;
                    cursor: pointer !important;
                    transition: outline 0.1s ease !important;
                }
                .admin-editable:hover {
                    outline: 2px solid #3498db !important;
                }
                .admin-editable.admin-selected {
                    outline: 2px solid #c9a227 !important;
                }
                .admin-editable.admin-free-move {
                    position: absolute !important;
                    cursor: move !important;
                }
                .admin-editable.admin-dragging {
                    opacity: 0.85 !important;
                    z-index: 999998 !important;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.3) !important;
                    cursor: grabbing !important;
                }

                /* Multi-Selection */
                .admin-multi-selected {
                    outline: 2px dashed #9b59b6 !important;
                    outline-offset: 2px !important;
                    background: rgba(155, 89, 182, 0.1) !important;
                }

                /* Spacing Overlay - zeigt Margin/Padding */
                .admin-spacing-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    pointer-events: none;
                    z-index: 999990;
                }
                .admin-spacing-overlay > div {
                    position: fixed;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 10px;
                    font-weight: 600;
                    font-family: monospace;
                    color: white;
                }
                .spacing-margin {
                    background: rgba(255, 166, 0, 0.4) !important;
                }
                .spacing-margin span {
                    background: rgba(255, 166, 0, 0.9);
                    padding: 2px 4px;
                    border-radius: 2px;
                }
                .spacing-padding {
                    background: rgba(144, 238, 144, 0.4) !important;
                }
                .spacing-padding span {
                    background: rgba(50, 205, 50, 0.9);
                    padding: 2px 4px;
                    border-radius: 2px;
                }

                /* Position Info Box */
                .admin-position-info {
                    position: fixed !important;
                    top: 10px !important;
                    left: 50% !important;
                    transform: translateX(-50%) !important;
                    background: #0a1628 !important;
                    color: white !important;
                    padding: 10px 20px !important;
                    border-radius: 8px !important;
                    font-family: monospace !important;
                    font-size: 12px !important;
                    z-index: 999999 !important;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.4) !important;
                    display: flex !important;
                    gap: 20px !important;
                    align-items: center !important;
                }
                .admin-position-info .pos-label {
                    color: #c9a227;
                    font-weight: 700;
                    text-transform: uppercase;
                    font-size: 10px;
                }
                .admin-position-info .pos-values {
                    display: flex;
                    gap: 15px;
                }
                .admin-position-info .pos-x,
                .admin-position-info .pos-y {
                    color: #3498db;
                }
                .admin-position-info .pos-size {
                    color: #2ecc71;
                    border-left: 1px solid rgba(255,255,255,0.2);
                    padding-left: 15px;
                }

                /* Hilfslinien */
                .admin-guidelines {
                    position: fixed;
                    pointer-events: none;
                    z-index: 999989;
                }
                .admin-guideline-h, .admin-guideline-v {
                    position: fixed;
                    background: #e74c3c;
                }
                .admin-guideline-h {
                    height: 1px;
                    left: 0;
                    right: 0;
                }
                .admin-guideline-v {
                    width: 1px;
                    top: 0;
                    bottom: 0;
                }

                /* Element Toolbar */
                .admin-element-toolbar {
                    position: absolute !important;
                    top: -36px !important;
                    left: 0 !important;
                    background: #0a1628 !important;
                    border-radius: 6px !important;
                    padding: 4px !important;
                    display: flex !important;
                    gap: 2px !important;
                    z-index: 999999 !important;
                    box-shadow: 0 4px 15px rgba(0,0,0,0.3) !important;
                    font-family: -apple-system, BlinkMacSystemFont, sans-serif !important;
                }
                .admin-element-toolbar button {
                    width: 28px !important;
                    height: 28px !important;
                    border: none !important;
                    background: transparent !important;
                    color: white !important;
                    border-radius: 4px !important;
                    cursor: pointer !important;
                    font-size: 12px !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    transition: background 0.2s !important;
                }
                .admin-element-toolbar button:hover {
                    background: #c9a227 !important;
                    color: #0a1628 !important;
                }
                .admin-element-toolbar .toolbar-label {
                    color: #c9a227 !important;
                    font-size: 10px !important;
                    padding: 0 8px !important;
                    display: flex !important;
                    align-items: center !important;
                    font-weight: 600 !important;
                    text-transform: uppercase !important;
                    border-right: 1px solid rgba(255,255,255,0.2) !important;
                    margin-right: 4px !important;
                }

                /* Drop Indicator */
                .admin-drop-indicator {
                    position: absolute !important;
                    background: #c9a227 !important;
                    pointer-events: none !important;
                    z-index: 999998 !important;
                    border-radius: 2px !important;
                }
                .admin-drop-indicator.horizontal {
                    height: 4px !important;
                    left: 0 !important;
                    right: 0 !important;
                }
                .admin-drop-indicator.vertical {
                    width: 4px !important;
                    top: 0 !important;
                    bottom: 0 !important;
                }

                /* Text Editing */
                .admin-text-editing {
                    outline: 2px solid #27ae60 !important;
                    background: rgba(39, 174, 96, 0.1) !important;
                    min-width: 20px !important;
                    min-height: 1em !important;
                }

                /* Resize Handles */
                .admin-resize-handle {
                    position: absolute !important;
                    width: 10px !important;
                    height: 10px !important;
                    background: #c9a227 !important;
                    border: 2px solid #0a1628 !important;
                    border-radius: 50% !important;
                    z-index: 999999 !important;
                }
                .admin-resize-handle.nw { top: -5px; left: -5px; cursor: nw-resize; }
                .admin-resize-handle.ne { top: -5px; right: -5px; cursor: ne-resize; }
                .admin-resize-handle.sw { bottom: -5px; left: -5px; cursor: sw-resize; }
                .admin-resize-handle.se { bottom: -5px; right: -5px; cursor: se-resize; }
            `;
            doc.head.appendChild(style);
        }

        // WICHTIG: admin-edit-mode Klasse auf body setzen um Hover-Effekte zu deaktivieren
        doc.body.classList.add('admin-edit-mode');

        // Erstelle Drag-Hilfe Info Box
        this.createDragHelp(doc);

        // Erstelle Grid-Overlay für präzise Positionierung
        this.createGridOverlay(doc);

        // Mache ALLE sichtbaren Elemente editierbar
        const editableSelectors = [
            'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
            'p', 'span', 'a', 'button',
            'div', 'section', 'article', 'header', 'footer', 'nav',
            'img', 'figure', 'video',
            'ul', 'ol', 'li',
            'form', 'input', 'textarea', 'select',
            'table', 'tr', 'td', 'th',
            '.container', '.card', '.btn', '.box', '.wrapper'
        ].join(', ');

        const allElements = doc.querySelectorAll(editableSelectors);

        allElements.forEach(el => {
            // Überspringe sehr kleine oder unsichtbare Elemente
            if (el.offsetWidth < 10 || el.offsetHeight < 10) return;
            if (win.getComputedStyle(el).display === 'none') return;
            if (el.closest('.admin-element-toolbar')) return;
            if (el.closest('.admin-spacing-overlay')) return;
            if (el.classList.contains('admin-position-info')) return;

            el.classList.add('admin-editable');

            // Click Event - Element auswählen + Click-to-Activate (statt Hover)
            el.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                // Entferne admin-click-active von allen anderen Elementen
                doc.querySelectorAll('.admin-click-active').forEach(activeEl => {
                    if (activeEl !== el) {
                        activeEl.classList.remove('admin-click-active');
                    }
                });

                // Toggle admin-click-active auf diesem Element (ersetzt Hover-Effekt)
                el.classList.toggle('admin-click-active');

                this.selectElement(el, doc);
            });

            // Doppelklick - Text bearbeiten
            el.addEventListener('dblclick', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (this.isTextElement(el)) {
                    this.startTextEditing(el, doc);
                }
            });

            // MOUSE-BASIERTES DRAG (kein HTML5 Drag & Drop)
            el.addEventListener('mousedown', (e) => {
                // Nur linke Maustaste
                if (e.button !== 0) return;
                // Nicht wenn auf Toolbar geklickt
                if (e.target.closest('.admin-element-toolbar')) return;

                e.preventDefault();
                e.stopPropagation();

                // Wähle Element aus
                this.selectElement(el, doc);

                // Starte Drag nach kurzem Delay (um Klick von Drag zu unterscheiden)
                const startX = e.clientX;
                const startY = e.clientY;
                const rect = el.getBoundingClientRect();
                const styles = win.getComputedStyle(el);

                let isDragging = false;

                const onMouseMove = (moveEvent) => {
                    const deltaX = moveEvent.clientX - startX;
                    const deltaY = moveEvent.clientY - startY;

                    // Starte Drag erst nach 5px Bewegung
                    if (!isDragging && (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5)) {
                        isDragging = true;

                        // Wechsle zu absolute Position wenn nötig
                        if (styles.position === 'static') {
                            el.style.position = 'relative';
                        }

                        el.classList.add('admin-dragging');

                        // Zeige Spacing-Overlay
                        this.showSpacingOverlay(el, doc);

                        // Erstelle Position-Info Box
                        this.createPositionInfo(doc);
                    }

                    if (isDragging) {
                        // Berechne neue Position
                        const currentLeft = parseInt(el.style.left) || 0;
                        const currentTop = parseInt(el.style.top) || 0;

                        el.style.left = (currentLeft + (moveEvent.clientX - (this.lastMouseX || startX))) + 'px';
                        el.style.top = (currentTop + (moveEvent.clientY - (this.lastMouseY || startY))) + 'px';

                        this.lastMouseX = moveEvent.clientX;
                        this.lastMouseY = moveEvent.clientY;

                        // Update Position-Info
                        this.updatePositionInfo(el, doc);
                    }
                };

                const onMouseUp = () => {
                    doc.removeEventListener('mousemove', onMouseMove);
                    doc.removeEventListener('mouseup', onMouseUp);

                    if (isDragging) {
                        el.classList.remove('admin-dragging');
                        this.hideSpacingOverlay(doc);
                        this.hidePositionInfo(doc);
                        this.showElementProperties(el);
                        this.showToast('success', 'Verschoben', `Position: ${el.style.left}, ${el.style.top}`);
                    }

                    this.lastMouseX = null;
                    this.lastMouseY = null;
                };

                doc.addEventListener('mousemove', onMouseMove);
                doc.addEventListener('mouseup', onMouseUp);
            });
        });

        // GLOBAL: Blockiere ALLE Clicks auf Links und Buttons im Dokument
        doc.addEventListener('click', (e) => {
            const target = e.target;
            // Blockiere Links und Buttons
            if (target.tagName === 'A' ||
                target.tagName === 'BUTTON' ||
                target.closest('a') ||
                target.closest('button') ||
                target.classList?.contains('btn')) {
                e.preventDefault();
                e.stopPropagation();
                console.log('[Admin Editor] Link/Button click blocked:', target);
            }
        }, true); // capture phase

        // Blockiere auch form submits
        doc.addEventListener('submit', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('[Admin Editor] Form submit blocked');
        }, true);

        // Füge Keyboard-Steuerung hinzu
        doc.addEventListener('keydown', (e) => {
            if (!this.selectedElement) return;

            const el = this.selectedElement;
            const step = e.shiftKey ? 10 : 1; // Shift = 10px Schritte
            const styles = win.getComputedStyle(el);

            // Stelle sicher, dass Element positioniert ist
            if (styles.position === 'static') {
                el.style.position = 'relative';
            }

            let moved = false;

            switch(e.key) {
                case 'ArrowUp':
                    e.preventDefault();
                    el.style.top = (parseInt(el.style.top) || 0) - step + 'px';
                    moved = true;
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    el.style.top = (parseInt(el.style.top) || 0) + step + 'px';
                    moved = true;
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    el.style.left = (parseInt(el.style.left) || 0) - step + 'px';
                    moved = true;
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    el.style.left = (parseInt(el.style.left) || 0) + step + 'px';
                    moved = true;
                    break;
                case 'Delete':
                case 'Backspace':
                    if (!el.isContentEditable) {
                        e.preventDefault();
                        this.deleteElement(el, doc);
                    }
                    break;
                case 'z':
                case 'Z':
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        this.undo();
                    }
                    break;
                case 'y':
                case 'Y':
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        this.redo();
                    }
                    break;
                case 'Escape':
                    this.selectedElement = null;
                    doc.querySelectorAll('.admin-element-toolbar').forEach(t => t.remove());
                    this.clearElementPropertiesPanel();
                    break;
            }

            if (moved) {
                this.showElementProperties(el);
            }
        });

        // Auch im Admin-Panel selbst Ctrl+Z/Y zulassen
        document.addEventListener('keydown', (e) => {
            if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                this.undo();
            }
            if (e.key === 'y' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                this.redo();
            }
        });
    }

    // Spacing Overlay - zeigt Margin/Padding während Drag
    showSpacingOverlay(el, doc) {
        this.hideSpacingOverlay(doc);

        const styles = doc.defaultView.getComputedStyle(el);
        const rect = el.getBoundingClientRect();

        const overlay = doc.createElement('div');
        overlay.className = 'admin-spacing-overlay';
        overlay.innerHTML = `
            <!-- Margin Bereiche -->
            <div class="spacing-margin spacing-top" style="
                top: ${rect.top - parseInt(styles.marginTop)}px;
                left: ${rect.left}px;
                width: ${rect.width}px;
                height: ${parseInt(styles.marginTop)}px;
            "><span>${parseInt(styles.marginTop)}px</span></div>
            <div class="spacing-margin spacing-right" style="
                top: ${rect.top}px;
                left: ${rect.right}px;
                width: ${parseInt(styles.marginRight)}px;
                height: ${rect.height}px;
            "><span>${parseInt(styles.marginRight)}px</span></div>
            <div class="spacing-margin spacing-bottom" style="
                top: ${rect.bottom}px;
                left: ${rect.left}px;
                width: ${rect.width}px;
                height: ${parseInt(styles.marginBottom)}px;
            "><span>${parseInt(styles.marginBottom)}px</span></div>
            <div class="spacing-margin spacing-left" style="
                top: ${rect.top}px;
                left: ${rect.left - parseInt(styles.marginLeft)}px;
                width: ${parseInt(styles.marginLeft)}px;
                height: ${rect.height}px;
            "><span>${parseInt(styles.marginLeft)}px</span></div>

            <!-- Padding Bereiche -->
            <div class="spacing-padding spacing-top" style="
                top: ${rect.top}px;
                left: ${rect.left}px;
                width: ${rect.width}px;
                height: ${parseInt(styles.paddingTop)}px;
            "><span>${parseInt(styles.paddingTop)}px</span></div>
            <div class="spacing-padding spacing-right" style="
                top: ${rect.top}px;
                left: ${rect.right - parseInt(styles.paddingRight)}px;
                width: ${parseInt(styles.paddingRight)}px;
                height: ${rect.height}px;
            "><span>${parseInt(styles.paddingRight)}px</span></div>
            <div class="spacing-padding spacing-bottom" style="
                top: ${rect.bottom - parseInt(styles.paddingBottom)}px;
                left: ${rect.left}px;
                width: ${rect.width}px;
                height: ${parseInt(styles.paddingBottom)}px;
            "><span>${parseInt(styles.paddingBottom)}px</span></div>
            <div class="spacing-padding spacing-left" style="
                top: ${rect.top}px;
                left: ${rect.left}px;
                width: ${parseInt(styles.paddingLeft)}px;
                height: ${rect.height}px;
            "><span>${parseInt(styles.paddingLeft)}px</span></div>
        `;

        doc.body.appendChild(overlay);
    }

    hideSpacingOverlay(doc) {
        doc.querySelectorAll('.admin-spacing-overlay').forEach(o => o.remove());
    }

    createPositionInfo(doc) {
        this.hidePositionInfo(doc);

        const info = doc.createElement('div');
        info.className = 'admin-position-info';
        info.innerHTML = `
            <div class="pos-label">Position</div>
            <div class="pos-values">
                <span class="pos-x">X: 0px</span>
                <span class="pos-y">Y: 0px</span>
            </div>
            <div class="pos-size">0 × 0</div>
        `;
        doc.body.appendChild(info);
    }

    updatePositionInfo(el, doc) {
        const info = doc.querySelector('.admin-position-info');
        if (!info) return;

        const rect = el.getBoundingClientRect();
        const scrollTop = doc.documentElement.scrollTop;

        info.querySelector('.pos-x').textContent = `X: ${Math.round(rect.left)}px`;
        info.querySelector('.pos-y').textContent = `Y: ${Math.round(rect.top + scrollTop)}px`;
        info.querySelector('.pos-size').textContent = `${Math.round(rect.width)} × ${Math.round(rect.height)}`;
    }

    hidePositionInfo(doc) {
        doc.querySelectorAll('.admin-position-info').forEach(i => i.remove());
    }

    // Drag-Hilfe Info Box erstellen
    createDragHelp(doc) {
        // Entferne vorherige
        doc.querySelectorAll('.admin-drag-help').forEach(h => h.remove());

        const helpBox = doc.createElement('div');
        helpBox.className = 'admin-drag-help';
        helpBox.innerHTML = `
            <div class="help-item">
                <span class="help-key">Klick</span>
                <span class="help-text">Element auswählen</span>
            </div>
            <div class="help-item">
                <span class="help-key">Doppelklick</span>
                <span class="help-text">Text bearbeiten</span>
            </div>
            <div class="help-item">
                <span class="help-key">Ziehen</span>
                <span class="help-text">Verschieben</span>
            </div>
            <div class="help-item">
                <span class="help-key">⬆⬇⬅➡</span>
                <span class="help-text">Feinpositionierung</span>
            </div>
            <div class="help-item">
                <span class="help-key">Shift</span>
                <span class="help-text">+10px Schritte</span>
            </div>
            <div class="help-item">
                <span class="help-key">G</span>
                <span class="help-text">Raster ein/aus</span>
            </div>
        `;
        doc.body.appendChild(helpBox);

        // Nach 8 Sekunden ausblenden
        setTimeout(() => {
            if (helpBox.parentElement) {
                helpBox.style.transition = 'opacity 0.5s';
                helpBox.style.opacity = '0';
                setTimeout(() => helpBox.remove(), 500);
            }
        }, 8000);
    }

    // Grid-Overlay für präzise Positionierung
    createGridOverlay(doc) {
        // Entferne vorherigen
        doc.querySelectorAll('.admin-grid-overlay').forEach(g => g.remove());

        const grid = doc.createElement('div');
        grid.className = 'admin-grid-overlay';
        doc.body.appendChild(grid);

        // Toggle Grid mit 'G' Taste
        doc.addEventListener('keydown', (e) => {
            if (e.key.toLowerCase() === 'g' && !e.ctrlKey && !e.metaKey && !e.altKey) {
                grid.classList.toggle('visible');
            }
        });
    }

    selectElement(el, doc) {
        // Entferne alte Auswahl
        doc.querySelectorAll('.admin-selected').forEach(s => s.classList.remove('admin-selected'));
        doc.querySelectorAll('.admin-element-toolbar').forEach(t => t.remove());
        doc.querySelectorAll('.admin-resize-handle').forEach(h => h.remove());

        // Neue Auswahl
        el.classList.add('admin-selected');
        this.selectedElement = el;

        // Toolbar erstellen
        const toolbar = doc.createElement('div');
        toolbar.className = 'admin-element-toolbar';

        const tagName = el.tagName.toLowerCase();
        const hasChildren = el.children.length > 0;
        const hasParent = el.parentElement && el.parentElement.tagName !== 'BODY';

        toolbar.innerHTML = `
            <span class="toolbar-label">${tagName}${hasChildren ? ` (${el.children.length})` : ''}</span>
            ${hasParent ? '<button onclick="window.adminEditor.selectParent()" title="Parent Container auswählen" style="background:#3498db!important;">⬆</button>' : ''}
            ${hasChildren ? '<button onclick="window.adminEditor.selectChildren()" title="Alle Kinder bearbeiten" style="background:#9b59b6!important;">⬇</button>' : ''}
            <button onclick="window.adminEditor.moveUp()" title="Nach oben">↑</button>
            <button onclick="window.adminEditor.moveDown()" title="Nach unten">↓</button>
            <button onclick="window.adminEditor.duplicate()" title="Duplizieren">⧉</button>
            <button onclick="window.adminEditor.editText()" title="Text bearbeiten">✎</button>
            <button onclick="window.adminEditor.deleteEl()" title="Löschen" style="color:#e74c3c!important;">✕</button>
        `;

        el.style.position = 'relative';
        el.appendChild(toolbar);

        // Resize Handles für Block-Elemente
        if (['div', 'section', 'img', 'figure', 'article'].includes(tagName)) {
            ['nw', 'ne', 'sw', 'se'].forEach(pos => {
                const handle = doc.createElement('div');
                handle.className = `admin-resize-handle ${pos}`;
                el.appendChild(handle);
            });
        }

        // Editor-Funktionen im iframe verfügbar machen
        const iframe = document.getElementById('websitePreview');
        iframe.contentWindow.adminEditor = {
            moveUp: () => this.moveElementUp(el),
            moveDown: () => this.moveElementDown(el),
            duplicate: () => this.duplicateElement(el, doc),
            editText: () => this.startTextEditing(el, doc),
            deleteEl: () => this.deleteElement(el, doc),
            selectParent: () => this.selectParentElement(el, doc),
            selectChildren: () => this.selectChildElements(el, doc)
        };

        // Zeige Element-Info im Properties Panel
        this.showElementProperties(el);
    }

    isTextElement(el) {
        const textTags = ['h1','h2','h3','h4','h5','h6','p','span','a','button','li','td','th','label'];
        return textTags.includes(el.tagName.toLowerCase());
    }

    startTextEditing(el, doc) {
        el.classList.add('admin-text-editing');
        el.contentEditable = 'true';
        el.focus();

        // Speichere original Text
        el.dataset.originalText = el.innerHTML;

        el.addEventListener('blur', () => {
            el.contentEditable = 'false';
            el.classList.remove('admin-text-editing');
            if (el.innerHTML !== el.dataset.originalText) {
                this.showToast('success', 'Gespeichert', 'Text wurde geändert');
            }
        }, { once: true });

        el.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                el.innerHTML = el.dataset.originalText;
                el.blur();
            }
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                el.blur();
            }
        });
    }

    showDropIndicator(targetEl, e, doc) {
        doc.querySelectorAll('.admin-drop-indicator').forEach(ind => ind.remove());

        const rect = targetEl.getBoundingClientRect();
        const indicator = doc.createElement('div');
        indicator.className = 'admin-drop-indicator';

        // Bestimme Position (oben/unten/links/rechts)
        const relY = (e.clientY - rect.top) / rect.height;
        const relX = (e.clientX - rect.left) / rect.width;

        if (relY < 0.3) {
            indicator.classList.add('horizontal');
            indicator.style.top = (rect.top - 2) + 'px';
            indicator.style.left = rect.left + 'px';
            indicator.style.width = rect.width + 'px';
            this.dropPosition = 'before';
        } else if (relY > 0.7) {
            indicator.classList.add('horizontal');
            indicator.style.top = (rect.bottom - 2) + 'px';
            indicator.style.left = rect.left + 'px';
            indicator.style.width = rect.width + 'px';
            this.dropPosition = 'after';
        } else {
            // In das Element hinein
            indicator.classList.add('horizontal');
            indicator.style.top = (rect.top + rect.height/2) + 'px';
            indicator.style.left = rect.left + 'px';
            indicator.style.width = rect.width + 'px';
            indicator.style.background = '#27ae60';
            this.dropPosition = 'inside';
        }

        indicator.style.position = 'fixed';
        doc.body.appendChild(indicator);
    }

    dropElement(targetEl, e, doc) {
        doc.querySelectorAll('.admin-drop-indicator').forEach(ind => ind.remove());

        if (!this.draggedElement) return;

        const draggedEl = this.draggedElement;

        if (this.dropPosition === 'before') {
            targetEl.parentNode.insertBefore(draggedEl, targetEl);
        } else if (this.dropPosition === 'after') {
            targetEl.parentNode.insertBefore(draggedEl, targetEl.nextSibling);
        } else if (this.dropPosition === 'inside') {
            targetEl.appendChild(draggedEl);
        }

        this.showToast('success', 'Verschoben', `Element wurde verschoben`);
        this.selectElement(draggedEl, doc);
    }

    moveElementUp(el) {
        const prev = el.previousElementSibling;
        if (prev) {
            el.parentNode.insertBefore(el, prev);
            this.showToast('info', 'Verschoben', 'Element nach oben verschoben');
        }
    }

    moveElementDown(el) {
        const next = el.nextElementSibling;
        if (next) {
            el.parentNode.insertBefore(next, el);
            this.showToast('info', 'Verschoben', 'Element nach unten verschoben');
        }
    }

    duplicateElement(el, doc) {
        const clone = el.cloneNode(true);
        clone.classList.remove('admin-selected');
        clone.querySelectorAll('.admin-element-toolbar, .admin-resize-handle').forEach(t => t.remove());
        el.parentNode.insertBefore(clone, el.nextSibling);
        this.showToast('success', 'Dupliziert', 'Element wurde dupliziert');
        this.selectElement(clone, doc);
    }

    deleteElement(el, doc, skipConfirm = false) {
        // Schütze wichtige Elemente vor versehentlichem Löschen
        const protectedTags = ['html', 'head', 'body', 'main'];
        const protectedClasses = ['preloader', 'cursor', 'page-transition'];

        if (protectedTags.includes(el.tagName.toLowerCase())) {
            this.showToast('error', 'Geschützt', 'Dieses Element kann nicht gelöscht werden');
            return;
        }

        if (protectedClasses.some(cls => el.classList.contains(cls))) {
            this.showToast('error', 'Geschützt', 'System-Elemente können nicht gelöscht werden');
            return;
        }

        // Warnung bei großen Sektionen
        const isLargeSection = el.tagName.toLowerCase() === 'section' || el.children.length > 5;

        if (!skipConfirm && isLargeSection) {
            if (!confirm(`Dieses Element enthält ${el.children.length} Kind-Elemente. Wirklich löschen?`)) {
                return;
            }
        }

        // Speichere für Undo
        this.saveUndoState('Element löschen');

        // Speichere Element-Info für Undo
        const parent = el.parentElement;
        const nextSibling = el.nextSibling;
        const elementClone = el.cloneNode(true);

        // Entferne Admin-Klassen vom Clone
        elementClone.classList.remove('admin-editable', 'admin-selected', 'admin-dragging');
        elementClone.querySelectorAll('.admin-element-toolbar, .admin-resize-handle').forEach(t => t.remove());

        el.remove();
        this.selectedElement = null;

        // Zeige Undo-Toast
        this.showUndoToast('Element gelöscht', () => {
            // Undo: Element wiederherstellen
            if (nextSibling) {
                parent.insertBefore(elementClone, nextSibling);
            } else {
                parent.appendChild(elementClone);
            }
            this.showToast('success', 'Wiederhergestellt', 'Element wurde zurückgeholt');
        });
    }

    selectParentElement(el, doc) {
        // Navigiere zum Parent-Container
        const parent = el.parentElement;
        if (parent && parent.tagName !== 'BODY' && parent.tagName !== 'HTML') {
            this.selectElement(parent, doc);
            this.showToast('info', 'Parent ausgewählt', `<${parent.tagName.toLowerCase()}> mit ${parent.children.length} Kindern`);
        } else {
            this.showToast('warning', 'Kein Parent', 'Dieses Element hat keinen übergeordneten Container');
        }
    }

    selectChildElements(el, doc) {
        // Wechsle in den Multi-Select-Modus für alle Kinder
        const children = Array.from(el.children).filter(child =>
            !child.classList.contains('admin-element-toolbar') &&
            !child.classList.contains('admin-resize-handle')
        );

        if (children.length === 0) {
            this.showToast('warning', 'Keine Kinder', 'Dieses Element hat keine Kind-Elemente');
            return;
        }

        // Setze Multi-Selection
        this.multiSelectedElements = children;
        this.isMultiSelectMode = true;

        // Markiere alle Kinder visuell
        doc.querySelectorAll('.admin-multi-selected').forEach(s => s.classList.remove('admin-multi-selected'));
        children.forEach(child => child.classList.add('admin-multi-selected'));

        // Zeige Multi-Edit Properties
        this.showMultiElementProperties(children, doc);

        this.showToast('success', 'Multi-Auswahl', `${children.length} Kind-Elemente ausgewählt. Änderungen werden auf alle angewendet.`);
    }

    showMultiElementProperties(elements, doc) {
        const content = document.getElementById('propertiesContent');
        if (!content) return;

        const iframe = document.getElementById('websitePreview');
        const count = elements.length;

        content.innerHTML = `
            <style>
                .prop-section { margin-bottom: 16px; }
                .prop-section-title {
                    font-size: 11px; font-weight: 700; color: var(--gold);
                    text-transform: uppercase; letter-spacing: 0.5px;
                    margin-bottom: 10px; padding-bottom: 6px;
                    border-bottom: 1px solid var(--gray-200);
                }
                .prop-row { display: flex; gap: 8px; margin-bottom: 8px; }
                .prop-row .property-group { flex: 1; margin: 0; }
                .multi-info { background: #9b59b6; color: white; padding: 12px; border-radius: 8px; margin-bottom: 16px; }
                .multi-info h4 { margin: 0 0 4px 0; }
                .multi-info p { margin: 0; font-size: 12px; opacity: 0.9; }
                .gradient-preview {
                    height: 40px; border-radius: 6px; margin: 8px 0;
                    border: 1px solid var(--gray-300);
                }
                .gradient-stops { display: flex; gap: 4px; margin-top: 8px; }
                .gradient-stop { display: flex; gap: 4px; align-items: center; }
            </style>

            <div class="multi-info">
                <h4><i class="fas fa-layer-group"></i> Multi-Bearbeitung</h4>
                <p>${count} Elemente ausgewählt</p>
            </div>

            <!-- Bulk Farben -->
            <div class="prop-section">
                <div class="prop-section-title">🎨 Farben (auf alle)</div>
                <div class="prop-row">
                    <div class="property-group">
                        <label>Hintergrund</label>
                        <input type="color" id="multiBackground" value="#ffffff"
                               onchange="adminPanel.applyToMulti('backgroundColor', this.value)">
                    </div>
                    <div class="property-group">
                        <label>Text</label>
                        <input type="color" id="multiColor" value="#000000"
                               onchange="adminPanel.applyToMulti('color', this.value)">
                    </div>
                </div>

                <!-- Gradient Editor -->
                <div class="property-group">
                    <label>Gradient Hintergrund</label>
                    <div id="gradientPreview" class="gradient-preview" style="background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);"></div>
                    <div class="prop-row">
                        <div class="property-group">
                            <label>Richtung</label>
                            <select id="gradientDirection" onchange="adminPanel.updateGradientPreview()">
                                <option value="90deg">→ Rechts</option>
                                <option value="180deg">↓ Unten</option>
                                <option value="270deg">← Links</option>
                                <option value="0deg">↑ Oben</option>
                                <option value="45deg">↗ Diagonal</option>
                                <option value="135deg">↘ Diagonal</option>
                                <option value="225deg">↙ Diagonal</option>
                                <option value="315deg">↖ Diagonal</option>
                            </select>
                        </div>
                        <div class="property-group">
                            <label>Typ</label>
                            <select id="gradientType" onchange="adminPanel.updateGradientPreview()">
                                <option value="linear">Linear</option>
                                <option value="radial">Radial</option>
                            </select>
                        </div>
                    </div>
                    <div class="prop-row">
                        <div class="property-group">
                            <label>Farbe 1</label>
                            <input type="color" id="gradientColor1" value="#667eea" onchange="adminPanel.updateGradientPreview()">
                        </div>
                        <div class="property-group">
                            <label>Farbe 2</label>
                            <input type="color" id="gradientColor2" value="#764ba2" onchange="adminPanel.updateGradientPreview()">
                        </div>
                        <div class="property-group">
                            <label>Farbe 3</label>
                            <input type="color" id="gradientColor3" value="" onchange="adminPanel.updateGradientPreview()" placeholder="Optional">
                        </div>
                    </div>
                    <button class="btn-primary btn-sm" style="width: 100%;" onclick="adminPanel.applyGradientToMulti()">
                        <i class="fas fa-paint-brush"></i> Gradient anwenden
                    </button>
                </div>
            </div>

            <!-- Bulk Abstände -->
            <div class="prop-section">
                <div class="prop-section-title">↔️ Abstände (auf alle)</div>
                <label style="font-size: 11px; color: var(--gray-600);">Margin</label>
                <div class="prop-row">
                    <div class="property-group">
                        <input type="number" id="multiMarginTop" placeholder="↑" onchange="adminPanel.applyToMulti('marginTop', this.value + 'px')">
                    </div>
                    <div class="property-group">
                        <input type="number" id="multiMarginRight" placeholder="→" onchange="adminPanel.applyToMulti('marginRight', this.value + 'px')">
                    </div>
                    <div class="property-group">
                        <input type="number" id="multiMarginBottom" placeholder="↓" onchange="adminPanel.applyToMulti('marginBottom', this.value + 'px')">
                    </div>
                    <div class="property-group">
                        <input type="number" id="multiMarginLeft" placeholder="←" onchange="adminPanel.applyToMulti('marginLeft', this.value + 'px')">
                    </div>
                </div>
                <label style="font-size: 11px; color: var(--gray-600);">Padding</label>
                <div class="prop-row">
                    <div class="property-group">
                        <input type="number" id="multiPaddingTop" placeholder="↑" onchange="adminPanel.applyToMulti('paddingTop', this.value + 'px')">
                    </div>
                    <div class="property-group">
                        <input type="number" id="multiPaddingRight" placeholder="→" onchange="adminPanel.applyToMulti('paddingRight', this.value + 'px')">
                    </div>
                    <div class="property-group">
                        <input type="number" id="multiPaddingBottom" placeholder="↓" onchange="adminPanel.applyToMulti('paddingBottom', this.value + 'px')">
                    </div>
                    <div class="property-group">
                        <input type="number" id="multiPaddingLeft" placeholder="←" onchange="adminPanel.applyToMulti('paddingLeft', this.value + 'px')">
                    </div>
                </div>
            </div>

            <!-- Bulk Text -->
            <div class="prop-section">
                <div class="prop-section-title">✏️ Text (auf alle)</div>
                <div class="prop-row">
                    <div class="property-group">
                        <label>Größe (px)</label>
                        <input type="number" id="multiFontSize" min="1" onchange="adminPanel.applyToMulti('fontSize', this.value + 'px')">
                    </div>
                    <div class="property-group">
                        <label>Gewicht</label>
                        <select onchange="adminPanel.applyToMulti('fontWeight', this.value)">
                            <option value="">--</option>
                            <option value="300">Light</option>
                            <option value="400">Normal</option>
                            <option value="600">Semi-Bold</option>
                            <option value="700">Bold</option>
                        </select>
                    </div>
                </div>
            </div>

            <!-- Bulk Border -->
            <div class="prop-section">
                <div class="prop-section-title">🔲 Rahmen (auf alle)</div>
                <div class="prop-row">
                    <div class="property-group">
                        <label>Breite (px)</label>
                        <input type="number" min="0" onchange="adminPanel.applyToMulti('borderWidth', this.value + 'px')">
                    </div>
                    <div class="property-group">
                        <label>Farbe</label>
                        <input type="color" onchange="adminPanel.applyToMulti('borderColor', this.value)">
                    </div>
                </div>
                <div class="property-group">
                    <label>Border Radius (px)</label>
                    <input type="number" min="0" onchange="adminPanel.applyToMulti('borderRadius', this.value + 'px')">
                </div>
            </div>

            <!-- Aktionen -->
            <div class="prop-section">
                <div class="prop-section-title">⚡ Aktionen</div>
                <button class="btn-secondary btn-sm" style="width: 100%; margin-bottom: 8px;" onclick="adminPanel.resetMultiStyles()">
                    <i class="fas fa-undo"></i> Alle Styles zurücksetzen
                </button>
                <button class="btn-danger btn-sm" style="width: 100%;" onclick="adminPanel.exitMultiSelect()">
                    <i class="fas fa-times"></i> Multi-Auswahl beenden
                </button>
            </div>
        `;
    }

    applyToMulti(property, value) {
        if (!this.multiSelectedElements || this.multiSelectedElements.length === 0) return;

        this.multiSelectedElements.forEach(el => {
            el.style[property] = value;
        });

        this.showToast('success', 'Angewendet', `${property} auf ${this.multiSelectedElements.length} Elemente angewendet`);
    }

    updateGradientPreview() {
        const preview = document.getElementById('gradientPreview');
        if (!preview) return;

        const type = document.getElementById('gradientType')?.value || 'linear';
        const direction = document.getElementById('gradientDirection')?.value || '90deg';
        const color1 = document.getElementById('gradientColor1')?.value || '#667eea';
        const color2 = document.getElementById('gradientColor2')?.value || '#764ba2';
        const color3 = document.getElementById('gradientColor3')?.value;

        let gradient;
        if (type === 'radial') {
            gradient = color3
                ? `radial-gradient(circle, ${color1} 0%, ${color2} 50%, ${color3} 100%)`
                : `radial-gradient(circle, ${color1} 0%, ${color2} 100%)`;
        } else {
            gradient = color3
                ? `linear-gradient(${direction}, ${color1} 0%, ${color2} 50%, ${color3} 100%)`
                : `linear-gradient(${direction}, ${color1} 0%, ${color2} 100%)`;
        }

        preview.style.background = gradient;
    }

    applyGradientToMulti() {
        if (!this.multiSelectedElements || this.multiSelectedElements.length === 0) {
            // Falls Single-Element ausgewählt
            if (this.selectedElement) {
                const gradient = document.getElementById('gradientPreview')?.style.background;
                if (gradient) {
                    this.selectedElement.style.background = gradient;
                    this.showToast('success', 'Gradient angewendet', 'Hintergrund-Gradient gesetzt');
                }
            }
            return;
        }

        const gradient = document.getElementById('gradientPreview')?.style.background;
        if (!gradient) return;

        this.multiSelectedElements.forEach(el => {
            el.style.background = gradient;
        });

        this.showToast('success', 'Gradient angewendet', `Gradient auf ${this.multiSelectedElements.length} Elemente angewendet`);
    }

    resetMultiStyles() {
        if (!this.multiSelectedElements) return;

        this.multiSelectedElements.forEach(el => {
            el.removeAttribute('style');
        });

        this.showToast('success', 'Zurückgesetzt', 'Alle Inline-Styles wurden entfernt');
    }

    exitMultiSelect() {
        const iframe = document.getElementById('websitePreview');
        if (iframe && iframe.contentDocument) {
            iframe.contentDocument.querySelectorAll('.admin-multi-selected').forEach(el => {
                el.classList.remove('admin-multi-selected');
            });
        }

        this.multiSelectedElements = null;
        this.isMultiSelectMode = false;

        // Zeige Standard-Properties
        const content = document.getElementById('propertiesContent');
        if (content) {
            content.innerHTML = `
                <div class="no-selection">
                    <i class="fas fa-mouse-pointer" style="font-size: 48px; color: var(--gray-300); margin-bottom: 16px;"></i>
                    <p>Klicke auf ein Element in der Vorschau um es zu bearbeiten</p>
                </div>
            `;
        }

        this.showToast('info', 'Multi-Auswahl beendet', 'Einzelne Elemente können wieder ausgewählt werden');
    }

    updateSingleGradientPreview() {
        const preview = document.getElementById('singleGradientPreview');
        if (!preview) return;

        const direction = document.getElementById('singleGradientDirection')?.value || '90deg';
        const color1 = document.getElementById('singleGradientColor1')?.value || '#667eea';
        const color2 = document.getElementById('singleGradientColor2')?.value || '#764ba2';

        preview.style.background = `linear-gradient(${direction}, ${color1} 0%, ${color2} 100%)`;
    }

    applySingleGradient() {
        if (!this.selectedElement) {
            this.showToast('warning', 'Kein Element', 'Bitte wähle zuerst ein Element aus');
            return;
        }

        const preview = document.getElementById('singleGradientPreview');
        if (!preview) return;

        this.selectedElement.style.background = preview.style.background;
        this.showToast('success', 'Gradient angewendet', 'Hintergrund-Gradient wurde gesetzt');
    }

    applyColorToChildren(property, color) {
        if (!this.selectedElement) {
            this.showToast('warning', 'Kein Element', 'Bitte wähle zuerst ein Element aus');
            return;
        }

        const children = Array.from(this.selectedElement.querySelectorAll('*'));
        if (children.length === 0) {
            this.showToast('warning', 'Keine Kinder', 'Dieses Element hat keine Kind-Elemente');
            return;
        }

        children.forEach(child => {
            child.style[property] = color;
        });

        this.showToast('success', 'Farbe angewendet', `${property === 'backgroundColor' ? 'Hintergrund' : 'Text'}-Farbe auf ${children.length} Elemente angewendet`);
    }

    clearElementPropertiesPanel() {
        const content = document.getElementById('propertiesContent');
        if (content) {
            content.innerHTML = `
                <div class="no-selection">
                    <i class="fas fa-mouse-pointer"></i>
                    <p>Klicke auf ein Element um es zu bearbeiten</p>
                </div>
            `;
        }
    }

    showElementProperties(el) {
        const content = document.getElementById('propertiesContent');
        if (!content) return;

        // WICHTIG: Stelle sicher, dass selectedElement synchron ist
        this.selectedElement = el;

        const iframe = document.getElementById('websitePreview');
        if (!iframe || !iframe.contentWindow) return;

        const styles = iframe.contentWindow.getComputedStyle(el);
        const tagName = el.tagName.toLowerCase();
        const rect = el.getBoundingClientRect();

        // Größe berechnen - mehrere Methoden als Fallback
        let elWidth = rect.width || el.offsetWidth || parseFloat(styles.width) || 0;
        let elHeight = rect.height || el.offsetHeight || parseFloat(styles.height) || 0;

        // Falls immer noch 0, versuche computed styles
        if (elWidth === 0) elWidth = parseFloat(styles.width) || 'auto';
        if (elHeight === 0) elHeight = parseFloat(styles.height) || 'auto';

        // Parse computed values
        const parseNum = (val) => parseInt(val) || 0;

        content.innerHTML = `
            <style>
                .prop-section { margin-bottom: 16px; }
                .prop-section-title {
                    font-size: 11px; font-weight: 700; color: var(--gold);
                    text-transform: uppercase; letter-spacing: 0.5px;
                    margin-bottom: 10px; padding-bottom: 6px;
                    border-bottom: 1px solid var(--gray-200);
                }
                .prop-row { display: flex; gap: 8px; margin-bottom: 8px; }
                .prop-row .property-group { flex: 1; margin: 0; }
                .prop-row input[type="number"] { text-align: center; }
                .prop-toggle { display: flex; gap: 4px; }
                .prop-toggle button {
                    flex: 1; padding: 6px; border: 1px solid var(--gray-300);
                    background: var(--white); border-radius: 4px; cursor: pointer;
                    font-size: 11px; transition: all 0.2s;
                }
                .prop-toggle button:hover { border-color: var(--gold); }
                .prop-toggle button.active { background: var(--gold); color: var(--navy-dark); border-color: var(--gold); }
                .prop-slider { display: flex; align-items: center; gap: 8px; }
                .prop-slider input[type="range"] { flex: 1; }
                .prop-slider span { min-width: 40px; text-align: right; font-size: 11px; color: var(--gray-600); }
                /* Ensure inputs are editable */
                .prop-section input, .prop-section select, .prop-section textarea {
                    pointer-events: auto !important;
                    user-select: text !important;
                    cursor: text;
                }
            </style>

            <!-- Element Info -->
            <div class="prop-section">
                <div class="prop-section-title">📦 Element</div>
                <div class="property-group">
                    <label>Typ</label>
                    <input type="text" value="<${tagName}>" readonly style="background: var(--gray-100); font-family: monospace; font-size: 12px;">
                </div>
                <div class="property-group">
                    <label>Größe (aktuell)</label>
                    <input type="text" value="${typeof elWidth === 'number' ? Math.round(elWidth) : elWidth} × ${typeof elHeight === 'number' ? Math.round(elHeight) : elHeight} px" readonly style="background: var(--gray-100);">
                </div>
            </div>

            <!-- Position -->
            <div class="prop-section">
                <div class="prop-section-title">📍 Position</div>
                <div class="property-group">
                    <label>Modus</label>
                    <div class="prop-toggle">
                        <button onclick="adminPanel.setPosition('static')" class="${styles.position === 'static' ? 'active' : ''}">Static</button>
                        <button onclick="adminPanel.setPosition('relative')" class="${styles.position === 'relative' ? 'active' : ''}">Relative</button>
                        <button onclick="adminPanel.setPosition('absolute')" class="${styles.position === 'absolute' ? 'active' : ''}">Absolute</button>
                        <button onclick="adminPanel.setPosition('fixed')" class="${styles.position === 'fixed' ? 'active' : ''}">Fixed</button>
                    </div>
                </div>
                <div class="prop-row">
                    <div class="property-group">
                        <label>Top (px)</label>
                        <input type="number" value="${parseNum(el.style.top) || parseNum(styles.top)}"
                               onchange="adminPanel.updateElementStyle('top', this.value + 'px')"
                               style="pointer-events:auto!important;cursor:text!important;">
                    </div>
                    <div class="property-group">
                        <label>Left (px)</label>
                        <input type="number" value="${parseNum(el.style.left) || parseNum(styles.left)}"
                               onchange="adminPanel.updateElementStyle('left', this.value + 'px')"
                               style="pointer-events:auto!important;cursor:text!important;">
                    </div>
                </div>
                <div class="prop-row">
                    <div class="property-group">
                        <label>Bottom (px)</label>
                        <input type="number" value="${parseNum(el.style.bottom)}"
                               onchange="adminPanel.updateElementStyle('bottom', this.value + 'px')"
                               style="pointer-events:auto!important;cursor:text!important;">
                    </div>
                    <div class="property-group">
                        <label>Right (px)</label>
                        <input type="number" value="${parseNum(el.style.right)}"
                               onchange="adminPanel.updateElementStyle('right', this.value + 'px')"
                               style="pointer-events:auto!important;cursor:text!important;">
                    </div>
                </div>
                <div class="property-group">
                    <label>Z-Index</label>
                    <input type="number" value="${parseNum(styles.zIndex) || 0}"
                           onchange="adminPanel.updateElementStyle('zIndex', this.value)"
                           style="pointer-events:auto!important;cursor:text!important;">
                </div>
            </div>

            <!-- Größe -->
            <div class="prop-section">
                <div class="prop-section-title">📐 Größe</div>
                <div class="prop-row">
                    <div class="property-group">
                        <label>Breite</label>
                        <input type="text" value="${el.style.width || 'auto'}" placeholder="auto / 100px / 50%"
                               onchange="adminPanel.updateElementStyle('width', this.value)"
                               style="pointer-events:auto!important;cursor:text!important;">
                    </div>
                    <div class="property-group">
                        <label>Höhe</label>
                        <input type="text" value="${el.style.height || 'auto'}" placeholder="auto / 100px"
                               onchange="adminPanel.updateElementStyle('height', this.value)"
                               style="pointer-events:auto!important;cursor:text!important;">
                    </div>
                </div>
                <div class="prop-row">
                    <div class="property-group">
                        <label>Min-Breite</label>
                        <input type="text" value="${el.style.minWidth || ''}" placeholder="0"
                               onchange="adminPanel.updateElementStyle('minWidth', this.value)"
                               style="pointer-events:auto!important;cursor:text!important;">
                    </div>
                    <div class="property-group">
                        <label>Max-Breite</label>
                        <input type="text" value="${el.style.maxWidth || ''}" placeholder="none"
                               onchange="adminPanel.updateElementStyle('maxWidth', this.value)"
                               style="pointer-events:auto!important;cursor:text!important;">
                    </div>
                </div>
            </div>

            <!-- Abstände -->
            <div class="prop-section">
                <div class="prop-section-title">↔️ Abstände</div>
                <label style="font-size: 11px; color: var(--gray-600);">Margin (außen)</label>
                <div class="prop-row">
                    <div class="property-group">
                        <input type="number" value="${parseNum(styles.marginTop)}" placeholder="↑"
                               onchange="adminPanel.updateElementStyle('marginTop', this.value + 'px')" title="Oben"
                               style="pointer-events:auto!important;cursor:text!important;">
                    </div>
                    <div class="property-group">
                        <input type="number" value="${parseNum(styles.marginRight)}" placeholder="→"
                               onchange="adminPanel.updateElementStyle('marginRight', this.value + 'px')" title="Rechts"
                               style="pointer-events:auto!important;cursor:text!important;">
                    </div>
                    <div class="property-group">
                        <input type="number" value="${parseNum(styles.marginBottom)}" placeholder="↓"
                               onchange="adminPanel.updateElementStyle('marginBottom', this.value + 'px')" title="Unten"
                               style="pointer-events:auto!important;cursor:text!important;">
                    </div>
                    <div class="property-group">
                        <input type="number" value="${parseNum(styles.marginLeft)}" placeholder="←"
                               onchange="adminPanel.updateElementStyle('marginLeft', this.value + 'px')" title="Links"
                               style="pointer-events:auto!important;cursor:text!important;">
                    </div>
                </div>
                <label style="font-size: 11px; color: var(--gray-600);">Padding (innen)</label>
                <div class="prop-row">
                    <div class="property-group">
                        <input type="number" value="${parseNum(styles.paddingTop)}" placeholder="↑"
                               onchange="adminPanel.updateElementStyle('paddingTop', this.value + 'px')" title="Oben"
                               style="pointer-events:auto!important;cursor:text!important;">
                    </div>
                    <div class="property-group">
                        <input type="number" value="${parseNum(styles.paddingRight)}" placeholder="→"
                               onchange="adminPanel.updateElementStyle('paddingRight', this.value + 'px')" title="Rechts"
                               style="pointer-events:auto!important;cursor:text!important;">
                    </div>
                    <div class="property-group">
                        <input type="number" value="${parseNum(styles.paddingBottom)}" placeholder="↓"
                               onchange="adminPanel.updateElementStyle('paddingBottom', this.value + 'px')" title="Unten"
                               style="pointer-events:auto!important;cursor:text!important;">
                    </div>
                    <div class="property-group">
                        <input type="number" value="${parseNum(styles.paddingLeft)}" placeholder="←"
                               onchange="adminPanel.updateElementStyle('paddingLeft', this.value + 'px')" title="Links"
                               style="pointer-events:auto!important;cursor:text!important;">
                    </div>
                </div>
            </div>

            <!-- Farben -->
            <div class="prop-section">
                <div class="prop-section-title">🎨 Farben</div>
                <div class="prop-row">
                    <div class="property-group">
                        <label>Hintergrund</label>
                        <input type="color" value="${this.rgbToHex(styles.backgroundColor)}"
                               onchange="adminPanel.updateElementStyle('backgroundColor', this.value)">
                    </div>
                    <div class="property-group">
                        <label>Text</label>
                        <input type="color" value="${this.rgbToHex(styles.color)}"
                               onchange="adminPanel.updateElementStyle('color', this.value)">
                    </div>
                </div>
                <div class="property-group">
                    <label>Opacity</label>
                    <div class="prop-slider">
                        <input type="range" min="0" max="100" value="${Math.round(parseFloat(styles.opacity) * 100)}"
                               oninput="adminPanel.updateElementStyle('opacity', this.value/100); this.nextElementSibling.textContent = this.value + '%'">
                        <span>${Math.round(parseFloat(styles.opacity) * 100)}%</span>
                    </div>
                </div>

                <!-- Gradient Editor für einzelnes Element -->
                <div class="property-group" style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--gray-200);">
                    <label>Gradient Hintergrund</label>
                    <div id="singleGradientPreview" style="height: 32px; border-radius: 6px; margin: 8px 0; border: 1px solid var(--gray-300); background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);"></div>
                    <div class="prop-row">
                        <div class="property-group">
                            <select id="singleGradientDirection" onchange="adminPanel.updateSingleGradientPreview()">
                                <option value="90deg">→</option>
                                <option value="180deg">↓</option>
                                <option value="45deg">↗</option>
                                <option value="135deg">↘</option>
                            </select>
                        </div>
                        <div class="property-group">
                            <input type="color" id="singleGradientColor1" value="#667eea" onchange="adminPanel.updateSingleGradientPreview()">
                        </div>
                        <div class="property-group">
                            <input type="color" id="singleGradientColor2" value="#764ba2" onchange="adminPanel.updateSingleGradientPreview()">
                        </div>
                    </div>
                    <button class="btn-secondary btn-sm" style="width: 100%;" onclick="adminPanel.applySingleGradient()">
                        Gradient anwenden
                    </button>
                </div>

                <!-- Farbe auf alle Kinder anwenden -->
                <div class="property-group" style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--gray-200);">
                    <label>Farbe auf Kinder anwenden</label>
                    <div class="prop-row">
                        <div class="property-group">
                            <input type="color" id="childrenBgColor" value="#ffffff">
                        </div>
                        <button class="btn-secondary btn-sm" onclick="adminPanel.applyColorToChildren('backgroundColor', document.getElementById('childrenBgColor').value)">
                            BG auf Kinder
                        </button>
                    </div>
                    <div class="prop-row">
                        <div class="property-group">
                            <input type="color" id="childrenTextColor" value="#000000">
                        </div>
                        <button class="btn-secondary btn-sm" onclick="adminPanel.applyColorToChildren('color', document.getElementById('childrenTextColor').value)">
                            Text auf Kinder
                        </button>
                    </div>
                </div>
            </div>

            <!-- Border -->
            <div class="prop-section">
                <div class="prop-section-title">🔲 Rahmen</div>
                <div class="prop-row">
                    <div class="property-group">
                        <label>Breite (px)</label>
                        <input type="number" value="${parseNum(styles.borderWidth)}" min="0"
                               onchange="adminPanel.updateElementStyle('borderWidth', this.value + 'px')">
                    </div>
                    <div class="property-group">
                        <label>Farbe</label>
                        <input type="color" value="${this.rgbToHex(styles.borderColor)}"
                               onchange="adminPanel.updateElementStyle('borderColor', this.value)">
                    </div>
                </div>
                <div class="property-group">
                    <label>Stil</label>
                    <select onchange="adminPanel.updateElementStyle('borderStyle', this.value)">
                        <option value="none" ${styles.borderStyle === 'none' ? 'selected' : ''}>Kein</option>
                        <option value="solid" ${styles.borderStyle === 'solid' ? 'selected' : ''}>Solid</option>
                        <option value="dashed" ${styles.borderStyle === 'dashed' ? 'selected' : ''}>Dashed</option>
                        <option value="dotted" ${styles.borderStyle === 'dotted' ? 'selected' : ''}>Dotted</option>
                        <option value="double" ${styles.borderStyle === 'double' ? 'selected' : ''}>Double</option>
                    </select>
                </div>
                <div class="property-group">
                    <label>Border Radius (px)</label>
                    <input type="number" value="${parseNum(styles.borderRadius)}" min="0"
                           onchange="adminPanel.updateElementStyle('borderRadius', this.value + 'px')">
                </div>
            </div>

            <!-- Text -->
            <div class="prop-section">
                <div class="prop-section-title">✏️ Text & Schrift</div>
                <div class="property-group">
                    <label>Schriftart</label>
                    <select onchange="adminPanel.updateElementStyle('fontFamily', this.value)">
                        <option value="" ${!el.style.fontFamily ? 'selected' : ''}>Standard (vererbt)</option>
                        <optgroup label="Serif (mit Serifen)">
                            <option value="Georgia, serif" ${styles.fontFamily.includes('Georgia') ? 'selected' : ''}>Georgia</option>
                            <option value="'Times New Roman', serif" ${styles.fontFamily.includes('Times') ? 'selected' : ''}>Times New Roman</option>
                            <option value="'Playfair Display', serif" ${styles.fontFamily.includes('Playfair') ? 'selected' : ''}>Playfair Display</option>
                            <option value="Merriweather, serif" ${styles.fontFamily.includes('Merriweather') ? 'selected' : ''}>Merriweather</option>
                        </optgroup>
                        <optgroup label="Sans-Serif (ohne Serifen)">
                            <option value="'Inter', sans-serif" ${styles.fontFamily.includes('Inter') ? 'selected' : ''}>Inter</option>
                            <option value="Arial, sans-serif" ${styles.fontFamily.includes('Arial') ? 'selected' : ''}>Arial</option>
                            <option value="'Helvetica Neue', sans-serif" ${styles.fontFamily.includes('Helvetica') ? 'selected' : ''}>Helvetica</option>
                            <option value="'Open Sans', sans-serif" ${styles.fontFamily.includes('Open Sans') ? 'selected' : ''}>Open Sans</option>
                            <option value="Roboto, sans-serif" ${styles.fontFamily.includes('Roboto') ? 'selected' : ''}>Roboto</option>
                            <option value="Poppins, sans-serif" ${styles.fontFamily.includes('Poppins') ? 'selected' : ''}>Poppins</option>
                            <option value="Montserrat, sans-serif" ${styles.fontFamily.includes('Montserrat') ? 'selected' : ''}>Montserrat</option>
                        </optgroup>
                        <optgroup label="Monospace (gleiche Breite)">
                            <option value="'Fira Code', monospace" ${styles.fontFamily.includes('Fira') ? 'selected' : ''}>Fira Code</option>
                            <option value="'Courier New', monospace" ${styles.fontFamily.includes('Courier') ? 'selected' : ''}>Courier New</option>
                            <option value="monospace" ${styles.fontFamily === 'monospace' ? 'selected' : ''}>System Monospace</option>
                        </optgroup>
                    </select>
                    <small style="color:var(--gray-500); font-size:10px; display:block; margin-top:4px;">
                        Tipp: Google Fonts müssen im HTML eingebunden sein
                    </small>
                </div>
                <div class="prop-row">
                    <div class="property-group">
                        <label>Größe (px)</label>
                        <input type="number" value="${parseNum(styles.fontSize)}" min="1"
                               onchange="adminPanel.updateElementStyle('fontSize', this.value + 'px')">
                    </div>
                    <div class="property-group">
                        <label>Gewicht</label>
                        <select onchange="adminPanel.updateElementStyle('fontWeight', this.value)">
                            <option value="100" ${styles.fontWeight == '100' ? 'selected' : ''}>Thin (100)</option>
                            <option value="200" ${styles.fontWeight == '200' ? 'selected' : ''}>Extra Light (200)</option>
                            <option value="300" ${styles.fontWeight == '300' ? 'selected' : ''}>Light (300)</option>
                            <option value="400" ${styles.fontWeight == '400' ? 'selected' : ''}>Normal (400)</option>
                            <option value="500" ${styles.fontWeight == '500' ? 'selected' : ''}>Medium (500)</option>
                            <option value="600" ${styles.fontWeight == '600' ? 'selected' : ''}>Semi-Bold (600)</option>
                            <option value="700" ${styles.fontWeight == '700' ? 'selected' : ''}>Bold (700)</option>
                            <option value="800" ${styles.fontWeight == '800' ? 'selected' : ''}>Extra Bold (800)</option>
                            <option value="900" ${styles.fontWeight == '900' ? 'selected' : ''}>Black (900)</option>
                        </select>
                    </div>
                </div>
                <div class="prop-row">
                    <div class="property-group">
                        <label>Stil</label>
                        <select onchange="adminPanel.updateElementStyle('fontStyle', this.value)">
                            <option value="normal" ${styles.fontStyle === 'normal' ? 'selected' : ''}>Normal</option>
                            <option value="italic" ${styles.fontStyle === 'italic' ? 'selected' : ''}>Kursiv</option>
                        </select>
                    </div>
                    <div class="property-group">
                        <label>Dekoration</label>
                        <select onchange="adminPanel.updateElementStyle('textDecoration', this.value)">
                            <option value="none" ${styles.textDecoration.includes('none') ? 'selected' : ''}>Keine</option>
                            <option value="underline" ${styles.textDecoration.includes('underline') ? 'selected' : ''}>Unterstrichen</option>
                            <option value="line-through" ${styles.textDecoration.includes('line-through') ? 'selected' : ''}>Durchgestrichen</option>
                            <option value="overline" ${styles.textDecoration.includes('overline') ? 'selected' : ''}>Überstrichen</option>
                        </select>
                    </div>
                </div>
                <div class="property-group">
                    <label>Ausrichtung</label>
                    <div class="prop-toggle">
                        <button onclick="adminPanel.updateElementStyle('textAlign', 'left')" class="${styles.textAlign === 'left' ? 'active' : ''}" title="Links">←</button>
                        <button onclick="adminPanel.updateElementStyle('textAlign', 'center')" class="${styles.textAlign === 'center' ? 'active' : ''}" title="Zentriert">↔</button>
                        <button onclick="adminPanel.updateElementStyle('textAlign', 'right')" class="${styles.textAlign === 'right' ? 'active' : ''}" title="Rechts">→</button>
                        <button onclick="adminPanel.updateElementStyle('textAlign', 'justify')" class="${styles.textAlign === 'justify' ? 'active' : ''}" title="Blocksatz">≡</button>
                    </div>
                </div>
                <div class="prop-row">
                    <div class="property-group">
                        <label>Zeilenhöhe</label>
                        <input type="text" value="${styles.lineHeight}" placeholder="normal / 1.5 / 24px"
                               onchange="adminPanel.updateElementStyle('lineHeight', this.value)">
                    </div>
                    <div class="property-group">
                        <label>Buchstabenabstand</label>
                        <input type="text" value="${el.style.letterSpacing || ''}" placeholder="0 / 2px / -1px"
                               onchange="adminPanel.updateElementStyle('letterSpacing', this.value)">
                    </div>
                </div>
                <div class="property-group">
                    <label>Text-Transform</label>
                    <div class="prop-toggle">
                        <button onclick="adminPanel.updateElementStyle('textTransform', 'none')" class="${styles.textTransform === 'none' ? 'active' : ''}" title="Normal">Aa</button>
                        <button onclick="adminPanel.updateElementStyle('textTransform', 'uppercase')" class="${styles.textTransform === 'uppercase' ? 'active' : ''}" title="GROSSBUCHSTABEN">AA</button>
                        <button onclick="adminPanel.updateElementStyle('textTransform', 'lowercase')" class="${styles.textTransform === 'lowercase' ? 'active' : ''}" title="kleinbuchstaben">aa</button>
                        <button onclick="adminPanel.updateElementStyle('textTransform', 'capitalize')" class="${styles.textTransform === 'capitalize' ? 'active' : ''}" title="Erster Buchstabe Groß">Ab</button>
                    </div>
                </div>
            </div>

            <!-- Display & Layout -->
            <div class="prop-section">
                <div class="prop-section-title">📊 Layout</div>
                <div class="property-group">
                    <label>Display</label>
                    <select onchange="adminPanel.updateElementStyle('display', this.value)">
                        <option value="block" ${styles.display === 'block' ? 'selected' : ''}>Block</option>
                        <option value="inline" ${styles.display === 'inline' ? 'selected' : ''}>Inline</option>
                        <option value="inline-block" ${styles.display === 'inline-block' ? 'selected' : ''}>Inline-Block</option>
                        <option value="flex" ${styles.display === 'flex' ? 'selected' : ''}>Flex</option>
                        <option value="inline-flex" ${styles.display === 'inline-flex' ? 'selected' : ''}>Inline-Flex</option>
                        <option value="grid" ${styles.display === 'grid' ? 'selected' : ''}>Grid</option>
                        <option value="none" ${styles.display === 'none' ? 'selected' : ''}>Hidden</option>
                    </select>
                </div>
                <div class="prop-row">
                    <div class="property-group">
                        <label>Overflow-X</label>
                        <select onchange="adminPanel.updateElementStyle('overflowX', this.value)">
                            <option value="visible" ${styles.overflowX === 'visible' ? 'selected' : ''}>Visible</option>
                            <option value="hidden" ${styles.overflowX === 'hidden' ? 'selected' : ''}>Hidden</option>
                            <option value="scroll" ${styles.overflowX === 'scroll' ? 'selected' : ''}>Scroll</option>
                            <option value="auto" ${styles.overflowX === 'auto' ? 'selected' : ''}>Auto</option>
                        </select>
                    </div>
                    <div class="property-group">
                        <label>Overflow-Y</label>
                        <select onchange="adminPanel.updateElementStyle('overflowY', this.value)">
                            <option value="visible" ${styles.overflowY === 'visible' ? 'selected' : ''}>Visible</option>
                            <option value="hidden" ${styles.overflowY === 'hidden' ? 'selected' : ''}>Hidden</option>
                            <option value="scroll" ${styles.overflowY === 'scroll' ? 'selected' : ''}>Scroll</option>
                            <option value="auto" ${styles.overflowY === 'auto' ? 'selected' : ''}>Auto</option>
                        </select>
                    </div>
                </div>
                <div class="property-group">
                    <label>Visibility</label>
                    <select onchange="adminPanel.updateElementStyle('visibility', this.value)">
                        <option value="visible" ${styles.visibility === 'visible' ? 'selected' : ''}>Visible</option>
                        <option value="hidden" ${styles.visibility === 'hidden' ? 'selected' : ''}>Hidden</option>
                        <option value="collapse" ${styles.visibility === 'collapse' ? 'selected' : ''}>Collapse</option>
                    </select>
                </div>
            </div>

            <!-- Flexbox (wenn display: flex) -->
            <div class="prop-section">
                <div class="prop-section-title">📦 Flexbox / Grid</div>
                <div class="property-group">
                    <label>Flex Direction</label>
                    <select onchange="adminPanel.updateElementStyle('flexDirection', this.value)">
                        <option value="row" ${styles.flexDirection === 'row' ? 'selected' : ''}>Row →</option>
                        <option value="row-reverse" ${styles.flexDirection === 'row-reverse' ? 'selected' : ''}>Row Reverse ←</option>
                        <option value="column" ${styles.flexDirection === 'column' ? 'selected' : ''}>Column ↓</option>
                        <option value="column-reverse" ${styles.flexDirection === 'column-reverse' ? 'selected' : ''}>Column Reverse ↑</option>
                    </select>
                </div>
                <div class="property-group">
                    <label>Justify Content</label>
                    <select onchange="adminPanel.updateElementStyle('justifyContent', this.value)">
                        <option value="flex-start" ${styles.justifyContent === 'flex-start' ? 'selected' : ''}>Start</option>
                        <option value="center" ${styles.justifyContent === 'center' ? 'selected' : ''}>Center</option>
                        <option value="flex-end" ${styles.justifyContent === 'flex-end' ? 'selected' : ''}>End</option>
                        <option value="space-between" ${styles.justifyContent === 'space-between' ? 'selected' : ''}>Space Between</option>
                        <option value="space-around" ${styles.justifyContent === 'space-around' ? 'selected' : ''}>Space Around</option>
                        <option value="space-evenly" ${styles.justifyContent === 'space-evenly' ? 'selected' : ''}>Space Evenly</option>
                    </select>
                </div>
                <div class="property-group">
                    <label>Align Items</label>
                    <select onchange="adminPanel.updateElementStyle('alignItems', this.value)">
                        <option value="stretch" ${styles.alignItems === 'stretch' ? 'selected' : ''}>Stretch</option>
                        <option value="flex-start" ${styles.alignItems === 'flex-start' ? 'selected' : ''}>Start</option>
                        <option value="center" ${styles.alignItems === 'center' ? 'selected' : ''}>Center</option>
                        <option value="flex-end" ${styles.alignItems === 'flex-end' ? 'selected' : ''}>End</option>
                        <option value="baseline" ${styles.alignItems === 'baseline' ? 'selected' : ''}>Baseline</option>
                    </select>
                </div>
                <div class="property-group">
                    <label>Flex Wrap</label>
                    <select onchange="adminPanel.updateElementStyle('flexWrap', this.value)">
                        <option value="nowrap" ${styles.flexWrap === 'nowrap' ? 'selected' : ''}>No Wrap</option>
                        <option value="wrap" ${styles.flexWrap === 'wrap' ? 'selected' : ''}>Wrap</option>
                        <option value="wrap-reverse" ${styles.flexWrap === 'wrap-reverse' ? 'selected' : ''}>Wrap Reverse</option>
                    </select>
                </div>
                <div class="property-group">
                    <label>Gap</label>
                    <input type="text" value="${el.style.gap || ''}" placeholder="10px / 10px 20px"
                           onchange="adminPanel.updateElementStyle('gap', this.value)">
                </div>
            </div>

            <!-- Selbst als Flex-Kind -->
            <div class="prop-section">
                <div class="prop-section-title">🧩 Als Flex-Kind</div>
                <div class="prop-row">
                    <div class="property-group">
                        <label>Flex Grow</label>
                        <input type="number" value="${parseNum(styles.flexGrow)}" min="0"
                               onchange="adminPanel.updateElementStyle('flexGrow', this.value)">
                    </div>
                    <div class="property-group">
                        <label>Flex Shrink</label>
                        <input type="number" value="${parseNum(styles.flexShrink)}" min="0"
                               onchange="adminPanel.updateElementStyle('flexShrink', this.value)">
                    </div>
                </div>
                <div class="property-group">
                    <label>Flex Basis</label>
                    <input type="text" value="${el.style.flexBasis || ''}" placeholder="auto / 200px / 50%"
                           onchange="adminPanel.updateElementStyle('flexBasis', this.value)">
                </div>
                <div class="property-group">
                    <label>Align Self</label>
                    <select onchange="adminPanel.updateElementStyle('alignSelf', this.value)">
                        <option value="auto" ${styles.alignSelf === 'auto' ? 'selected' : ''}>Auto</option>
                        <option value="flex-start" ${styles.alignSelf === 'flex-start' ? 'selected' : ''}>Start</option>
                        <option value="center" ${styles.alignSelf === 'center' ? 'selected' : ''}>Center</option>
                        <option value="flex-end" ${styles.alignSelf === 'flex-end' ? 'selected' : ''}>End</option>
                        <option value="stretch" ${styles.alignSelf === 'stretch' ? 'selected' : ''}>Stretch</option>
                    </select>
                </div>
                <div class="property-group">
                    <label>Order</label>
                    <input type="number" value="${parseNum(styles.order)}"
                           onchange="adminPanel.updateElementStyle('order', this.value)">
                </div>
            </div>

            <!-- Effekte -->
            <div class="prop-section">
                <div class="prop-section-title">✨ Effekte</div>
                <div class="property-group">
                    <label>Box Shadow</label>
                    <input type="text" value="${el.style.boxShadow || ''}" placeholder="0 4px 20px rgba(0,0,0,0.2)"
                           onchange="adminPanel.updateElementStyle('boxShadow', this.value)">
                </div>
                <div class="property-group">
                    <label>Text Shadow</label>
                    <input type="text" value="${el.style.textShadow || ''}" placeholder="2px 2px 4px #000"
                           onchange="adminPanel.updateElementStyle('textShadow', this.value)">
                </div>
                <div class="property-group">
                    <label>Transform</label>
                    <input type="text" value="${el.style.transform || ''}" placeholder="rotate(5deg) scale(1.1)"
                           onchange="adminPanel.updateElementStyle('transform', this.value)">
                </div>
                <div class="property-group">
                    <label>Filter</label>
                    <input type="text" value="${el.style.filter || ''}" placeholder="blur(5px) brightness(1.2)"
                           onchange="adminPanel.updateElementStyle('filter', this.value)">
                </div>
                <div class="property-group">
                    <label>Transition</label>
                    <input type="text" value="${el.style.transition || ''}" placeholder="all 0.3s ease"
                           onchange="adminPanel.updateElementStyle('transition', this.value)">
                    <small style="color:var(--gray-500); font-size:10px; display:block; margin-top:4px;">
                        Bestimmt wie schnell Änderungen animiert werden
                    </small>
                </div>
            </div>

            <!-- Hover-Effekte -->
            <div class="prop-section">
                <div class="prop-section-title">🖱️ Hover-Effekte (Maus darüber)</div>
                <div style="background:var(--gray-100); padding:10px; border-radius:8px; margin-bottom:12px;">
                    <p style="font-size:11px; color:var(--gray-600); margin:0 0 8px 0; line-height:1.4;">
                        <strong>Was ist ein Hover-Effekt?</strong><br>
                        Wenn jemand mit der Maus über ein Element fährt, kann sich dessen Aussehen ändern - z.B. Farbe, Größe oder ein Schatten erscheint. Das macht die Seite interaktiv!
                    </p>
                </div>

                <div class="property-group">
                    <label>Schnelle Hover-Vorlagen</label>
                    <select onchange="adminPanel.applyHoverPreset(this.value)">
                        <option value="">-- Vorlage wählen --</option>
                        <option value="lift">Anheben (Element schwebt hoch)</option>
                        <option value="glow">Leuchten (goldener Schimmer)</option>
                        <option value="scale">Vergrößern (wird größer)</option>
                        <option value="darken">Abdunkeln (wird dunkler)</option>
                        <option value="brighten">Aufhellen (wird heller)</option>
                        <option value="border">Rahmen erscheint</option>
                        <option value="shake">Wackeln (Aufmerksamkeit)</option>
                        <option value="none">Alle Hover entfernen</option>
                    </select>
                </div>

                <div style="border-top:1px solid var(--gray-200); margin:12px 0; padding-top:12px;">
                    <label style="font-size:11px; font-weight:600; color:var(--gray-700);">Eigene Hover-Stile:</label>
                    <small style="color:var(--gray-500); font-size:10px; display:block; margin:4px 0 8px 0;">
                        Tipp: Setzt zuerst eine Transition oben, damit der Übergang smooth ist!
                    </small>
                </div>

                <div class="prop-row">
                    <div class="property-group">
                        <label>Hover-Hintergrund</label>
                        <input type="color" id="hoverBgColor" value="${this.rgbToHex(styles.backgroundColor)}"
                               onchange="adminPanel.setHoverStyle('backgroundColor', this.value)">
                    </div>
                    <div class="property-group">
                        <label>Hover-Textfarbe</label>
                        <input type="color" id="hoverTextColor" value="${this.rgbToHex(styles.color)}"
                               onchange="adminPanel.setHoverStyle('color', this.value)">
                    </div>
                </div>

                <div class="property-group">
                    <label>Hover-Transform</label>
                    <input type="text" id="hoverTransform" placeholder="scale(1.05) / translateY(-5px)"
                           onchange="adminPanel.setHoverStyle('transform', this.value)">
                    <small style="color:var(--gray-500); font-size:10px; display:block; margin-top:4px;">
                        scale(1.05) = 5% größer | translateY(-5px) = 5px nach oben
                    </small>
                </div>

                <div class="property-group">
                    <label>Hover-Shadow</label>
                    <input type="text" id="hoverShadow" placeholder="0 10px 30px rgba(0,0,0,0.3)"
                           onchange="adminPanel.setHoverStyle('boxShadow', this.value)">
                </div>

                <div class="property-group">
                    <label>Hover-Opacity</label>
                    <div class="prop-slider">
                        <input type="range" min="0" max="100" value="100" id="hoverOpacity"
                               oninput="adminPanel.setHoverStyle('opacity', this.value/100); this.nextElementSibling.textContent = this.value + '%'">
                        <span>100%</span>
                    </div>
                </div>

                <button class="btn-secondary btn-sm" style="width:100%; margin-top:8px;" onclick="adminPanel.testHoverEffect()">
                    <i class="fas fa-play"></i> Hover-Effekt testen
                </button>

                <button class="btn-warning btn-sm" style="width:100%; margin-top:8px; background:#ffc107; color:#000;" onclick="adminPanel.removeHoverStyles()">
                    <i class="fas fa-trash"></i> Alle Hover-Stile entfernen
                </button>
            </div>

            <!-- Bild-Bearbeitung (nur bei img, background-image oder Containern mit Bildern) -->
            ${this.getImagePropertiesHTML(el, styles)}

            <!-- Benutzer-Upload-Zone -->
            <div class="prop-section">
                <div class="prop-section-title">📤 Benutzer-Upload-Zone</div>
                <div style="background:var(--gray-100); padding:10px; border-radius:8px; margin-bottom:12px;">
                    <p style="font-size:11px; color:var(--gray-600); margin:0; line-height:1.4;">
                        <strong>Was ist das?</strong><br>
                        Markiere dieses Element als Upload-Zone. Dann kann jeder (auch ohne Admin) hier per Drag & Drop oder Klick ein eigenes Bild hochladen.
                    </p>
                </div>
                <div class="property-group">
                    <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                        <input type="checkbox" id="enableUploadZone"
                               ${el.dataset.uploadZone === 'true' ? 'checked' : ''}
                               onchange="adminPanel.toggleUploadZone(this.checked)"
                               style="width:18px; height:18px; cursor:pointer;">
                        <span>Als Upload-Zone aktivieren</span>
                    </label>
                </div>
                ${el.dataset.uploadZone === 'true' ? `
                <div class="property-group">
                    <label>Zone-Name (für Benutzer)</label>
                    <input type="text" value="${el.dataset.uploadZoneName || ''}"
                           placeholder="z.B. 'Profilbild' oder 'Logo'"
                           onchange="adminPanel.setUploadZoneName(this.value)">
                </div>
                <div class="property-group">
                    <label>Maximale Dateigröße</label>
                    <select onchange="adminPanel.setUploadZoneMaxSize(this.value)">
                        <option value="1" ${el.dataset.uploadMaxSize === '1' ? 'selected' : ''}>1 MB</option>
                        <option value="2" ${el.dataset.uploadMaxSize === '2' || !el.dataset.uploadMaxSize ? 'selected' : ''}>2 MB</option>
                        <option value="5" ${el.dataset.uploadMaxSize === '5' ? 'selected' : ''}>5 MB</option>
                        <option value="10" ${el.dataset.uploadMaxSize === '10' ? 'selected' : ''}>10 MB</option>
                    </select>
                </div>
                <div class="property-group">
                    <label>Erlaubte Formate</label>
                    <div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:4px;">
                        <label style="display:flex; align-items:center; gap:4px; font-size:11px; cursor:pointer;">
                            <input type="checkbox" ${!el.dataset.uploadFormats || el.dataset.uploadFormats.includes('jpg') ? 'checked' : ''}
                                   onchange="adminPanel.updateUploadFormats()"> JPG
                        </label>
                        <label style="display:flex; align-items:center; gap:4px; font-size:11px; cursor:pointer;">
                            <input type="checkbox" ${!el.dataset.uploadFormats || el.dataset.uploadFormats.includes('png') ? 'checked' : ''}
                                   onchange="adminPanel.updateUploadFormats()"> PNG
                        </label>
                        <label style="display:flex; align-items:center; gap:4px; font-size:11px; cursor:pointer;">
                            <input type="checkbox" ${el.dataset.uploadFormats?.includes('gif') ? 'checked' : ''}
                                   onchange="adminPanel.updateUploadFormats()"> GIF
                        </label>
                        <label style="display:flex; align-items:center; gap:4px; font-size:11px; cursor:pointer;">
                            <input type="checkbox" ${el.dataset.uploadFormats?.includes('webp') ? 'checked' : ''}
                                   onchange="adminPanel.updateUploadFormats()"> WebP
                        </label>
                    </div>
                </div>
                <div style="background:var(--success); color:white; padding:8px 12px; border-radius:6px; font-size:11px; margin-top:8px;">
                    <i class="fas fa-check-circle"></i> Diese Zone ist aktiv! Benutzer können hier Bilder hochladen.
                </div>
                ` : ''}
            </div>

            <!-- Aktionen -->
            <div class="prop-section">
                <div class="prop-section-title">⚡ Schnellaktionen</div>
                <button class="btn-secondary btn-sm" style="width: 100%; margin-bottom: 8px;"
                        onclick="adminPanel.enableFreeMove()">
                    <i class="fas fa-arrows-alt"></i> Freies Verschieben (Pixel-genau)
                </button>
                <button class="btn-secondary btn-sm" style="width: 100%; margin-bottom: 8px;"
                        onclick="adminPanel.resetElementStyles()">
                    <i class="fas fa-undo"></i> Styles zurücksetzen
                </button>
                <button class="btn-secondary btn-sm" style="width: 100%; margin-bottom: 8px;"
                        onclick="adminPanel.copyElementStyles()">
                    <i class="fas fa-copy"></i> Styles kopieren
                </button>
                <button class="btn-primary btn-sm" style="width: 100%;"
                        onclick="adminPanel.startTextEditing(adminPanel.selectedElement, document.getElementById('websitePreview').contentDocument)">
                    <i class="fas fa-edit"></i> Inhalt bearbeiten
                </button>
            </div>
        `;

        // Stelle sicher, dass alle Eingabefelder klickbar und editierbar sind
        setTimeout(() => {
            const inputs = content.querySelectorAll('input:not([readonly]), select, textarea');
            inputs.forEach(input => {
                // Entferne mögliche blockierende Event-Listener
                input.addEventListener('mousedown', (e) => e.stopPropagation());
                input.addEventListener('click', (e) => {
                    e.stopPropagation();
                    input.focus();
                });
                // Setze tabindex für Keyboard-Navigation
                input.tabIndex = 0;
            });
            console.log('Properties inputs aktiviert:', inputs.length);
        }, 50);
    }

    setPosition(pos) {
        if (!this.selectedElement) return;
        this.selectedElement.style.position = pos;
        this.showElementProperties(this.selectedElement);
        this.showToast('info', 'Position', `Position auf "${pos}" gesetzt`);
    }

    enableFreeMove() {
        if (!this.selectedElement) return;

        const el = this.selectedElement;
        const iframe = document.getElementById('websitePreview');
        const doc = iframe.contentDocument;
        const rect = el.getBoundingClientRect();

        // Setze auf absolute Positionierung
        el.style.position = 'absolute';
        el.style.left = rect.left + 'px';
        el.style.top = rect.top + doc.documentElement.scrollTop + 'px';
        el.classList.add('admin-free-move');

        this.showToast('info', 'Freies Verschieben', 'Ziehe das Element mit der Maus. Klicke woanders zum Beenden.');

        // Mouse-Move Handler
        const moveHandler = (e) => {
            if (this.isFreeMoveActive) {
                el.style.left = (e.clientX - this.freeMoveOffset.x) + 'px';
                el.style.top = (e.clientY - this.freeMoveOffset.y + doc.documentElement.scrollTop) + 'px';
            }
        };

        const downHandler = (e) => {
            if (e.target === el || el.contains(e.target)) {
                e.preventDefault();
                this.isFreeMoveActive = true;
                const elRect = el.getBoundingClientRect();
                this.freeMoveOffset = {
                    x: e.clientX - elRect.left,
                    y: e.clientY - elRect.top
                };
                el.classList.add('admin-dragging');
            }
        };

        const upHandler = () => {
            if (this.isFreeMoveActive) {
                this.isFreeMoveActive = false;
                el.classList.remove('admin-dragging');
                this.showElementProperties(el);
            }
        };

        doc.addEventListener('mousemove', moveHandler);
        doc.addEventListener('mousedown', downHandler);
        doc.addEventListener('mouseup', upHandler);

        // Speichere Handler zum späteren Entfernen
        el._freeMoveHandlers = { moveHandler, downHandler, upHandler };
    }

    resetElementStyles() {
        if (!this.selectedElement) return;
        this.selectedElement.removeAttribute('style');
        this.showElementProperties(this.selectedElement);
        this.showToast('success', 'Zurückgesetzt', 'Alle Inline-Styles wurden entfernt');
    }

    copyElementStyles() {
        if (!this.selectedElement) return;
        const styles = this.selectedElement.getAttribute('style') || '';
        navigator.clipboard.writeText(styles).then(() => {
            this.showToast('success', 'Kopiert', 'Styles in Zwischenablage kopiert');
        });
    }

    // ==========================================
    // HOVER-EFFEKTE
    // ==========================================

    applyHoverPreset(preset) {
        if (!this.selectedElement) {
            this.showToast('warning', 'Kein Element', 'Bitte zuerst ein Element auswählen');
            return;
        }

        const el = this.selectedElement;
        const iframe = document.getElementById('websitePreview');
        const doc = iframe.contentDocument;

        // Entferne bestehende Hover-Klasse
        el.classList.remove('admin-hover-effect');

        // Generiere einzigartige Klasse für dieses Element
        let hoverClass = el.dataset.hoverClass;
        if (!hoverClass) {
            hoverClass = 'hover-' + Math.random().toString(36).substr(2, 9);
            el.dataset.hoverClass = hoverClass;
            el.classList.add(hoverClass);
        }

        // Definiere Hover-Presets
        const presets = {
            lift: {
                transition: 'all 0.3s ease',
                hover: 'transform: translateY(-8px); box-shadow: 0 15px 40px rgba(0,0,0,0.2);'
            },
            glow: {
                transition: 'all 0.3s ease',
                hover: 'box-shadow: 0 0 25px rgba(201, 162, 39, 0.6);'
            },
            scale: {
                transition: 'transform 0.3s ease',
                hover: 'transform: scale(1.05);'
            },
            darken: {
                transition: 'filter 0.3s ease',
                hover: 'filter: brightness(0.8);'
            },
            brighten: {
                transition: 'filter 0.3s ease',
                hover: 'filter: brightness(1.2);'
            },
            border: {
                transition: 'all 0.3s ease',
                hover: 'outline: 3px solid var(--gold, #c9a227); outline-offset: 3px;'
            },
            shake: {
                transition: 'none',
                hover: 'animation: admin-shake 0.5s ease;'
            },
            none: {
                transition: '',
                hover: ''
            }
        };

        if (!presets[preset]) return;

        // Setze Basis-Transition
        el.style.transition = presets[preset].transition;

        // Entferne alte Hover-Styles
        const oldStyle = doc.getElementById('admin-hover-style-' + hoverClass);
        if (oldStyle) oldStyle.remove();

        if (preset !== 'none' && presets[preset].hover) {
            // Füge neuen Hover-Style hinzu
            const style = doc.createElement('style');
            style.id = 'admin-hover-style-' + hoverClass;
            style.textContent = `
                .${hoverClass}:hover { ${presets[preset].hover} }
                @keyframes admin-shake {
                    0%, 100% { transform: translateX(0); }
                    25% { transform: translateX(-5px); }
                    75% { transform: translateX(5px); }
                }
            `;
            doc.head.appendChild(style);

            this.showToast('success', 'Hover-Effekt', `"${preset}" wurde angewendet`);
        } else {
            this.showToast('info', 'Entfernt', 'Hover-Effekt wurde entfernt');
        }
    }

    setHoverStyle(property, value) {
        if (!this.selectedElement) {
            this.showToast('warning', 'Kein Element', 'Bitte zuerst ein Element auswählen');
            return;
        }

        const el = this.selectedElement;
        const iframe = document.getElementById('websitePreview');
        const doc = iframe.contentDocument;

        // Generiere einzigartige Klasse für dieses Element
        let hoverClass = el.dataset.hoverClass;
        if (!hoverClass) {
            hoverClass = 'hover-' + Math.random().toString(36).substr(2, 9);
            el.dataset.hoverClass = hoverClass;
            el.classList.add(hoverClass);
        }

        // Setze Transition falls nicht vorhanden
        if (!el.style.transition) {
            el.style.transition = 'all 0.3s ease';
        }

        // Hole oder erstelle Style-Element
        let styleEl = doc.getElementById('admin-hover-style-' + hoverClass);
        if (!styleEl) {
            styleEl = doc.createElement('style');
            styleEl.id = 'admin-hover-style-' + hoverClass;
            doc.head.appendChild(styleEl);
        }

        // Parse existierende Hover-Styles
        const currentStyles = this._parseHoverStyles(styleEl.textContent, hoverClass);

        // Füge/Aktualisiere neue Eigenschaft
        // Konvertiere camelCase zu kebab-case
        const cssProperty = property.replace(/([A-Z])/g, '-$1').toLowerCase();
        currentStyles[cssProperty] = value;

        // Generiere neuen Style-String
        const styleString = Object.entries(currentStyles)
            .map(([prop, val]) => `${prop}: ${val}`)
            .join('; ');

        styleEl.textContent = `.${hoverClass}:hover { ${styleString}; }`;

        this.showToast('success', 'Hover-Stil', `${property} wurde gesetzt`);
    }

    _parseHoverStyles(styleContent, className) {
        const styles = {};
        const match = styleContent.match(new RegExp(`\\.${className}:hover\\s*\\{([^}]*)\\}`));
        if (match) {
            match[1].split(';').forEach(rule => {
                const [prop, val] = rule.split(':').map(s => s.trim());
                if (prop && val) {
                    styles[prop] = val;
                }
            });
        }
        return styles;
    }

    testHoverEffect() {
        if (!this.selectedElement) {
            this.showToast('warning', 'Kein Element', 'Bitte zuerst ein Element auswählen');
            return;
        }

        const el = this.selectedElement;

        // Simuliere Hover durch dispatchen eines Events
        el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));

        // Zeige visuelles Feedback
        this.showToast('info', 'Test', 'Hover-Effekt wird für 2 Sekunden angezeigt...');

        // Entferne Hover nach 2 Sekunden
        setTimeout(() => {
            el.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
        }, 2000);
    }

    removeHoverStyles() {
        if (!this.selectedElement) {
            this.showToast('warning', 'Kein Element', 'Bitte zuerst ein Element auswählen');
            return;
        }

        const el = this.selectedElement;
        const iframe = document.getElementById('websitePreview');
        const doc = iframe.contentDocument;

        const hoverClass = el.dataset.hoverClass;
        if (hoverClass) {
            // Entferne Style-Element
            const styleEl = doc.getElementById('admin-hover-style-' + hoverClass);
            if (styleEl) styleEl.remove();

            // Entferne Klasse und data-Attribut
            el.classList.remove(hoverClass);
            delete el.dataset.hoverClass;
        }

        // Entferne Transition
        el.style.transition = '';

        this.showToast('success', 'Entfernt', 'Alle Hover-Stile wurden entfernt');
    }

    // ==========================================
    // BENUTZER-UPLOAD-ZONEN
    // ==========================================

    toggleUploadZone(enabled) {
        if (!this.selectedElement) return;

        const el = this.selectedElement;
        const iframe = document.getElementById('websitePreview');
        const doc = iframe.contentDocument;

        if (enabled) {
            // Aktiviere Upload-Zone
            el.dataset.uploadZone = 'true';
            el.dataset.uploadMaxSize = el.dataset.uploadMaxSize || '2';
            el.dataset.uploadFormats = el.dataset.uploadFormats || 'jpg,png';

            // Füge Upload-Zone Klasse hinzu
            el.classList.add('user-upload-zone');

            // Initialisiere Upload-Handler für dieses Element
            this.initUploadZone(el, doc);

            this.showToast('success', 'Aktiviert', 'Upload-Zone wurde aktiviert');
        } else {
            // Deaktiviere Upload-Zone
            delete el.dataset.uploadZone;
            delete el.dataset.uploadZoneName;
            delete el.dataset.uploadMaxSize;
            delete el.dataset.uploadFormats;

            el.classList.remove('user-upload-zone');

            // Entferne Upload-Overlay falls vorhanden
            const overlay = el.querySelector('.upload-zone-overlay');
            if (overlay) overlay.remove();

            this.showToast('info', 'Deaktiviert', 'Upload-Zone wurde deaktiviert');
        }

        // Aktualisiere Properties-Anzeige
        this.showElementProperties(el);
    }

    setUploadZoneName(name) {
        if (!this.selectedElement) return;
        this.selectedElement.dataset.uploadZoneName = name;
        this.showToast('success', 'Gespeichert', `Zone-Name: "${name}"`);
    }

    setUploadZoneMaxSize(size) {
        if (!this.selectedElement) return;
        this.selectedElement.dataset.uploadMaxSize = size;
        this.showToast('success', 'Gespeichert', `Max. Größe: ${size} MB`);
    }

    updateUploadFormats() {
        if (!this.selectedElement) return;

        const checkboxes = document.querySelectorAll('#propertiesContent input[type="checkbox"]');
        const formats = [];

        // Finde alle Format-Checkboxen (die letzten 4)
        const formatCheckboxes = Array.from(checkboxes).slice(-4);
        const formatNames = ['jpg', 'png', 'gif', 'webp'];

        formatCheckboxes.forEach((cb, i) => {
            if (cb.checked) formats.push(formatNames[i]);
        });

        this.selectedElement.dataset.uploadFormats = formats.join(',');
        this.showToast('success', 'Gespeichert', `Formate: ${formats.join(', ').toUpperCase()}`);
    }

    initUploadZone(el, doc) {
        // Prüfe ob bereits initialisiert
        if (el.querySelector('.upload-zone-overlay')) return;

        // Erstelle Upload-Overlay
        const overlay = doc.createElement('div');
        overlay.className = 'upload-zone-overlay';
        overlay.innerHTML = `
            <div class="upload-zone-content">
                <i class="fas fa-cloud-upload-alt"></i>
                <span>${el.dataset.uploadZoneName || 'Bild hochladen'}</span>
                <small>Klicken oder Drag & Drop</small>
            </div>
            <input type="file" class="upload-zone-input" accept="image/*" style="display:none;">
        `;

        // Style für Overlay
        overlay.style.cssText = `
            position: absolute;
            inset: 0;
            background: rgba(201, 162, 39, 0.1);
            border: 2px dashed rgba(201, 162, 39, 0.5);
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0;
            transition: opacity 0.3s ease;
            cursor: pointer;
            z-index: 10;
        `;

        overlay.querySelector('.upload-zone-content').style.cssText = `
            text-align: center;
            color: var(--gold, #c9a227);
            pointer-events: none;
        `;

        overlay.querySelector('i').style.cssText = `
            font-size: 32px;
            display: block;
            margin-bottom: 8px;
        `;

        overlay.querySelector('small').style.cssText = `
            display: block;
            font-size: 11px;
            opacity: 0.7;
        `;

        // Stelle sicher, dass Parent relativ positioniert ist
        const currentPosition = doc.defaultView.getComputedStyle(el).position;
        if (currentPosition === 'static') {
            el.style.position = 'relative';
        }

        el.appendChild(overlay);

        // Event Listener
        el.addEventListener('mouseenter', () => {
            overlay.style.opacity = '1';
        });

        el.addEventListener('mouseleave', () => {
            overlay.style.opacity = '0';
        });

        // Klick zum Hochladen
        overlay.addEventListener('click', (e) => {
            e.stopPropagation();
            const input = overlay.querySelector('.upload-zone-input');
            input.click();
        });

        // Datei-Input Handler
        const input = overlay.querySelector('.upload-zone-input');
        input.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                this.handleUploadZoneFile(el, e.target.files[0]);
            }
        });

        // Drag & Drop
        el.addEventListener('dragover', (e) => {
            e.preventDefault();
            overlay.style.opacity = '1';
            overlay.style.background = 'rgba(201, 162, 39, 0.2)';
        });

        el.addEventListener('dragleave', (e) => {
            e.preventDefault();
            overlay.style.opacity = '0';
            overlay.style.background = 'rgba(201, 162, 39, 0.1)';
        });

        el.addEventListener('drop', (e) => {
            e.preventDefault();
            overlay.style.opacity = '0';
            overlay.style.background = 'rgba(201, 162, 39, 0.1)';

            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                this.handleUploadZoneFile(el, e.dataTransfer.files[0]);
            }
        });
    }

    async handleUploadZoneFile(el, file) {
        // Validiere Dateigröße
        const maxSize = parseInt(el.dataset.uploadMaxSize || '2') * 1024 * 1024;
        if (file.size > maxSize) {
            this.showToast('error', 'Zu groß', `Maximale Dateigröße: ${el.dataset.uploadMaxSize || 2} MB`);
            return;
        }

        // Validiere Format
        const allowedFormats = (el.dataset.uploadFormats || 'jpg,png').split(',');
        const fileExt = file.name.split('.').pop().toLowerCase();
        const mimeMap = { 'jpg': 'jpeg', 'jpeg': 'jpeg', 'png': 'png', 'gif': 'gif', 'webp': 'webp' };

        if (!allowedFormats.some(f => f === fileExt || mimeMap[f] === fileExt)) {
            this.showToast('error', 'Falsches Format', `Erlaubte Formate: ${allowedFormats.join(', ').toUpperCase()}`);
            return;
        }

        // Zeige Ladeanimation
        const overlay = el.querySelector('.upload-zone-overlay');
        if (overlay) {
            overlay.querySelector('.upload-zone-content').innerHTML = `
                <i class="fas fa-spinner fa-spin"></i>
                <span>Wird hochgeladen...</span>
            `;
            overlay.style.opacity = '1';
        }

        try {
            // Upload zum Server
            const formData = new FormData();
            formData.append('image', file);

            const response = await fetch('/api/upload-image', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (data.success) {
                // Wende Bild an
                const tagName = el.tagName.toLowerCase();
                if (tagName === 'img') {
                    el.src = data.url;
                } else {
                    el.style.backgroundImage = `url('${data.url}')`;
                    el.style.backgroundSize = 'cover';
                    el.style.backgroundPosition = 'center';
                }

                this.showToast('success', 'Hochgeladen', 'Bild wurde erfolgreich gesetzt');

                // Aktualisiere Properties falls dieses Element ausgewählt ist
                if (this.selectedElement === el) {
                    this.showElementProperties(el);
                }
            } else {
                throw new Error(data.error || 'Upload fehlgeschlagen');
            }
        } catch (error) {
            this.showToast('error', 'Fehler', error.message);
        }

        // Stelle Overlay wieder her
        if (overlay) {
            overlay.querySelector('.upload-zone-content').innerHTML = `
                <i class="fas fa-cloud-upload-alt"></i>
                <span>${el.dataset.uploadZoneName || 'Bild hochladen'}</span>
                <small>Klicken oder Drag & Drop</small>
            `;
            overlay.style.opacity = '0';
        }
    }

    // Initialisiere alle Upload-Zonen beim Laden
    initAllUploadZones() {
        const iframe = document.getElementById('websitePreview');
        if (!iframe || !iframe.contentDocument) return;

        const doc = iframe.contentDocument;
        const uploadZones = doc.querySelectorAll('[data-upload-zone="true"]');

        uploadZones.forEach(el => {
            this.initUploadZone(el, doc);
        });

        if (uploadZones.length > 0) {
            console.log(`[Admin] ${uploadZones.length} Upload-Zonen initialisiert`);
        }
    }

    updateElementStyle(property, value) {
        console.log('updateElementStyle called:', property, value, 'selectedElement:', this.selectedElement);
        if (this.selectedElement) {
            const el = this.selectedElement;
            const tagName = el.tagName.toLowerCase();

            // Konvertiere camelCase zu kebab-case für setProperty
            const cssProperty = property.replace(/([A-Z])/g, '-$1').toLowerCase();

            // Liste von Properties die mit !important gesetzt werden sollten
            const importantProps = ['width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
                                    'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
                                    'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
                                    'font-size', 'line-height', 'display'];

            // Prüfe ob das Element ein Button/Link ist oder ob es wichtige Properties sind
            const isButton = tagName === 'button' || (tagName === 'a' && el.classList.contains('btn'));
            const needsImportant = isButton || importantProps.includes(cssProperty);

            if (needsImportant && value && value !== 'auto' && value !== '') {
                el.style.setProperty(cssProperty, value, 'important');
                console.log(`Style ${cssProperty} set to ${value} with !important`);
            } else {
                el.style[property] = value;
                console.log(`Style ${property} set to ${value}`);
            }
        } else {
            this.showToast('warning', 'Kein Element', 'Bitte zuerst ein Element im Bearbeitungsmodus auswählen');
        }
    }

    updateElementClass(value) {
        if (this.selectedElement) {
            const adminClasses = 'admin-editable admin-selected';
            this.selectedElement.className = `${adminClasses} ${value}`;
        }
    }

    updateElementId(value) {
        if (this.selectedElement) {
            this.selectedElement.id = value;
        }
    }

    rgbToHex(rgb) {
        if (!rgb || rgb === 'transparent' || rgb === 'rgba(0, 0, 0, 0)') return '#ffffff';
        const match = rgb.match(/\d+/g);
        if (!match) return '#ffffff';
        const hex = match.slice(0, 3).map(x => {
            const h = parseInt(x).toString(16);
            return h.length === 1 ? '0' + h : h;
        }).join('');
        return '#' + hex;
    }

    // ============================================
    // BILD-VERWALTUNG
    // ============================================

    getImagePropertiesHTML(el, styles) {
        const tagName = el.tagName.toLowerCase();
        const isImg = tagName === 'img';
        const bgImage = styles.backgroundImage;
        const hasBgImage = bgImage && bgImage !== 'none';

        // Prüfe ob Element Bilder enthält
        const containedImages = el.querySelectorAll('img');
        const hasContainedImages = containedImages.length > 0;

        // Wenn kein Bild-Element und kein Hintergrundbild, zeige nur Upload-Option
        if (!isImg && !hasBgImage && !hasContainedImages) {
            return `
                <div class="prop-section">
                    <div class="prop-section-title">🖼️ Bild hinzufügen</div>
                    <button class="btn-secondary btn-sm" style="width: 100%; margin-bottom: 8px;"
                            onclick="adminPanel.openImageGallery('background')">
                        <i class="fas fa-image"></i> Hintergrundbild setzen
                    </button>
                    <button class="btn-secondary btn-sm" style="width: 100%;"
                            onclick="adminPanel.insertImageElement()">
                        <i class="fas fa-plus"></i> Bild-Element einfügen
                    </button>
                </div>
            `;
        }

        let html = `<div class="prop-section"><div class="prop-section-title">🖼️ Bild-Bearbeitung</div>`;

        // Wenn es ein IMG Element ist
        if (isImg) {
            const currentSrc = el.getAttribute('src') || '';
            const altText = el.getAttribute('alt') || '';
            html += `
                <div class="property-group">
                    <label>Aktuelles Bild</label>
                    <div style="background: var(--gray-100); border-radius: 6px; padding: 8px; margin-bottom: 8px;">
                        <img src="${currentSrc}" style="max-width: 100%; max-height: 80px; display: block; margin: 0 auto; border-radius: 4px;">
                    </div>
                </div>
                <div class="property-group">
                    <label>Bild-URL</label>
                    <input type="text" value="${currentSrc}"
                           onchange="adminPanel.updateImageSrc(this.value)"
                           style="pointer-events:auto!important;cursor:text!important; font-size: 11px;">
                </div>
                <div class="property-group">
                    <label>Alt-Text (SEO)</label>
                    <input type="text" value="${altText}"
                           onchange="adminPanel.updateImageAlt(this.value)"
                           placeholder="Beschreibung des Bildes"
                           style="pointer-events:auto!important;cursor:text!important;">
                </div>
                <button class="btn-primary btn-sm" style="width: 100%; margin-bottom: 8px;"
                        onclick="adminPanel.showDirectImageUpload()">
                    <i class="fas fa-upload"></i> Neues Bild hochladen
                </button>
                <button class="btn-secondary btn-sm" style="width: 100%; margin-bottom: 8px;"
                        onclick="adminPanel.openImageGallery('src')">
                    <i class="fas fa-images"></i> Aus Mediathek wählen
                </button>
                <button class="btn-warning btn-sm" style="width: 100%; margin-bottom: 8px; background:#ffc107; color:#000;"
                        onclick="adminPanel.removeImageFromElement()">
                    <i class="fas fa-trash"></i> Bild entfernen / Platzhalter setzen
                </button>
                <div class="property-group">
                    <label>Object Fit</label>
                    <select onchange="adminPanel.updateElementStyle('objectFit', this.value)">
                        <option value="fill" ${styles.objectFit === 'fill' ? 'selected' : ''}>Fill</option>
                        <option value="contain" ${styles.objectFit === 'contain' ? 'selected' : ''}>Contain</option>
                        <option value="cover" ${styles.objectFit === 'cover' ? 'selected' : ''}>Cover</option>
                        <option value="none" ${styles.objectFit === 'none' ? 'selected' : ''}>None</option>
                        <option value="scale-down" ${styles.objectFit === 'scale-down' ? 'selected' : ''}>Scale Down</option>
                    </select>
                </div>
                <div class="property-group">
                    <label>Object Position</label>
                    <input type="text" value="${el.style.objectPosition || 'center center'}"
                           placeholder="center center / top left / 50% 20%"
                           onchange="adminPanel.updateElementStyle('objectPosition', this.value)"
                           style="pointer-events:auto!important;cursor:text!important;">
                </div>
            `;
        }

        // Wenn es ein Hintergrundbild hat
        if (hasBgImage) {
            const bgUrl = bgImage.replace(/^url\(['"]?/, '').replace(/['"]?\)$/, '');
            html += `
                <div class="property-group">
                    <label>Hintergrundbild</label>
                    <div style="background: var(--gray-100); border-radius: 6px; padding: 8px; margin-bottom: 8px;">
                        <div style="width: 100%; height: 60px; background-image: ${bgImage}; background-size: cover; background-position: center; border-radius: 4px;"></div>
                    </div>
                </div>
                <div class="property-group">
                    <label>Bild-URL</label>
                    <input type="text" value="${bgUrl}"
                           onchange="adminPanel.updateBackgroundImage(this.value)"
                           style="pointer-events:auto!important;cursor:text!important; font-size: 11px;">
                </div>
                <button class="btn-primary btn-sm" style="width: 100%; margin-bottom: 8px;"
                        onclick="adminPanel.showDirectImageUpload()">
                    <i class="fas fa-upload"></i> Neues Bild hochladen
                </button>
                <button class="btn-secondary btn-sm" style="width: 100%; margin-bottom: 8px;"
                        onclick="adminPanel.openImageGallery('background')">
                    <i class="fas fa-images"></i> Aus Mediathek wählen
                </button>
                <button class="btn-secondary btn-sm" style="width: 100%; margin-bottom: 8px;"
                        onclick="adminPanel.removeBackgroundImage()">
                    <i class="fas fa-trash"></i> Hintergrundbild entfernen
                </button>
                <div class="property-group">
                    <label>Background Size</label>
                    <select onchange="adminPanel.updateElementStyle('backgroundSize', this.value)">
                        <option value="auto" ${styles.backgroundSize === 'auto' ? 'selected' : ''}>Auto</option>
                        <option value="cover" ${styles.backgroundSize === 'cover' ? 'selected' : ''}>Cover</option>
                        <option value="contain" ${styles.backgroundSize === 'contain' ? 'selected' : ''}>Contain</option>
                        <option value="100% 100%" ${styles.backgroundSize === '100% 100%' ? 'selected' : ''}>Stretch</option>
                    </select>
                </div>
                <div class="property-group">
                    <label>Background Position</label>
                    <input type="text" value="${el.style.backgroundPosition || 'center center'}"
                           placeholder="center center / top left"
                           onchange="adminPanel.updateElementStyle('backgroundPosition', this.value)"
                           style="pointer-events:auto!important;cursor:text!important;">
                </div>
                <div class="property-group">
                    <label>Background Repeat</label>
                    <select onchange="adminPanel.updateElementStyle('backgroundRepeat', this.value)">
                        <option value="no-repeat" ${styles.backgroundRepeat === 'no-repeat' ? 'selected' : ''}>No Repeat</option>
                        <option value="repeat" ${styles.backgroundRepeat === 'repeat' ? 'selected' : ''}>Repeat</option>
                        <option value="repeat-x" ${styles.backgroundRepeat === 'repeat-x' ? 'selected' : ''}>Repeat X</option>
                        <option value="repeat-y" ${styles.backgroundRepeat === 'repeat-y' ? 'selected' : ''}>Repeat Y</option>
                    </select>
                </div>
            `;
        }

        // Wenn Container Bilder enthält
        if (hasContainedImages && !isImg) {
            html += `
                <div class="property-group" style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--gray-200);">
                    <label>Enthaltene Bilder (${containedImages.length})</label>
                    <div style="max-height: 150px; overflow-y: auto; background: var(--gray-100); border-radius: 6px; padding: 8px;">
                        ${Array.from(containedImages).map((img, i) => `
                            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px; padding: 4px; background: white; border-radius: 4px;">
                                <img src="${img.src}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px;">
                                <span style="flex: 1; font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${img.alt || 'Bild ' + (i+1)}</span>
                                <button class="btn-secondary btn-sm" style="padding: 2px 6px; font-size: 10px;"
                                        onclick="adminPanel.selectContainedImage(${i})">
                                    <i class="fas fa-edit"></i>
                                </button>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        html += `</div>`;
        return html;
    }

    updateImageSrc(newSrc) {
        if (!this.selectedElement || this.selectedElement.tagName.toLowerCase() !== 'img') return;
        this.selectedElement.src = newSrc;
        this.showToast('success', 'Bild aktualisiert', 'Bildquelle wurde geändert');
        this.showElementProperties(this.selectedElement);
    }

    updateImageAlt(newAlt) {
        if (!this.selectedElement || this.selectedElement.tagName.toLowerCase() !== 'img') return;
        this.selectedElement.alt = newAlt;
        this.showToast('success', 'Alt-Text aktualisiert', 'SEO-Text wurde geändert');
    }

    updateBackgroundImage(url) {
        if (!this.selectedElement) return;
        this.selectedElement.style.backgroundImage = `url('${url}')`;
        this.showToast('success', 'Hintergrundbild aktualisiert', 'Bild wurde geändert');
        this.showElementProperties(this.selectedElement);
    }

    removeBackgroundImage() {
        if (!this.selectedElement) return;
        this.selectedElement.style.backgroundImage = 'none';
        this.selectedElement.style.background = '';
        this.showToast('success', 'Entfernt', 'Hintergrundbild wurde entfernt');
        this.showElementProperties(this.selectedElement);
    }

    removeImageFromElement() {
        if (!this.selectedElement) return;

        const el = this.selectedElement;
        const tagName = el.tagName.toLowerCase();

        if (tagName === 'img') {
            // Zeige Dialog für Bild-Entfernung
            const modal = document.createElement('div');
            modal.id = 'removeImageModal';
            modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:10001; display:flex; align-items:center; justify-content:center;';
            modal.innerHTML = `
                <div style="background:white; border-radius:12px; padding:24px; max-width:400px; box-shadow: 0 25px 50px rgba(0,0,0,0.3);">
                    <h3 style="margin:0 0 16px 0; color:var(--navy-dark);">
                        <i class="fas fa-image" style="color:var(--gold); margin-right:8px;"></i>
                        Bild entfernen
                    </h3>
                    <p style="color:var(--gray-600); margin-bottom:20px; font-size:14px;">
                        Was möchtest du mit diesem Bild tun?
                    </p>
                    <div style="display:flex; flex-direction:column; gap:10px;">
                        <button class="btn-secondary" style="width:100%; padding:12px;" onclick="adminPanel.setPlaceholderImage()">
                            <i class="fas fa-user-circle"></i> Platzhalter-Avatar setzen
                        </button>
                        <button class="btn-secondary" style="width:100%; padding:12px;" onclick="adminPanel.setEmptyImage()">
                            <i class="fas fa-square"></i> Leeres/Transparentes Bild
                        </button>
                        <button class="btn-warning" style="width:100%; padding:12px; background:#dc3545; color:white;" onclick="adminPanel.deleteImageElement()">
                            <i class="fas fa-trash"></i> Element komplett löschen
                        </button>
                        <button class="btn-secondary" style="width:100%; padding:12px; margin-top:8px;" onclick="document.getElementById('removeImageModal').remove()">
                            Abbrechen
                        </button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        } else {
            // Für andere Elemente, entferne Hintergrundbild
            this.removeBackgroundImage();
        }
    }

    setPlaceholderImage() {
        if (!this.selectedElement) return;

        const el = this.selectedElement;

        // Generiere einen Platzhalter-Avatar als Data-URL
        const canvas = document.createElement('canvas');
        canvas.width = 200;
        canvas.height = 200;
        const ctx = canvas.getContext('2d');

        // Hintergrund
        ctx.fillStyle = '#e0e0e0';
        ctx.fillRect(0, 0, 200, 200);

        // Person-Icon
        ctx.fillStyle = '#a0a0a0';
        // Kopf
        ctx.beginPath();
        ctx.arc(100, 70, 40, 0, Math.PI * 2);
        ctx.fill();
        // Körper
        ctx.beginPath();
        ctx.ellipse(100, 180, 60, 50, 0, Math.PI, 0);
        ctx.fill();

        el.src = canvas.toDataURL('image/png');
        el.alt = 'Platzhalter';

        document.getElementById('removeImageModal')?.remove();
        this.showToast('success', 'Platzhalter', 'Platzhalter-Avatar wurde gesetzt');
        this.showElementProperties(el);
    }

    setEmptyImage() {
        if (!this.selectedElement) return;

        const el = this.selectedElement;

        // Transparentes 1x1 Pixel Bild
        el.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        el.alt = '';

        document.getElementById('removeImageModal')?.remove();
        this.showToast('success', 'Geleert', 'Bild wurde durch leeres Bild ersetzt');
        this.showElementProperties(el);
    }

    deleteImageElement() {
        if (!this.selectedElement) return;

        const el = this.selectedElement;
        const parent = el.parentElement;

        // Entferne das Element
        el.remove();

        document.getElementById('removeImageModal')?.remove();
        this.selectedElement = null;
        this.showToast('success', 'Gelöscht', 'Bild-Element wurde entfernt');

        // Wähle Parent-Element aus
        if (parent) {
            const iframe = document.getElementById('websitePreview');
            this.selectElement(parent, iframe.contentDocument);
        }
    }

    selectContainedImage(index) {
        if (!this.selectedElement) return;
        const images = this.selectedElement.querySelectorAll('img');
        if (images[index]) {
            const iframe = document.getElementById('websitePreview');
            this.selectElement(images[index], iframe.contentDocument);
        }
    }

    insertImageElement() {
        if (!this.selectedElement) return;
        const iframe = document.getElementById('websitePreview');
        const doc = iframe.contentDocument;

        const img = doc.createElement('img');
        img.src = '/uploads/placeholder.png';
        img.alt = 'Neues Bild';
        img.style.maxWidth = '100%';
        img.style.height = 'auto';

        this.selectedElement.appendChild(img);
        this.showToast('success', 'Bild eingefügt', 'Klicke auf das Bild um es zu bearbeiten');

        // Wähle das neue Bild aus
        setTimeout(() => this.selectElement(img, doc), 100);
    }

    // Bildgalerie öffnen
    async openImageGallery(mode = 'src') {
        this.imageSelectMode = mode; // 'src' für img src, 'background' für background-image

        // Modal erstellen
        const modal = document.createElement('div');
        modal.id = 'imageGalleryModal';
        modal.className = 'modal-overlay';
        modal.style.cssText = 'display:flex; position:fixed; inset:0; background:rgba(0,0,0,0.8); z-index:10000; align-items:center; justify-content:center;';

        modal.innerHTML = `
            <div class="modal-content" style="background: var(--white); border-radius: 12px; width: 90%; max-width: 900px; max-height: 85vh; overflow: hidden; display: flex; flex-direction: column;">
                <div class="modal-header" style="padding: 16px 20px; border-bottom: 1px solid var(--gray-200); display: flex; justify-content: space-between; align-items: center;">
                    <h3 style="margin: 0; color: var(--navy-dark);">
                        <i class="fas fa-images" style="color: var(--gold); margin-right: 8px;"></i>
                        Mediathek
                    </h3>
                    <button onclick="adminPanel.closeImageGallery()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: var(--gray-500);">&times;</button>
                </div>

                <div style="padding: 16px 20px; border-bottom: 1px solid var(--gray-200); display: flex; gap: 12px; align-items: center;">
                    <label class="btn-primary" style="cursor: pointer; display: inline-flex; align-items: center; gap: 8px; padding: 10px 16px;">
                        <i class="fas fa-upload"></i> Bild hochladen
                        <input type="file" id="imageUploadInput" accept="image/*" multiple style="display: none;" onchange="adminPanel.handleImageUpload(event)">
                    </label>
                    <input type="text" id="imageUrlInput" placeholder="Oder Bild-URL eingeben..."
                           style="flex: 1; padding: 10px 14px; border: 1px solid var(--gray-300); border-radius: 6px;">
                    <button class="btn-secondary" onclick="adminPanel.useImageUrl()">
                        <i class="fas fa-link"></i> URL verwenden
                    </button>
                </div>

                <div id="imageGalleryGrid" style="flex: 1; overflow-y: auto; padding: 20px; display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 16px;">
                    <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--gray-500);">
                        <i class="fas fa-spinner fa-spin" style="font-size: 32px; margin-bottom: 12px; display: block;"></i>
                        Lade Bilder...
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Bilder laden
        await this.loadGalleryImages();
    }

    closeImageGallery() {
        const modal = document.getElementById('imageGalleryModal');
        if (modal) modal.remove();
    }

    async loadGalleryImages() {
        const grid = document.getElementById('imageGalleryGrid');
        if (!grid) return;

        try {
            const response = await fetch('/api/images');
            const data = await response.json();

            if (!data.images || data.images.length === 0) {
                grid.innerHTML = `
                    <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; color: var(--gray-500);">
                        <i class="fas fa-image" style="font-size: 48px; margin-bottom: 16px; display: block; opacity: 0.5;"></i>
                        <p style="margin: 0 0 8px 0; font-size: 16px;">Noch keine Bilder hochgeladen</p>
                        <p style="margin: 0; font-size: 13px;">Lade Bilder hoch oder gib eine URL ein</p>
                    </div>
                `;
                return;
            }

            grid.innerHTML = data.images.map(img => `
                <div class="gallery-item" onclick="adminPanel.selectGalleryImage('${img.url}')"
                     style="position: relative; aspect-ratio: 1; border-radius: 8px; overflow: hidden; cursor: pointer; border: 2px solid transparent; transition: all 0.2s;">
                    <img src="${img.url}" style="width: 100%; height: 100%; object-fit: cover;">
                    <div style="position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 50%); opacity: 0; transition: opacity 0.2s;"></div>
                    <div style="position: absolute; bottom: 8px; left: 8px; right: 8px; color: white; font-size: 11px; opacity: 0; transition: opacity 0.2s; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        ${img.filename}
                    </div>
                    <button onclick="event.stopPropagation(); adminPanel.deleteGalleryImage('${img.filename}')"
                            style="position: absolute; top: 8px; right: 8px; background: rgba(220,53,69,0.9); color: white; border: none; width: 24px; height: 24px; border-radius: 4px; cursor: pointer; opacity: 0; transition: opacity 0.2s;">
                        <i class="fas fa-trash" style="font-size: 10px;"></i>
                    </button>
                </div>
            `).join('');

            // Hover-Effekte
            grid.querySelectorAll('.gallery-item').forEach(item => {
                item.addEventListener('mouseenter', () => {
                    item.style.borderColor = 'var(--gold)';
                    item.querySelectorAll('div, button').forEach(el => el.style.opacity = '1');
                });
                item.addEventListener('mouseleave', () => {
                    item.style.borderColor = 'transparent';
                    item.querySelectorAll('div, button').forEach(el => el.style.opacity = '0');
                });
            });

        } catch (error) {
            console.error('Fehler beim Laden der Bilder:', error);
            grid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--red);">
                    <i class="fas fa-exclamation-triangle" style="font-size: 32px; margin-bottom: 12px; display: block;"></i>
                    Fehler beim Laden der Bilder
                </div>
            `;
        }
    }

    async handleImageUpload(event) {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        this.showToast('info', 'Hochladen...', `${files.length} Bild(er) werden hochgeladen`);

        for (const file of files) {
            const formData = new FormData();
            formData.append('image', file);

            try {
                const response = await fetch('/api/upload-image', {
                    method: 'POST',
                    body: formData
                });

                const result = await response.json();

                if (result.success) {
                    console.log('Bild hochgeladen:', result);
                } else {
                    this.showToast('error', 'Fehler', `Upload fehlgeschlagen: ${result.error}`);
                }
            } catch (error) {
                console.error('Upload error:', error);
                this.showToast('error', 'Fehler', 'Upload fehlgeschlagen');
            }
        }

        this.showToast('success', 'Hochgeladen', `${files.length} Bild(er) erfolgreich hochgeladen`);
        await this.loadGalleryImages();

        // Input zurücksetzen
        event.target.value = '';
    }

    selectGalleryImage(url) {
        if (!this.selectedElement) {
            this.showToast('warning', 'Kein Element', 'Bitte zuerst ein Element auswählen');
            return;
        }

        if (this.imageSelectMode === 'src') {
            if (this.selectedElement.tagName.toLowerCase() === 'img') {
                this.selectedElement.src = url;
                this.showToast('success', 'Bild gesetzt', 'Bildquelle wurde aktualisiert');
            } else {
                this.showToast('warning', 'Falsches Element', 'Bitte ein IMG-Element auswählen');
            }
        } else if (this.imageSelectMode === 'background') {
            this.selectedElement.style.backgroundImage = `url('${url}')`;
            this.selectedElement.style.backgroundSize = 'cover';
            this.selectedElement.style.backgroundPosition = 'center';
            this.showToast('success', 'Hintergrundbild gesetzt', 'Hintergrund wurde aktualisiert');
        }

        this.closeImageGallery();
        this.showElementProperties(this.selectedElement);
    }

    useImageUrl() {
        const input = document.getElementById('imageUrlInput');
        if (!input || !input.value.trim()) {
            this.showToast('warning', 'Keine URL', 'Bitte eine Bild-URL eingeben');
            return;
        }

        this.selectGalleryImage(input.value.trim());
    }

    async deleteGalleryImage(filename) {
        if (!confirm(`Bild "${filename}" wirklich löschen?`)) return;

        try {
            const response = await fetch(`/api/images/${filename}`, {
                method: 'DELETE'
            });

            const result = await response.json();

            if (result.success) {
                this.showToast('success', 'Gelöscht', 'Bild wurde gelöscht');
                await this.loadGalleryImages();
            } else {
                this.showToast('error', 'Fehler', 'Löschen fehlgeschlagen');
            }
        } catch (error) {
            console.error('Delete error:', error);
            this.showToast('error', 'Fehler', 'Löschen fehlgeschlagen');
        }
    }

    // Bilder im iframe markieren
    highlightImagesInIframe() {
        const iframe = document.getElementById('websitePreview');
        if (!iframe || !iframe.contentDocument) return;

        const doc = iframe.contentDocument;

        // Alle IMG-Elemente finden (mit src)
        const allImages = doc.querySelectorAll('img');
        const images = Array.from(allImages).filter(img => {
            if (!img.src || img.src === 'about:blank') return false;
            if (img.classList.contains('admin-')) return false;
            return true;
        });

        // Alle Elemente mit ECHTEN Hintergrundbildern finden (keine SVG-Patterns, keine Gradients)
        const allElements = doc.querySelectorAll('*');
        const bgImageElements = [];

        allElements.forEach(el => {
            // Überspringe Admin-Elemente
            if (el.classList && el.classList.contains('admin-overlay')) return;
            if (el.id && el.id.startsWith('admin-')) return;

            const style = iframe.contentWindow.getComputedStyle(el);
            const bgImage = style.backgroundImage;

            // Nur echte Bilder - keine Gradients, keine Data-URLs (SVG-Patterns)
            if (bgImage && bgImage !== 'none' &&
                !bgImage.includes('gradient') &&
                !bgImage.includes('data:image/svg')) {

                // Extrahiere die URL
                const bgUrl = bgImage.replace(/^url\(['"]?/, '').replace(/['"]?\)$/, '');

                // Nur wenn es wie eine Bild-URL aussieht
                if (bgUrl.match(/\.(jpg|jpeg|png|gif|webp|bmp)(\?|$)/i) ||
                    bgUrl.startsWith('/uploads/') ||
                    (bgUrl.startsWith('http') && !bgUrl.includes('data:'))) {
                    bgImageElements.push(el);
                }
            }
        });

        console.log(`Gefunden: ${images.length} IMG-Tags, ${bgImageElements.length} echte Hintergrundbilder`);

        // Markierungs-Style hinzufügen
        let styleTag = doc.getElementById('admin-image-highlight-styles');
        if (!styleTag) {
            styleTag = doc.createElement('style');
            styleTag.id = 'admin-image-highlight-styles';
            styleTag.textContent = `
                .admin-image-highlight {
                    outline: 3px dashed #c9a227 !important;
                    outline-offset: 2px !important;
                    position: relative !important;
                }
                .admin-image-highlight::after {
                    content: '🖼️' !important;
                    position: absolute !important;
                    top: 4px !important;
                    right: 4px !important;
                    background: #c9a227 !important;
                    color: #0a1628 !important;
                    padding: 2px 6px !important;
                    border-radius: 4px !important;
                    font-size: 12px !important;
                    z-index: 9999 !important;
                    pointer-events: none !important;
                }
            `;
            doc.head.appendChild(styleTag);
        }

        // Bestehende Markierungen entfernen
        doc.querySelectorAll('.admin-image-highlight').forEach(el => {
            el.classList.remove('admin-image-highlight');
        });

        // Neue Markierungen setzen
        images.forEach(img => img.classList.add('admin-image-highlight'));
        bgImageElements.forEach(el => el.classList.add('admin-image-highlight'));

        this.showToast('info', 'Bilder markiert', `${images.length} Bilder + ${bgImageElements.length} Hintergrundbilder gefunden`);
    }

    removeDragHandlesFromIframe() {
        const iframe = document.getElementById('websitePreview');
        if (!iframe || !iframe.contentDocument) return;

        const doc = iframe.contentDocument;
        const win = iframe.contentWindow;

        // WICHTIG: Hover-Trigger-System wieder aktivieren beim Verlassen des Drag-Mode
        doc.body.classList.remove('admin-edit-mode');
        if (win && win.hoverTriggerSystem) {
            win.hoverTriggerSystem.setEnabled(true);
            console.log('Hover-Trigger aktiviert (Drag-Mode beendet)');
        }

        // Entferne alle Editor-Elemente
        doc.querySelectorAll('.admin-element-toolbar').forEach(t => t.remove());
        doc.querySelectorAll('.admin-resize-handle').forEach(h => h.remove());
        doc.querySelectorAll('.admin-drop-indicator').forEach(i => i.remove());

        // Entferne Editor-Klassen und Events
        doc.querySelectorAll('.admin-editable').forEach(el => {
            el.classList.remove('admin-editable', 'admin-selected', 'admin-dragging', 'admin-text-editing', 'admin-multi-selected');
            el.removeAttribute('draggable');
            el.contentEditable = 'false';
        });

        // Entferne auch Multi-Selection Markierungen
        doc.querySelectorAll('.admin-multi-selected').forEach(el => {
            el.classList.remove('admin-multi-selected');
        });

        // Entferne Editor-Styles
        const style = doc.getElementById('adminEditorStyles');
        if (style) style.remove();

        this.selectedElement = null;
        this.draggedElement = null;
        this.multiSelectedElements = null;
        this.isMultiSelectMode = false;
    }

    // ============================================
    // WEBSITE SPEICHERN (Visual Builder Änderungen)
    // ============================================
    async saveWebsiteChanges() {
        const iframe = document.getElementById('websitePreview');
        if (!iframe || !iframe.contentDocument) {
            this.showToast('error', 'Fehler', 'Keine Website zum Speichern gefunden');
            return;
        }

        try {
            this.showToast('info', 'Speichern...', 'Website wird gespeichert');

            // Erstelle eine Kopie des Dokuments
            const doc = iframe.contentDocument;
            const clone = doc.documentElement.cloneNode(true);

            // Entferne alle Admin-spezifischen Elemente aus dem Clone
            clone.querySelectorAll('.admin-element-toolbar').forEach(el => el.remove());
            clone.querySelectorAll('.admin-resize-handle').forEach(el => el.remove());
            clone.querySelectorAll('.admin-drop-indicator').forEach(el => el.remove());
            clone.querySelectorAll('.admin-spacing-overlay').forEach(el => el.remove());
            clone.querySelectorAll('.admin-position-info').forEach(el => el.remove());
            clone.querySelectorAll('#adminEditorStyles').forEach(el => el.remove());

            // Entferne Admin-Klassen von allen Elementen
            clone.querySelectorAll('[class*="admin-"]').forEach(el => {
                // Handle SVG elements which have className as SVGAnimatedString
                const currentClass = typeof el.className === 'string' ? el.className : (el.className?.baseVal || '');
                const classes = currentClass.split(' ').filter(c => !c.startsWith('admin-'));
                const newClass = classes.join(' ').trim();
                if (typeof el.className === 'string') {
                    el.className = newClass;
                } else if (el.className?.baseVal !== undefined) {
                    el.className.baseVal = newClass;
                }
                if (!newClass) el.removeAttribute('class');
            });

            // Entferne admin-edit-mode Klasse vom body
            const bodyEl = clone.querySelector('body');
            if (bodyEl) {
                bodyEl.classList.remove('admin-edit-mode');
            }

            // Entferne temporäre Attribute
            clone.querySelectorAll('[draggable]').forEach(el => el.removeAttribute('draggable'));
            clone.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));
            clone.querySelectorAll('[data-original-text]').forEach(el => el.removeAttribute('data-original-text'));

            // Erstelle HTML String
            const htmlContent = '<!DOCTYPE html>\n' + clone.outerHTML;

            // Speichere über API
            const response = await fetch('/api/save-file', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: 'index.html',
                    content: htmlContent
                })
            });

            const result = await response.json();

            if (result.success) {
                this.showToast('success', 'Gespeichert!', 'Website-Änderungen wurden übernommen');
                console.log('Website saved successfully:', result.path);
            } else {
                throw new Error(result.error || 'Speichern fehlgeschlagen');
            }

        } catch (error) {
            console.error('Error saving website:', error);
            this.showToast('error', 'Fehler', 'Konnte nicht speichern: ' + error.message);
        }
    }

    updateSectionOrderFromDOM() {
        const iframe = document.getElementById('websitePreview');
        if (!iframe || !iframe.contentDocument) return;

        const doc = iframe.contentDocument;
        const sections = this.getWebsiteSections();

        // Sammle alle Sektionen mit ihrer Position
        const positioned = [];
        sections.forEach(section => {
            const el = doc.querySelector(section.selector);
            if (el) {
                positioned.push({ id: section.id, top: el.getBoundingClientRect().top });
            }
        });

        // Sortiere nach Y-Position
        positioned.sort((a, b) => a.top - b.top);
        this.sectionOrder = positioned.map(p => p.id);

        // Aktualisiere Seitenliste
        this.renderLiveBuilder();
    }

    renderDragOverlay() {
        const overlay = document.getElementById('sectionDragOverlay');
        const iframe = document.getElementById('websitePreview');
        if (!overlay || !iframe) return;

        // Warte bis iframe geladen ist
        if (!iframe.contentDocument || !iframe.contentDocument.body) {
            iframe.onload = () => this.renderDragOverlay();
            return;
        }

        const sections = this.getWebsiteSections();
        const iframeRect = iframe.getBoundingClientRect();
        const overlayRect = overlay.getBoundingClientRect();

        // Berechne Scale-Faktor
        const scale = this.previewZoom / 100;

        let html = '';

        sections.forEach((section, index) => {
            try {
                const el = iframe.contentDocument.querySelector(section.selector);
                if (el) {
                    const rect = el.getBoundingClientRect();
                    // Position relativ zum Overlay berechnen
                    const top = (rect.top * scale);
                    const height = (rect.height * scale);

                    const sectionIcons = {
                        'hero': 'fa-image', 'about': 'fa-info-circle', 'ceo': 'fa-quote-right',
                        'products': 'fa-box', 'partners': 'fa-handshake', 'services': 'fa-cogs',
                        'team': 'fa-users', 'locations': 'fa-map-marker-alt', 'projects': 'fa-briefcase',
                        'contact': 'fa-envelope', 'footer': 'fa-window-minimize', 'values': 'fa-heart',
                        'sustainability': 'fa-leaf', 'testimonials': 'fa-star'
                    };

                    html += `
                        <div class="drag-section-handle ${this.selectedSection === section.id ? 'selected' : ''}"
                             data-id="${section.id}"
                             data-index="${index}"
                             style="top: ${top}px; height: ${height}px;"
                             draggable="true">
                            <div class="section-handle-label">
                                <i class="fas ${sectionIcons[section.type] || 'fa-square'}"></i>
                                ${section.name}
                                <span class="drag-icon"><i class="fas fa-grip-vertical"></i></span>
                            </div>
                        </div>
                    `;
                }
            } catch (e) {
                console.log('Could not access section:', section.id);
            }
        });

        overlay.innerHTML = html;
        this.bindDragOverlayEvents();
    }

    bindDragOverlayEvents() {
        const overlay = document.getElementById('sectionDragOverlay');
        const handles = overlay.querySelectorAll('.drag-section-handle');

        handles.forEach(handle => {
            // Click to select
            handle.addEventListener('click', (e) => {
                if (!e.target.closest('.drag-icon')) {
                    this.selectSection(handle.dataset.id);
                    handles.forEach(h => h.classList.remove('selected'));
                    handle.classList.add('selected');
                }
            });

            // Drag start
            handle.addEventListener('dragstart', (e) => {
                this.draggedOverlaySection = {
                    id: handle.dataset.id,
                    index: parseInt(handle.dataset.index)
                };
                handle.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', handle.dataset.id);
            });

            // Drag end
            handle.addEventListener('dragend', () => {
                handle.classList.remove('dragging');
                handles.forEach(h => {
                    h.classList.remove('drag-over', 'drag-over-top', 'drag-over-bottom');
                });
            });

            // Drag over
            handle.addEventListener('dragover', (e) => {
                e.preventDefault();
                if (!this.draggedOverlaySection || this.draggedOverlaySection.id === handle.dataset.id) return;

                const rect = handle.getBoundingClientRect();
                const midY = rect.top + rect.height / 2;

                handles.forEach(h => h.classList.remove('drag-over-top', 'drag-over-bottom'));

                if (e.clientY < midY) {
                    handle.classList.add('drag-over-top');
                } else {
                    handle.classList.add('drag-over-bottom');
                }
            });

            // Drop
            handle.addEventListener('drop', (e) => {
                e.preventDefault();
                handles.forEach(h => h.classList.remove('drag-over-top', 'drag-over-bottom'));

                if (!this.draggedOverlaySection) return;

                const fromId = this.draggedOverlaySection.id;
                const toId = handle.dataset.id;
                const fromIndex = this.draggedOverlaySection.index;
                const toIndex = parseInt(handle.dataset.index);

                if (fromId !== toId) {
                    const rect = handle.getBoundingClientRect();
                    const insertBefore = e.clientY < rect.top + rect.height / 2;

                    this.reorderSectionsInIframe(fromId, toId, insertBefore);
                }

                this.draggedOverlaySection = null;
            });
        });

        // Update overlay on scroll
        const iframe = document.getElementById('websitePreview');
        if (iframe && iframe.contentWindow) {
            try {
                iframe.contentWindow.addEventListener('scroll', () => {
                    if (this.dragModeActive) {
                        this.renderDragOverlay();
                    }
                });
            } catch (e) {
                // Cross-origin restriction
            }
        }
    }

    reorderSectionsInIframe(fromId, toId, insertBefore) {
        const iframe = document.getElementById('websitePreview');
        if (!iframe || !iframe.contentDocument) return;

        try {
            const sections = this.getWebsiteSections();
            const fromSection = sections.find(s => s.id === fromId);
            const toSection = sections.find(s => s.id === toId);

            if (!fromSection || !toSection) return;

            const fromEl = iframe.contentDocument.querySelector(fromSection.selector);
            const toEl = iframe.contentDocument.querySelector(toSection.selector);

            if (fromEl && toEl) {
                const parent = fromEl.parentNode;

                if (insertBefore) {
                    parent.insertBefore(fromEl, toEl);
                } else {
                    parent.insertBefore(fromEl, toEl.nextSibling);
                }

                // Update section order in data
                this.updateSectionOrder(fromId, toId, insertBefore);

                // Re-render overlay
                setTimeout(() => this.renderDragOverlay(), 100);

                this.showToast('success', 'Erfolg', `"${fromSection.name}" wurde verschoben`);
            }
        } catch (e) {
            this.showToast('error', 'Fehler', 'Konnte Sektion nicht verschieben');
            console.error('Reorder error:', e);
        }
    }

    updateSectionOrder(fromId, toId, insertBefore) {
        // Speichere die neue Reihenfolge
        if (!this.sectionOrder) {
            this.sectionOrder = this.getWebsiteSections().map(s => s.id);
        }

        const fromIndex = this.sectionOrder.indexOf(fromId);
        const toIndex = this.sectionOrder.indexOf(toId);

        if (fromIndex > -1) {
            this.sectionOrder.splice(fromIndex, 1);
        }

        const newToIndex = this.sectionOrder.indexOf(toId);
        if (insertBefore) {
            this.sectionOrder.splice(newToIndex, 0, fromId);
        } else {
            this.sectionOrder.splice(newToIndex + 1, 0, fromId);
        }

        // Update the section list in sidebar
        this.renderLiveBuilder();
    }

    bindCanvasDragDrop() {
        const canvasContent = document.getElementById('canvasContent');
        if (!canvasContent) return;

        const sections = canvasContent.querySelectorAll('.canvas-section');
        const dropZone = document.getElementById('canvasDropZone');

        sections.forEach(section => {
            section.addEventListener('dragstart', (e) => {
                this.draggedSection = {
                    id: section.dataset.id,
                    index: parseInt(section.dataset.index),
                    isNew: false
                };
                section.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
            });

            section.addEventListener('dragend', () => {
                section.classList.remove('dragging');
                sections.forEach(s => s.classList.remove('drag-over-top', 'drag-over-bottom'));
            });

            section.addEventListener('dragover', (e) => {
                e.preventDefault();
                if (!this.draggedSection) return;

                const rect = section.getBoundingClientRect();
                const midY = rect.top + rect.height / 2;

                sections.forEach(s => s.classList.remove('drag-over-top', 'drag-over-bottom'));

                if (e.clientY < midY) {
                    section.classList.add('drag-over-top');
                } else {
                    section.classList.add('drag-over-bottom');
                }
            });

            section.addEventListener('drop', (e) => {
                e.preventDefault();
                sections.forEach(s => s.classList.remove('drag-over-top', 'drag-over-bottom'));

                if (!this.draggedSection) return;

                const rect = section.getBoundingClientRect();
                const midY = rect.top + rect.height / 2;
                const targetIndex = parseInt(section.dataset.index);
                const insertBefore = e.clientY < midY;

                if (this.draggedSection.isNew) {
                    // Add new section at position
                    this.addSectionAtIndex(this.draggedSection.type, insertBefore ? targetIndex : targetIndex + 1);
                } else {
                    // Move existing section
                    this.moveSectionToIndex(this.draggedSection.id, insertBefore ? targetIndex : targetIndex + 1);
                }

                this.draggedSection = null;
            });
        });

        // Drop zone for adding at the end
        if (dropZone) {
            dropZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                dropZone.classList.add('active');
            });

            dropZone.addEventListener('dragleave', () => {
                dropZone.classList.remove('active');
            });

            dropZone.addEventListener('drop', (e) => {
                e.preventDefault();
                dropZone.classList.remove('active');

                if (this.draggedSection && this.draggedSection.isNew) {
                    this.addSectionOfType(this.draggedSection.type);
                    this.renderVisualBuilder();
                }
            });
        }
    }

    addSectionAtIndex(type, index) {
        if (!window.SyncBridge) return;

        const structure = SyncBridge.getStructure();
        const newSection = {
            id: `section-${Date.now()}`,
            type: type,
            enabled: true,
            config: {}
        };

        structure.sections.splice(index, 0, newSection);
        SyncBridge.setStructure(structure);
        this.renderVisualBuilder();
        this.renderStructure();
        this.trackChange(`${type}-Sektion eingefügt`);
        this.showToast('success', 'Hinzugefügt', `${type} wurde hinzugefügt.`);
    }

    moveSectionToIndex(sectionId, newIndex) {
        if (!window.SyncBridge) return;

        const structure = SyncBridge.getStructure();
        const currentIndex = structure.sections.findIndex(s => s.id === sectionId);

        if (currentIndex === -1 || currentIndex === newIndex) return;

        const [section] = structure.sections.splice(currentIndex, 1);

        // Adjust index if we removed from before the target
        const adjustedIndex = currentIndex < newIndex ? newIndex - 1 : newIndex;
        structure.sections.splice(adjustedIndex, 0, section);

        SyncBridge.setStructure(structure);
        this.renderVisualBuilder();
        this.renderStructure();
        this.renderStructurePreview();
        this.trackChange('Sektion verschoben');
    }

    resetLayout() {
        if (!confirm('Layout wirklich zurücksetzen? Alle Änderungen gehen verloren.')) return;

        if (window.SyncBridge) {
            const defaultStructure = {
                sections: [
                    { id: 'section-hero', type: 'hero', enabled: true, config: {} },
                    { id: 'section-about', type: 'about', enabled: true, config: {} },
                    { id: 'section-ceo', type: 'ceo-message', enabled: true, config: {} },
                    { id: 'section-products', type: 'products', enabled: true, config: {} },
                    { id: 'section-team', type: 'team', enabled: true, config: {} },
                    { id: 'section-locations', type: 'locations', enabled: true, config: {} },
                    { id: 'section-contact', type: 'contact', enabled: true, config: {} },
                    { id: 'section-footer', type: 'footer', enabled: true, config: {} }
                ]
            };
            SyncBridge.setStructure(defaultStructure);
            this.renderVisualBuilder();
            this.renderStructure();
            this.trackChange('Layout zurückgesetzt');
            this.showToast('success', 'Zurückgesetzt', 'Layout wurde zurückgesetzt.');
        }
    }

    // ============================================
    // MEDIATHEK (Hauptsektion)
    // ============================================

    initMediathek() {
        // Initialize media data stores
        this._videos = [];
        this._logos = { partners: [], certifications: [], flags: [] };
        this._documents = [];
        this._embeddedVideos = [];

        // Setup image upload zone
        this.setupUploadZone('mediathekUploadZone', 'mediathekUpload', 'images');

        // Setup video upload zone
        this.setupUploadZone('videoUploadZone', 'videoUpload', 'videos');

        // Setup logo upload zone
        this.setupUploadZone('logoUploadZone', 'logoUpload', 'logos');

        // Setup document upload zone
        this.setupUploadZone('docUploadZone', 'docUpload', 'documents');

        // Bind media type tabs
        this.bindMediathekTabs();

        // Initial load
        this.loadMediathekImages();
        this.loadAllMediaTypes();
    }

    setupUploadZone(zoneId, inputId, mediaType) {
        const uploadZone = document.getElementById(zoneId);
        const uploadInput = document.getElementById(inputId);

        if (!uploadZone || !uploadInput) return;

        // Drag & Drop Events
        uploadZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadZone.classList.add('drag-over');
        });

        uploadZone.addEventListener('dragleave', () => {
            uploadZone.classList.remove('drag-over');
        });

        uploadZone.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadZone.classList.remove('drag-over');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.uploadMediaFiles(files, mediaType);
            }
        });

        // Click to upload - prevent default click handling
        uploadZone.addEventListener('click', (e) => {
            // Don't trigger upload when clicking on form elements
            const ignoredTags = ['BUTTON', 'INPUT', 'SELECT', 'OPTION', 'LABEL'];
            if (!ignoredTags.includes(e.target.tagName) && !e.target.closest('select') && !e.target.closest('.upload-folder-select')) {
                uploadInput.click();
            }
        });

        uploadInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.uploadMediaFiles(e.target.files, mediaType);
            }
        });
    }

    bindMediathekTabs() {
        const tabs = document.querySelectorAll('.mediathek-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const mediaType = tab.dataset.mediaType;

                // Update active tab
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                // Show corresponding content
                document.querySelectorAll('.mediathek-tab-content').forEach(content => {
                    content.classList.remove('active');
                });
                const targetContent = document.getElementById(`media-tab-${mediaType}`);
                if (targetContent) {
                    targetContent.classList.add('active');
                }
            });
        });
    }

    async loadAllMediaTypes() {
        await Promise.all([
            this.loadVideos(),
            this.loadLogos(),
            this.loadDocuments(),
            this.loadEmbeddedVideos()
        ]);
        this.updateMediathekCounts();
    }

    async uploadMediaFiles(files, mediaType) {
        if (mediaType === 'images') {
            return this.uploadMediathekFiles(files);
        }

        const maxSizes = {
            videos: 100 * 1024 * 1024,    // 100MB
            logos: 10 * 1024 * 1024,      // 10MB
            documents: 25 * 1024 * 1024   // 25MB
        };

        const allowedTypes = {
            videos: ['video/mp4', 'video/webm', 'video/quicktime'],
            logos: ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'],
            documents: [
                'application/pdf',
                'application/msword',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'application/vnd.ms-excel',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'application/vnd.ms-powerpoint',
                'application/vnd.openxmlformats-officedocument.presentationml.presentation'
            ]
        };

        for (const file of files) {
            // Check file size
            if (file.size > maxSizes[mediaType]) {
                this.showToast('error', 'Datei zu gross', `${file.name} ist zu gross. Max: ${Math.round(maxSizes[mediaType] / 1024 / 1024)}MB`);
                continue;
            }

            // Check file type
            const allowed = allowedTypes[mediaType];
            if (allowed && !allowed.includes(file.type)) {
                this.showToast('error', 'Falscher Dateityp', `${file.name} hat einen nicht erlaubten Dateityp.`);
                continue;
            }

            const formData = new FormData();
            formData.append('file', file);
            formData.append('media_type', mediaType);
            formData.append('website_id', 'ws_iustus');

            try {
                const response = await fetch('/api/upload/media', {
                    method: 'POST',
                    body: formData
                });

                if (response.ok) {
                    this.showToast('success', 'Hochgeladen', `${file.name} wurde erfolgreich hochgeladen.`);
                } else {
                    throw new Error('Upload fehlgeschlagen');
                }
            } catch (error) {
                this.showToast('error', 'Fehler', `Fehler beim Hochladen von ${file.name}`);
            }
        }

        // Reload the appropriate section
        if (mediaType === 'videos') await this.loadVideos();
        else if (mediaType === 'logos') await this.loadLogos();
        else if (mediaType === 'documents') await this.loadDocuments();

        this.updateMediathekCounts();
    }

    // ============================================
    // VIDEOS
    // ============================================

    async loadVideos() {
        const grid = document.getElementById('videosGrid');
        if (!grid) return;

        try {
            const response = await fetch('/api/media/videos');
            if (response.ok) {
                const data = await response.json();
                this._videos = data.videos || [];
            } else {
                this._videos = [];
            }
        } catch (e) {
            this._videos = [];
        }

        this.renderVideos();
    }

    renderVideos() {
        const grid = document.getElementById('videosGrid');
        if (!grid) return;

        if (this._videos.length === 0) {
            grid.innerHTML = `
                <div class="mediathek-empty">
                    <i class="fas fa-video"></i>
                    <h3>Keine Videos vorhanden</h3>
                    <p>Lade dein erstes Video hoch!</p>
                </div>
            `;
            return;
        }

        grid.innerHTML = this._videos.map(video => `
            <div class="video-item" data-id="${video.id}">
                <div class="video-thumbnail">
                    <video src="${video.url}" preload="metadata"></video>
                    <div class="video-play-btn" onclick="adminPanel.playVideo('${video.url}')">
                        <i class="fas fa-play"></i>
                    </div>
                    ${video.duration ? `<span class="video-duration">${this.formatDuration(video.duration)}</span>` : ''}
                </div>
                <div class="video-info">
                    <div class="video-title">${video.original_name || video.filename}</div>
                    <div class="video-meta">
                        <span><i class="fas fa-file"></i> ${this.formatFileSize(video.size)}</span>
                        <span><i class="fas fa-calendar"></i> ${this.formatDate(video.uploaded)}</span>
                    </div>
                </div>
                <div class="video-actions">
                    <button class="btn-primary" onclick="adminPanel.copyVideoUrl('${video.url}')" style="background:var(--gray-100);color:var(--navy-dark);">
                        <i class="fas fa-link"></i> URL kopieren
                    </button>
                    <button class="btn-delete" onclick="adminPanel.deleteVideo('${video.id}')" style="background:#dc3545;color:white;">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');
    }

    playVideo(url) {
        // Open video in a modal or new tab
        window.open(url, '_blank');
    }

    copyVideoUrl(url) {
        const fullUrl = `${window.location.origin}${url}`;
        navigator.clipboard.writeText(fullUrl);
        this.showToast('success', 'Kopiert', 'Video-URL wurde kopiert.');
    }

    async deleteVideo(id) {
        if (!confirm('Video wirklich loeschen?')) return;

        try {
            const response = await fetch(`/api/media/videos/${id}`, { method: 'DELETE' });
            if (response.ok) {
                this.showToast('success', 'Geloescht', 'Video wurde geloescht.');
                await this.loadVideos();
                this.updateMediathekCounts();
            }
        } catch (e) {
            this.showToast('error', 'Fehler', 'Video konnte nicht geloescht werden.');
        }
    }

    // Embedded Videos (YouTube, Vimeo)
    async loadEmbeddedVideos() {
        try {
            const response = await fetch('/api/media/embedded-videos');
            if (response.ok) {
                const data = await response.json();
                this._embeddedVideos = data.videos || [];
            }
        } catch (e) {
            this._embeddedVideos = [];
        }
        this.renderEmbeddedVideos();
    }

    renderEmbeddedVideos() {
        const list = document.getElementById('embeddedVideosList');
        if (!list) return;

        if (this._embeddedVideos.length === 0) {
            list.innerHTML = '<p style="color:var(--gray-500);font-size:13px;text-align:center;padding:20px;">Keine eingebetteten Videos vorhanden.</p>';
            return;
        }

        list.innerHTML = this._embeddedVideos.map(video => `
            <div class="embedded-video-item" data-id="${video.id}">
                <div class="video-platform ${video.platform}">
                    <i class="fab fa-${video.platform}"></i>
                </div>
                <div class="video-details">
                    <h4>${video.title || 'Video'}</h4>
                    <span>${video.url}</span>
                </div>
                <button class="btn-delete" onclick="adminPanel.deleteEmbeddedVideo('${video.id}')" style="background:#dc3545;color:white;border:none;padding:8px 12px;border-radius:6px;cursor:pointer;">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `).join('');
    }

    async addVideoEmbed() {
        const urlInput = document.getElementById('videoEmbedUrl');
        const url = urlInput?.value?.trim();

        if (!url) {
            this.showToast('error', 'Fehler', 'Bitte eine Video-URL eingeben.');
            return;
        }

        // Detect platform
        let platform = 'unknown';
        let videoId = '';

        if (url.includes('youtube.com') || url.includes('youtu.be')) {
            platform = 'youtube';
            const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
            if (match) videoId = match[1];
        } else if (url.includes('vimeo.com')) {
            platform = 'vimeo';
            const match = url.match(/vimeo\.com\/(\d+)/);
            if (match) videoId = match[1];
        }

        if (platform === 'unknown') {
            this.showToast('error', 'Nicht unterstuetzt', 'Nur YouTube und Vimeo URLs werden unterstuetzt.');
            return;
        }

        try {
            const response = await fetch('/api/media/embedded-videos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, platform, videoId })
            });

            if (response.ok) {
                urlInput.value = '';
                this.showToast('success', 'Hinzugefuegt', 'Video wurde hinzugefuegt.');
                await this.loadEmbeddedVideos();
            }
        } catch (e) {
            this.showToast('error', 'Fehler', 'Video konnte nicht hinzugefuegt werden.');
        }
    }

    async deleteEmbeddedVideo(id) {
        if (!confirm('Eingebettetes Video wirklich entfernen?')) return;

        try {
            const response = await fetch(`/api/media/embedded-videos/${id}`, { method: 'DELETE' });
            if (response.ok) {
                this.showToast('success', 'Entfernt', 'Video wurde entfernt.');
                await this.loadEmbeddedVideos();
            }
        } catch (e) {
            this.showToast('error', 'Fehler', 'Video konnte nicht entfernt werden.');
        }
    }

    // ============================================
    // LOGOS
    // ============================================

    async loadLogos() {
        try {
            const response = await fetch('/api/media/logos');
            if (response.ok) {
                const data = await response.json();
                this._logos = data.logos || { partners: [], certifications: [], flags: [] };
            }
        } catch (e) {
            this._logos = { partners: [], certifications: [], flags: [] };
        }
        this.renderLogos();
    }

    renderLogos() {
        const categories = ['partners', 'certifications', 'flags'];

        categories.forEach(category => {
            const gridId = category === 'partners' ? 'partnerLogosGrid' :
                          category === 'certifications' ? 'certLogosGrid' : 'flagsGrid';
            const grid = document.getElementById(gridId);
            if (!grid) return;

            const logos = this._logos[category] || [];

            let html = logos.map(logo => `
                <div class="logo-item" data-id="${logo.id}" data-category="${category}">
                    <img src="${logo.url}" alt="${logo.name || logo.filename}">
                    <div class="logo-overlay">
                        <button class="btn-edit" onclick="event.stopPropagation(); adminPanel.editLogo('${logo.id}')">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn-delete" onclick="event.stopPropagation(); adminPanel.deleteLogo('${logo.id}', '${category}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `).join('');

            // Add placeholder
            html += `
                <div class="logo-placeholder" onclick="adminPanel.addLogoToCategory('${category}')">
                    <i class="fas fa-plus"></i>
                    <span>${category === 'flags' ? 'Flagge hinzufuegen' : 'Logo hinzufuegen'}</span>
                </div>
            `;

            grid.innerHTML = html;
        });
    }

    addLogoToCategory(category) {
        // Open file dialog for the specific category
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*,.svg';
        input.multiple = true;

        input.onchange = async (e) => {
            const files = e.target.files;
            if (!files || files.length === 0) return;

            for (const file of files) {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('media_type', 'logos');
                formData.append('category', category);
                formData.append('website_id', 'ws_iustus');

                try {
                    const response = await fetch('/api/upload/media', {
                        method: 'POST',
                        body: formData
                    });

                    if (response.ok) {
                        this.showToast('success', 'Hochgeladen', `Logo wurde zu ${category} hinzugefuegt.`);
                    }
                } catch (error) {
                    this.showToast('error', 'Fehler', 'Fehler beim Hochladen.');
                }
            }

            await this.loadLogos();
            this.updateMediathekCounts();
        };

        input.click();
    }

    async deleteLogo(id, category) {
        if (!confirm('Logo wirklich loeschen?')) return;

        try {
            const response = await fetch(`/api/media/logos/${id}`, { method: 'DELETE' });
            if (response.ok) {
                this.showToast('success', 'Geloescht', 'Logo wurde geloescht.');
                await this.loadLogos();
                this.updateMediathekCounts();
            }
        } catch (e) {
            this.showToast('error', 'Fehler', 'Logo konnte nicht geloescht werden.');
        }
    }

    // ============================================
    // DOCUMENTS
    // ============================================

    async loadDocuments() {
        try {
            const response = await fetch('/api/media/documents');
            if (response.ok) {
                const data = await response.json();
                this._documents = data.documents || [];
            }
        } catch (e) {
            this._documents = [];
        }
        this.renderDocuments();
    }

    renderDocuments() {
        const list = document.getElementById('documentsList');
        if (!list) return;

        if (this._documents.length === 0) {
            list.innerHTML = `
                <div class="mediathek-empty">
                    <i class="fas fa-file-alt"></i>
                    <h3>Keine Dokumente vorhanden</h3>
                    <p>Lade dein erstes Dokument hoch!</p>
                </div>
            `;
            return;
        }

        list.innerHTML = this._documents.map(doc => {
            const ext = doc.filename.split('.').pop().toLowerCase();
            let iconClass = 'pdf';
            if (['doc', 'docx'].includes(ext)) iconClass = 'doc';
            else if (['xls', 'xlsx'].includes(ext)) iconClass = 'xls';
            else if (['ppt', 'pptx'].includes(ext)) iconClass = 'ppt';

            const iconMap = { pdf: 'fa-file-pdf', doc: 'fa-file-word', xls: 'fa-file-excel', ppt: 'fa-file-powerpoint' };

            return `
                <div class="document-item" data-id="${doc.id}">
                    <div class="doc-icon ${iconClass}">
                        <i class="fas ${iconMap[iconClass] || 'fa-file'}"></i>
                    </div>
                    <div class="doc-info">
                        <div class="doc-name">${doc.original_name || doc.filename}</div>
                        <div class="doc-meta">
                            <span><i class="fas fa-file"></i> ${ext.toUpperCase()}</span>
                            <span><i class="fas fa-weight"></i> ${this.formatFileSize(doc.size)}</span>
                            <span><i class="fas fa-calendar"></i> ${this.formatDate(doc.uploaded)}</span>
                        </div>
                    </div>
                    <div class="doc-actions">
                        <button class="btn-download" onclick="adminPanel.downloadDocument('${doc.url}')" title="Download">
                            <i class="fas fa-download"></i>
                        </button>
                        <button class="btn-preview" onclick="adminPanel.previewDocument('${doc.url}')" title="Vorschau">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="btn-delete" onclick="adminPanel.deleteDocument('${doc.id}')" title="Loeschen">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    filterDocuments() {
        const filter = document.getElementById('docFilterType')?.value || 'all';

        const items = document.querySelectorAll('.document-item');
        items.forEach(item => {
            const doc = this._documents.find(d => d.id === item.dataset.id);
            if (!doc) return;

            const ext = doc.filename.split('.').pop().toLowerCase();
            let type = 'other';
            if (ext === 'pdf') type = 'pdf';
            else if (['doc', 'docx'].includes(ext)) type = 'doc';
            else if (['xls', 'xlsx'].includes(ext)) type = 'xls';
            else if (['ppt', 'pptx'].includes(ext)) type = 'ppt';

            if (filter === 'all' || filter === type) {
                item.style.display = '';
            } else {
                item.style.display = 'none';
            }
        });
    }

    downloadDocument(url) {
        const link = document.createElement('a');
        link.href = url;
        link.download = '';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    previewDocument(url) {
        window.open(url, '_blank');
    }

    async deleteDocument(id) {
        if (!confirm('Dokument wirklich loeschen?')) return;

        try {
            const response = await fetch(`/api/media/documents/${id}`, { method: 'DELETE' });
            if (response.ok) {
                this.showToast('success', 'Geloescht', 'Dokument wurde geloescht.');
                await this.loadDocuments();
                this.updateMediathekCounts();
            }
        } catch (e) {
            this.showToast('error', 'Fehler', 'Dokument konnte nicht geloescht werden.');
        }
    }

    // ============================================
    // MEDIATHEK HELPERS
    // ============================================

    updateMediathekCounts() {
        // Header counts
        const imageCount = document.getElementById('mediathekImageCount');
        const videoCount = document.getElementById('mediathekVideoCount');
        const logoCount = document.getElementById('mediathekLogoCount');
        const docCount = document.getElementById('mediathekDocCount');

        // Tab counts
        const tabImagesCount = document.getElementById('tabImagesCount');
        const tabVideosCount = document.getElementById('tabVideosCount');
        const tabLogosCount = document.getElementById('tabLogosCount');
        const tabDocsCount = document.getElementById('tabDocsCount');

        const totalLogos = (this._logos?.partners?.length || 0) +
                          (this._logos?.certifications?.length || 0) +
                          (this._logos?.flags?.length || 0);

        // Update all counts
        if (videoCount) videoCount.textContent = this._videos?.length || 0;
        if (logoCount) logoCount.textContent = totalLogos;
        if (docCount) docCount.textContent = this._documents?.length || 0;

        if (tabVideosCount) tabVideosCount.textContent = this._videos?.length || 0;
        if (tabLogosCount) tabLogosCount.textContent = totalLogos;
        if (tabDocsCount) tabDocsCount.textContent = this._documents?.length || 0;
    }

    formatDuration(seconds) {
        if (!seconds) return '';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    formatFileSize(bytes) {
        if (!bytes) return '0 KB';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    formatDate(isoString) {
        if (!isoString) return '';
        const d = new Date(isoString);
        return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }

    // ========================================
    // MEDIA FOLDER MANAGEMENT
    // ========================================

    _currentMediaFolder = 'all';
    _customFolders = [];
    _mediaFolderCounts = {};

    async initMediaFolders() {
        // Load custom folders from localStorage
        try {
            const saved = localStorage.getItem('media_custom_folders');
            if (saved) {
                this._customFolders = JSON.parse(saved);
                this.renderCustomFolders();
            }
        } catch (e) {}

        // Update folder counts
        await this.updateFolderCounts();
    }

    async updateFolderCounts() {
        try {
            const response = await fetch('/api/images');
            const data = await response.json();

            if (!data.images) return;

            const counts = {
                all: data.images.length,
                uploads: 0,
                team: 0,
                products: 0,
                locations: 0,
                logos: 0,
                flags: 0,
                documents: 0,
                videos: 0
            };

            data.images.forEach(img => {
                const folder = this.getImageFolder(img);
                if (counts.hasOwnProperty(folder)) {
                    counts[folder]++;
                } else {
                    counts.uploads++;
                }
            });

            // Update count displays for all folders
            Object.keys(counts).forEach(folder => {
                const folderName = folder.charAt(0).toUpperCase() + folder.slice(1);
                const countEl = document.getElementById('folderCount' + folderName);
                if (countEl) countEl.textContent = counts[folder];
            });

            // Update banner counts (top header stats)
            const imageCount = document.getElementById('mediathekImageCount');
            const videoCount = document.getElementById('mediathekVideoCount');
            const logoCount = document.getElementById('mediathekLogoCount');

            // Calculate total images (excluding videos, documents, flags, logos)
            const totalImages = counts.team + counts.uploads + counts.products + counts.locations;

            if (imageCount) imageCount.textContent = totalImages;
            if (videoCount) videoCount.textContent = counts.videos;
            if (logoCount) logoCount.textContent = counts.logos + counts.flags; // Logos + Flags

            this._mediaFolderCounts = counts;
            this._allMediaImages = data.images;
        } catch (e) {
            console.error('Error updating folder counts:', e);
        }
    }

    getImageFolder(img) {
        // Use folder from server if available
        if (img.folder) return img.folder;

        const path = img.url || '';
        const filename = (img.filename || '').toLowerCase();
        const originalName = (img.original_name || '').toLowerCase();
        const ext = filename.split('.').pop();

        // File type detection for documents and videos
        const docExtensions = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];
        const videoExtensions = ['mp4', 'webm', 'mov', 'avi', 'mkv'];

        if (docExtensions.includes(ext)) return 'documents';
        if (videoExtensions.includes(ext)) return 'videos';

        // Path-based detection
        if (path.includes('/flags/')) return 'flags';
        if (path.includes('/team/')) return 'team';
        if (path.includes('/products/')) return 'products';
        if (path.includes('/locations/')) return 'locations';
        if (path.includes('/logos/')) return 'logos';
        if (path.includes('/documents/')) return 'documents';
        if (path.includes('/videos/')) return 'videos';

        // Check original_name for team member detection
        if (originalName && originalName !== filename) {
            return 'team';
        }

        // Name-based detection for team members
        const teamNames = ['emir', 'keco', 'tobias', 'westerfield', 'rafael', 'arevalo',
                          'kevin', 'barrios', 'gerhard', 'schobesberger', 'david', 'awori',
                          'emmanuel', 'musinguzi', 'tony', 'kamya', 'isaac', 'cheruiyot',
                          'julius', 'muraya', 'placeholder'];
        for (const name of teamNames) {
            if (filename.includes(name) || originalName.includes(name)) return 'team';
        }

        // Flag detection by filename
        if (filename.includes('flag') || filename.match(/^[a-z]{2}\.(svg|png|jpg)$/)) {
            return 'flags';
        }

        // Logo detection
        if (filename.includes('logo') || filename.includes('certificate') || filename.includes('badge')) {
            return 'logos';
        }

        return 'uploads';
    }

    getFileType(filename) {
        const ext = (filename || '').split('.').pop().toLowerCase();
        const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'ico', 'bmp'];
        const videoExtensions = ['mp4', 'webm', 'mov', 'avi', 'mkv', 'flv'];
        const docExtensions = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt'];

        if (imageExtensions.includes(ext)) return 'images';
        if (videoExtensions.includes(ext)) return 'videos';
        if (docExtensions.includes(ext)) return 'documents';
        return 'images';
    }

    selectMediaFolder(folder) {
        this._currentMediaFolder = folder;

        // Update active state
        document.querySelectorAll('.folder-item').forEach(el => {
            el.classList.toggle('active', el.dataset.folder === folder);
        });

        // Update folder name display
        const folderNames = {
            all: 'Alle Dateien',
            uploads: 'Uploads',
            team: 'Mitarbeiter',
            products: 'Produkte',
            locations: 'Standorte',
            logos: 'Logos',
            flags: 'Flaggen',
            documents: 'Dokumente',
            videos: 'Videos'
        };
        const nameEl = document.getElementById('currentFolderName');
        if (nameEl) nameEl.textContent = folderNames[folder] || folder;

        // Show/hide video embed section
        const videoEmbedSection = document.getElementById('videoEmbedSection');
        if (videoEmbedSection) {
            videoEmbedSection.style.display = folder === 'videos' ? 'block' : 'none';
        }

        // Auto-select upload target folder
        const uploadSelect = document.getElementById('uploadTargetFolder');
        if (uploadSelect && folder !== 'all' && uploadSelect.querySelector(`option[value="${folder}"]`)) {
            uploadSelect.value = folder;
        }

        // Reload files filtered by folder
        this.loadMediathekImages();
    }

    filterByType(type) {
        this._currentMediaType = type;

        // Update active state on filter buttons
        document.querySelectorAll('.type-filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.type === type);
        });

        // Filter currently displayed items
        const items = document.querySelectorAll('.mediathek-item');
        items.forEach(item => {
            const itemType = item.dataset.filetype || 'images';
            if (type === 'all') {
                item.style.display = '';
            } else {
                item.style.display = itemType === type ? '' : 'none';
            }
        });
    }

    createMediaFolder() {
        this.openModal('Neuen Ordner erstellen', `
            <div class="form-group">
                <label>Ordnername</label>
                <input type="text" class="form-input" id="newFolderName" placeholder="z.B. Marketing, Events..." required>
            </div>
            <div class="form-group">
                <label>Icon (optional)</label>
                <select class="form-input" id="newFolderIcon">
                    <option value="fa-folder">Standard</option>
                    <option value="fa-image">Bild</option>
                    <option value="fa-camera">Kamera</option>
                    <option value="fa-building">Gebaeude</option>
                    <option value="fa-globe">Welt</option>
                    <option value="fa-star">Stern</option>
                    <option value="fa-heart">Herz</option>
                    <option value="fa-briefcase">Business</option>
                </select>
            </div>
        `, () => {
            const name = document.getElementById('newFolderName').value.trim();
            const icon = document.getElementById('newFolderIcon').value;

            if (!name) {
                this.showToast('error', 'Fehler', 'Bitte Ordnername eingeben');
                return;
            }

            const folderId = 'custom_' + Date.now();
            this._customFolders.push({ id: folderId, name, icon });

            // Save to localStorage
            localStorage.setItem('media_custom_folders', JSON.stringify(this._customFolders));

            // Add to upload select
            const select = document.getElementById('uploadTargetFolder');
            if (select) {
                const opt = document.createElement('option');
                opt.value = folderId;
                opt.textContent = name;
                select.appendChild(opt);
            }

            this.renderCustomFolders();
            this.showToast('success', 'Erstellt', 'Ordner "' + name + '" wurde erstellt');
        });
    }

    renderCustomFolders() {
        const container = document.getElementById('customFoldersList');
        if (!container) return;

        container.innerHTML = this._customFolders.map(folder => `
            <div class="folder-item custom-folder" data-folder="${folder.id}" onclick="adminPanel.selectMediaFolder('${folder.id}')">
                <i class="fas ${folder.icon || 'fa-folder'}"></i>
                <span>${folder.name}</span>
                <span class="folder-count">0</span>
                <button class="folder-delete" onclick="event.stopPropagation(); adminPanel.deleteMediaFolder('${folder.id}')" title="Ordner loeschen">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `).join('');
    }

    deleteMediaFolder(folderId) {
        if (!confirm('Ordner wirklich loeschen? Die Dateien werden nicht geloescht.')) return;

        this._customFolders = this._customFolders.filter(f => f.id !== folderId);
        localStorage.setItem('media_custom_folders', JSON.stringify(this._customFolders));

        this.renderCustomFolders();

        if (this._currentMediaFolder === folderId) {
            this.selectMediaFolder('all');
        }

        this.showToast('success', 'Geloescht', 'Ordner wurde entfernt');
    }

    filterMediaFiles() {
        const search = document.getElementById('mediaSearchInput')?.value?.toLowerCase() || '';
        const items = document.querySelectorAll('.mediathek-item');

        items.forEach(item => {
            const filename = item.dataset.filename?.toLowerCase() || '';
            item.style.display = filename.includes(search) ? '' : 'none';
        });
    }

    setMediaView(viewType) {
        const grid = document.getElementById('mediathekGrid');
        if (!grid) return;

        // Update button states
        document.querySelectorAll('.view-toggle .view-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === viewType);
        });

        // Toggle view class
        if (viewType === 'list') {
            grid.classList.add('list-view');
            grid.classList.remove('grid-view');
        } else {
            grid.classList.add('grid-view');
            grid.classList.remove('list-view');
        }
    }

    async loadMediathekImages() {
        const grid = document.getElementById('mediathekGrid');
        const countEl = document.getElementById('mediathekImageCount');

        if (!grid) return;

        // Multi-Select State initialisieren
        if (!this._selectedMediathekImages) {
            this._selectedMediathekImages = new Set();
        }

        // Lade Zuordnungen
        await this.loadImageAssignments();

        try {
            const response = await fetch('/api/images');
            const data = await response.json();

            if (!data.images || data.images.length === 0) {
                grid.innerHTML = `
                    <div class="mediathek-empty">
                        <i class="fas fa-images"></i>
                        <h3>Keine Bilder vorhanden</h3>
                        <p>Lade dein erstes Bild hoch!</p>
                    </div>
                `;
                if (countEl) countEl.textContent = '0';
                this.updateMediathekToolbar();
                this.updateFolderCounts(data.images || []);
                return;
            }

            // Filter images by current folder
            let filteredImages = data.images;
            const currentFolder = this._currentMediaFolder || 'all';

            if (currentFolder !== 'all') {
                filteredImages = data.images.filter(img => {
                    const folder = this.getImageFolder(img);
                    return folder === currentFolder;
                });
            }

            if (countEl) countEl.textContent = filteredImages.length;

            // Update folder counts
            this.updateFolderCounts(data.images);

            // Teile Bilder in zugeordnet und nicht zugeordnet
            const assignedImages = [];
            const unassignedImages = [];

            filteredImages.forEach(img => {
                const assignment = this._imageAssignments[img.url];
                if (assignment) {
                    assignedImages.push({ ...img, assignment });
                } else {
                    unassignedImages.push(img);
                }
            });

            let html = '';

            // Zugeordnete Bilder
            if (assignedImages.length > 0) {
                html += `
                    <div class="mediathek-section">
                        <h3 style="margin:0 0 12px 0; padding:8px 12px; background:linear-gradient(135deg, #28a745, #20c997); color:white; border-radius:8px; font-size:13px; display:flex; align-items:center; gap:8px;">
                            <i class="fas fa-check-circle"></i>
                            Zugeordnet (${assignedImages.length})
                        </h3>
                        <div class="mediathek-assigned-grid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(180px, 1fr)); gap:12px; margin-bottom:24px;">
                            ${assignedImages.map(img => `
                                <div class="mediathek-item assigned ${this._selectedMediathekImages.has(img.url) ? 'selected' : ''}"
                                     data-url="${img.url}" data-filename="${img.filename}"
                                     onclick="adminPanel.toggleMediathekSelect('${img.url}', event)"
                                     style="border:2px solid #28a745;">
                                    <div class="mediathek-checkbox ${this._selectedMediathekImages.has(img.url) ? 'checked' : ''}">
                                        <i class="fas fa-check"></i>
                                    </div>
                                    <div class="mediathek-assigned-badge" style="position:absolute; top:8px; left:8px; z-index:5; background:#28a745; color:white; padding:4px 8px; border-radius:4px; font-size:10px; font-weight:600; max-width:calc(100% - 50px); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                                        <i class="fas fa-link" style="margin-right:4px;"></i>${img.assignment.name}
                                    </div>
                                    <img src="${img.url}" alt="${img.filename}" loading="lazy">
                                    <div class="mediathek-item-overlay">
                                        <div class="mediathek-item-name">${img.filename}</div>
                                        <div class="mediathek-item-actions">
                                            <button class="btn-primary" onclick="event.stopPropagation(); adminPanel.assignImageToWebsite('${img.url}')" title="Neu zuordnen" style="background:var(--gold);color:var(--navy-dark);">
                                                <i class="fas fa-exchange-alt"></i>
                                            </button>
                                            <button class="btn-warning" onclick="event.stopPropagation(); adminPanel.removeImageAssignment(this.closest('.mediathek-item').dataset.url)" title="Zuordnung entfernen" style="background:#ffc107;color:#000;">
                                                <i class="fas fa-unlink"></i>
                                            </button>
                                            <button class="btn-delete" onclick="event.stopPropagation(); adminPanel.deleteMediathekImage('${img.filename}')" title="Löschen">
                                                <i class="fas fa-trash"></i>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            }

            // Nicht zugeordnete Bilder
            if (unassignedImages.length > 0) {
                html += `
                    <div class="mediathek-section">
                        <h3 style="margin:0 0 12px 0; padding:8px 12px; background:linear-gradient(135deg, var(--gray-500), var(--gray-600)); color:white; border-radius:8px; font-size:13px; display:flex; align-items:center; gap:8px;">
                            <i class="fas fa-inbox"></i>
                            Nicht zugeordnet (${unassignedImages.length})
                        </h3>
                        <div class="mediathek-unassigned-grid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(150px, 1fr)); gap:12px;">
                            ${unassignedImages.map(img => `
                                <div class="mediathek-item ${this._selectedMediathekImages.has(img.url) ? 'selected' : ''}"
                                     data-url="${img.url}" data-filename="${img.filename}"
                                     onclick="adminPanel.toggleMediathekSelect('${img.url}', event)">
                                    <div class="mediathek-checkbox ${this._selectedMediathekImages.has(img.url) ? 'checked' : ''}">
                                        <i class="fas fa-check"></i>
                                    </div>
                                    <img src="${img.url}" alt="${img.filename}" loading="lazy">
                                    <div class="mediathek-item-overlay">
                                        <div class="mediathek-item-name">${img.filename}</div>
                                        <div class="mediathek-item-actions">
                                            <button class="btn-primary" onclick="event.stopPropagation(); adminPanel.assignImageToWebsite('${img.url}')" title="Bild auf Website zuordnen" style="background:var(--gold);color:var(--navy-dark);">
                                                <i class="fas fa-bullseye"></i> Zuordnen
                                            </button>
                                            <button class="btn-copy" onclick="event.stopPropagation(); adminPanel.copyImageUrl('${img.url}')" title="URL kopieren">
                                                <i class="fas fa-copy"></i>
                                            </button>
                                            <button class="btn-delete" onclick="event.stopPropagation(); adminPanel.deleteMediathekImage('${img.filename}')" title="Löschen">
                                                <i class="fas fa-trash"></i>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            }

            grid.innerHTML = html;
            this.updateMediathekToolbar();

        } catch (error) {
            console.error('Error loading mediathek:', error);
            grid.innerHTML = `
                <div class="mediathek-empty" style="color: var(--danger);">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>Fehler beim Laden</h3>
                    <p>${error.message}</p>
                </div>
            `;
        }
    }

    toggleMediathekSelect(url, event) {
        // Wenn auf Button geklickt, nicht selektieren
        if (event.target.closest('button')) return;

        if (!this._selectedMediathekImages) {
            this._selectedMediathekImages = new Set();
        }

        if (this._selectedMediathekImages.has(url)) {
            this._selectedMediathekImages.delete(url);
        } else {
            this._selectedMediathekImages.add(url);
        }

        // Update UI
        const item = document.querySelector(`.mediathek-item[data-url="${url}"]`);
        if (item) {
            item.classList.toggle('selected', this._selectedMediathekImages.has(url));
            const checkbox = item.querySelector('.mediathek-checkbox');
            if (checkbox) {
                checkbox.classList.toggle('checked', this._selectedMediathekImages.has(url));
            }
        }

        this.updateMediathekToolbar();
    }

    selectAllMediathekImages() {
        const items = document.querySelectorAll('.mediathek-item');
        items.forEach(item => {
            const url = item.dataset.url;
            if (url) {
                this._selectedMediathekImages.add(url);
                item.classList.add('selected');
                const checkbox = item.querySelector('.mediathek-checkbox');
                if (checkbox) checkbox.classList.add('checked');
            }
        });
        this.updateMediathekToolbar();
    }

    deselectAllMediathekImages() {
        this._selectedMediathekImages.clear();
        document.querySelectorAll('.mediathek-item').forEach(item => {
            item.classList.remove('selected');
            const checkbox = item.querySelector('.mediathek-checkbox');
            if (checkbox) checkbox.classList.remove('checked');
        });
        this.updateMediathekToolbar();
    }

    updateMediathekToolbar() {
        let toolbar = document.getElementById('mediathekMultiToolbar');
        const count = this._selectedMediathekImages ? this._selectedMediathekImages.size : 0;

        if (count === 0) {
            if (toolbar) toolbar.remove();
            return;
        }

        if (!toolbar) {
            toolbar = document.createElement('div');
            toolbar.id = 'mediathekMultiToolbar';
            toolbar.style.cssText = `
                position: sticky;
                top: 0;
                z-index: 100;
                background: linear-gradient(135deg, var(--navy-dark), var(--navy-medium));
                padding: 12px 16px;
                margin: -16px -16px 16px -16px;
                display: flex;
                align-items: center;
                gap: 12px;
                border-radius: 8px 8px 0 0;
                box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            `;
            const grid = document.getElementById('mediathekGrid');
            if (grid) grid.parentNode.insertBefore(toolbar, grid);
        }

        toolbar.innerHTML = `
            <div style="flex:1; color:white; font-weight:600;">
                <i class="fas fa-check-square" style="color:var(--gold); margin-right:8px;"></i>
                ${count} Bild${count > 1 ? 'er' : ''} ausgewählt
            </div>
            <button onclick="adminPanel.assignMultipleImages()" style="background:var(--gold); color:var(--navy-dark); border:none; padding:8px 16px; border-radius:6px; cursor:pointer; font-weight:600; display:flex; align-items:center; gap:6px;">
                <i class="fas fa-bullseye"></i> Alle zuordnen
            </button>
            <button onclick="adminPanel.selectAllMediathekImages()" style="background:rgba(255,255,255,0.1); color:white; border:1px solid rgba(255,255,255,0.3); padding:8px 12px; border-radius:6px; cursor:pointer;">
                <i class="fas fa-check-double"></i> Alle
            </button>
            <button onclick="adminPanel.deselectAllMediathekImages()" style="background:rgba(255,255,255,0.1); color:white; border:1px solid rgba(255,255,255,0.3); padding:8px 12px; border-radius:6px; cursor:pointer;">
                <i class="fas fa-times"></i> Keine
            </button>
        `;
    }

    async assignMultipleImages() {
        if (!this._selectedMediathekImages || this._selectedMediathekImages.size === 0) {
            this.showToast('warning', 'Keine Auswahl', 'Bitte wähle zuerst Bilder aus');
            return;
        }

        const urls = Array.from(this._selectedMediathekImages);
        this._multiAssignQueue = urls;
        this._multiAssignIndex = 0;

        this.showToast('info', 'Multi-Zuordnung', `${urls.length} Bilder werden nacheinander zugeordnet`);

        // Wechsle zur Struktur-Ansicht
        const structureTab = document.querySelector('[data-section="structure"]');
        if (structureTab) {
            structureTab.click();
            await new Promise(r => setTimeout(r, 500));
        }

        // Starte mit dem ersten Bild
        this.showMultiAssignDialog();
    }

    showMultiAssignDialog() {
        if (!this._multiAssignQueue || this._multiAssignIndex >= this._multiAssignQueue.length) {
            // Fertig!
            this.showToast('success', 'Fertig!', 'Alle Bilder wurden zugeordnet');
            this._selectedMediathekImages.clear();
            this.updateMediathekToolbar();
            return;
        }

        const currentUrl = this._multiAssignQueue[this._multiAssignIndex];
        const total = this._multiAssignQueue.length;
        const current = this._multiAssignIndex + 1;

        // Zeige angepassten Target-Selector mit Fortschrittsanzeige
        this.showImageTargetSelector(currentUrl, {
            multiMode: true,
            current: current,
            total: total,
            onComplete: () => {
                this._multiAssignIndex++;
                // Kleine Pause zwischen den Zuordnungen
                setTimeout(() => this.showMultiAssignDialog(), 300);
            },
            onSkip: () => {
                this._multiAssignIndex++;
                setTimeout(() => this.showMultiAssignDialog(), 100);
            },
            onCancel: () => {
                this.showToast('info', 'Abgebrochen', `${this._multiAssignIndex} von ${total} Bildern zugeordnet`);
                this._multiAssignQueue = null;
            }
        });
    }

    async uploadMediathekFiles(files) {
        this.showToast('info', 'Hochladen...', `${files.length} Bild(er) werden hochgeladen`);

        let successCount = 0;

        for (const file of files) {
            const formData = new FormData();
            formData.append('image', file);

            try {
                const response = await fetch('/api/upload-image', {
                    method: 'POST',
                    body: formData
                });

                const result = await response.json();
                if (result.success) {
                    successCount++;
                }
            } catch (error) {
                console.error('Upload error:', error);
            }
        }

        if (successCount > 0) {
            this.showToast('success', 'Hochgeladen!', `${successCount} Bild(er) erfolgreich hochgeladen`);
            await this.loadMediathekImages();
            // Aktualisiere auch die Galerie im Modal falls geöffnet
            if (document.getElementById('imageGalleryModal')) {
                await this.loadGalleryImages();
            }
        } else {
            this.showToast('error', 'Fehler', 'Keine Bilder konnten hochgeladen werden');
        }
    }

    copyImageUrl(url) {
        const fullUrl = window.location.origin + url;
        navigator.clipboard.writeText(fullUrl).then(() => {
            this.showToast('success', 'Kopiert!', 'Bild-URL in Zwischenablage kopiert');
        }).catch(() => {
            this.showToast('info', 'URL', url);
        });
    }

    async deleteMediathekImage(filename) {
        if (!confirm(`Bild "${filename}" wirklich löschen?`)) return;

        try {
            const response = await fetch(`/api/images/${filename}`, {
                method: 'DELETE'
            });

            const result = await response.json();

            if (result.success) {
                this.showToast('success', 'Gelöscht', 'Bild wurde gelöscht');
                await this.loadMediathekImages();
            } else {
                this.showToast('error', 'Fehler', 'Löschen fehlgeschlagen');
            }
        } catch (error) {
            console.error('Delete error:', error);
            this.showToast('error', 'Fehler', 'Löschen fehlgeschlagen');
        }
    }

    showImageSelectDialog(url) {
        const el = this.selectedElement;
        if (!el) return;

        const isImg = el.tagName.toLowerCase() === 'img';
        const hasBackground = el.style.backgroundImage && el.style.backgroundImage !== 'none';

        let options = [];
        if (isImg) {
            options.push({ label: 'Als Bildquelle setzen', action: 'src' });
        }
        options.push({ label: 'Als Hintergrundbild setzen', action: 'background' });

        // Wenn nur eine Option, direkt ausführen
        if (options.length === 1) {
            this.applyImageToElement(url, options[0].action);
            return;
        }

        // Dialog anzeigen
        const dialog = document.createElement('div');
        dialog.id = 'imageSelectDialog';
        dialog.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.7); z-index:10000; display:flex; align-items:center; justify-content:center;';
        dialog.innerHTML = `
            <div style="background:white; border-radius:12px; padding:24px; max-width:400px; width:90%;">
                <h3 style="margin:0 0 16px 0; color:var(--navy-dark);">Bild verwenden als...</h3>
                <div style="display:flex; flex-direction:column; gap:12px;">
                    ${options.map(opt => `
                        <button class="btn-${opt.action === 'src' ? 'primary' : 'secondary'}"
                                onclick="adminPanel.applyImageToElement('${url}', '${opt.action}'); document.getElementById('imageSelectDialog').remove();"
                                style="padding:12px; font-size:14px;">
                            <i class="fas fa-${opt.action === 'src' ? 'image' : 'fill'}"></i> ${opt.label}
                        </button>
                    `).join('')}
                    <button class="btn-secondary" onclick="document.getElementById('imageSelectDialog').remove()" style="padding:12px; font-size:14px;">
                        <i class="fas fa-times"></i> Abbrechen
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(dialog);
    }

    applyImageToElement(url, mode) {
        const el = this.selectedElement;
        if (!el) return;

        if (mode === 'src' && el.tagName.toLowerCase() === 'img') {
            el.src = url;
            this.showToast('success', 'Bild gesetzt', 'Bildquelle wurde aktualisiert');
        } else if (mode === 'background') {
            el.style.backgroundImage = `url('${url}')`;
            el.style.backgroundSize = 'cover';
            el.style.backgroundPosition = 'center';
            this.showToast('success', 'Hintergrund gesetzt', 'Hintergrundbild wurde aktualisiert');
        }

        this.showElementProperties(el);
    }

    // Direkter Upload bei Bild-Klick im iframe
    showDirectImageUpload() {
        const el = this.selectedElement;
        if (!el) return;

        // Erstelle verstecktes File Input
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.style.display = 'none';

        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            this.showToast('info', 'Hochladen...', 'Bild wird hochgeladen');

            const formData = new FormData();
            formData.append('image', file);

            try {
                const response = await fetch('/api/upload-image', {
                    method: 'POST',
                    body: formData
                });

                const result = await response.json();

                if (result.success) {
                    // Wende das Bild auf das ausgewählte Element an
                    const isImg = el.tagName.toLowerCase() === 'img';
                    if (isImg) {
                        el.src = result.url;
                    } else {
                        el.style.backgroundImage = `url('${result.url}')`;
                        el.style.backgroundSize = 'cover';
                        el.style.backgroundPosition = 'center';
                    }

                    this.showToast('success', 'Hochgeladen!', 'Bild wurde hochgeladen und angewendet');
                    this.showElementProperties(el);

                    // Aktualisiere Mediathek
                    this.loadMediathekImages();
                } else {
                    this.showToast('error', 'Fehler', result.error || 'Upload fehlgeschlagen');
                }
            } catch (error) {
                console.error('Upload error:', error);
                this.showToast('error', 'Fehler', 'Upload fehlgeschlagen');
            }

            input.remove();
        };

        document.body.appendChild(input);
        input.click();
    }

    // Wechselt zur Struktur-Ansicht und zeigt Ziel-Auswahl
    assignImageToWebsite(imageUrl) {
        // Speichere die URL für später
        this._pendingImageUrl = imageUrl;

        // Wechsle zur Struktur-Ansicht
        const structureBtn = document.querySelector('[data-section="structure"]');
        if (structureBtn) {
            structureBtn.click();

            // Warte bis die Ansicht geladen ist, dann zeige Dialog
            setTimeout(() => {
                this.showImageTargetSelector(imageUrl);
            }, 500);
        } else {
            this.showToast('error', 'Fehler', 'Struktur-Ansicht nicht gefunden');
        }
    }

    // Zeigt alle Bilder auf der Website zur Auswahl an
    showImageTargetSelector(sourceUrl, options = {}) {
        // options: { multiMode, current, total, onComplete, onSkip, onCancel }
        this._imageTargetOptions = options;

        const iframe = document.getElementById('websitePreview');
        if (!iframe || !iframe.contentDocument) {
            this.showToast('warning', 'Kein Vorschau', 'Bitte zuerst zur "Struktur"-Ansicht wechseln');
            return;
        }

        const doc = iframe.contentDocument;

        // Sammle alle Bilder von der Website (auch versteckte)
        const allImgElements = Array.from(doc.querySelectorAll('img'));
        const images = allImgElements.filter(img => {
            // Nur Bilder mit src (nicht leere)
            if (!img.src || img.src === 'about:blank') return false;
            // Keine Admin-eigenen Bilder
            if (img.classList.contains('admin-') || img.id.startsWith('admin-')) return false;
            return true;
        });

        console.log(`[Image Target] Gefunden: ${images.length} IMG-Elemente`);

        const bgElements = [];

        // Finde auch Elemente mit Hintergrundbildern
        doc.querySelectorAll('*').forEach(el => {
            // Überspringe Admin-Elemente
            if (el.classList && (el.classList.contains('admin-overlay') || el.id && el.id.startsWith('admin-'))) return;

            const style = iframe.contentWindow.getComputedStyle(el);
            const bgImage = style.backgroundImage;

            // Nur echte Bilder (keine Gradients, keine Data-URLs für SVG-Patterns)
            if (bgImage && bgImage !== 'none' &&
                !bgImage.includes('gradient') &&
                !bgImage.includes('data:image/svg')) {

                const bgUrl = bgImage.replace(/^url\(['"]?/, '').replace(/['"]?\)$/, '');

                // Nur Bild-URLs (jpg, png, gif, webp, etc.)
                if (bgUrl.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?|$)/i) ||
                    bgUrl.startsWith('/uploads/') ||
                    bgUrl.startsWith('http')) {
                    bgElements.push({
                        element: el,
                        bgUrl: bgUrl
                    });
                }
            }
        });

        console.log(`[Image Target] Gefunden: ${bgElements.length} Hintergrundbilder`);

        // Finde Sektionen/Container wo man Hintergrundbilder hinzufügen kann
        const insertTargets = [];
        const processedElements = new Set();

        // Markiere bereits gefundene Elemente
        bgElements.forEach(item => processedElements.add(item.element));

        // Suche nach geeigneten Containern für neue Bilder
        const sectionSelectors = [
            'section', '.hero', '.hero-section', '.about', '.about-section',
            '.services', '.team', '.products', '.contact', '.cta',
            '[class*="section"]', '.card', '.feature', '.banner',
            'header', 'footer', 'article', 'aside', '.content-block'
        ];

        sectionSelectors.forEach(selector => {
            try {
                doc.querySelectorAll(selector).forEach(el => {
                    if (processedElements.has(el)) return;

                    const rect = el.getBoundingClientRect();
                    const style = iframe.contentWindow.getComputedStyle(el);

                    // Nur sichtbare Elemente mit ausreichender Größe
                    if (rect.width > 150 && rect.height > 80) {
                        // Besserer Name aus ID oder Klasse
                        let rawName = el.id || el.className.split(' ').filter(c => c && !c.startsWith('admin-'))[0] || el.tagName.toLowerCase();

                        // Name lesbar formatieren (hero-section -> Hero Section)
                        const displayName = rawName
                            .replace(/[-_]/g, ' ')
                            .replace(/([a-z])([A-Z])/g, '$1 $2')
                            .split(' ')
                            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                            .join(' ');

                        // Beschreibung aus Überschriften holen
                        const heading = el.querySelector('h1, h2, h3, h4');
                        const description = heading ? heading.textContent.trim().substring(0, 50) : '';

                        // Position auf der Seite (von oben)
                        const scrollTop = iframe.contentWindow.scrollY || 0;
                        const positionY = Math.round(rect.top + scrollTop);

                        // Hintergrundfarbe des Elements für Vorschau
                        const bgColor = style.backgroundColor || 'transparent';

                        insertTargets.push({
                            element: el,
                            name: displayName,
                            rawName: rawName,
                            description: description,
                            positionY: positionY,
                            bgColor: bgColor,
                            width: Math.round(rect.width),
                            height: Math.round(rect.height)
                        });
                        processedElements.add(el);
                    }
                });
            } catch(e) {}
        });

        // Sortiere nach Position auf der Seite (von oben nach unten)
        insertTargets.sort((a, b) => a.positionY - b.positionY);

        // Finde auch spezielle Bild-Container (Team-Bilder, Avatar-Bereiche, etc.)
        const imageContainers = [];
        const imageContainerSelectors = [
            '.team-image',           // Team-Mitarbeiter Bilder
            '.avatar',               // Avatar-Bereiche
            '.profile-image',        // Profil-Bilder
            '.member-photo',         // Mitglieder-Fotos
            '.person-image',         // Personen-Bilder
            '.employee-image',       // Mitarbeiter-Bilder
            '[class*="photo"]',      // Alle Photo-Klassen
            '[class*="avatar"]',     // Alle Avatar-Klassen
            '.testimonial-image',    // Testimonial-Bilder
            '.author-avatar'         // Autor-Avatare
        ];

        imageContainerSelectors.forEach(selector => {
            try {
                doc.querySelectorAll(selector).forEach(el => {
                    if (processedElements.has(el)) return;

                    const rect = el.getBoundingClientRect();
                    if (rect.width < 30 || rect.height < 30) return; // Zu klein

                    // Prüfe ob bereits ein Bild drin ist
                    const existingImg = el.querySelector('img');
                    const hasInitials = el.querySelector('.initials, span');

                    // Finde den Namen der Person (aus Nachbarelementen)
                    const parent = el.closest('.team-card-front, .team-card, .member-card, .testimonial, .author-info') || el.parentElement;
                    const nameEl = parent?.querySelector('h4, h3, .name, .author-name');
                    const personName = nameEl ? nameEl.textContent.trim() : '';

                    const scrollTop = iframe.contentWindow.scrollY || 0;
                    const positionY = Math.round(rect.top + scrollTop);

                    imageContainers.push({
                        element: el,
                        existingImg: existingImg,
                        hasInitials: !!hasInitials && !existingImg,
                        personName: personName,
                        positionY: positionY,
                        width: Math.round(rect.width),
                        height: Math.round(rect.height)
                    });
                    processedElements.add(el);
                });
            } catch(e) {}
        });

        console.log(`[Image Target] Gefunden: ${imageContainers.length} Bild-Container (Team, Avatar, etc.)`);

        // Modal erstellen - LINKS positioniert damit Vorschau sichtbar bleibt
        const modal = document.createElement('div');
        modal.id = 'imageTargetModal';
        modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:10001; display:flex; align-items:flex-start; justify-content:flex-start; padding: 20px;';

        const isMulti = options.multiMode;
        // Extrahiere Dateinamen aus URL für bessere Zuordnung
        const imageName = sourceUrl ? sourceUrl.split('/').pop() || 'Unbekannt' : 'Unbekannt';
        const progressHtml = isMulti ? `
            <div style="background:var(--gold); color:var(--navy-dark); padding:10px 16px;">
                <div style="display:flex; align-items:center; gap:12px; margin-bottom:6px;">
                    <div style="font-weight:700; font-size:14px;">Bild ${options.current} von ${options.total}</div>
                    <div style="flex:1; height:6px; background:rgba(0,0,0,0.2); border-radius:3px; overflow:hidden;">
                        <div style="height:100%; width:${(options.current / options.total) * 100}%; background:var(--navy-dark); border-radius:3px; transition:width 0.3s;"></div>
                    </div>
                </div>
                <div style="display:flex; align-items:center; gap:10px; font-size:12px;">
                    <img src="${sourceUrl}" style="width:40px; height:40px; object-fit:cover; border-radius:6px; border:2px solid rgba(0,0,0,0.2);" alt="">
                    <span style="font-weight:500; max-width:300px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${imageName}">${imageName}</span>
                </div>
            </div>
        ` : '';

        modal.innerHTML = `
            <div style="background:white; border-radius:16px; width:450px; max-height:90vh; overflow:hidden; display:flex; flex-direction:column; box-shadow: 0 25px 50px rgba(0,0,0,0.3);">
                ${progressHtml}
                <div style="padding:16px 20px; border-bottom:1px solid var(--gray-200); display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <h2 style="margin:0 0 4px 0; color:var(--navy-dark); font-size:16px;">
                            <i class="fas fa-bullseye" style="color:var(--gold); margin-right:8px;"></i>
                            ${isMulti ? 'Ziel für dieses Bild' : 'Bild-Ziel wählen'}
                        </h2>
                        <p style="margin:0; color:var(--gray-600); font-size:11px;">Hover über ein Element um es rechts zu sehen</p>
                    </div>
                    <button onclick="adminPanel.closeImageTargetModal(true)"
                            style="background:none; border:none; font-size:24px; cursor:pointer; color:var(--gray-500); line-height:1;">&times;</button>
                </div>

                <div style="padding:12px 20px; background:var(--gray-100); border-bottom:1px solid var(--gray-200);">
                    <img src="${sourceUrl}" style="height:50px; width:auto; border-radius:4px; border:2px solid var(--gold);">
                </div>

                <div style="flex:1; overflow-y:auto; padding:16px 20px;">
                    ${imageContainers.length > 0 ? `
                        <h4 style="margin:0 0 10px 0; color:var(--navy-dark); font-size:13px;">
                            <i class="fas fa-user-circle" style="color:#9c27b0; margin-right:8px;"></i>
                            Team / Personen-Bilder (${imageContainers.length})
                        </h4>
                        <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:20px;">
                            ${imageContainers.map((item, i) => `
                                <div class="target-image-item" data-type="container" data-index="${i}"
                                     style="cursor:pointer; border-radius:8px; padding:10px 12px; border:2px solid transparent; transition:all 0.2s; background:var(--gray-100); display:flex; align-items:center; gap:12px;"
                                     onclick="adminPanel.applyImageToTarget('${sourceUrl}', 'container', ${i}); document.getElementById('imageTargetModal').remove();"
                                     onmouseenter="this.style.borderColor='#9c27b0'; this.style.background='rgba(156,39,176,0.1)';"
                                     onmouseleave="this.style.borderColor='transparent'; this.style.background='var(--gray-100)';">
                                    <div style="width:40px; height:40px; border-radius:50%; background:${item.hasInitials ? '#e0e0e0' : 'var(--gold)'}; display:flex; align-items:center; justify-content:center; overflow:hidden; flex-shrink:0;">
                                        ${item.existingImg ? `<img src="${item.existingImg.src}" style="width:100%; height:100%; object-fit:cover;">` : `<i class="fas fa-user" style="color:#666;"></i>`}
                                    </div>
                                    <div style="flex:1; min-width:0;">
                                        <div style="font-size:12px; font-weight:600; color:var(--navy-dark);">${item.personName || 'Unbenannt'}</div>
                                        <div style="font-size:10px; color:var(--gray-500);">${item.hasInitials ? 'Nur Initialen - Foto hinzufügen' : item.existingImg ? 'Foto ersetzen' : 'Bild hinzufügen'}</div>
                                    </div>
                                    <i class="fas fa-chevron-right" style="color:var(--gray-400); font-size:10px;"></i>
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}

                    ${images.length > 0 ? `
                        <h4 style="margin:0 0 10px 0; color:var(--navy-dark); font-size:13px;">
                            <i class="fas fa-image" style="color:var(--gold); margin-right:8px;"></i>
                            Bestehende Bilder (${images.length})
                        </h4>
                        <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:8px; margin-bottom:20px;">
                            ${images.map((img, i) => `
                                <div class="target-image-item" data-type="img" data-index="${i}"
                                     style="cursor:pointer; border-radius:8px; overflow:hidden; border:2px solid transparent; transition:all 0.2s; background:var(--gray-100);"
                                     onclick="adminPanel.applyImageToTarget('${sourceUrl}', 'img', ${i}); document.getElementById('imageTargetModal').remove();"
                                     onmouseenter="this.style.borderColor='var(--gold)'; this.style.transform='scale(1.02)';"
                                     onmouseleave="this.style.borderColor='transparent'; this.style.transform='scale(1)';">
                                    <img src="${img.src}" style="width:100%; height:70px; object-fit:cover; display:block;">
                                    <div style="padding:6px; font-size:9px; color:var(--gray-600); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                                        ${img.alt || img.src.split('/').pop()?.substring(0,15) || 'Bild ' + (i+1)}
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}

                    ${bgElements.length > 0 ? `
                        <h4 style="margin:0 0 12px 0; color:var(--navy-dark); font-size:14px;">
                            <i class="fas fa-fill" style="color:var(--gold); margin-right:8px;"></i>
                            Bestehende Hintergrundbilder ersetzen (${bgElements.length})
                        </h4>
                        <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(140px, 1fr)); gap:12px; margin-bottom:24px;">
                            ${bgElements.map((item, i) => `
                                <div class="target-image-item" data-type="bg" data-index="${i}"
                                     style="cursor:pointer; border-radius:8px; overflow:hidden; border:2px solid transparent; transition:all 0.2s;"
                                     onclick="adminPanel.applyImageToTarget('${sourceUrl}', 'bg', ${i}); document.getElementById('imageTargetModal').remove();"
                                     onmouseenter="this.style.borderColor='var(--gold)'; this.style.transform='scale(1.02)';"
                                     onmouseleave="this.style.borderColor='transparent'; this.style.transform='scale(1)';">
                                    <div style="width:100%; height:100px; background-image:url('${item.bgUrl}'); background-size:cover; background-position:center;"></div>
                                    <div style="padding:8px; font-size:10px; color:var(--gray-600); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                                        ${item.element.className.split(' ').filter(c => c && !c.startsWith('admin-'))[0] || item.element.tagName.toLowerCase()}
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}

                    ${insertTargets.length > 0 ? `
                        <h4 style="margin:0 0 12px 0; color:var(--navy-dark); font-size:14px;">
                            <i class="fas fa-plus-circle" style="color:var(--success); margin-right:8px;"></i>
                            Neues Hintergrundbild hinzufügen zu... (${insertTargets.length} Bereiche)
                        </h4>
                        <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); gap:12px;">
                            ${insertTargets.slice(0, 20).map((item, i) => `
                                <div class="target-section-item" data-type="insert" data-index="${i}"
                                     style="cursor:pointer; border-radius:12px; overflow:hidden; border:2px dashed var(--gray-300); transition:all 0.2s; background:var(--gray-50);"
                                     onclick="adminPanel.applyImageToTarget('${sourceUrl}', 'insert', ${i}); document.getElementById('imageTargetModal').remove();"
                                     onmouseenter="this.style.borderColor='var(--success)'; this.style.background='rgba(40,167,69,0.1)'; this.style.transform='translateY(-2px)';"
                                     onmouseleave="this.style.borderColor='var(--gray-300)'; this.style.background='var(--gray-50)'; this.style.transform='translateY(0)';">
                                    <div style="width:100%; height:60px; display:flex; align-items:center; justify-content:center; background:${item.bgColor}; border-bottom:1px solid var(--gray-200); position:relative;">
                                        <i class="fas fa-plus" style="font-size:20px; color:var(--gray-400);"></i>
                                        <span style="position:absolute; top:6px; right:8px; font-size:9px; background:var(--gray-200); color:var(--gray-600); padding:2px 6px; border-radius:10px;">
                                            ${item.positionY}px
                                        </span>
                                    </div>
                                    <div style="padding:12px;">
                                        <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
                                            <span style="font-size:13px; font-weight:600; color:var(--navy-dark);">${item.name}</span>
                                            <span style="font-size:9px; background:var(--gold-light); color:var(--gold-dark); padding:2px 6px; border-radius:4px;">${item.width}×${item.height}</span>
                                        </div>
                                        ${item.description ? `
                                            <div style="font-size:11px; color:var(--gray-600); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${item.description}">
                                                <i class="fas fa-heading" style="margin-right:4px; font-size:9px;"></i>${item.description}
                                            </div>
                                        ` : `
                                            <div style="font-size:10px; color:var(--gray-400); font-style:italic;">
                                                Keine Überschrift
                                            </div>
                                        `}
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>

                <div style="padding:16px 20px; border-top:1px solid var(--gray-200); display:flex; gap:12px; justify-content:flex-end;">
                    ${isMulti ? `
                        <button onclick="adminPanel.skipCurrentImage()"
                                class="btn-secondary" style="padding:10px 20px;">
                            <i class="fas fa-forward"></i> Überspringen
                        </button>
                        <button onclick="adminPanel.closeImageTargetModal(true)"
                                class="btn-secondary" style="padding:10px 20px; background:var(--danger); color:white; border-color:var(--danger);">
                            <i class="fas fa-stop"></i> Abbrechen
                        </button>
                    ` : `
                        <button onclick="adminPanel.copyImageUrl('${sourceUrl}'); adminPanel.closeImageTargetModal()"
                                class="btn-secondary" style="padding:10px 20px;">
                            <i class="fas fa-copy"></i> URL kopieren
                        </button>
                        <button onclick="adminPanel.closeImageTargetModal()"
                                class="btn-secondary" style="padding:10px 20px;">
                            Abbrechen
                        </button>
                    `}
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Speichere die Referenzen für später
        this._targetImages = images;
        this._targetBgElements = bgElements;
        this._targetInsertElements = insertTargets;
        this._targetImageContainers = imageContainers;

        // Hover-Highlight: Beim Überfahren der Karten das Element in der Vorschau markieren
        modal.querySelectorAll('.target-section-item, .target-image-item').forEach(card => {
            card.addEventListener('mouseenter', () => {
                const type = card.dataset.type;
                const index = parseInt(card.dataset.index);
                let targetEl = null;

                if (type === 'img' && this._targetImages[index]) {
                    targetEl = this._targetImages[index];
                } else if (type === 'bg' && this._targetBgElements[index]) {
                    targetEl = this._targetBgElements[index].element;
                } else if (type === 'insert' && this._targetInsertElements[index]) {
                    targetEl = this._targetInsertElements[index].element;
                } else if (type === 'container' && this._targetImageContainers[index]) {
                    targetEl = this._targetImageContainers[index].element;
                }

                if (targetEl) {
                    // Entferne vorherige Markierung
                    doc.querySelectorAll('.admin-target-highlight').forEach(el => el.classList.remove('admin-target-highlight'));

                    // Füge Highlight-Klasse hinzu
                    targetEl.classList.add('admin-target-highlight');

                    // Scrolle zum Element
                    targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            });

            card.addEventListener('mouseleave', () => {
                doc.querySelectorAll('.admin-target-highlight').forEach(el => el.classList.remove('admin-target-highlight'));
            });
        });

        // Highlight-Style in iframe einfügen falls nicht vorhanden
        if (!doc.getElementById('admin-highlight-styles')) {
            const highlightStyle = doc.createElement('style');
            highlightStyle.id = 'admin-highlight-styles';
            highlightStyle.textContent = `
                .admin-target-highlight {
                    outline: 4px solid #28a745 !important;
                    outline-offset: 2px !important;
                    box-shadow: 0 0 20px rgba(40, 167, 69, 0.5) !important;
                    transition: all 0.3s ease !important;
                }
            `;
            doc.head.appendChild(highlightStyle);
        }
    }

    applyImageToTarget(sourceUrl, type, index) {
        const iframe = document.getElementById('websitePreview');
        if (!iframe || !iframe.contentDocument) return;

        const doc = iframe.contentDocument;

        if (type === 'img') {
            const images = Array.from(doc.querySelectorAll('img'));
            if (images[index]) {
                const targetName = images[index].alt || images[index].src.split('/').pop() || 'Bild';
                images[index].src = sourceUrl;
                this.showToast('success', 'Bild ersetzt!', 'Das Bild wurde aktualisiert');

                // Wähle das Element aus
                this.selectElement(images[index], doc);

                // Speichere die Zuordnung
                this.saveImageAssignment(sourceUrl, 'img', targetName);
            }
        } else if (type === 'bg') {
            // Finde das Element erneut
            const bgElements = [];
            doc.querySelectorAll('*').forEach(el => {
                const style = iframe.contentWindow.getComputedStyle(el);
                const bgImage = style.backgroundImage;
                if (bgImage && bgImage !== 'none' && !bgImage.includes('gradient')) {
                    bgElements.push(el);
                }
            });

            if (bgElements[index]) {
                const targetName = bgElements[index].className.split(' ').filter(c => c)[0] || 'Hintergrund';
                bgElements[index].style.backgroundImage = `url('${sourceUrl}')`;
                this.showToast('success', 'Hintergrund ersetzt!', 'Das Hintergrundbild wurde aktualisiert');

                // Wähle das Element aus
                this.selectElement(bgElements[index], doc);

                // Speichere die Zuordnung
                this.saveImageAssignment(sourceUrl, 'bg', targetName);
            }
        } else if (type === 'insert') {
            // Füge neues Hintergrundbild zu einer Sektion hinzu
            if (this._targetInsertElements && this._targetInsertElements[index]) {
                const el = this._targetInsertElements[index].element;
                el.style.backgroundImage = `url('${sourceUrl}')`;
                el.style.backgroundSize = 'cover';
                el.style.backgroundPosition = 'center';
                el.style.backgroundRepeat = 'no-repeat';

                this.showToast('success', 'Hintergrundbild hinzugefügt!', `Bild wurde zu "${this._targetInsertElements[index].name}" hinzugefügt`);

                // Wähle das Element aus
                this.selectElement(el, doc);

                // Speichere die Zuordnung
                this.saveImageAssignment(sourceUrl, 'insert', this._targetInsertElements[index].name);
            }
        } else if (type === 'container') {
            // Team/Person Bild-Container
            if (this._targetImageContainers && this._targetImageContainers[index]) {
                const container = this._targetImageContainers[index];
                const el = container.element;

                // Prüfe ob bereits ein IMG-Element existiert
                let img = el.querySelector('img');

                if (img) {
                    // Ersetze das bestehende Bild
                    img.src = sourceUrl;
                } else {
                    // Erstelle neues IMG-Element
                    img = doc.createElement('img');
                    img.src = sourceUrl;
                    img.alt = container.personName || 'Foto';
                    img.style.cssText = 'width:100%; height:100%; object-fit:cover;';

                    // Entferne Initialen falls vorhanden
                    const initials = el.querySelector('.initials, span');
                    if (initials) {
                        initials.style.display = 'none';
                    }

                    // Füge Bild ein
                    el.insertBefore(img, el.firstChild);

                    // Füge has-photo Klasse hinzu
                    el.classList.add('has-photo');
                }

                this.showToast('success', 'Foto hinzugefügt!', `Foto für "${container.personName || 'Person'}" wurde gesetzt`);
                this.selectElement(el, doc);

                // Speichere die Zuordnung
                this.saveImageAssignment(sourceUrl, 'container', container.personName || 'Person');
            }
        }

        // Bei Multi-Mode: Nächstes Bild
        if (this._imageTargetOptions && this._imageTargetOptions.multiMode) {
            this.closeImageTargetModal();
            if (this._imageTargetOptions.onComplete) {
                this._imageTargetOptions.onComplete();
            }
        } else {
            this.closeImageTargetModal();
        }
    }

    closeImageTargetModal(cancel = false) {
        const modal = document.getElementById('imageTargetModal');
        if (modal) modal.remove();

        if (cancel && this._imageTargetOptions && this._imageTargetOptions.onCancel) {
            this._imageTargetOptions.onCancel();
        }
    }

    skipCurrentImage() {
        this.closeImageTargetModal();
        if (this._imageTargetOptions && this._imageTargetOptions.onSkip) {
            this._imageTargetOptions.onSkip();
        }
    }

    // Speichere Bild-Zuordnungen
    async saveImageAssignment(imageUrl, targetType, targetName) {
        // Lade bestehende Zuordnungen
        if (!this._imageAssignments) {
            await this.loadImageAssignments();
        }

        // Füge neue Zuordnung hinzu
        this._imageAssignments[imageUrl] = {
            type: targetType,
            name: targetName,
            assignedAt: new Date().toISOString()
        };

        // Speichere in data.json
        try {
            const dataResponse = await fetch('/api/data');
            let data = {};
            if (dataResponse.ok) {
                data = await dataResponse.json();
            }

            data.imageAssignments = this._imageAssignments;

            await fetch('/api/data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            // Aktualisiere Mediathek-Anzeige
            await this.loadMediathekImages();
        } catch (error) {
            console.error('Error saving image assignment:', error);
        }
    }

    async loadImageAssignments() {
        try {
            const response = await fetch('/api/data');
            if (response.ok) {
                const data = await response.json();
                this._imageAssignments = data.imageAssignments || {};
            } else {
                this._imageAssignments = {};
            }

            // Extrahiere Bild-Zuweisungen aus den Team-Daten (aus HTML)
            if (this.data?.team) {
                const categories = ['leadership', 'ceo', 'cooRegional'];
                for (const category of categories) {
                    const members = this.data.team[category] || [];
                    for (const member of members) {
                        if (member.image && member.image.trim() !== '') {
                            // Füge Zuordnung hinzu wenn nicht bereits vorhanden
                            if (!this._imageAssignments[member.image]) {
                                this._imageAssignments[member.image] = {
                                    type: 'team',
                                    name: member.name,
                                    category: category,
                                    assignedAt: new Date().toISOString()
                                };
                            }
                        }
                    }
                }
            }

            // Extrahiere Bild-Zuweisungen aus Locations
            if (this.data?.locations) {
                for (const loc of this.data.locations) {
                    if (loc.image && loc.image.trim() !== '') {
                        if (!this._imageAssignments[loc.image]) {
                            this._imageAssignments[loc.image] = {
                                type: 'location',
                                name: loc.name || loc.city,
                                assignedAt: new Date().toISOString()
                            };
                        }
                    }
                }
            }
        } catch (error) {
            this._imageAssignments = {};
        }
    }

    async removeImageAssignment(imageUrl) {
        console.log('[removeImageAssignment] Removing:', imageUrl);

        // Lade Zuordnungen falls nicht vorhanden
        if (!this._imageAssignments) {
            await this.loadImageAssignments();
        }

        console.log('[removeImageAssignment] Current assignments:', this._imageAssignments);

        // Entferne die Zuordnung
        if (this._imageAssignments && this._imageAssignments[imageUrl]) {
            delete this._imageAssignments[imageUrl];
            console.log('[removeImageAssignment] Deleted from memory');
        } else {
            console.log('[removeImageAssignment] Not found in memory, trying to reload');
            // Versuche nochmal zu laden und zu entfernen
            await this.loadImageAssignments();
            if (this._imageAssignments && this._imageAssignments[imageUrl]) {
                delete this._imageAssignments[imageUrl];
            }
        }

        // Speichere
        try {
            const dataResponse = await fetch('/api/data');
            let data = {};
            if (dataResponse.ok) {
                data = await dataResponse.json();
            }

            data.imageAssignments = this._imageAssignments || {};

            const saveResponse = await fetch('/api/data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (saveResponse.ok) {
                this.showToast('success', 'Zuordnung entfernt', 'Das Bild ist wieder nicht zugeordnet');
            } else {
                this.showToast('error', 'Fehler', 'Konnte Zuordnung nicht entfernen');
            }

            await this.loadMediathekImages();
        } catch (error) {
            console.error('Error removing assignment:', error);
            this.showToast('error', 'Fehler', 'Konnte Zuordnung nicht entfernen');
        }
    }
}

// ============================================
// AUTHENTICATION HELPERS
// ============================================
function checkAuth() {
    const isAuthenticated = sessionStorage.getItem('iustus_admin_auth') === 'true';
    const loginOverlay = document.getElementById('loginOverlay');
    const adminContent = document.getElementById('adminContent');

    if (isAuthenticated) {
        loginOverlay.style.display = 'none';
        adminContent.style.display = 'block';
        return true;
    } else {
        loginOverlay.style.display = 'flex';
        adminContent.style.display = 'none';
        return false;
    }
}

async function handleLogin(event) {
    event.preventDefault();
    const passwordInput = document.getElementById('adminPassword');
    const errorMsg = document.getElementById('loginError');

    const result = await adminPanel.login(passwordInput.value);

    if (result.success) {
        checkAuth();
        adminPanel.init();
    } else {
        errorMsg.style.display = 'block';
        errorMsg.textContent = result.error || 'Falsches Passwort';
        passwordInput.value = '';
        passwordInput.focus();
    }
}

function logout() {
    if (adminPanel) {
        adminPanel.logout();
    }
}

// ============================================
// INITIALIZATION
// ============================================
let adminPanel;

document.addEventListener('DOMContentLoaded', () => {
    adminPanel = new AdminPanel();
    window.adminPanel = adminPanel;

    if (checkAuth()) {
        adminPanel.init();
    }

    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    // Close mobile nav dropdown when clicking outside
    document.addEventListener('click', (e) => {
        const dropdown = document.getElementById('mobileNavDropdown');
        if (dropdown && dropdown.classList.contains('open')) {
            if (!dropdown.contains(e.target)) {
                dropdown.classList.remove('open');
            }
        }
    });
});
