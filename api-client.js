/**
 * CMS API Client
 * Wird von Website, Kunden-Admin und Dev-Admin genutzt
 *
 * Einbinden: <script src="https://api.example.com/client/api-client.js"></script>
 * Oder kopieren in das jeweilige Projekt
 */

const CmsApi = {
  // Konfiguration - wird beim Init gesetzt
  baseUrl: window.location.origin,
  siteId: null,
  token: null,

  /**
   * Initialisierung
   * @param {Object} config - { baseUrl, siteId, token }
   */
  init(config) {
    if (config.baseUrl) this.baseUrl = config.baseUrl.replace(/\/$/, '');
    if (config.siteId) this.siteId = config.siteId;
    if (config.token) this.token = config.token;
    console.log('[CmsApi] Initialized:', { baseUrl: this.baseUrl, siteId: this.siteId });
  },

  /**
   * HTTP Request Helper
   */
  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      return data;
    } catch (error) {
      console.error('[CmsApi] Request failed:', endpoint, error);
      throw error;
    }
  },

  // ============================================
  // AUTH
  // ============================================

  /**
   * Dev-Admin Login
   */
  async loginDev(username, password) {
    const result = await this.request('/api/auth/dev', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    if (result.token) {
      this.token = result.token;
    }
    return result;
  },

  /**
   * Site-Admin Login
   */
  async loginSite(siteId, password) {
    const result = await this.request(`/api/auth/site/${siteId}`, {
      method: 'POST',
      body: JSON.stringify({ password })
    });
    if (result.token) {
      this.token = result.token;
      this.siteId = siteId;
    }
    return result;
  },

  /**
   * Logout
   */
  logout() {
    this.token = null;
    this.siteId = null;
  },

  // ============================================
  // SITES - Für Website (öffentlich)
  // ============================================

  /**
   * Öffentliche Site-Daten laden (für Website)
   */
  async getPublicSiteData(siteId = null) {
    const id = siteId || this.siteId;
    if (!id) throw new Error('Site ID required');
    return this.request(`/api/sites/${id}/public`);
  },

  /**
   * Site by Domain laden
   */
  async getSiteByDomain(domain) {
    return this.request(`/api/sites/domain/${domain}`);
  },

  // ============================================
  // SITES - Für Admin (authentifiziert)
  // ============================================

  /**
   * Alle Sites laden (nur Dev-Admin)
   */
  async getAllSites() {
    return this.request('/api/sites');
  },

  /**
   * Site Details laden
   */
  async getSite(siteId = null) {
    const id = siteId || this.siteId;
    if (!id) throw new Error('Site ID required');
    return this.request(`/api/sites/${id}`);
  },

  /**
   * Neue Site erstellen
   */
  async createSite(siteData) {
    return this.request('/api/sites', {
      method: 'POST',
      body: JSON.stringify(siteData)
    });
  },

  /**
   * Site komplett aktualisieren
   */
  async updateSite(siteId, siteData) {
    return this.request(`/api/sites/${siteId}`, {
      method: 'PUT',
      body: JSON.stringify(siteData)
    });
  },

  /**
   * Site löschen
   */
  async deleteSite(siteId) {
    return this.request(`/api/sites/${siteId}`, {
      method: 'DELETE'
    });
  },

  // ============================================
  // CONTENT
  // ============================================

  /**
   * Content aktualisieren
   */
  async updateContent(content, siteId = null) {
    const id = siteId || this.siteId;
    if (!id) throw new Error('Site ID required');
    return this.request(`/api/sites/${id}/content`, {
      method: 'PATCH',
      body: JSON.stringify(content)
    });
  },

  // ============================================
  // TEAM
  // ============================================

  /**
   * Team aktualisieren
   */
  async updateTeam(team, siteId = null) {
    const id = siteId || this.siteId;
    if (!id) throw new Error('Site ID required');
    return this.request(`/api/sites/${id}/team`, {
      method: 'PATCH',
      body: JSON.stringify(team)
    });
  },

  // ============================================
  // PRODUCTS
  // ============================================

  /**
   * Produkte aktualisieren
   */
  async updateProducts(products, siteId = null) {
    const id = siteId || this.siteId;
    if (!id) throw new Error('Site ID required');
    return this.request(`/api/sites/${id}/products`, {
      method: 'PATCH',
      body: JSON.stringify(products)
    });
  },

  // ============================================
  // LOCATIONS
  // ============================================

  /**
   * Standorte aktualisieren
   */
  async updateLocations(locations, siteId = null) {
    const id = siteId || this.siteId;
    if (!id) throw new Error('Site ID required');
    return this.request(`/api/sites/${id}/locations`, {
      method: 'PATCH',
      body: JSON.stringify(locations)
    });
  },

  // ============================================
  // CONFIG
  // ============================================

  /**
   * Konfiguration aktualisieren
   */
  async updateConfig(config, siteId = null) {
    const id = siteId || this.siteId;
    if (!id) throw new Error('Site ID required');
    return this.request(`/api/sites/${id}/config`, {
      method: 'PATCH',
      body: JSON.stringify(config)
    });
  },

  // ============================================
  // TEMPLATES
  // ============================================

  /**
   * Alle Templates laden
   */
  async getTemplates() {
    return this.request('/api/templates');
  },

  /**
   * Template laden
   */
  async getTemplate(templateId) {
    return this.request(`/api/templates/${templateId}`);
  },

  /**
   * Template erstellen
   */
  async createTemplate(templateData) {
    return this.request('/api/templates', {
      method: 'POST',
      body: JSON.stringify(templateData)
    });
  },

  /**
   * Site aus Template erstellen
   */
  async createSiteFromTemplate(templateId, siteData) {
    return this.request(`/api/templates/${templateId}/use`, {
      method: 'POST',
      body: JSON.stringify(siteData)
    });
  }
};

// Global verfügbar machen
if (typeof window !== 'undefined') {
  window.CmsApi = CmsApi;
}

// Für ES Modules
if (typeof module !== 'undefined') {
  module.exports = CmsApi;
}
