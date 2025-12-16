/**
 * Server Analytics System - DSGVO-konform
 */
class ServerAnalytics {
    constructor() {
        this.data = { visitors: [], requests: [], errors: [], security: [], performance: [] };
        this.config = { maxEntries: 10000, suspiciousThreshold: 50, retentionDays: 30 };
        this.filters = { dateFrom: null, dateTo: null, type: 'all', severity: 'all', search: '' };
        this.errorSolutions = this.initErrorSolutions();
        this.securityPatterns = this.initSecurityPatterns();
        this.init();
    }

    init() {
        this.loadData();
        this.interceptRequests();
        this.interceptErrors();
        this.startPerformanceMonitoring();
        this.trackVisitor();
        this.cleanOldData();
    }

    async trackVisitor() {
        const visitorId = this.getOrCreateVisitorId();
        const sessionId = this.getOrCreateSessionId();
        this.addEntry('visitors', {
            id: visitorId, sessionId, timestamp: new Date().toISOString(),
            page: window.location.pathname, referrer: document.referrer || 'Direktzugriff',
            userAgent: this.parseUserAgent(navigator.userAgent),
            screenSize: window.screen.width + 'x' + window.screen.height,
            language: navigator.language,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            geo: { region: Intl.DateTimeFormat().resolvedOptions().timeZone.split('/')[0] }
        });
    }

    getOrCreateVisitorId() {
        let id = localStorage.getItem('analytics_visitor_id');
        if (\!id) { id = 'v_' + this.generateId(); localStorage.setItem('analytics_visitor_id', id); }
        return id;
    }

    getOrCreateSessionId() {
        let s = sessionStorage.getItem('analytics_session');
        if (\!s) { s = 's_' + this.generateId(); sessionStorage.setItem('analytics_session', s); }
        return s;
    }

    parseUserAgent(ua) {
        let browser = 'Unbekannt', os = 'Unbekannt', device = 'Desktop';
        if (ua.includes('Firefox')) browser = 'Firefox';
        else if (ua.includes('Edg')) browser = 'Edge';
        else if (ua.includes('Chrome')) browser = 'Chrome';
        else if (ua.includes('Safari')) browser = 'Safari';
        if (ua.includes('Windows')) os = 'Windows';
        else if (ua.includes('Mac')) os = 'macOS';
        else if (ua.includes('Linux')) os = 'Linux';
        else if (ua.includes('Android')) os = 'Android';
        else if (ua.includes('iOS') || ua.includes('iPhone')) os = 'iOS';
        if (ua.includes('Mobile')) device = 'Mobile';
        else if (ua.includes('Tablet')) device = 'Tablet';
        return { browser, os, device };
    }

    interceptRequests() {
        const self = this, originalFetch = window.fetch;
        window.fetch = async function(...args) {
            const startTime = performance.now();
            const url = args[0] && args[0].url ? args[0].url : args[0];
            const method = args[1] && args[1].method ? args[1].method : 'GET';
            try {
                const response = await originalFetch.apply(this, args);
                self.logRequest({ url, method, status: response.status, duration: Math.round(performance.now() - startTime), success: response.ok, timestamp: new Date().toISOString() });
                self.checkRequestSecurity(url);
                return response;
            } catch (error) {
                self.logRequest({ url, method, status: 0, duration: Math.round(performance.now() - startTime), success: false, error: error.message, timestamp: new Date().toISOString() });
                self.logError({ type: 'network', message: 'Netzwerkfehler: ' + error.message, url, timestamp: new Date().toISOString() });
                throw error;
            }
        };
    }

    logRequest(req) {
        this.addEntry('requests', req);
        if (req.duration > 3000) {
            this.addEntry('performance', { type: 'slowRequest', url: req.url, duration: req.duration, timestamp: new Date().toISOString() });
        }
    }

