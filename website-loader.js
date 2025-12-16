/**
 * Website Content Loader - Iustus Mercatura
 * Lädt Inhalte von der API oder als Fallback aus LocalStorage
 */

(function() {
    'use strict';

    // ============================================
    // CONFIGURATION - Hier wird die API konfiguriert
    // ============================================
    const CONFIG = {
        // API Einstellungen
        API_URL: window.CMS_API_URL || window.location.origin,
        SITE_ID: window.CMS_SITE_ID || null,

        // Fallback auf LocalStorage wenn API nicht erreichbar
        FALLBACK_TO_LOCALSTORAGE: true,
        STORAGE_KEY: 'iustus_website_content',

        // Debug
        DEBUG: false
    };

    function log(...args) {
        if (CONFIG.DEBUG) console.log('[WebsiteLoader]', ...args);
    }

    // ============================================
    // DATA LOADER - API mit LocalStorage Fallback
    // ============================================
    async function loadData() {
        // Versuche zuerst von API zu laden
        if (CONFIG.SITE_ID) {
            try {
                log('Loading from API...');
                const response = await fetch(`${CONFIG.API_URL}/api/sites/${CONFIG.SITE_ID}/public`);

                if (response.ok) {
                    const data = await response.json();
                    log('API data loaded:', data);

                    // Cache in LocalStorage für Offline-Zugriff
                    try {
                        localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(data));
                    } catch (e) {}

                    return data;
                }
            } catch (error) {
                log('API not reachable, trying fallback:', error.message);
            }
        }

        // Fallback: LocalStorage
        if (CONFIG.FALLBACK_TO_LOCALSTORAGE) {
            try {
                const stored = localStorage.getItem(CONFIG.STORAGE_KEY);
                if (stored) {
                    const data = JSON.parse(stored);
                    log('LocalStorage data loaded:', data);
                    return data;
                }
            } catch (e) {
                console.error('Error loading from LocalStorage:', e);
            }
        }

        log('No data available');
        return null;
    }

    // ============================================
    // UTILITY FUNCTIONS
    // ============================================
    function setText(selector, text) {
        const el = document.querySelector(selector);
        if (el && text !== undefined && text !== null && text !== '') {
            el.textContent = text;
        }
    }

    function setHTML(selector, html) {
        const el = document.querySelector(selector);
        if (el && html !== undefined && html !== null) {
            el.innerHTML = html;
        }
    }

    // ============================================
    // SECTION UPDATERS
    // ============================================

    function updateHeroSection(content) {
        if (!content?.hero) return;
        const hero = content.hero;

        const heroLabel = document.querySelector('.hero-label');
        if (heroLabel && hero.label) {
            const iconSpan = heroLabel.querySelector('.label-icon');
            heroLabel.innerHTML = '';
            if (iconSpan) heroLabel.appendChild(iconSpan);
            heroLabel.appendChild(document.createTextNode(' ' + hero.label));
        }

        const titleLines = document.querySelectorAll('.hero-title .title-line');
        if (titleLines.length >= 3) {
            if (hero.titleLine1) titleLines[0].textContent = hero.titleLine1;
            if (hero.titleLine2) titleLines[1].textContent = hero.titleLine2;
            if (hero.titleLine3) titleLines[2].textContent = hero.titleLine3;
        }

        setText('.hero-description', hero.description);

        const buttons = document.querySelectorAll('.hero-buttons .btn');
        if (buttons.length >= 2) {
            if (hero.button1) {
                const icon1 = buttons[0].querySelector('.btn-icon');
                buttons[0].innerHTML = hero.button1;
                if (icon1) buttons[0].appendChild(icon1);
            }
            if (hero.button2) {
                const icon2 = buttons[1].querySelector('.btn-icon');
                buttons[1].innerHTML = hero.button2;
                if (icon2) buttons[1].appendChild(icon2);
            }
        }

        const statItems = document.querySelectorAll('.hero-stats .stat-item');
        if (statItems.length >= 3) {
            updateStat(statItems[0], hero.stat1Value, hero.stat1Suffix, hero.stat1Label);
            updateStat(statItems[1], hero.stat2Value, hero.stat2Suffix, hero.stat2Label);
            updateStat(statItems[2], hero.stat3Value, hero.stat3Suffix, hero.stat3Label);
        }
    }

    function updateStat(statItem, value, suffix, label) {
        const number = statItem.querySelector('.stat-number');
        const suffixEl = statItem.querySelector('.stat-suffix');
        const labelEl = statItem.querySelector('.stat-label');
        if (number && value) number.setAttribute('data-count', value);
        if (suffixEl && suffix !== undefined) suffixEl.textContent = suffix;
        if (labelEl && label) labelEl.textContent = label;
    }

    function updateAboutSection(content) {
        if (!content?.about) return;
        const about = content.about;

        setText('#about .section-label', about.sectionLabel);

        const aboutTitle = document.querySelector('#about .section-title');
        if (aboutTitle && about.title) {
            aboutTitle.innerHTML = about.title.replace(/(Just Trade)/gi, '<span class="highlight">$1</span>');
        }

        setText('#about .about-text .lead', about.leadText);
        const descP = document.querySelector('#about .about-text > p:not(.lead)');
        if (descP && about.description) descP.textContent = about.description;

        const features = document.querySelectorAll('#about .feature-item');
        if (features.length >= 3) {
            updateFeature(features[0], about.feature1Title, about.feature1Desc);
            updateFeature(features[1], about.feature2Title, about.feature2Desc);
            updateFeature(features[2], about.feature3Title, about.feature3Desc);
        }

        setText('#about .card-year', about.cardYear);
        setText('#about .main-card h3', about.cardTitle);
        setText('#about .main-card .card-content p', about.cardDesc);
    }

    function updateFeature(featureEl, title, desc) {
        const text = featureEl.querySelector('.feature-text');
        if (text) {
            const h4 = text.querySelector('h4');
            const p = text.querySelector('p');
            if (h4 && title) h4.textContent = title;
            if (p && desc) p.textContent = desc;
        }
    }

    function updateCEOSection(content) {
        if (!content?.ceo) return;
        const ceo = content.ceo;

        setText('.ceo-section .section-label', ceo.sectionLabel);

        const quote = document.querySelector('.ceo-quote');
        if (quote && ceo.quote) {
            quote.textContent = `"${ceo.quote}"`;
        }

        setText('.ceo-info h4', ceo.name);
        setText('.ceo-info span', ceo.role);

        const initials = document.querySelector('.ceo-section .initials');
        if (initials && ceo.name) {
            const nameParts = ceo.name.replace(/^(Dr\.|Mr\.|Mrs\.|Ms\.|LLM|Lic\. jur\.)\s*/i, '').split(' ');
            initials.textContent = nameParts.map(p => p.charAt(0)).join('').substring(0, 2).toUpperCase();
        }
    }

    function updateProductsSection(content, products) {
        if (!content?.products) return;

        setText('#products .section-label', content.products.sectionLabel);

        const productsTitle = document.querySelector('#products .section-title');
        if (productsTitle && content.products.title) {
            productsTitle.innerHTML = content.products.title.replace(/(Brazilian Commodities|Commodities)/gi, '<span class="highlight">$1</span>');
        }

        setText('#products .section-desc', content.products.description);

        if (products && products.length > 0) {
            updateProductCards(products);
        }
    }

    function updateProductCards(products) {
        const cards = document.querySelectorAll('.product-card');

        products.forEach((product, index) => {
            if (cards[index]) {
                const card = cards[index];
                setText('.product-content h3', product.name);
                const descEl = card.querySelector('.product-content > p');
                if (descEl) descEl.textContent = product.description;

                if (product.specs) {
                    const specsList = card.querySelector('.product-specs');
                    if (specsList) {
                        const specItems = specsList.querySelectorAll('li');
                        Object.entries(product.specs).forEach(([key, value], i) => {
                            if (specItems[i]) {
                                const label = key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1');
                                specItems[i].innerHTML = `<span>${label}:</span> ${value}`;
                            }
                        });
                    }
                }

                card.classList.toggle('featured', product.featured === true);
            }
        });
    }

    function updateLocationsSection(content, locations) {
        setText('#locations .section-label', content?.locations?.sectionLabel);

        if (!locations || locations.length === 0) return;

        const locationsList = document.querySelector('.locations-list');
        if (!locationsList) return;

        locationsList.innerHTML = locations.map(loc => `
            <div class="location-card" data-location="${loc.dataLocation || loc.country.toLowerCase().replace(/\s+/g, '')}" title="${loc.address || ''}">
                <div class="location-flag">${loc.flag || ''}</div>
                <div class="location-info">
                    <h4>${getLocationTitle(loc)}</h4>
                    <p>${loc.city}</p>
                    <span class="location-type">${loc.type}</span>
                </div>
            </div>
        `).join('');

        bindLocationCards();
    }

    function getLocationTitle(loc) {
        const titles = {
            'British Virgin Islands': 'Head Office',
            'United States': 'USA Operations',
            'Brazil': 'Brazil Operations',
            'UAE': 'UAE Office',
            'United Kingdom': 'UK Operations',
            'Uganda': 'Uganda Operations',
            'Kenya': 'Kenya Operations'
        };
        return titles[loc.country] || `${loc.country} Office`;
    }

    function bindLocationCards() {
        const cards = document.querySelectorAll('.location-card');
        const markers = document.querySelectorAll('.location-marker');

        cards.forEach(card => {
            card.addEventListener('mouseenter', () => {
                const location = card.dataset.location;
                markers.forEach(marker => {
                    marker.classList.toggle('active', marker.dataset.location === location);
                });
            });
            card.addEventListener('mouseleave', () => {
                markers.forEach(marker => marker.classList.remove('active'));
            });
        });
    }

    function updateTeamSection(team) {
        if (!team) return;

        const grids = {
            leadership: document.getElementById('teamLeadershipGrid'),
            ceo: document.getElementById('teamCEOGrid'),
            cooRegional: document.getElementById('teamCOOGrid')
        };

        if (team.leadership && grids.leadership) updateTeamGrid(grids.leadership, team.leadership);
        if (team.ceo && grids.ceo) updateTeamGrid(grids.ceo, team.ceo);
        if (team.cooRegional && grids.cooRegional) updateTeamGrid(grids.cooRegional, team.cooRegional);
    }

    function updateTeamGrid(grid, members) {
        if (!members || members.length === 0) return;

        grid.innerHTML = members.map(member => createTeamCardHTML(member)).join('');

        grid.className = grid.className.replace(/team-grid-\d+/g, '');
        grid.classList.add('team-grid');
        if (members.length <= 2) grid.classList.add('team-grid-2');
        else if (members.length <= 4) grid.classList.add('team-grid-4');
        else grid.classList.add('team-grid-5');
    }

    function createTeamCardHTML(member) {
        const initials = member.initials || getInitials(member.name);
        const hasPhoto = member.image && member.image !== 'assets/images/placeholder.jpg';

        return `
            <div class="team-card-flip">
                <div class="team-card-inner">
                    <div class="team-card-front">
                        <div class="team-image ${hasPhoto ? 'has-photo' : ''}">
                            ${hasPhoto
                                ? `<img src="${member.image}" alt="${member.name}" onerror="this.parentElement.classList.remove('has-photo');this.outerHTML='<span class=\\'initials\\'>${initials}</span>'">`
                                : `<span class="initials">${initials}</span>`
                            }
                        </div>
                        <h4>${member.name}</h4>
                        <span class="role">${member.role}</span>
                    </div>
                    <div class="team-card-back">
                        <div class="back-content">
                            <h4>${member.name}</h4>
                            <span class="role">${member.role}</span>
                            <p>${member.description || ''}</p>
                            ${member.linkedin ? `
                                <a href="${member.linkedin}" target="_blank" rel="noopener noreferrer" class="linkedin-btn">
                                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                                    LinkedIn
                                </a>
                            ` : ''}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    function getInitials(name) {
        if (!name) return '??';
        const cleaned = name.replace(/^(Dr\.|Mr\.|Mrs\.|Ms\.|LLM|Lic\. jur\.|Eng\.)\s*/gi, '');
        return cleaned.split(' ').filter(p => p.length > 0).map(p => p.charAt(0)).join('').substring(0, 2).toUpperCase();
    }

    function updateContactSection(content, config) {
        if (!content?.contact) return;
        const contact = content.contact;

        setText('#contact .section-label', contact.sectionLabel);

        const contactTitle = document.querySelector('#contact .section-title');
        if (contactTitle && contact.title) {
            contactTitle.innerHTML = contact.title.replace(/(Together)/gi, '<span class="highlight">$1</span>');
        }

        setText('.contact-intro', contact.description);

        const email = contact.email || config?.contact?.email;
        const phone = contact.phone || config?.contact?.phone;

        const emailLink = document.querySelector('.contact-details .contact-item:first-child a');
        if (emailLink && email) {
            emailLink.href = `mailto:${email}`;
            emailLink.textContent = email;
        }

        const phoneLink = document.querySelector('.contact-details .contact-item:nth-child(2) a');
        if (phoneLink && phone) {
            phoneLink.href = `tel:${phone.replace(/\s+/g, '')}`;
            phoneLink.textContent = phone;
        }
    }

    function updateFooterSection(content, config) {
        if (!content?.footer) return;

        setText('.footer-tagline', content.footer.tagline);
        setText('.footer-bottom p', content.footer.copyright);

        if (config?.contact?.email) {
            const footerEmail = document.querySelector('.footer-contact-info a[href^="mailto:"]');
            if (footerEmail) {
                footerEmail.href = `mailto:${config.contact.email}`;
                const svg = footerEmail.querySelector('svg');
                footerEmail.innerHTML = '';
                if (svg) footerEmail.appendChild(svg);
                footerEmail.appendChild(document.createTextNode(' ' + config.contact.email));
            }
        }
    }

    // ============================================
    // MAIN INITIALIZATION
    // ============================================
    async function init() {
        const data = await loadData();

        if (!data) {
            log('No data available, using default content');
            return;
        }

        log('Applying data to website...');

        updateHeroSection(data.content);
        updateAboutSection(data.content);
        updateCEOSection(data.content);
        updateProductsSection(data.content, data.products);
        updateLocationsSection(data.content, data.locations);
        updateTeamSection(data.team);
        updateContactSection(data.content, data.config);
        updateFooterSection(data.content, data.config);

        log('Website content updated successfully');
        window.dispatchEvent(new CustomEvent('websiteContentLoaded', { detail: data }));
    }

    // Run when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Expose for manual refresh
    window.refreshWebsiteContent = init;

    // Listen for storage changes (for backwards compatibility)
    window.addEventListener('storage', (e) => {
        if (e.key === CONFIG.STORAGE_KEY) {
            log('Storage change detected - refreshing content');
            init();
        }
    });

})();