    interceptErrors() {
        const self = this;
        window.addEventListener('error', function(e) {
            self.logError({ type: 'javascript', message: e.message, filename: e.filename, line: e.lineno, stack: e.error ? e.error.stack : null, timestamp: new Date().toISOString() });
        });
        window.addEventListener('unhandledrejection', function(e) {
            self.logError({ type: 'promise', message: e.reason && e.reason.message ? e.reason.message : String(e.reason), stack: e.reason ? e.reason.stack : null, timestamp: new Date().toISOString() });
        });
    }

    logError(error) {
        error.solutions = this.findSolutions(error);
        error.severity = this.calculateSeverity(error);
        error.id = 'err_' + this.generateId();
        this.addEntry('errors', error);
        if (error.severity === 'critical' && window.showToast) {
            window.showToast('Kritischer Fehler: ' + error.message, 'error');
        }
    }

    initErrorSolutions() {
        return {
            'Failed to fetch': { title: 'Netzwerkfehler', solutions: ['Internetverbindung pruefen', 'Server erreichbar?', 'CORS pruefen'], severity: 'high' },
            'is not defined': { title: 'Variable undefiniert', solutions: ['Scripts geladen?', 'Ladereihenfolge pruefen'], severity: 'medium' },
            'is not a function': { title: 'Keine Funktion', solutions: ['Objekt initialisiert?', 'Methode existiert?'], severity: 'medium' },
            'Cannot read prop': { title: 'Null-Zugriff', solutions: ['Objekt existiert?', 'Optional chaining nutzen'], severity: 'medium' },
            '401': { title: 'Nicht autorisiert', solutions: ['API-Token pruefen', 'Token abgelaufen?'], severity: 'high' },
            '403': { title: 'Zugriff verweigert', solutions: ['Berechtigungen pruefen'], severity: 'high' },
            '404': { title: 'Nicht gefunden', solutions: ['URL korrekt?'], severity: 'medium' },
            '500': { title: 'Serverfehler', solutions: ['Server-Problem', 'Spaeter versuchen'], severity: 'critical' },
            'CORS': { title: 'CORS-Fehler', solutions: ['CORS-Header fehlen'], severity: 'high' }
        };
    }

    findSolutions(error) {
        var msg = (error.message || '').toLowerCase();
        for (var pattern in this.errorSolutions) {
            if (msg.includes(pattern.toLowerCase())) return [this.errorSolutions[pattern]];
        }
        return [{ title: 'Allgemeiner Fehler', solutions: ['Konsole pruefen', 'Seite neu laden'], severity: 'low' }];
    }

    calculateSeverity(error) {
        if (error.solutions && error.solutions[0] && error.solutions[0].severity === 'critical') return 'critical';
        if (error.type === 'network') return 'critical';
        if (error.solutions && error.solutions[0] && error.solutions[0].severity === 'high') return 'high';
        return 'medium';
    }

    initSecurityPatterns() {
        return {
            sqlInjection: { patterns: [/(union|select|insert|delete|drop)/i], severity: 'critical', description: 'SQL Injection Versuch' },
            xss: { patterns: [/<script/i, /javascript:/i, /on\w+=/i], severity: 'critical', description: 'XSS Versuch' },
            pathTraversal: { patterns: [/\.\.\//], severity: 'high', description: 'Path Traversal Versuch' }
        };
    }

    checkRequestSecurity(url) {
        var u = String(url);
        for (var type in this.securityPatterns) {
            var check = this.securityPatterns[type];
            for (var i = 0; i < check.patterns.length; i++) {
                if (check.patterns[i].test(u)) {
                    this.addEntry('security', { type: type, severity: check.severity, description: check.description, url: u, id: 'sec_' + this.generateId(), timestamp: new Date().toISOString() });
                    if (window.showToast) window.showToast('Sicherheitswarnung: ' + check.description, 'warning');
                    return;
                }
            }
        }
        var recent = this.data.requests.filter(function(r) { return new Date(r.timestamp).getTime() > Date.now() - 60000; });
        if (recent.length > this.config.suspiciousThreshold) {
            this.addEntry('security', { type: 'ddos', severity: 'high', description: 'Hohe Anfragerate: ' + recent.length + '/min', id: 'sec_' + this.generateId(), timestamp: new Date().toISOString() });
        }
    }

    startPerformanceMonitoring() {
        var self = this;
        window.addEventListener('load', function() {
            setTimeout(function() {
                var p = performance.getEntriesByType('navigation')[0];
                if (p) {
                    self.addEntry('performance', {
                        type: 'pageLoad',
                        ttfb: Math.round(p.responseStart - p.requestStart),
                        fullLoad: Math.round(p.loadEventEnd - p.navigationStart),
                        timestamp: new Date().toISOString()
                    });
                }
            }, 100);
        });
    }

    addEntry(cat, entry) {
        this.data[cat].unshift(entry);
        if (this.data[cat].length > this.config.maxEntries) {
            this.data[cat] = this.data[cat].slice(0, this.config.maxEntries);
        }
        this.saveData();
        this.notifyDashboard();
    }

    saveData() {
        try {
            localStorage.setItem('server_analytics', JSON.stringify({
                visitors: this.data.visitors.slice(0, 1000),
                requests: this.data.requests.slice(0, 2000),
                errors: this.data.errors.slice(0, 500),
                security: this.data.security.slice(0, 500),
                performance: this.data.performance.slice(0, 500),
                lastSaved: new Date().toISOString()
            }));
        } catch (e) {}
    }

    loadData() {
        try {
            var s = localStorage.getItem('server_analytics');
            if (s) {
                var parsed = JSON.parse(s);
                this.data = {
                    visitors: parsed.visitors || [],
                    requests: parsed.requests || [],
                    errors: parsed.errors || [],
                    security: parsed.security || [],
                    performance: parsed.performance || []
                };
            }
        } catch (e) {}
    }

    cleanOldData() {
        var cutoff = Date.now() - this.config.retentionDays * 86400000;
        var self = this;
        Object.keys(this.data).forEach(function(k) {
            if (Array.isArray(self.data[k])) {
                self.data[k] = self.data[k].filter(function(e) { return new Date(e.timestamp).getTime() > cutoff; });
            }
        });
        this.saveData();
    }

    setFilter(name, val) { this.filters[name] = val; }

    getFilteredData(cat) {
        var d = this.data[cat] ? this.data[cat].slice() : [];
        var self = this;
        if (this.filters.dateFrom) d = d.filter(function(e) { return new Date(e.timestamp) >= new Date(self.filters.dateFrom); });
        if (this.filters.dateTo) d = d.filter(function(e) { return new Date(e.timestamp) <= new Date(self.filters.dateTo); });
        if (this.filters.type !== 'all') d = d.filter(function(e) { return e.type === self.filters.type; });
        if (this.filters.severity !== 'all') d = d.filter(function(e) { return e.severity === self.filters.severity; });
        if (this.filters.search) d = d.filter(function(e) { return JSON.stringify(e).toLowerCase().includes(self.filters.search.toLowerCase()); });
        return d;
    }

    getStats() {
        var today = new Date().setHours(0,0,0,0);
        var week = Date.now() - 604800000;
        var self = this;
        return {
            visitors: {
                total: this.data.visitors.length,
                today: this.data.visitors.filter(function(v) { return new Date(v.timestamp) >= today; }).length,
                thisWeek: this.data.visitors.filter(function(v) { return new Date(v.timestamp).getTime() >= week; }).length,
                unique: new Set(this.data.visitors.map(function(v) { return v.id; })).size,
                byDevice: this.groupBy(this.data.visitors, function(v) { return v.userAgent ? v.userAgent.device : null; }),
                byBrowser: this.groupBy(this.data.visitors, function(v) { return v.userAgent ? v.userAgent.browser : null; }),
                topPages: this.getTopItems(this.data.visitors, 'page', 10)
            },
            requests: {
                total: this.data.requests.length,
                success: this.data.requests.filter(function(r) { return r.success; }).length,
                failed: this.data.requests.filter(function(r) { return \!r.success; }).length,
                avgDuration: this.avg(this.data.requests.map(function(r) { return r.duration; }))
            },
            errors: {
                total: this.data.errors.length,
                today: this.data.errors.filter(function(e) { return new Date(e.timestamp) >= today; }).length,
                bySeverity: this.groupBy(this.data.errors, function(e) { return e.severity; }),
                recent: this.data.errors.slice(0, 10)
            },
            security: {
                total: this.data.security.length,
                threats: this.data.security.filter(function(s) { return s.severity === 'critical'; }).length,
                byType: this.groupBy(this.data.security, function(s) { return s.type; }),
                recent: this.data.security.slice(0, 10)
            },
            performance: {
                avgPageLoad: this.avg(this.data.performance.filter(function(p) { return p.type === 'pageLoad'; }).map(function(p) { return p.fullLoad; })),
                slowRequests: this.data.performance.filter(function(p) { return p.type === 'slowRequest'; }).length
            }
        };
    }

    groupBy(arr, fn) {
        var g = {};
        arr.forEach(function(i) { var k = fn(i) || 'unbekannt'; g[k] = (g[k] || 0) + 1; });
        return g;
    }

    getTopItems(arr, f, n) {
        var c = {};
        arr.forEach(function(i) { c[i[f]] = (c[i[f]] || 0) + 1; });
        return Object.entries(c).sort(function(a, b) { return b[1] - a[1]; }).slice(0, n).map(function(x) { return { name: x[0], count: x[1] }; });
    }

    avg(nums) { return nums.length ? Math.round(nums.reduce(function(a, b) { return a + b; }, 0) / nums.length) : 0; }

    exportData(format, category) {
        format = format || 'json';
        category = category || 'all';
        var data = category === 'all' ? this.data : {};
        if (category \!== 'all') data[category] = this.data[category];
        var stats = this.getStats();
        var self = this;

        if (format === 'json') {
            var blob = new Blob([JSON.stringify({ exportDate: new Date().toISOString(), statistics: stats, data: data }, null, 2)], { type: 'application/json' });
            this.download(blob, 'analytics_' + new Date().toISOString().split('T')[0] + '.json');
        } else if (format === 'csv') {
            var csv = '';
            Object.keys(data).forEach(function(k) {
                var v = data[k];
                if (\!v || \!v.length) return;
                csv += '\n=== ' + k.toUpperCase() + ' ===\n';
                csv += Object.keys(v[0]).join(';') + '\n';
                v.forEach(function(e) {
                    csv += Object.values(e).map(function(x) { return typeof x === 'object' ? JSON.stringify(x) : String(x || ''); }).join(';') + '\n';
                });
            });
            self.download(new Blob([csv], { type: 'text/csv;charset=utf-8' }), 'analytics_' + new Date().toISOString().split('T')[0] + '.csv');
        }
    }

    download(blob, name) {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
    }

    generateId() { return Date.now().toString(36) + Math.random().toString(36).substr(2, 9); }

    notifyDashboard() {
        window.dispatchEvent(new CustomEvent('analytics-update', { detail: this.getStats() }));
    }

    clearData(cat) {
        cat = cat || 'all';
        if (cat === 'all') this.data = { visitors: [], requests: [], errors: [], security: [], performance: [] };
        else if (this.data[cat]) this.data[cat] = [];
        this.saveData();
    }

    getRecentErrors(n) { return this.data.errors.slice(0, n || 10); }
    getRecentSecurityEvents(n) { return this.data.security.slice(0, n || 10); }
    getErrorWithSolutions(errorId) { return this.data.errors.find(function(e) { return e.id === errorId; }); }
}

window.serverAnalytics = new ServerAnalytics();
console.log('[ServerAnalytics] System geladen - DSGVO-konform');
