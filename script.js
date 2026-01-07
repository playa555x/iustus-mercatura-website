/**
 * Iustus Mercatura - Interactive Website Script
 * Three.js 3D Globe, GSAP Animations, Sugar Particle Effects
 */

// ============================================
// COMMODITY TICKER - Live Sugar IC45 Price
// ============================================
async function updateCommodityTicker() {
    const priceEl = document.getElementById('sugarPrice');
    const changeEl = document.getElementById('sugarChange');

    if (!priceEl || !changeEl) return;

    // Helper function to update the display
    const updateDisplay = (price, changePercent, isPositive) => {
        priceEl.textContent = '$' + price;
        changeEl.textContent = (isPositive ? '+' : '') + changePercent + '%';
        changeEl.className = 'ticker-change ' + (isPositive ? 'positive' : 'negative');
    };

    // Helper to check if we're on a dev server
    const isDevServer = () => {
        const hostname = window.location.hostname;
        return hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.');
    };

    try {
        // Always try our API first (works both in dev and production)
        const response = await fetch('/api/commodity-price');

        if (response.ok) {
            const data = await response.json();
            if (data.price) {
                updateDisplay(data.price, data.change, data.direction === 'positive');
                return;
            }
        }
    } catch (e) {
        // Server API failed, try fallback
    }

    // Fallback: Direct Yahoo Finance via CORS proxy (only for static hosting without backend)
    try {
        const proxyUrl = 'https://api.allorigins.win/raw?url=' + encodeURIComponent('https://query1.finance.yahoo.com/v8/finance/chart/SB=F?interval=1d&range=2d');
        const response = await fetch(proxyUrl);

        if (response.ok) {
            const data = await response.json();
            const result = data.chart?.result?.[0];

            if (result) {
                const meta = result.meta;
                const currentPrice = meta.regularMarketPrice;
                const previousClose = meta.chartPreviousClose || meta.previousClose;
                const change = currentPrice - previousClose;
                const changePercent = ((change / previousClose) * 100);
                // Convert cents/lb to $/ton
                const pricePerTon = (currentPrice / 100) * 2204.62;

                updateDisplay(pricePerTon.toFixed(2), changePercent.toFixed(2), change >= 0);
            }
        }
    } catch (error) {
        console.log('Commodity ticker update failed, keeping current values');
    }
}

// Update ticker on load and every 5 minutes
let tickerInterval = null;
document.addEventListener('DOMContentLoaded', () => {
    updateCommodityTicker();
    tickerInterval = setInterval(updateCommodityTicker, 5 * 60 * 1000);
});

// Cleanup interval on page unload
window.addEventListener('beforeunload', () => {
    if (tickerInterval) {
        clearInterval(tickerInterval);
        tickerInterval = null;
    }
});

// ============================================
// DYNAMIC CONTENT LOADING FROM DATABASE
// ============================================

/**
 * Load dynamic content from database.json via API
 * This allows Admin/Developer changes to reflect on the website
 */
async function loadDynamicContent() {
    try {
        const response = await fetch('/api/public/content');
        if (!response.ok) {
            console.log('[Dynamic] API not available, using static content');
            return null;
        }

        const result = await response.json();
        if (!result.success) {
            console.log('[Dynamic] Failed to load content');
            return null;
        }

        const data = result.data;
        console.log('[Dynamic] Content loaded from database');

        // Update Team Section
        if (data.team) {
            updateTeamSection(data.team);
            // Cache team data for locations - flatten object to array
            cachedTeamData = Object.values(data.team).flat();
            // Update CEO Modal with CEO data
            updateCeoModal(data.team);
        }

        // Update Products Section
        if (data.products) {
            updateProductsSection(data.products);
        }

        // Update Locations Section (pass team data for info boxes)
        if (data.locations) {
            updateLocationsSection(data.locations, data.team);
        }

        // Update Projects Section
        if (data.projects) {
            updateProjectsSection(data.projects);
        }

        // Update Hero Section (full)
        if (data.blocks?.hero) {
            updateHeroSection(data.blocks.hero);
        }

        // Update About Section
        if (data.blocks?.about) {
            updateAboutSection(data.blocks.about);
        }

        // Update CEO Section (main page, not modal)
        if (data.blocks?.ceo) {
            updateCeoSection(data.blocks.ceo);
        }

        // Update Values Section
        if (data.blocks?.values?.values) {
            console.log('[Dynamic] Updating values section with', data.blocks.values.values.length, 'values');
            updateValuesSection(data.blocks.values.values);
        } else {
            console.log('[Dynamic] No values data found in blocks:', data.blocks?.values);
        }

        // Update Sustainability Section (full - header, intro, cards, stats)
        if (data.blocks?.sustainability) {
            updateSustainabilitySection(data.blocks.sustainability);
        }

        // Update Section Headers for all sections
        if (data.blocks?.products) {
            updateSectionHeader('.products-section', data.blocks.products);
        }
        if (data.blocks?.locations) {
            updateSectionHeader('.locations-section', data.blocks.locations);
        }
        if (data.blocks?.team) {
            updateSectionHeader('.team-section', data.blocks.team);
        }
        if (data.blocks?.values) {
            updateValuesHeader(data.blocks.values);
        }
        if (data.blocks?.projects) {
            updateSectionHeader('.projects-section', data.blocks.projects);
        }
        if (data.blocks?.partners) {
            updatePartnersSection(data.blocks.partners);
        }

        // Update Footer
        if (data.blocks?.footer) {
            updateFooterSection(data.blocks.footer);
        }

        // Update Contact Section
        if (data.blocks?.contact) {
            updateContactSection(data.blocks.contact);
        }

        // Update Navigation Section (Logo, Menu, CTA)
        if (data.blocks?.navigation) {
            updateNavigationSection(data.blocks.navigation);
        }

        return data;
    } catch (error) {
        console.log('[Dynamic] Error loading content:', error.message);
        return null;
    }
}

/**
 * Update CEO Modal with data from database
 */
function updateCeoModal(teamData) {
    // Find the CEO (usually first in leadership or has CEO in role)
    let ceo = null;

    // Check if teamData is array or object with categories
    if (Array.isArray(teamData)) {
        ceo = teamData.find(m => m.role && (m.role.toLowerCase().includes('ceo') || m.role.toLowerCase().includes('founder')));
    } else {
        // Check leadership category first
        if (teamData['Global Leadership']) {
            ceo = teamData['Global Leadership'].find(m => m.role && (m.role.toLowerCase().includes('ceo') || m.role.toLowerCase().includes('founder')));
        }
        if (!ceo && teamData['CEO']) {
            ceo = teamData['CEO'][0];
        }
    }

    if (!ceo) return;

    // Update CEO Modal elements
    const modal = document.getElementById('ceo-message-modal');
    if (!modal) return;

    // Update photo
    const photoImg = modal.querySelector('.ceo-photo');
    const photoFallback = modal.querySelector('.ceo-photo-fallback');
    if (photoImg && ceo.image) {
        photoImg.src = ceo.image.startsWith('/') ? ceo.image : '/' + ceo.image;
        photoImg.alt = ceo.name;
        photoImg.style.display = '';
        if (photoFallback) photoFallback.style.display = 'none';
    }

    // Update name and role
    const nameEl = modal.querySelector('.ceo-photo-info h3');
    const roleEl = modal.querySelector('.ceo-photo-info span');
    if (nameEl) nameEl.textContent = ceo.name;
    if (roleEl) roleEl.textContent = ceo.role || 'Founder & CEO';

    // Update signature
    const signatureName = modal.querySelector('.ceo-signature-name');
    const signatureRole = modal.querySelector('.ceo-signature-role');
    if (signatureName) signatureName.textContent = ceo.name;
    if (signatureRole) signatureRole.textContent = ceo.role || 'Founder & CEO';

    console.log('[Dynamic] CEO Modal updated with:', ceo.name);
}

/**
 * Dynamically update the team section with data from database
 */
function updateTeamSection(teamByCategory) {
    console.log('[Dynamic] updateTeamSection called with:', teamByCategory);
    const teamSection = document.querySelector('.team-section .team-container');
    if (!teamSection) {
        console.log('[Dynamic] ERROR: team-container not found!');
        return;
    }
    console.log('[Dynamic] Found team-container, updating...');

    // Define category order
    const categoryOrder = ['Global Leadership', 'CEO', 'COO & Regional Heads'];

    // Clear existing content (except the header)
    const header = teamSection.querySelector('.team-header');
    console.log('[Dynamic] Header found:', !!header);

    // Clone the header before clearing innerHTML (to preserve it)
    const headerClone = header ? header.cloneNode(true) : null;
    teamSection.innerHTML = '';
    if (headerClone) {
        teamSection.appendChild(headerClone);
    }

    // Generate HTML for each category
    categoryOrder.forEach(category => {
        const members = teamByCategory[category];
        if (!members || members.length === 0) return;

        const categoryHtml = `
            <div class="team-category">
                <h3 class="team-category-title">${category}</h3>
            </div>
            <div class="team-grid team-grid-3">
                ${members.map(member => generateTeamCardHtml(member)).join('')}
            </div>
        `;
        teamSection.insertAdjacentHTML('beforeend', categoryHtml);
    });

    // Re-initialize hover effects for new cards
    initTeamCardEffects();
    console.log('[Dynamic] Team section update complete. Cards in DOM:', document.querySelectorAll('.team-card-flip').length);
}

/**
 * Generate HTML for a single team member card
 */
function generateTeamCardHtml(member) {
    // Use path exactly as stored in database (same as Admin Panel does)
    const imagePath = member.image || '';
    const hasImage = member.image && member.image.trim() !== '';
    console.log('[Dynamic] Generating card for', member.name, 'image:', imagePath, 'hasImage:', hasImage);

    // Generate initials for fallback
    const initials = member.initials || member.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

    return `
        <div class="team-card-flip" data-member-id="${member.id}">
            <div class="team-card-inner">
                <div class="team-card-front">
                    <div class="team-image${hasImage ? ' has-photo' : ''}">
                        ${hasImage
                            ? `<img src="${imagePath}" alt="${member.name}" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">`
                            : ''
                        }
                        <div class="initials" style="${hasImage ? 'display:none;' : ''}">${initials}</div>
                    </div>
                    <h4 class="team-name">${member.name}</h4>
                    <p class="team-role">${member.role}</p>
                </div>
                <div class="team-card-back">
                    <h4 class="team-name">${member.name}</h4>
                    <p class="team-role">${member.role}</p>
                    <p class="team-bio">${member.description || ''}</p>
                    ${member.linkedin ? `<a href="${member.linkedin}" class="team-linkedin" target="_blank" rel="noopener noreferrer"><i class="fab fa-linkedin"></i></a>` : ''}
                </div>
            </div>
        </div>
    `;
}

/**
 * Initialize hover/click effects for team cards
 */
function initTeamCardEffects() {
    const teamCards = document.querySelectorAll('.team-card-flip');
    teamCards.forEach(card => {
        // Touch device support - tap to flip
        card.addEventListener('click', function(e) {
            if ('ontouchstart' in window) {
                this.classList.toggle('flipped');
            }
        });
    });
}

/**
 * Update hero statistics
 */
function updateHeroStats(stats) {
    const heroStats = document.querySelector('.hero-stats');
    if (!heroStats || !stats || stats.length === 0) return;

    const statItems = heroStats.querySelectorAll('.stat-item');
    stats.forEach((stat, index) => {
        if (statItems[index]) {
            const numberEl = statItems[index].querySelector('.stat-number');
            const labelEl = statItems[index].querySelector('.stat-label');
            if (numberEl) numberEl.textContent = stat.value;
            if (labelEl) labelEl.textContent = stat.label;
        }
    });
}

/**
 * Update values section - generate dynamically from database
 */
function updateValuesSection(values) {
    console.log('[Dynamic] updateValuesSection called with:', values);
    const valuesGrid = document.querySelector('.values-grid');
    console.log('[Dynamic] valuesGrid element:', valuesGrid);
    if (!valuesGrid) {
        console.error('[Dynamic] ERROR: .values-grid element not found!');
        return;
    }
    if (!values || values.length === 0) {
        console.error('[Dynamic] ERROR: No values data provided!');
        return;
    }

    // Clear loading placeholder
    console.log('[Dynamic] Clearing loading placeholder and adding', values.length, 'value cards');
    valuesGrid.innerHTML = '';

    // Generate value cards dynamically
    values.forEach((value, index) => {
        const valueHtml = `
            <div class="value-card">
                <div class="value-number">${value.number}</div>
                <h3>${value.title}</h3>
                <p>${value.description}</p>
            </div>
        `;
        valuesGrid.insertAdjacentHTML('beforeend', valueHtml);
    });

    // Re-initialize animations for value cards
    initValueAnimations();
}

/**
 * Initialize value card animations
 */
function initValueAnimations() {
    if (typeof gsap !== 'undefined') {
        gsap.utils.toArray('.value-card').forEach((card, i) => {
            gsap.fromTo(card,
                { y: 50, opacity: 0 },
                {
                    y: 0,
                    opacity: 1,
                    duration: 0.6,
                    delay: i * 0.1,
                    ease: 'power3.out',
                    scrollTrigger: {
                        trigger: card,
                        start: 'top 85%',
                        toggleActions: 'play none none reverse'
                    }
                }
            );
        });
    }
}

/**
 * Update sustainability statistics
 */
function updateSustainabilityStats(stats) {
    const sustainabilityStats = document.querySelector('.sustainability-stats');
    if (!sustainabilityStats || !stats || stats.length === 0) return;

    const statItems = sustainabilityStats.querySelectorAll('.stat-item');
    stats.forEach((stat, index) => {
        if (statItems[index]) {
            const numberEl = statItems[index].querySelector('.stat-number');
            const labelEl = statItems[index].querySelector('.stat-label');
            if (numberEl) numberEl.textContent = stat.value;
            if (labelEl) labelEl.textContent = stat.label;
        }
    });
}

/**
 * Update Hero Section with full content from database
 */
function updateHeroSection(heroData) {
    if (!heroData) return;

    // Update hero label
    const heroLabel = document.querySelector('.hero-label');
    if (heroLabel && heroData.label) {
        const labelIcon = heroLabel.querySelector('.label-icon');
        heroLabel.innerHTML = (labelIcon ? labelIcon.outerHTML : '<span class="label-icon">&#9670;</span>') + ' ' + heroData.label;
    }

    // Update hero title lines
    const heroTitle = document.querySelector('.hero-title');
    if (heroTitle && heroData.titleLines) {
        heroTitle.innerHTML = heroData.titleLines.map((line, i) =>
            `<span class="title-line${i === 1 ? ' highlight' : ''}">${line}</span>`
        ).join('');
    }

    // Update hero description
    const heroDesc = document.querySelector('.hero-description');
    if (heroDesc && heroData.description) {
        heroDesc.textContent = heroData.description;
    }

    // Update primary button
    const primaryBtn = document.querySelector('.hero-buttons .btn-primary');
    if (primaryBtn && heroData.buttonPrimary) {
        primaryBtn.href = heroData.buttonPrimary.link;
        const btnIcon = primaryBtn.querySelector('.btn-icon');
        primaryBtn.innerHTML = heroData.buttonPrimary.text + (btnIcon ? btnIcon.outerHTML : '<span class="btn-icon">&rarr;</span>');
    }

    // Update secondary button
    const secondaryBtn = document.querySelector('.hero-buttons .btn-outline');
    if (secondaryBtn && heroData.buttonSecondary) {
        secondaryBtn.href = heroData.buttonSecondary.link;
        const btnIcon = secondaryBtn.querySelector('.btn-icon');
        secondaryBtn.innerHTML = heroData.buttonSecondary.text + (btnIcon ? btnIcon.outerHTML : '<span class="btn-icon">&rarr;</span>');
    }

    // Update stats (also handled by updateHeroStats but included here for completeness)
    if (heroData.stats) {
        updateHeroStats(heroData.stats);
    }

    console.log('[Dynamic] Hero section updated');
}

/**
 * Update About Section with content from database
 */
function updateAboutSection(aboutData) {
    if (!aboutData) return;

    const aboutSection = document.querySelector('.about-section');
    if (!aboutSection) return;

    // Update section label
    const sectionLabel = aboutSection.querySelector('.section-label');
    if (sectionLabel && aboutData.sectionLabel) {
        sectionLabel.textContent = aboutData.sectionLabel;
    }

    // Update section title (allows HTML for highlight span)
    const sectionTitle = aboutSection.querySelector('.section-title');
    if (sectionTitle && aboutData.title) {
        sectionTitle.innerHTML = aboutData.title;
    }

    // Update lead text
    const leadText = aboutSection.querySelector('.about-text .lead');
    if (leadText && aboutData.leadText) {
        leadText.textContent = aboutData.leadText;
    }

    // Update description paragraph
    const descPara = aboutSection.querySelector('.about-text > p:not(.lead)');
    if (descPara && aboutData.description) {
        descPara.textContent = aboutData.description;
    }

    // Update features
    if (aboutData.features && aboutData.features.length > 0) {
        const featureItems = aboutSection.querySelectorAll('.feature-item');
        aboutData.features.forEach((feature, index) => {
            if (featureItems[index]) {
                const titleEl = featureItems[index].querySelector('h4');
                const descEl = featureItems[index].querySelector('p');
                if (titleEl) titleEl.textContent = feature.title;
                if (descEl) descEl.textContent = feature.description;
            }
        });
    }

    // Update founded year and text
    const cardYear = aboutSection.querySelector('.card-year');
    if (cardYear && aboutData.foundedYear) {
        cardYear.textContent = aboutData.foundedYear;
    }

    const cardDesc = aboutSection.querySelector('.main-card .card-content p');
    if (cardDesc && aboutData.foundedText) {
        cardDesc.textContent = aboutData.foundedText;
    }

    console.log('[Dynamic] About section updated');
}

/**
 * Update CEO Section (main page) with content from database
 */
function updateCeoSection(ceoData) {
    if (!ceoData) return;

    const ceoSection = document.querySelector('.ceo-section');
    if (!ceoSection) return;

    // Update section label
    const sectionLabel = ceoSection.querySelector('.section-label');
    if (sectionLabel && ceoData.sectionLabel) {
        sectionLabel.textContent = ceoData.sectionLabel;
    }

    // Update CEO quote
    const ceoQuote = ceoSection.querySelector('.ceo-quote');
    if (ceoQuote && ceoData.quote) {
        ceoQuote.innerHTML = '"' + ceoData.quote + '"';
    }

    // Update CEO name
    const ceoName = ceoSection.querySelector('.ceo-info h4');
    if (ceoName && ceoData.name) {
        ceoName.textContent = ceoData.name;
    }

    // Update CEO role
    const ceoRole = ceoSection.querySelector('.ceo-info span');
    if (ceoRole && ceoData.role) {
        ceoRole.textContent = ceoData.role;
    }

    // Update initials
    const initials = ceoSection.querySelector('.initials');
    if (initials && ceoData.initials) {
        initials.textContent = ceoData.initials;
    }

    // Update button text
    const ceoBtn = ceoSection.querySelector('#open-ceo-modal');
    if (ceoBtn && ceoData.buttonText) {
        ceoBtn.innerHTML = ceoData.buttonText + ' &rarr;';
    }

    console.log('[Dynamic] CEO section updated');
}

/**
 * Update Footer Section with content from database
 */
function updateFooterSection(footerData) {
    if (!footerData) return;

    const footer = document.querySelector('.footer');
    if (!footer) return;

    // Update tagline
    const tagline = footer.querySelector('.footer-tagline');
    if (tagline && footerData.tagline) {
        tagline.textContent = footerData.tagline;
    }

    // Update email
    const emailLink = footer.querySelector('.footer-contact-info a[href^="mailto:"]');
    if (emailLink && footerData.email) {
        emailLink.href = 'mailto:' + footerData.email;
        const svg = emailLink.querySelector('svg');
        emailLink.innerHTML = (svg ? svg.outerHTML : '') + footerData.email;
    }

    // Update phone
    const phoneLink = footer.querySelector('.footer-contact-info a[href^="tel:"]');
    if (phoneLink && footerData.phone) {
        phoneLink.href = 'tel:' + footerData.phone.replace(/\s/g, '');
        const svg = phoneLink.querySelector('svg');
        phoneLink.innerHTML = (svg ? svg.outerHTML : '') + footerData.phone;
    }

    // Update WhatsApp link
    const whatsappLink = document.querySelector('.whatsapp-float');
    if (whatsappLink && footerData.whatsapp) {
        whatsappLink.href = 'https://wa.me/' + footerData.whatsapp.replace(/\+/g, '') + '?text=Hello%2C%20I%20would%20like%20to%20inquire%20about%20your%20products';
    }

    // Update copyright
    const copyright = footer.querySelector('.footer-bottom p');
    if (copyright && footerData.copyright) {
        copyright.textContent = footerData.copyright;
    }

    // Update footer columns (links)
    if (footerData.columns && footerData.columns.length > 0) {
        const footerColumns = footer.querySelectorAll('.footer-column');
        footerData.columns.forEach((col, index) => {
            if (footerColumns[index]) {
                const titleEl = footerColumns[index].querySelector('h4');
                if (titleEl) titleEl.textContent = col.title;

                const linksList = footerColumns[index].querySelector('ul');
                if (linksList && col.links) {
                    linksList.innerHTML = col.links.map(link =>
                        `<li><a href="${link.href}">${link.text}</a></li>`
                    ).join('');
                }
            }
        });
    }

    // Update newsletter section
    if (footerData.newsletter) {
        const newsletterTitle = footer.querySelector('.newsletter-content h4');
        const newsletterSubtitle = footer.querySelector('.newsletter-content p');
        const newsletterBtn = footer.querySelector('.newsletter-form button span');

        if (newsletterTitle && footerData.newsletter.title) {
            newsletterTitle.textContent = footerData.newsletter.title;
        }
        if (newsletterSubtitle && footerData.newsletter.subtitle) {
            newsletterSubtitle.textContent = footerData.newsletter.subtitle;
        }
        if (newsletterBtn && footerData.newsletter.buttonText) {
            newsletterBtn.textContent = footerData.newsletter.buttonText;
        }
    }

    console.log('[Dynamic] Footer section updated');
}

/**
 * Update Contact Section with content from database
 */
function updateContactSection(contactData) {
    if (!contactData) return;

    const contactSection = document.querySelector('.contact-section');
    if (!contactSection) return;

    // Update section label
    const sectionLabel = contactSection.querySelector('.section-label');
    if (sectionLabel && contactData.sectionLabel) {
        sectionLabel.textContent = contactData.sectionLabel;
    }

    // Update section title (allows HTML for highlight span)
    const sectionTitle = contactSection.querySelector('.section-title');
    if (sectionTitle && contactData.title) {
        sectionTitle.innerHTML = contactData.title;
    }

    // Update description
    const description = contactSection.querySelector('.contact-intro p');
    if (description && contactData.description) {
        description.textContent = contactData.description;
    }

    // Update contact info
    const emailEl = contactSection.querySelector('.contact-info-item a[href^="mailto:"]');
    if (emailEl && contactData.email) {
        emailEl.href = 'mailto:' + contactData.email;
        emailEl.textContent = contactData.email;
    }

    const phoneEl = contactSection.querySelector('.contact-info-item a[href^="tel:"]');
    if (phoneEl && contactData.phone) {
        phoneEl.href = 'tel:' + contactData.phone.replace(/\s/g, '');
        phoneEl.textContent = contactData.phone;
    }

    // Update form labels if provided
    if (contactData.formLabels) {
        const form = contactSection.querySelector('.contact-form');
        if (form) {
            const labels = contactData.formLabels;

            // Update placeholders
            const nameInput = form.querySelector('input[name="name"]');
            const emailInput = form.querySelector('input[name="email"]');
            const companyInput = form.querySelector('input[name="company"]');
            const messageInput = form.querySelector('textarea[name="message"]');
            const submitBtn = form.querySelector('button[type="submit"]');

            if (nameInput && labels.name) nameInput.placeholder = labels.name;
            if (emailInput && labels.email) emailInput.placeholder = labels.email;
            if (companyInput && labels.company) companyInput.placeholder = labels.company;
            if (messageInput && labels.message) messageInput.placeholder = labels.message;
            if (submitBtn && labels.submit) {
                const svg = submitBtn.querySelector('svg');
                submitBtn.innerHTML = '<span>' + labels.submit + '</span>' + (svg ? svg.outerHTML : '');
            }
        }
    }

    console.log('[Dynamic] Contact section updated');
}

/**
 * Generic function to update section headers
 */
function updateSectionHeader(sectionSelector, blockData) {
    if (!blockData) return;

    const section = document.querySelector(sectionSelector);
    if (!section) return;

    // Update section label
    const sectionLabel = section.querySelector('.section-label');
    if (sectionLabel && blockData.sectionLabel) {
        sectionLabel.textContent = blockData.sectionLabel;
    }

    // Update section title (allows HTML for highlight span)
    const sectionTitle = section.querySelector('.section-title');
    if (sectionTitle && blockData.title) {
        sectionTitle.innerHTML = blockData.title;
    }

    // Update section description if present
    const sectionDesc = section.querySelector('.section-desc');
    if (sectionDesc && blockData.description) {
        sectionDesc.textContent = blockData.description;
    }

    console.log('[Dynamic] Section header updated:', sectionSelector);
}

/**
 * Update Values section header (special layout)
 */
function updateValuesHeader(valuesData) {
    if (!valuesData) return;

    const section = document.querySelector('.values-section');
    if (!section) return;

    const sectionLabel = section.querySelector('.section-label');
    if (sectionLabel && valuesData.sectionLabel) {
        sectionLabel.textContent = valuesData.sectionLabel;
    }

    const sectionTitle = section.querySelector('.section-title');
    if (sectionTitle && valuesData.title) {
        sectionTitle.innerHTML = valuesData.title;
    }

    console.log('[Dynamic] Values header updated');
}

/**
 * Update Partners section (header + logos)
 */
function updatePartnersSection(partnersData) {
    if (!partnersData) return;

    const section = document.querySelector('.partners-section');
    if (!section) return;

    // Update header
    const sectionLabel = section.querySelector('.section-label');
    if (sectionLabel && partnersData.sectionLabel) {
        sectionLabel.textContent = partnersData.sectionLabel;
    }

    const sectionTitle = section.querySelector('.section-title');
    if (sectionTitle && partnersData.title) {
        sectionTitle.innerHTML = partnersData.title;
    }

    // Update partner logos
    if (partnersData.partners && partnersData.partners.length > 0) {
        const partnersTrack = section.querySelector('.partners-track');
        if (partnersTrack) {
            // Generate partner logos (repeat 5x for infinite scroll)
            const partnerLogos = partnersData.partners.map(name => `
                <div class="partner-logo">
                    <svg viewBox="0 0 120 40" fill="currentColor" opacity="0.6">
                        <text x="60" y="25" text-anchor="middle" font-size="14" font-weight="600">${name}</text>
                    </svg>
                </div>
            `).join('');

            // Repeat for seamless infinite scroll
            partnersTrack.innerHTML = partnerLogos.repeat(5);
        }
    }

    console.log('[Dynamic] Partners section updated');
}

/**
 * Update Navigation section (Logo, Menu Items, CTA Button)
 */
function updateNavigationSection(navData) {
    if (!navData) return;

    const header = document.querySelector('.main-header');
    if (!header) return;

    // Update Logo Text
    const logoMain = header.querySelector('.logo-main');
    if (logoMain && navData.logoText) {
        logoMain.textContent = navData.logoText;
    }

    // Update Logo Tagline
    const logoTagline = header.querySelector('.logo-tagline');
    if (logoTagline && navData.logoTagline) {
        logoTagline.textContent = navData.logoTagline;
    }

    // Update CTA Button
    const ctaBtn = header.querySelector('.nav-cta .btn-primary');
    if (ctaBtn && navData.ctaButton) {
        ctaBtn.href = navData.ctaButton.href;
        const btnIcon = ctaBtn.querySelector('.btn-icon');
        ctaBtn.innerHTML = navData.ctaButton.text + (btnIcon ? btnIcon.outerHTML : '<span class="btn-icon">&rarr;</span>');
    }

    // Update Menu Items Labels & Dropdown Titles
    if (navData.menuItems && navData.menuItems.length > 0) {
        const navItems = header.querySelectorAll('.nav-item');

        navData.menuItems.forEach((item, index) => {
            if (navItems[index]) {
                // Update nav link text
                const navLink = navItems[index].querySelector('.nav-link');
                if (navLink) {
                    navLink.textContent = item.label;
                }

                // Update dropdown title and description if this item has dropdown
                if (item.hasDropdown) {
                    const dropdownTitle = navItems[index].querySelector('.dropdown-main-title');
                    const dropdownDesc = navItems[index].querySelector('.dropdown-desc');

                    if (dropdownTitle && item.dropdownTitle) {
                        dropdownTitle.textContent = item.dropdownTitle;
                    }
                    if (dropdownDesc && item.dropdownDesc) {
                        dropdownDesc.textContent = item.dropdownDesc;
                    }

                    // Update dropdown links
                    if (item.links && item.links.length > 0) {
                        const dropdownNavList = navItems[index].querySelector('.dropdown-nav-list');
                        if (dropdownNavList) {
                            const listItems = dropdownNavList.querySelectorAll('li a');
                            item.links.forEach((link, linkIndex) => {
                                if (listItems[linkIndex]) {
                                    listItems[linkIndex].href = link.href;
                                    // Preserve data-panel attribute
                                    const panel = listItems[linkIndex].getAttribute('data-panel');
                                    listItems[linkIndex].textContent = link.text;
                                }
                            });
                        }
                    }
                } else {
                    // Simple link without dropdown
                    const navLink = navItems[index].querySelector('.nav-link');
                    if (navLink && item.href) {
                        navLink.href = item.href;
                    }
                }
            }
        });
    }

    // Update Mobile Navigation as well
    const mobileNav = document.querySelector('.mobile-nav-menu');
    if (mobileNav && navData.menuItems) {
        const mobileLinks = mobileNav.querySelectorAll('.mobile-nav-link');
        navData.menuItems.forEach((item, index) => {
            if (mobileLinks[index]) {
                const textSpan = mobileLinks[index].querySelector('span');
                if (textSpan) {
                    textSpan.textContent = item.label;
                }
            }
        });
    }

    console.log('[Dynamic] Navigation section updated');
}

/**
 * Update Sustainability section (full - header, intro, cards, stats)
 */
function updateSustainabilitySection(sustainData) {
    if (!sustainData) return;

    const section = document.querySelector('.sustainability-section');
    if (!section) return;

    // Update header
    const sectionLabel = section.querySelector('.section-label');
    if (sectionLabel && sustainData.sectionLabel) {
        sectionLabel.textContent = sustainData.sectionLabel;
    }

    const sectionTitle = section.querySelector('.section-title');
    if (sectionTitle && sustainData.title) {
        sectionTitle.innerHTML = sustainData.title;
    }

    // Update intro text
    const introText = section.querySelector('.sustainability-intro .lead');
    if (introText && sustainData.intro) {
        introText.textContent = sustainData.intro;
    }

    // Update sustainability cards
    if (sustainData.cards && sustainData.cards.length > 0) {
        const cardsGrid = section.querySelector('.sustainability-grid');
        if (cardsGrid) {
            cardsGrid.innerHTML = sustainData.cards.map(card => `
                <div class="sustainability-card">
                    <div class="sustainability-icon">
                        ${getSustainabilityIcon(card.icon)}
                    </div>
                    <h3>${card.title}</h3>
                    <p>${card.description}</p>
                </div>
            `).join('');
        }
    }

    // Update stats
    if (sustainData.stats) {
        updateSustainabilityStats(sustainData.stats);
    }

    console.log('[Dynamic] Sustainability section updated');
}

/**
 * Get SVG icon for sustainability cards
 */
function getSustainabilityIcon(iconType) {
    const icons = {
        'layers': `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
            <path d="M2 17l10 5 10-5"></path>
            <path d="M2 12l10 5 10-5"></path>
        </svg>`,
        'clock': `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M12 6v6l4 2"></path>
        </svg>`,
        'box': `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
            <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
            <line x1="12" y1="22.08" x2="12" y2="12"></line>
        </svg>`,
        'leaf': `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"></path>
            <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"></path>
        </svg>`,
        'shield': `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
        </svg>`,
        'globe': `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
        </svg>`
    };
    return icons[iconType] || icons['shield'];
}

/**
 * Update products section with data from database
 */
function updateProductsSection(products) {
    const productsGrid = document.querySelector('.products-section .products-grid');
    if (!productsGrid || !products || products.length === 0) return;

    // Clear loading placeholder
    productsGrid.innerHTML = '';

    // Product category to visual class mapping
    const categoryVisuals = {
        'Sugar': 'sugar-visual',
        'Grains': 'soy-visual',
        'Other': 'generic-visual'
    };

    // Generate product cards
    products.forEach((product, index) => {
        const visualClass = product.name.toLowerCase().includes('corn') ? 'corn-visual' :
                           product.name.toLowerCase().includes('soy') ? 'soy-visual' :
                           product.name.toLowerCase().includes('vhp') ? 'vhp-visual' :
                           categoryVisuals[product.category] || 'sugar-visual';

        const specsHtml = Object.entries(product.specs || {}).map(([key, value]) =>
            `<li><span>${key}:</span> ${value}</li>`
        ).join('');

        const productHtml = `
            <div class="product-card${product.featured ? ' featured' : ''}" data-product-id="${product.id}">
                ${product.featured ? '<span class="product-badge">Flagship Product</span>' : ''}
                <div class="product-visual ${visualClass}">
                    ${visualClass === 'sugar-visual' ? `
                        <div class="sugar-particles-container">
                            <div class="sugar-particle"></div>
                            <div class="sugar-particle"></div>
                            <div class="sugar-particle"></div>
                            <div class="sugar-particle"></div>
                            <div class="sugar-particle"></div>
                        </div>
                    ` : ''}
                    <div class="product-icon">
                        ${getProductIcon(visualClass)}
                    </div>
                </div>
                <div class="product-content">
                    <h3>${product.name}</h3>
                    <p>${product.description}</p>
                    <ul class="product-specs">
                        ${specsHtml}
                    </ul>
                    <a href="#contact" class="product-link">Request Quote &rarr;</a>
                </div>
            </div>
        `;
        productsGrid.insertAdjacentHTML('beforeend', productHtml);
    });

    // Re-initialize animations for new product cards
    initProductAnimations();
}

/**
 * Get SVG icon for product based on visual class
 */
function getProductIcon(visualClass) {
    switch(visualClass) {
        case 'sugar-visual':
            return `<svg viewBox="0 0 100 100">
                <rect x="30" y="30" width="40" height="40" rx="5" fill="currentColor" opacity="0.3"></rect>
                <rect x="35" y="35" width="30" height="30" rx="3" fill="currentColor" opacity="0.5"></rect>
                <rect x="40" y="40" width="20" height="20" rx="2" fill="currentColor"></rect>
            </svg>`;
        case 'vhp-visual':
            return `<svg viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="30" fill="currentColor" opacity="0.3"></circle>
                <circle cx="50" cy="50" r="20" fill="currentColor" opacity="0.5"></circle>
                <circle cx="50" cy="50" r="10" fill="currentColor"></circle>
            </svg>`;
        case 'soy-visual':
            return `<svg viewBox="0 0 100 100">
                <ellipse cx="50" cy="50" rx="25" ry="15" fill="currentColor" opacity="0.3"></ellipse>
                <ellipse cx="50" cy="50" rx="18" ry="10" fill="currentColor" opacity="0.5"></ellipse>
                <ellipse cx="50" cy="50" rx="10" ry="5" fill="currentColor"></ellipse>
            </svg>`;
        case 'corn-visual':
            return `<svg viewBox="0 0 100 100">
                <path d="M50 20 L70 50 L50 80 L30 50 Z" fill="currentColor" opacity="0.3"></path>
                <path d="M50 30 L62 50 L50 70 L38 50 Z" fill="currentColor" opacity="0.5"></path>
                <path d="M50 40 L55 50 L50 60 L45 50 Z" fill="currentColor"></path>
            </svg>`;
        default:
            return `<svg viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="30" fill="currentColor" opacity="0.3"></circle>
                <circle cx="50" cy="50" r="20" fill="currentColor" opacity="0.5"></circle>
                <circle cx="50" cy="50" r="10" fill="currentColor"></circle>
            </svg>`;
    }
}

/**
 * Initialize product card animations
 */
function initProductAnimations() {
    if (typeof gsap !== 'undefined') {
        gsap.utils.toArray('.product-card').forEach((card, i) => {
            gsap.fromTo(card,
                { y: 80, scale: 0.9, opacity: 0 },
                {
                    y: 0,
                    scale: 1,
                    opacity: 1,
                    duration: 0.8,
                    delay: i * 0.1,
                    ease: 'power3.out',
                    scrollTrigger: {
                        trigger: card,
                        start: 'top 85%',
                        toggleActions: 'play none none reverse'
                    }
                }
            );
        });
    }
}

// Store team data globally for location info boxes
let cachedTeamData = null;

/**
 * Update locations section with data from database
 */
function updateLocationsSection(locations, teamData) {
    const mapInfoBoxes = document.querySelector('.map-info-boxes');
    if (!mapInfoBoxes || !locations || locations.length === 0) return;

    // Use passed team data or cached data - flatten if object
    if (teamData) {
        cachedTeamData = Array.isArray(teamData) ? teamData : Object.values(teamData).flat();
    }

    // Clear existing info boxes
    mapInfoBoxes.innerHTML = '';

    // Country code to location ID mapping
    const countryToLocationId = {
        'VG': 'bvi',
        'US': 'usa',
        'BR': 'brazil',
        'AE': 'uae',
        'GB': 'uk',
        'UG': 'uganda',
        'KE': 'kenya',
        'BD': 'bangladesh'
    };

    // City-specific mappings for countries with multiple offices
    const cityToLocationId = {
        'Austin': 'usa_texas',
        'Austin, Texas': 'usa_texas',
        'Miami': 'usa_florida',
        'Miami, Florida': 'usa_florida'
    };

    // Find team member for a location by assigned ID or fallback to keywords
    function findTeamMember(location, locationId) {
        if (!cachedTeamData) return null;

        // First: Check if location has a directly assigned team member
        if (location.assignedTeamMemberId) {
            const assigned = cachedTeamData.find(m => m.id === location.assignedTeamMemberId);
            if (assigned) return assigned;
        }

        // Fallback: Legacy keyword matching for unassigned locations
        const locationTeamMap = {
            'bvi': ['CEO', 'Founder', 'Chairman', 'Group'],
            'usa': ['USA', 'Princeton'],
            'usa_texas': ['Texas', 'Austin', '(TX)'],
            'usa_florida': ['Florida', 'Miami', '(FL)'],
            'brazil': ['Brazil', 'Brasil'],
            'uae': ['Dubai', 'UAE', 'Middle East', 'FITC Energy'],
            'uk': ['UK', 'Maritime', 'Logistics'],
            'uganda': ['Uganda'],
            'kenya': ['Kenya', 'East Africa'],
            'bangladesh': ['Bangladesh']
        };

        const keywords = locationTeamMap[locationId] || [];
        return cachedTeamData.find(member => {
            const role = member.role || '';
            return keywords.some(kw => role.toLowerCase().includes(kw.toLowerCase()));
        });
    }

    // Generate info boxes for each location
    locations.forEach(location => {
        // Check for city-specific mapping first (for USA offices)
        let locationId = cityToLocationId[location.city];
        if (!locationId) {
            locationId = countryToLocationId[location.countryCode] || location.countryCode.toLowerCase();
        }
        const flagPath = `assets/images/flags/${location.countryCode.toLowerCase()}.svg`;

        // Find team member for this location (using assigned ID or keyword fallback)
        const teamMember = findTeamMember(location, locationId);

        // Generate team section HTML if team member found
        let teamSectionHtml = '';
        if (teamMember) {
            const photoHtml = teamMember.image
                ? `<img src="${teamMember.image}" alt="${teamMember.name}" class="info-team-photo" onerror="this.outerHTML='<div class=\\'info-team-initials\\'>${teamMember.initials || ''}</div>'">`
                : `<div class="info-team-initials">${teamMember.initials || ''}</div>`;

            teamSectionHtml = `
                <div class="info-team-section">
                    ${photoHtml}
                    <div class="info-team-details">
                        <p class="info-team-name">${teamMember.name}</p>
                        <p class="info-team-role">${teamMember.role}</p>
                    </div>
                </div>
            `;
        }

        const infoBoxHtml = `
            <div class="map-info-box" data-location="${locationId}">
                <!-- Corner Decorations -->
                <div class="info-card-corner info-card-corner-tl"></div>
                <div class="info-card-corner info-card-corner-tr"></div>
                <div class="info-card-corner info-card-corner-bl"></div>
                <div class="info-card-corner info-card-corner-br"></div>
                <!-- Card Content -->
                <div class="info-card-inner">
                    <div class="info-box-header">
                        <img src="${flagPath}" alt="${location.countryCode}" class="info-flag-img" onerror="this.style.display='none'">
                        <div class="info-title">
                            <h4>${location.city || location.country}</h4>
                            <span class="info-type">${location.type}</span>
                        </div>
                    </div>
                    <div class="info-box-content">
                        <p class="info-company">${location.company}</p>
                        <p class="info-address">${location.address}</p>
                    </div>
                    ${teamSectionHtml}
                </div>
            </div>
        `;
        mapInfoBoxes.insertAdjacentHTML('beforeend', infoBoxHtml);
    });

    // Re-initialize map hover effects
    // Reset flag since we have new info boxes that need listeners
    mapInteractionsInitialized = false;
    initInteractiveMap();
}

/**
 * Update projects section with data from database
 */
function updateProjectsSection(projects) {
    const projectsTimeline = document.querySelector('.projects-timeline');
    if (!projectsTimeline || !projects || projects.length === 0) return;

    // Keep the timeline line but clear project items
    const timelineLine = projectsTimeline.querySelector('.timeline-line');
    projectsTimeline.innerHTML = '';
    if (timelineLine) {
        projectsTimeline.appendChild(timelineLine);
    } else {
        projectsTimeline.insertAdjacentHTML('afterbegin', '<div class="timeline-line"></div>');
    }

    // Group projects by year
    const projectsByYear = {};
    projects.forEach(project => {
        const year = project.year || 'Upcoming';
        if (!projectsByYear[year]) {
            projectsByYear[year] = [];
        }
        projectsByYear[year].push(project);
    });

    // Generate project items
    Object.entries(projectsByYear).sort((a, b) => a[0].localeCompare(b[0])).forEach(([year, yearProjects]) => {
        yearProjects.forEach(project => {
            const statsHtml = (project.stats || []).map(stat =>
                `<div class="project-stat">
                    <span class="stat-value">${stat.value}</span>
                    <span class="stat-label">${stat.label}</span>
                </div>`
            ).join('');

            const projectHtml = `
                <div class="project-item" data-project-id="${project.id}">
                    <div class="project-year">${year}</div>
                    <div class="project-card">
                        <div class="project-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M3 21h18M9 8h1M9 12h1M9 16h1M14 8h1M14 12h1M14 16h1M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16"></path>
                            </svg>
                        </div>
                        <div class="project-content">
                            <h3>${project.name}</h3>
                            <p>${project.description}</p>
                            ${statsHtml ? `<div class="project-stats">${statsHtml}</div>` : ''}
                        </div>
                    </div>
                </div>
            `;
            projectsTimeline.insertAdjacentHTML('beforeend', projectHtml);
        });
    });

    // Re-initialize animations for projects
    initProjectAnimations();
}

/**
 * Initialize project animations
 */
function initProjectAnimations() {
    if (typeof gsap !== 'undefined') {
        gsap.utils.toArray('.project-item').forEach((item, i) => {
            gsap.fromTo(item.querySelector('.project-card'),
                { x: i % 2 === 0 ? -100 : 100, opacity: 0 },
                {
                    x: 0,
                    opacity: 1,
                    duration: 0.8,
                    ease: 'power3.out',
                    scrollTrigger: {
                        trigger: item,
                        start: 'top 85%',
                        toggleActions: 'play none none reverse'
                    }
                }
            );
        });
    }
}

// Load dynamic content when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Load dynamic content from database
    loadDynamicContent();
});

// ============================================
// PRELOADER
// ============================================
window.addEventListener('load', () => {
    const preloader = document.querySelector('.preloader');

    gsap.to(preloader, {
        opacity: 0,
        duration: 1,
        delay: 1.5,
        onComplete: () => {
            preloader.style.display = 'none';
            initAnimations();
        }
    });
});

// ============================================
// CUSTOM CURSOR - Performance optimized
// ============================================
const cursor = document.querySelector('.cursor');
const cursorFollower = document.querySelector('.cursor-follower');

// Disable custom cursor on touch devices and mobile for performance
const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
const isMobile = window.innerWidth < 768;

if (cursor && cursorFollower && !isTouchDevice && !isMobile) {
    let mouseX = 0, mouseY = 0;
    let cursorX = 0, cursorY = 0;
    let followerX = 0, followerY = 0;
    let rafId = null;

    // Use passive event listener and store mouse position
    document.addEventListener('mousemove', (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
    }, { passive: true });

    // Animate using requestAnimationFrame for smooth 60fps updates
    function animateCursor() {
        // Lerp for smooth following
        cursorX += (mouseX - cursorX) * 0.2;
        cursorY += (mouseY - cursorY) * 0.2;
        followerX += (mouseX - followerX) * 0.1;
        followerY += (mouseY - followerY) * 0.1;

        cursor.style.transform = `translate(${cursorX}px, ${cursorY}px) translate(-50%, -50%)`;
        cursorFollower.style.transform = `translate(${followerX}px, ${followerY}px) translate(-50%, -50%)`;

        rafId = requestAnimationFrame(animateCursor);
    }
    animateCursor();

    // Pause animation when tab is not visible
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            cancelAnimationFrame(rafId);
        } else {
            animateCursor();
        }
    });

    // Cursor hover effects - use CSS classes for better performance
    const hoverElements = document.querySelectorAll('a, button, .product-card, .team-card, .location-marker');

    hoverElements.forEach(el => {
        el.addEventListener('mouseenter', () => {
            cursor.classList.add('cursor-hover');
            cursorFollower.classList.add('cursor-hover');
        });

        el.addEventListener('mouseleave', () => {
            cursor.classList.remove('cursor-hover');
            cursorFollower.classList.remove('cursor-hover');
        });
    });
} else if (cursor && cursorFollower) {
    // Hide custom cursor on touch/mobile devices
    cursor.style.display = 'none';
    cursorFollower.style.display = 'none';
}

// ============================================
// THREE.JS 3D GLOBE
// ============================================
let scene, camera, renderer, globe, particles;
let globeRotationSpeed = 0.002;
let globeAnimationId = null;
let isGlobeVisible = true;

function initGlobe() {
    const container = document.getElementById('globe-container');
    if (!container) return;

    // Scene setup
    scene = new THREE.Scene();

    // Camera
    camera = new THREE.PerspectiveCamera(
        60,
        container.offsetWidth / container.offsetHeight,
        0.1,
        1000
    );
    camera.position.z = 2.5;

    // Renderer
    renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true
    });
    renderer.setSize(container.offsetWidth, container.offsetHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // Create Earth Globe
    const geometry = new THREE.SphereGeometry(1, 64, 64);

    // Create gradient material for globe
    const globeMaterial = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0 },
            colorA: { value: new THREE.Color(0x0a1628) },
            colorB: { value: new THREE.Color(0x1a3a5c) },
            colorGold: { value: new THREE.Color(0xc9a227) }
        },
        vertexShader: `
            varying vec2 vUv;
            varying vec3 vNormal;
            varying vec3 vPosition;

            void main() {
                vUv = uv;
                vNormal = normalize(normalMatrix * normal);
                vPosition = position;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform float time;
            uniform vec3 colorA;
            uniform vec3 colorB;
            uniform vec3 colorGold;

            varying vec2 vUv;
            varying vec3 vNormal;
            varying vec3 vPosition;

            void main() {
                // Base gradient
                vec3 baseColor = mix(colorA, colorB, vUv.y);

                // Add latitude lines
                float latLines = abs(sin(vPosition.y * 20.0));
                latLines = smoothstep(0.95, 1.0, latLines);

                // Add longitude lines
                float lonLines = abs(sin(atan(vPosition.z, vPosition.x) * 12.0));
                lonLines = smoothstep(0.95, 1.0, lonLines);

                // Combine grid
                float grid = max(latLines, lonLines) * 0.3;

                // Fresnel effect for edge glow
                float fresnel = pow(1.0 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.0);

                // Final color
                vec3 finalColor = baseColor + colorGold * grid + colorGold * fresnel * 0.5;

                gl_FragColor = vec4(finalColor, 0.9);
            }
        `,
        transparent: true,
        side: THREE.FrontSide
    });

    globe = new THREE.Mesh(geometry, globeMaterial);
    scene.add(globe);

    // Add glow effect
    const glowGeometry = new THREE.SphereGeometry(1.15, 32, 32);
    const glowMaterial = new THREE.ShaderMaterial({
        uniforms: {
            colorGlow: { value: new THREE.Color(0xc9a227) }
        },
        vertexShader: `
            varying vec3 vNormal;
            void main() {
                vNormal = normalize(normalMatrix * normal);
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 colorGlow;
            varying vec3 vNormal;
            void main() {
                float intensity = pow(0.65 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
                gl_FragColor = vec4(colorGlow, intensity * 0.4);
            }
        `,
        transparent: true,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending
    });

    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    scene.add(glow);

    // Add location markers
    addLocationMarkers();

    // Add particle field
    createParticleField();

    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xc9a227, 1);
    directionalLight.position.set(5, 3, 5);
    scene.add(directionalLight);

    // Animation loop
    animateGlobe();

    // Handle resize
    window.addEventListener('resize', () => {
        if (!container) return;
        camera.aspect = container.offsetWidth / container.offsetHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.offsetWidth, container.offsetHeight);
    });
}

// Location coordinates (latitude, longitude) -> 3D position
function latLongToVector3(lat, lon, radius = 1.02) {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lon + 180) * (Math.PI / 180);

    return new THREE.Vector3(
        -radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.cos(phi),
        radius * Math.sin(phi) * Math.sin(theta)
    );
}

function addLocationMarkers() {
    const locations = [
        { name: 'BVI', lat: 18.4207, lon: -64.6399 },
        { name: 'USA', lat: 40.3573, lon: -74.6672 },
        { name: 'Dubai', lat: 25.2048, lon: 55.2708 },
        { name: 'Brazil', lat: -23.5505, lon: -46.6333 },
        { name: 'Uganda', lat: 0.3476, lon: 32.5825 },
        { name: 'Kenya', lat: -1.2921, lon: 36.8219 },
        { name: 'UK', lat: 51.5074, lon: -0.1278 }
    ];

    const markerGeometry = new THREE.SphereGeometry(0.025, 16, 16);
    const markerMaterial = new THREE.MeshBasicMaterial({
        color: 0xc9a227,
        transparent: true,
        opacity: 1
    });

    locations.forEach(loc => {
        const position = latLongToVector3(loc.lat, loc.lon);
        const marker = new THREE.Mesh(markerGeometry, markerMaterial.clone());
        marker.position.copy(position);
        globe.add(marker);

        // Add pulse ring
        const ringGeometry = new THREE.RingGeometry(0.03, 0.05, 32);
        const ringMaterial = new THREE.MeshBasicMaterial({
            color: 0xc9a227,
            transparent: true,
            opacity: 0.6,
            side: THREE.DoubleSide
        });
        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        ring.position.copy(position);
        ring.lookAt(new THREE.Vector3(0, 0, 0));
        globe.add(ring);

        // Animate pulse
        gsap.to(ring.scale, {
            x: 2,
            y: 2,
            duration: 2,
            repeat: -1,
            ease: "power1.out"
        });
        gsap.to(ringMaterial, {
            opacity: 0,
            duration: 2,
            repeat: -1,
            ease: "power1.out"
        });
    });

    // Add trade route lines
    addTradeRoutes(locations);
}

function addTradeRoutes(locations) {
    const curves = [
        [locations[3], locations[0]], // Brazil to BVI
        [locations[3], locations[2]], // Brazil to Dubai
        [locations[4], locations[2]], // Uganda to Dubai
        [locations[0], locations[6]], // BVI to UK
    ];

    curves.forEach(([start, end]) => {
        const startVec = latLongToVector3(start.lat, start.lon, 1.02);
        const endVec = latLongToVector3(end.lat, end.lon, 1.02);

        // Create curved line
        const midPoint = new THREE.Vector3()
            .addVectors(startVec, endVec)
            .multiplyScalar(0.5)
            .normalize()
            .multiplyScalar(1.4);

        const curve = new THREE.QuadraticBezierCurve3(startVec, midPoint, endVec);
        const points = curve.getPoints(50);
        const geometry = new THREE.BufferGeometry().setFromPoints(points);

        const material = new THREE.LineBasicMaterial({
            color: 0xc9a227,
            transparent: true,
            opacity: 0.4
        });

        const line = new THREE.Line(geometry, material);
        globe.add(line);
    });
}

function createParticleField() {
    const particleCount = 500;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
        // Random positions in sphere around globe
        const radius = 2 + Math.random() * 3;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);

        positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
        positions[i * 3 + 2] = radius * Math.cos(phi);

        // Gold/white colors
        const goldIntensity = Math.random();
        colors[i * 3] = 0.79 + goldIntensity * 0.21;     // R
        colors[i * 3 + 1] = 0.64 + goldIntensity * 0.36; // G
        colors[i * 3 + 2] = 0.15 + goldIntensity * 0.85; // B
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
        size: 0.02,
        vertexColors: true,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending
    });

    particles = new THREE.Points(geometry, material);
    scene.add(particles);
}

function animateGlobe() {
    // Only animate if globe is visible (performance optimization)
    if (!isGlobeVisible || !renderer) {
        globeAnimationId = null;
        return;
    }

    globeAnimationId = requestAnimationFrame(animateGlobe);

    if (globe) {
        globe.rotation.y += globeRotationSpeed;
        globe.material.uniforms.time.value += 0.01;
    }

    if (particles) {
        particles.rotation.y += 0.0005;
        particles.rotation.x += 0.0002;
    }

    renderer.render(scene, camera);
}

// Start/stop globe animation based on visibility
function startGlobeAnimation() {
    if (!globeAnimationId && renderer) {
        isGlobeVisible = true;
        animateGlobe();
    }
}

function stopGlobeAnimation() {
    isGlobeVisible = false;
    if (globeAnimationId) {
        cancelAnimationFrame(globeAnimationId);
        globeAnimationId = null;
    }
}

// Pause animation when tab is hidden
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        stopGlobeAnimation();
    } else {
        startGlobeAnimation();
    }
});

// Use IntersectionObserver to pause animation when globe is not visible
if (typeof IntersectionObserver !== 'undefined') {
    const globeObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                startGlobeAnimation();
            } else {
                stopGlobeAnimation();
            }
        });
    }, { threshold: 0.1 });

    // Observe globe container when DOM is ready
    document.addEventListener('DOMContentLoaded', () => {
        const container = document.getElementById('globe-container');
        if (container) {
            globeObserver.observe(container);
        }
    });
}

// ============================================
// SUGAR PARTICLE CANVAS EFFECT (Disabled for performance)
// ============================================
function initSugarParticles() {
    // Disabled - 80 particles with gradients cause frame drops
}

// ============================================
// GSAP SCROLL ANIMATIONS
// ============================================
function initAnimations() {
    // Register ScrollTrigger
    gsap.registerPlugin(ScrollTrigger);

    // Hero content animation
    gsap.from('.hero-content h1', {
        opacity: 0,
        y: 100,
        duration: 1.2,
        ease: 'power3.out'
    });

    // Animate hero description if it exists
    if (document.querySelector('.hero-content .hero-description')) {
        gsap.from('.hero-content .hero-description', {
            opacity: 0,
            y: 50,
            duration: 1,
            delay: 0.3,
            ease: 'power3.out'
        });
    }

    gsap.from('.hero-content .hero-buttons', {
        opacity: 0,
        y: 30,
        duration: 1,
        delay: 0.6,
        ease: 'power3.out'
    });

    // Section headers - check if already visible
    gsap.utils.toArray('.section-header').forEach(header => {
        const rect = header.getBoundingClientRect();
        const isInViewport = rect.top < window.innerHeight && rect.bottom > 0;

        if (isInViewport) {
            gsap.set(header, { opacity: 1, y: 0 });
        } else {
            gsap.fromTo(header,
                { opacity: 0, y: 50 },
                {
                    scrollTrigger: {
                        trigger: header,
                        start: 'top 85%',
                        toggleActions: 'play none none none'
                    },
                    opacity: 1,
                    y: 0,
                    duration: 1,
                    ease: 'power3.out'
                }
            );
        }
    });

    // About features - check if already visible
    gsap.utils.toArray('.feature').forEach((feature, index) => {
        const rect = feature.getBoundingClientRect();
        const isInViewport = rect.top < window.innerHeight && rect.bottom > 0;

        if (isInViewport) {
            gsap.set(feature, { opacity: 1, y: 0 });
        } else {
            gsap.fromTo(feature,
                { opacity: 0, y: 60 },
                {
                    scrollTrigger: {
                        trigger: feature,
                        start: 'top 90%',
                        toggleActions: 'play none none none'
                    },
                    opacity: 1,
                    y: 0,
                    duration: 0.8,
                    delay: index * 0.15,
                    ease: 'power3.out'
                }
            );
        }
    });

    // CEO Section - check if already visible
    const ceoImage = document.querySelector('.ceo-image');
    if (ceoImage) {
        const rect = ceoImage.getBoundingClientRect();
        const isInViewport = rect.top < window.innerHeight && rect.bottom > 0;

        if (isInViewport) {
            gsap.set(ceoImage, { opacity: 1, x: 0 });
        } else {
            gsap.fromTo(ceoImage,
                { opacity: 0, x: -100 },
                {
                    scrollTrigger: {
                        trigger: '.ceo-section',
                        start: 'top 75%',
                        toggleActions: 'play none none none'
                    },
                    opacity: 1,
                    x: 0,
                    duration: 1,
                    ease: 'power3.out'
                }
            );
        }
    }

    const ceoContent = document.querySelector('.ceo-content');
    if (ceoContent) {
        const rect = ceoContent.getBoundingClientRect();
        const isInViewport = rect.top < window.innerHeight && rect.bottom > 0;

        if (isInViewport) {
            gsap.set(ceoContent, { opacity: 1, x: 0 });
        } else {
            gsap.fromTo(ceoContent,
                { opacity: 0, x: 100 },
                {
                    scrollTrigger: {
                        trigger: '.ceo-section',
                        start: 'top 75%',
                        toggleActions: 'play none none none'
                    },
                    opacity: 1,
                    x: 0,
                    duration: 1,
                    ease: 'power3.out'
                }
            );
        }
    }

    // Product cards - check if already visible
    gsap.utils.toArray('.product-card').forEach((card, index) => {
        const rect = card.getBoundingClientRect();
        const isInViewport = rect.top < window.innerHeight && rect.bottom > 0;

        if (isInViewport) {
            gsap.set(card, { opacity: 1, y: 0, scale: 1 });
        } else {
            gsap.fromTo(card,
                { opacity: 0, y: 80, scale: 0.9 },
                {
                    scrollTrigger: {
                        trigger: card,
                        start: 'top 90%',
                        toggleActions: 'play none none none'
                    },
                    opacity: 1,
                    y: 0,
                    scale: 1,
                    duration: 0.8,
                    delay: index * 0.1,
                    ease: 'back.out(1.7)'
                }
            );
        }
    });

    // Stats counter animation with particle effects
    initHeroStatsAnimation();

    // Location markers on map - check if already visible
    const worldMap = document.querySelector('.world-map');
    const mapInViewport = worldMap ? worldMap.getBoundingClientRect().top < window.innerHeight : false;

    gsap.utils.toArray('.location-marker').forEach((marker, index) => {
        if (mapInViewport) {
            gsap.set(marker, { opacity: 1, scale: 1 });
        } else {
            gsap.fromTo(marker,
                { opacity: 0, scale: 0 },
                {
                    scrollTrigger: {
                        trigger: '.world-map',
                        start: 'top 75%',
                        toggleActions: 'play none none none'
                    },
                    opacity: 1,
                    scale: 1,
                    duration: 0.6,
                    delay: index * 0.15,
                    ease: 'back.out(2)'
                }
            );
        }
    });

    // Project cards timeline - check if already visible
    gsap.utils.toArray('.project-card').forEach((card, index) => {
        const rect = card.getBoundingClientRect();
        const isInViewport = rect.top < window.innerHeight && rect.bottom > 0;

        if (isInViewport) {
            gsap.set(card, { opacity: 1, x: 0 });
        } else {
            gsap.fromTo(card,
                { opacity: 0, x: index % 2 === 0 ? -100 : 100 },
                {
                    scrollTrigger: {
                        trigger: card,
                        start: 'top 90%',
                        toggleActions: 'play none none none'
                    },
                    opacity: 1,
                    x: 0,
                    duration: 1,
                    ease: 'power3.out'
                }
            );
        }
    });

    // Team cards - check if already visible, then animate if needed
    gsap.utils.toArray('.team-card').forEach((card, index) => {
        const rect = card.getBoundingClientRect();
        const isInViewport = rect.top < window.innerHeight && rect.bottom > 0;

        if (isInViewport) {
            // Already visible - just ensure it's shown
            gsap.set(card, { opacity: 1, y: 0, rotation: 0 });
        } else {
            // Not yet visible - animate when scrolled into view
            gsap.fromTo(card,
                {
                    opacity: 0,
                    y: 60,
                    rotation: index % 2 === 0 ? -5 : 5
                },
                {
                    scrollTrigger: {
                        trigger: card,
                        start: 'top 90%',
                        toggleActions: 'play none none none'
                    },
                    opacity: 1,
                    y: 0,
                    rotation: 0,
                    duration: 0.8,
                    delay: index * 0.1,
                    ease: 'power3.out'
                }
            );
        }
    });

    // Value cards - check if already visible, then animate if needed
    gsap.utils.toArray('.value-card').forEach((card, index) => {
        const rect = card.getBoundingClientRect();
        const isInViewport = rect.top < window.innerHeight && rect.bottom > 0;

        if (isInViewport) {
            gsap.set(card, { opacity: 1, y: 0 });
        } else {
            gsap.fromTo(card,
                { opacity: 0, y: 50 },
                {
                    scrollTrigger: {
                        trigger: card,
                        start: 'top 90%',
                        toggleActions: 'play none none none'
                    },
                    opacity: 1,
                    y: 0,
                    duration: 0.8,
                    delay: index * 0.15,
                    ease: 'power3.out'
                }
            );
        }
    });

    // CTA section - check if already visible
    const ctaContent = document.querySelector('.cta-section .cta-content');
    if (ctaContent) {
        const rect = ctaContent.getBoundingClientRect();
        const isInViewport = rect.top < window.innerHeight && rect.bottom > 0;

        if (isInViewport) {
            gsap.set(ctaContent, { opacity: 1, scale: 1 });
        } else {
            gsap.fromTo(ctaContent,
                { opacity: 0, scale: 0.9 },
                {
                    scrollTrigger: {
                        trigger: '.cta-section',
                        start: 'top 80%',
                        toggleActions: 'play none none none'
                    },
                    opacity: 1,
                    scale: 1,
                    duration: 1,
                    ease: 'power3.out'
                }
            );
        }
    }

    // Footer columns - check if already visible
    const footer = document.querySelector('.footer');
    const footerInViewport = footer ? footer.getBoundingClientRect().top < window.innerHeight : false;

    gsap.utils.toArray('.footer-column').forEach((col, index) => {
        if (footerInViewport) {
            gsap.set(col, { opacity: 1, y: 0 });
        } else {
            gsap.fromTo(col,
                { opacity: 0, y: 30 },
                {
                    scrollTrigger: {
                        trigger: '.footer',
                        start: 'top 95%',
                        toggleActions: 'play none none none'
                    },
                    opacity: 1,
                    y: 0,
                    duration: 0.6,
                    delay: index * 0.1,
                    ease: 'power3.out'
                }
            );
        }
    });
}

// ============================================
// NAVIGATION
// ============================================
function initNavigation() {
    const header = document.querySelector('.main-header');
    const topNav = document.querySelector('.top-nav');
    const mobileMenuToggle = document.querySelector('.mobile-menu-toggle');
    const mainNav = document.querySelector('.main-nav');

    // Sticky header on scroll - throttled with requestAnimationFrame
    let lastScroll = 0;
    let ticking = false;

    window.addEventListener('scroll', () => {
        if (!ticking) {
            requestAnimationFrame(() => {
                const currentScroll = window.pageYOffset;

                // After scrolling 100px: hide top-nav, show scrolled header style
                if (currentScroll > 100) {
                    header.classList.add('scrolled');
                    if (topNav) {
                        topNav.style.transform = 'translateY(-100%)';
                        topNav.style.opacity = '0';
                    }
                } else {
                    header.classList.remove('scrolled');
                    if (topNav) {
                        topNav.style.transform = 'translateY(0)';
                        topNav.style.opacity = '1';
                    }
                }

                // Don't hide header on scroll down - keep it always visible
                lastScroll = currentScroll;
                ticking = false;
            });
            ticking = true;
        }
    }, { passive: true });

    // Mobile menu toggle
    const mobileNavOverlay = document.querySelector('.mobile-nav-overlay');
    const mobileNavClose = document.querySelector('.mobile-nav-close');

    // Function to close mobile menu
    function closeMobileMenu() {
        mobileMenuToggle.classList.remove('active');
        mobileNavOverlay.classList.remove('active');
        document.body.style.overflow = '';
    }

    if (mobileMenuToggle && mobileNavOverlay) {
        // Toggle menu with hamburger button
        mobileMenuToggle.addEventListener('click', () => {
            mobileMenuToggle.classList.toggle('active');
            mobileNavOverlay.classList.toggle('active');
            document.body.style.overflow = mobileNavOverlay.classList.contains('active') ? 'hidden' : '';
        });

        // Close button
        if (mobileNavClose) {
            mobileNavClose.addEventListener('click', closeMobileMenu);
        }

        // Close mobile menu when clicking a link
        const mobileNavLinks = mobileNavOverlay.querySelectorAll('a');
        mobileNavLinks.forEach(link => {
            link.addEventListener('click', closeMobileMenu);
        });

        // Accordion submenus
        const mobileNavToggles = mobileNavOverlay.querySelectorAll('.mobile-nav-toggle');
        mobileNavToggles.forEach(toggle => {
            toggle.addEventListener('click', () => {
                const parentItem = toggle.closest('.mobile-nav-item');
                // Close other open submenus
                mobileNavOverlay.querySelectorAll('.mobile-nav-item.active').forEach(item => {
                    if (item !== parentItem) {
                        item.classList.remove('active');
                    }
                });
                // Toggle current submenu
                parentItem.classList.toggle('active');
            });
        });

        // Close on clicking outside the menu content
        mobileNavOverlay.addEventListener('click', (e) => {
            if (e.target === mobileNavOverlay) {
                closeMobileMenu();
            }
        });
    }

    // Search functionality
    const searchBtn = document.querySelector('.search-btn');
    const searchOverlay = document.querySelector('.search-overlay');
    const searchClose = document.querySelector('.search-close');
    const searchInput = document.querySelector('.search-input');

    if (searchBtn && searchOverlay) {
        searchBtn.addEventListener('click', () => {
            searchOverlay.classList.add('active');
            document.body.style.overflow = 'hidden';
            // Focus the input after a short delay for animation
            setTimeout(() => {
                if (searchInput) searchInput.focus();
            }, 100);
        });

        if (searchClose) {
            searchClose.addEventListener('click', () => {
                searchOverlay.classList.remove('active');
                document.body.style.overflow = '';
            });
        }

        // Close on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && searchOverlay.classList.contains('active')) {
                searchOverlay.classList.remove('active');
                document.body.style.overflow = '';
            }
        });

        // Close when clicking suggestion links
        const searchSuggestions = searchOverlay.querySelectorAll('.search-suggestions a');
        searchSuggestions.forEach(link => {
            link.addEventListener('click', () => {
                searchOverlay.classList.remove('active');
                document.body.style.overflow = '';
            });
        });
    }

    // ORIGINAL Smooth scroll for anchor links (AUSKOMMENTIERT für Test)
    /*
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                gsap.to(window, {
                    scrollTo: {
                        y: target,
                        offsetY: 80
                    },
                    duration: 1,
                    ease: 'power3.inOut'
                });
            }
        });
    });
    */

    // NEU: Page Transition Effect für Navigation
    initPageTransitionEffect();
}

// ============================================
// PAGE TRANSITION EFFECT - Experimentell
// ============================================
function initPageTransitionEffect() {
    // Erstelle Transition Overlay
    const transitionOverlay = document.createElement('div');
    transitionOverlay.className = 'page-transition-overlay';
    transitionOverlay.innerHTML = `
        <div class="transition-panels">
            <div class="transition-panel panel-1"></div>
            <div class="transition-panel panel-2"></div>
            <div class="transition-panel panel-3"></div>
            <div class="transition-panel panel-4"></div>
            <div class="transition-panel panel-5"></div>
        </div>
        <div class="transition-logo">
            <svg viewBox="0 0 100 100" class="transition-icon">
                <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="251" stroke-dashoffset="251"/>
            </svg>
        </div>
    `;
    document.body.appendChild(transitionOverlay);

    // Füge Styles hinzu
    const transitionStyles = document.createElement('style');
    transitionStyles.textContent = `
        .page-transition-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 9999;
            pointer-events: none;
            visibility: hidden;
        }

        .page-transition-overlay.active {
            visibility: visible;
            pointer-events: auto;
        }

        .transition-panels {
            display: flex;
            width: 100%;
            height: 100%;
        }

        .transition-panel {
            flex: 1;
            height: 100%;
            background: var(--primary-navy);
            transform: translateY(100%);
            transition: transform 0.5s cubic-bezier(0.77, 0, 0.175, 1);
        }

        .transition-panel.panel-1 { transition-delay: 0s; background: #0a1628; }
        .transition-panel.panel-2 { transition-delay: 0.05s; background: #0d1c32; }
        .transition-panel.panel-3 { transition-delay: 0.1s; background: #10223c; }
        .transition-panel.panel-4 { transition-delay: 0.15s; background: #132846; }
        .transition-panel.panel-5 { transition-delay: 0.2s; background: #162e50; }

        .page-transition-overlay.active .transition-panel {
            transform: translateY(0);
        }

        .page-transition-overlay.exit .transition-panel {
            transform: translateY(-100%);
            transition-delay: 0s;
        }

        .page-transition-overlay.exit .transition-panel.panel-1 { transition-delay: 0.2s; }
        .page-transition-overlay.exit .transition-panel.panel-2 { transition-delay: 0.15s; }
        .page-transition-overlay.exit .transition-panel.panel-3 { transition-delay: 0.1s; }
        .page-transition-overlay.exit .transition-panel.panel-4 { transition-delay: 0.05s; }
        .page-transition-overlay.exit .transition-panel.panel-5 { transition-delay: 0s; }

        .transition-logo {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            opacity: 0;
            transition: opacity 0.3s ease 0.3s;
        }

        .page-transition-overlay.active .transition-logo {
            opacity: 1;
        }

        .page-transition-overlay.exit .transition-logo {
            opacity: 0;
            transition-delay: 0s;
        }

        .transition-icon {
            width: 60px;
            height: 60px;
            color: var(--accent-gold);
        }

        .transition-icon circle {
            animation: none;
        }

        .page-transition-overlay.active .transition-icon circle {
            animation: drawCircle 0.8s ease-out 0.3s forwards;
        }

        @keyframes drawCircle {
            to {
                stroke-dashoffset: 0;
            }
        }

        /* Goldener Glow beim Laden */
        .transition-logo::after {
            content: '';
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 80px;
            height: 80px;
            background: radial-gradient(circle, rgba(212, 175, 55, 0.3) 0%, transparent 70%);
            opacity: 0;
            animation: none;
        }

        .page-transition-overlay.active .transition-logo::after {
            animation: pulseGlow 1s ease-in-out infinite;
        }

        @keyframes pulseGlow {
            0%, 100% { opacity: 0.5; transform: translate(-50%, -50%) scale(1); }
            50% { opacity: 1; transform: translate(-50%, -50%) scale(1.2); }
        }
    `;
    document.head.appendChild(transitionStyles);

    // Event Listener für alle Anchor Links (außer CEO Modal Button)
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        // Skip CEO Modal Button
        if (anchor.id === 'open-ceo-modal') return;

        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            const target = document.querySelector(targetId);

            if (!target) return;

            // Schließe Mobile Menu falls offen
            const mobileOverlay = document.querySelector('.mobile-nav-overlay');
            const mobileToggle = document.querySelector('.mobile-menu-toggle');
            if (mobileOverlay && mobileOverlay.classList.contains('active')) {
                mobileOverlay.classList.remove('active');
                mobileToggle?.classList.remove('active');
                document.body.style.overflow = '';
            }

            // Starte Transition
            transitionOverlay.classList.add('active');
            transitionOverlay.classList.remove('exit');

            // Nach Panels eingefahren sind, scrolle zum Ziel
            setTimeout(() => {
                window.scrollTo({
                    top: target.offsetTop - 80,
                    behavior: 'auto' // Instant scroll während Overlay sichtbar
                });

                // Exit Animation starten
                setTimeout(() => {
                    transitionOverlay.classList.add('exit');

                    // Cleanup nach Animation
                    setTimeout(() => {
                        transitionOverlay.classList.remove('active', 'exit');
                    }, 600);
                }, 400);
            }, 600);
        });
    });
}

// ============================================
// INTERACTIVE MAP - Info Box on Hover
// ============================================
let mapInteractionsInitialized = false;
let mapHoverTimeout = null;
let mapActiveLocation = null;

function showMapInfoBox(locationId) {
    // Clear any pending hide
    clearTimeout(mapHoverTimeout);

    // Skip if already showing this location
    if (mapActiveLocation === locationId) return;
    mapActiveLocation = locationId;

    // Hide all other info boxes first
    document.querySelectorAll('.map-info-box').forEach(box => {
        if (box.dataset.location !== locationId) {
            box.classList.remove('active');
            box.style.opacity = '0';
            box.style.visibility = 'hidden';
        }
    });
    document.querySelectorAll('.location-marker').forEach(m => m.classList.remove('active'));

    // Get the marker and info box
    const marker = document.querySelector(`.location-marker[data-location="${locationId}"]`);
    const infoBox = document.querySelector(`.map-info-box[data-location="${locationId}"]`);

    if (!infoBox) {
        console.warn('[Map] No info box found for location:', locationId);
        return;
    }

    if (infoBox && marker) {
        // Position info box at marker location
        const mapContainer = document.querySelector('.map-container');
        const svg = mapContainer?.querySelector('svg.map-svg');

        if (svg && mapContainer) {
            const markerCircle = marker.querySelector('.marker-logo');
            if (markerCircle) {
                const cx = parseFloat(markerCircle.getAttribute('cx'));
                const cy = parseFloat(markerCircle.getAttribute('cy'));

                // Get SVG viewBox for percentage calculation
                const viewBox = svg.viewBox.baseVal;
                const percentX = (cx / viewBox.width) * 100;
                const percentY = (cy / viewBox.height) * 100;

                // Position the card - offset so it doesn't cover marker
                infoBox.style.left = `${percentX}%`;
                infoBox.style.top = `${percentY}%`;
            }
        }

        // Show the info box
        infoBox.style.visibility = 'visible';
        infoBox.style.opacity = '1';
        infoBox.classList.add('active');
        marker.classList.add('active');

        // GSAP Premium Animation
        if (typeof gsap !== 'undefined') {
            const corners = infoBox.querySelectorAll('.info-card-corner');
            const inner = infoBox.querySelector('.info-card-inner');
            const header = infoBox.querySelector('.info-box-header');
            const content = infoBox.querySelector('.info-box-content');
            const teamSection = infoBox.querySelector('.info-team-section');

            // Kill any running animations
            gsap.killTweensOf([infoBox, corners, inner, header, content, teamSection]);

            // Create timeline
            const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

            // Initial state
            gsap.set(infoBox, { scale: 0.1, opacity: 0 });
            gsap.set(corners, { opacity: 0 });
            if (inner) gsap.set(inner, { opacity: 0 });

            // Animate in
            tl.to(infoBox, { scale: 1, opacity: 1, duration: 0.5, ease: 'back.out(1.5)' });
            if (inner) tl.to(inner, { opacity: 1, duration: 0.3 }, '-=0.3');
            tl.to(corners, { opacity: 0.6, duration: 0.3, stagger: 0.05 }, '-=0.2');
            if (content) tl.to(content, { opacity: 1, duration: 0.3 }, '-=0.2');
            if (teamSection) tl.to(teamSection, { opacity: 1, duration: 0.3 }, '-=0.2');
        }
    }
}

function hideAllMapInfoBoxes() {
    mapActiveLocation = null;

    document.querySelectorAll('.map-info-box').forEach(box => {
        if (typeof gsap !== 'undefined' && box.classList.contains('active')) {
            // Smooth hide animation with GSAP
            gsap.killTweensOf(box);
            gsap.to(box, {
                scale: 0.15,
                opacity: 0,
                duration: 0.3,
                ease: 'power2.in',
                onComplete: () => {
                    box.classList.remove('active');
                    gsap.set(box, { clearProps: 'all' });
                }
            });
        } else {
            box.classList.remove('active');
        }
    });

    document.querySelectorAll('.location-marker').forEach(marker => marker.classList.remove('active'));
}

function scheduleHideMapInfoBoxes() {
    clearTimeout(mapHoverTimeout);
    mapHoverTimeout = setTimeout(() => {
        hideAllMapInfoBoxes();
    }, 400);
}

function initInteractiveMap() {
    const markers = document.querySelectorAll('.location-marker');
    const infoBoxes = document.querySelectorAll('.map-info-box');

    // Only add marker listeners once (they don't change)
    if (!mapInteractionsInitialized) {
        mapInteractionsInitialized = true;

        // Use event delegation on the map container for better performance
        const mapContainer = document.querySelector('.world-map');
        if (mapContainer) {
            mapContainer.addEventListener('mouseover', (e) => {
                const marker = e.target.closest('.location-marker');
                if (marker) {
                    const location = marker.dataset.location;
                    showMapInfoBox(location);
                }
            });

            mapContainer.addEventListener('mouseout', (e) => {
                const marker = e.target.closest('.location-marker');
                const infoBox = e.target.closest('.map-info-box');

                // Only schedule hide if leaving both marker and info box
                if (marker || infoBox) {
                    const relatedTarget = e.relatedTarget;
                    const goingToMarker = relatedTarget && relatedTarget.closest('.location-marker');
                    const goingToInfoBox = relatedTarget && relatedTarget.closest('.map-info-box');

                    if (!goingToMarker && !goingToInfoBox) {
                        scheduleHideMapInfoBoxes();
                    }
                }
            });

            // Click to toggle persistent selection
            mapContainer.addEventListener('click', (e) => {
                const marker = e.target.closest('.location-marker');
                if (marker) {
                    const location = marker.dataset.location;
                    if (mapActiveLocation === location) {
                        hideAllMapInfoBoxes();
                    } else {
                        showMapInfoBox(location);
                    }
                }
            });
        }
    }

    // Add listeners to info boxes (they are dynamically created)
    infoBoxes.forEach(box => {
        // Remove old listeners by cloning
        const newBox = box.cloneNode(true);
        box.parentNode.replaceChild(newBox, box);

        newBox.addEventListener('mouseenter', () => {
            clearTimeout(mapHoverTimeout);
        });

        newBox.addEventListener('mouseleave', (e) => {
            const relatedTarget = e.relatedTarget;
            const goingToMarker = relatedTarget && relatedTarget.closest('.location-marker');
            if (!goingToMarker) {
                scheduleHideMapInfoBoxes();
            }
        });
    });

    // Add connection line highlighting
    const tradeRoutes = document.querySelectorAll('.trade-route');
    tradeRoutes.forEach(route => {
        route.addEventListener('mouseenter', () => {
            route.classList.add('active');
        });
        route.addEventListener('mouseleave', () => {
            route.classList.remove('active');
        });
    });
}

// ============================================
// PRODUCT CARD HOVER EFFECTS
// ============================================
function initProductCards() {
    const cards = document.querySelectorAll('.product-card');

    cards.forEach(card => {
        const particles = card.querySelector('.sugar-particles');

        card.addEventListener('mouseenter', () => {
            if (particles) {
                particles.style.opacity = '1';
            }

            gsap.to(card, {
                y: -15,
                boxShadow: '0 30px 60px rgba(201, 162, 39, 0.3)',
                duration: 0.4,
                ease: 'power2.out'
            });
        });

        card.addEventListener('mouseleave', () => {
            if (particles) {
                particles.style.opacity = '0';
            }

            gsap.to(card, {
                y: 0,
                boxShadow: '0 10px 30px rgba(0, 0, 0, 0.1)',
                duration: 0.4,
                ease: 'power2.out'
            });
        });
    });
}

// ============================================
// PARALLAX EFFECTS
// ============================================
function initParallax() {
    gsap.utils.toArray('[data-parallax]').forEach(element => {
        const speed = element.dataset.parallax || 0.5;

        gsap.to(element, {
            scrollTrigger: {
                trigger: element,
                start: 'top bottom',
                end: 'bottom top',
                scrub: true
            },
            y: 100 * speed,
            ease: 'none'
        });
    });
}

// ============================================
// TYPING EFFECT FOR TAGLINE
// ============================================
function initTypingEffect() {
    const tagline = document.querySelector('.tagline');
    if (!tagline) return;

    const text = tagline.textContent;
    tagline.textContent = '';
    tagline.style.opacity = '1';

    let i = 0;
    const typeWriter = () => {
        if (i < text.length) {
            tagline.textContent += text.charAt(i);
            i++;
            setTimeout(typeWriter, 50);
        }
    };

    // Start typing after initial animations
    setTimeout(typeWriter, 1500);
}

// ============================================
// STOCK TICKER ANIMATION
// ============================================
function initStockTicker() {
    // Stock ticker animation disabled - single ticker item doesn't need scrolling
    // The animation was duplicating content and causing overflow issues
    // If you want scrolling ticker with multiple items, add a .stock-ticker-track wrapper
    return;
}

// ============================================
// SPECTACULAR MEGA-DROPDOWN EFFECTS
// ============================================
function initSpectacularDropdown() {
    const dropdowns = document.querySelectorAll('.mega-dropdown');
    const navItems = document.querySelectorAll('.nav-item.has-dropdown');

    // Add canvas for particle effect to each dropdown
    dropdowns.forEach((dropdown, index) => {
        // Create particle canvas
        const canvas = document.createElement('canvas');
        canvas.className = 'dropdown-particles-canvas';
        canvas.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 1;
        `;
        dropdown.insertBefore(canvas, dropdown.firstChild);

        // Initialize particle animation
        initDropdownParticles(canvas);

        // Add light sweep element to image section
        const imageSection = dropdown.querySelector('.dropdown-image-section');
        if (imageSection) {
            const lightSweep = document.createElement('div');
            lightSweep.className = 'light-sweep';
            imageSection.appendChild(lightSweep);
        }
    });

    // Text scramble effect for dropdown titles
    class TextScramble {
        constructor(el) {
            this.el = el;
            this.chars = '!<>-_\\/[]{}—=+*^?#________';
            this.originalText = el.textContent;
            this.update = this.update.bind(this);
        }

        setText(newText) {
            const oldText = this.el.textContent;
            const length = Math.max(oldText.length, newText.length);
            const promise = new Promise((resolve) => this.resolve = resolve);
            this.queue = [];

            for (let i = 0; i < length; i++) {
                const from = oldText[i] || '';
                const to = newText[i] || '';
                const start = Math.floor(Math.random() * 20);
                const end = start + Math.floor(Math.random() * 20);
                this.queue.push({ from, to, start, end });
            }

            cancelAnimationFrame(this.frameRequest);
            this.frame = 0;
            this.update();
            return promise;
        }

        update() {
            let output = '';
            let complete = 0;

            for (let i = 0, n = this.queue.length; i < n; i++) {
                let { from, to, start, end, char } = this.queue[i];

                if (this.frame >= end) {
                    complete++;
                    output += to;
                } else if (this.frame >= start) {
                    if (!char || Math.random() < 0.28) {
                        char = this.chars[Math.floor(Math.random() * this.chars.length)];
                        this.queue[i].char = char;
                    }
                    output += `<span class="scramble-char">${char}</span>`;
                } else {
                    output += from;
                }
            }

            this.el.innerHTML = output;

            if (complete === this.queue.length) {
                this.resolve();
            } else {
                this.frameRequest = requestAnimationFrame(this.update);
                this.frame++;
            }
        }

        reset() {
            cancelAnimationFrame(this.frameRequest);
            this.el.textContent = this.originalText;
        }
    }

    // Apply text scramble to dropdown titles
    navItems.forEach(item => {
        const title = item.querySelector('.dropdown-main-title');
        if (title) {
            const scrambler = new TextScramble(title);
            const originalText = title.textContent;

            item.addEventListener('mouseenter', () => {
                scrambler.setText(originalText);
            });

            item.addEventListener('mouseleave', () => {
                scrambler.reset();
            });
        }
    });

    // Magnetic effect for dropdown links
    const dropdownLinks = document.querySelectorAll('.dropdown-nav-list a');

    dropdownLinks.forEach(link => {
        link.addEventListener('mousemove', (e) => {
            const rect = link.getBoundingClientRect();
            const x = e.clientX - rect.left - rect.width / 2;
            const y = e.clientY - rect.top - rect.height / 2;

            gsap.to(link, {
                x: x * 0.15,
                y: y * 0.15,
                duration: 0.3,
                ease: 'power2.out'
            });
        });

        link.addEventListener('mouseleave', () => {
            gsap.to(link, {
                x: 0,
                y: 0,
                duration: 0.5,
                ease: 'elastic.out(1, 0.3)'
            });
        });

        // Ripple effect on click
        link.addEventListener('click', (e) => {
            const ripple = document.createElement('span');
            ripple.className = 'ripple-effect';
            ripple.style.cssText = `
                position: absolute;
                background: rgba(201, 162, 39, 0.4);
                border-radius: 50%;
                transform: scale(0);
                animation: rippleExpand 0.6s ease-out;
                pointer-events: none;
            `;

            const rect = link.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);
            ripple.style.width = ripple.style.height = size + 'px';
            ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
            ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';

            link.style.position = 'relative';
            link.appendChild(ripple);

            setTimeout(() => ripple.remove(), 600);
        });
    });
}

// Dropdown particle network effect
function initDropdownParticles(canvas) {
    const ctx = canvas.getContext('2d');
    let animationId;
    let particles = [];
    let isActive = false;

    function resizeCanvas() {
        const rect = canvas.parentElement.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
    }

    class Particle {
        constructor() {
            this.reset();
        }

        reset() {
            this.x = Math.random() * canvas.width;
            this.y = Math.random() * canvas.height;
            this.size = Math.random() * 3 + 1;
            this.speedX = (Math.random() - 0.5) * 0.8;
            this.speedY = (Math.random() - 0.5) * 0.8;
            this.opacity = Math.random() * 0.5 + 0.2;
            // Sugar crystal colors: gold, white, cream
            const colors = [
                'rgba(201, 162, 39, ',
                'rgba(255, 255, 255, ',
                'rgba(245, 240, 232, '
            ];
            this.color = colors[Math.floor(Math.random() * colors.length)];
        }

        update() {
            this.x += this.speedX;
            this.y += this.speedY;

            if (this.x < 0 || this.x > canvas.width) this.speedX *= -1;
            if (this.y < 0 || this.y > canvas.height) this.speedY *= -1;
        }

        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fillStyle = this.color + this.opacity + ')';
            ctx.fill();
        }
    }

    function init() {
        resizeCanvas();
        particles = [];
        for (let i = 0; i < 40; i++) {
            particles.push(new Particle());
        }
    }

    function drawConnections() {
        for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
                const dx = particles[i].x - particles[j].x;
                const dy = particles[i].y - particles[j].y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < 100) {
                    ctx.beginPath();
                    ctx.strokeStyle = `rgba(201, 162, 39, ${0.2 * (1 - distance / 100)})`;
                    ctx.lineWidth = 0.5;
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.stroke();
                }
            }
        }
    }

    function animate() {
        if (!isActive) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        particles.forEach(particle => {
            particle.update();
            particle.draw();
        });

        drawConnections();

        animationId = requestAnimationFrame(animate);
    }

    // Observe parent dropdown visibility
    const dropdown = canvas.parentElement;
    const navItem = dropdown.closest('.nav-item');

    if (navItem) {
        navItem.addEventListener('mouseenter', () => {
            isActive = true;
            init();
            animate();
        });

        navItem.addEventListener('mouseleave', () => {
            isActive = false;
            cancelAnimationFrame(animationId);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        });
    }

    window.addEventListener('resize', resizeCanvas);
}

// ============================================
// DROPDOWN PANEL HOVER EFFECTS
// ============================================
function initDropdownPanels() {
    const dropdownLinks = document.querySelectorAll('.dropdown-nav-list a[data-panel]');

    dropdownLinks.forEach(link => {
        link.addEventListener('mouseenter', () => {
            const panelId = link.getAttribute('data-panel');
            const dropdown = link.closest('.mega-dropdown');
            if (!dropdown) return;

            const imageSection = dropdown.querySelector('.dropdown-image-section');
            if (!imageSection) return;

            // Hide all panels in this dropdown
            const allPanels = imageSection.querySelectorAll('.dropdown-panel');
            allPanels.forEach(panel => {
                panel.classList.remove('active');
            });

            // Show the target panel
            const targetPanel = imageSection.querySelector(`.dropdown-panel[data-panel="${panelId}"]`);
            if (targetPanel) {
                targetPanel.classList.add('active');

                // Trigger animations for elements inside the panel
                const progressFills = targetPanel.querySelectorAll('.progress-fill, .risk-fill');
                progressFills.forEach(fill => {
                    fill.style.animation = 'none';
                    fill.offsetHeight; // Trigger reflow
                    fill.style.animation = '';
                });

                // Animate numbers if present
                const statValues = targetPanel.querySelectorAll('.stat-value, .value');
                statValues.forEach(stat => {
                    stat.style.animation = 'none';
                    stat.offsetHeight;
                    stat.style.animation = 'countUp 0.8s ease-out forwards';
                });
            }
        });

        link.addEventListener('mouseleave', () => {
            // Optional: Keep panel visible until another is hovered
            // or until mouse leaves the dropdown entirely
        });
    });

    // Hide panels when leaving dropdown entirely
    const dropdowns = document.querySelectorAll('.mega-dropdown');
    dropdowns.forEach(dropdown => {
        const navItem = dropdown.closest('.nav-item');
        if (navItem) {
            navItem.addEventListener('mouseleave', () => {
                const panels = dropdown.querySelectorAll('.dropdown-panel');
                panels.forEach(panel => {
                    panel.classList.remove('active');
                });
            });
        }
    });
}

// Initialize dropdown panels
document.addEventListener('DOMContentLoaded', () => {
    initDropdownPanels();
});

// Add ripple keyframe animation
const rippleStyle = document.createElement('style');
rippleStyle.textContent = `
    @keyframes rippleExpand {
        to {
            transform: scale(4);
            opacity: 0;
        }
    }

    @keyframes countUp {
        0% { opacity: 0; transform: translateY(10px); }
        100% { opacity: 1; transform: translateY(0); }
    }

    .scramble-char {
        color: var(--accent-gold);
        opacity: 0.7;
    }

    .dropdown-particles-canvas {
        opacity: 0;
        transition: opacity 0.5s ease;
    }

    .nav-item.has-dropdown:hover .dropdown-particles-canvas {
        opacity: 1;
    }
`;
document.head.appendChild(rippleStyle);

// ============================================
// INITIALIZE EVERYTHING
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    // Core functionality
    initGlobe();
    initSugarParticles();
    initNavigation();
    initInteractiveMap();
    initProductCards();
    initParallax();
    initStockTicker();
    initSpectacularDropdown();

    // Initialize visual effects after a short delay to ensure DOM is fully ready
    setTimeout(() => {
        initScrollProgress();
        initMagneticButtons();
        initTiltEffect();
        initFloatingShapes();
        initSmoothReveal();
    }, 100);
});

// ============================================
// SCROLL PROGRESS BAR
// ============================================
function initScrollProgress() {
    const progressBar = document.createElement('div');
    progressBar.className = 'scroll-progress-bar';
    document.body.appendChild(progressBar);

    window.addEventListener('scroll', () => {
        const scrollTop = window.scrollY;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        const progress = (scrollTop / docHeight) * 100;
        progressBar.style.width = `${progress}%`;
    }, { passive: true });
}

// ============================================
// MAGNETIC BUTTONS - Simplified for performance
// ============================================
function initMagneticButtons() {
    // Disabled for better performance - CSS hover effects are smoother
}

// ============================================
// TILT EFFECT FOR CARDS - Simplified for performance
// ============================================
function initTiltEffect() {
    // Disabled for better performance - CSS hover effects are smoother
}

// ============================================
// FLOATING SHAPES BACKGROUND - Disabled for performance
// ============================================
function initFloatingShapes() {
    // Disabled for better performance - these large animated blurs cause frame drops
}

// ============================================
// SMOOTH REVEAL ANIMATIONS
// ============================================
function initSmoothReveal() {
    // Note: Elements animated by GSAP (team-card, product-card, value-card, section-header, feature)
    // are excluded here to prevent conflicts with ScrollTrigger animations
    const revealElements = document.querySelectorAll(
        '.stat-item'
    );

    // If no elements found, skip initialization
    if (revealElements.length === 0) {
        console.log('No reveal elements found');
        return;
    }

    // Add reveal styles first (before adding classes)
    const revealStyle = document.createElement('style');
    revealStyle.textContent = `
        .reveal-element {
            opacity: 0;
            transform: translateY(40px);
            transition: opacity 0.8s cubic-bezier(0.4, 0, 0.2, 1),
                        transform 0.8s cubic-bezier(0.4, 0, 0.2, 1);
            transition-delay: var(--reveal-delay, 0s);
        }

        .reveal-element.revealed {
            opacity: 1;
            transform: translateY(0);
        }
    `;
    document.head.appendChild(revealStyle);

    // Check if IntersectionObserver is supported
    if (!('IntersectionObserver' in window)) {
        // Fallback: just show all elements immediately
        revealElements.forEach(el => {
            el.style.opacity = '1';
            el.style.transform = 'translateY(0)';
        });
        return;
    }

    revealElements.forEach((el, index) => {
        el.classList.add('reveal-element');
        // Limit the delay to avoid very long waits
        el.style.setProperty('--reveal-delay', `${Math.min(index * 0.05, 0.5)}s`);
    });

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                // Add slight delay for smooth animation
                requestAnimationFrame(() => {
                    entry.target.classList.add('revealed');
                });
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -30px 0px' });

    revealElements.forEach(el => observer.observe(el));

    // Fallback: if elements are still hidden after 3 seconds, show them
    setTimeout(() => {
        revealElements.forEach(el => {
            if (!el.classList.contains('revealed')) {
                el.classList.add('revealed');
            }
        });
    }, 3000);
}

// ============================================
// PERFORMANCE OPTIMIZATION
// ============================================
// Pause animations when tab is not visible
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        globeRotationSpeed = 0;
    } else {
        globeRotationSpeed = 0.002;
    }
});

// Reduce animations on mobile
if (window.innerWidth < 768) {
    globeRotationSpeed = 0.001;
}

// ============================================
// CONTACT FORM VALIDATION & SUBMISSION
// ============================================
function initContactForm() {
    const form = document.getElementById('contactForm');
    if (!form) return;

    const submitBtn = document.getElementById('submitBtn');
    const formSuccess = document.getElementById('formSuccess');
    const formError = document.getElementById('formError');
    const charCount = document.getElementById('charCount');
    const messageField = document.getElementById('message');

    // Character counter for message
    if (messageField && charCount) {
        messageField.addEventListener('input', () => {
            const count = messageField.value.length;
            charCount.textContent = count;
            if (count > 2000) {
                charCount.parentElement.style.color = '#dc3545';
            } else {
                charCount.parentElement.style.color = '';
            }
        });
    }

    // Validation rules
    const validators = {
        firstName: {
            required: true,
            minLength: 2,
            maxLength: 50,
            pattern: /^[a-zA-ZäöüÄÖÜß\s'-]+$/,
            messages: {
                required: 'First name is required',
                minLength: 'First name must be at least 2 characters',
                maxLength: 'First name must be less than 50 characters',
                pattern: 'Please enter a valid name'
            }
        },
        lastName: {
            required: true,
            minLength: 2,
            maxLength: 50,
            pattern: /^[a-zA-ZäöüÄÖÜß\s'-]+$/,
            messages: {
                required: 'Last name is required',
                minLength: 'Last name must be at least 2 characters',
                maxLength: 'Last name must be less than 50 characters',
                pattern: 'Please enter a valid name'
            }
        },
        email: {
            required: true,
            pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
            messages: {
                required: 'Email address is required',
                pattern: 'Please enter a valid email address'
            }
        },
        phone: {
            required: false,
            pattern: /^[\d\s+\-().]{7,20}$/,
            messages: {
                pattern: 'Please enter a valid phone number'
            }
        },
        inquiry: {
            required: true,
            messages: {
                required: 'Please select an inquiry type'
            }
        },
        message: {
            required: true,
            minLength: 20,
            maxLength: 2000,
            messages: {
                required: 'Message is required',
                minLength: 'Message must be at least 20 characters',
                maxLength: 'Message must be less than 2000 characters'
            }
        },
        privacy: {
            required: true,
            messages: {
                required: 'You must agree to the Privacy Policy'
            }
        }
    };

    // Validate single field
    function validateField(fieldName, value) {
        const rules = validators[fieldName];
        if (!rules) return { valid: true };

        // Check required
        if (rules.required && (!value || value.trim() === '')) {
            return { valid: false, message: rules.messages.required };
        }

        // Skip other checks if empty and not required
        if (!value || value.trim() === '') {
            return { valid: true };
        }

        // Check minLength
        if (rules.minLength && value.length < rules.minLength) {
            return { valid: false, message: rules.messages.minLength };
        }

        // Check maxLength
        if (rules.maxLength && value.length > rules.maxLength) {
            return { valid: false, message: rules.messages.maxLength };
        }

        // Check pattern
        if (rules.pattern && !rules.pattern.test(value)) {
            return { valid: false, message: rules.messages.pattern };
        }

        return { valid: true };
    }

    // Show/hide error for field
    function showFieldError(fieldName, message) {
        const field = form.querySelector(`[name="${fieldName}"]`);
        const errorEl = document.getElementById(`${fieldName}Error`);

        if (field) {
            field.classList.add('error');
            field.setAttribute('aria-invalid', 'true');
        }
        if (errorEl) {
            errorEl.textContent = message;
        }
    }

    function clearFieldError(fieldName) {
        const field = form.querySelector(`[name="${fieldName}"]`);
        const errorEl = document.getElementById(`${fieldName}Error`);

        if (field) {
            field.classList.remove('error');
            field.removeAttribute('aria-invalid');
        }
        if (errorEl) {
            errorEl.textContent = '';
        }
    }

    // Real-time validation on blur
    const fields = form.querySelectorAll('input, textarea, select');
    fields.forEach(field => {
        field.addEventListener('blur', () => {
            const fieldName = field.name;
            const value = field.type === 'checkbox' ? field.checked : field.value;
            const result = validateField(fieldName, value);

            if (!result.valid) {
                showFieldError(fieldName, result.message);
            } else {
                clearFieldError(fieldName);
            }
        });

        // Clear error on input
        field.addEventListener('input', () => {
            clearFieldError(field.name);
        });
    });

    // Form submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Validate all fields
        let isValid = true;
        const formData = {};

        Object.keys(validators).forEach(fieldName => {
            const field = form.querySelector(`[name="${fieldName}"]`);
            if (!field) return;

            const value = field.type === 'checkbox' ? field.checked : field.value;
            formData[fieldName] = value;

            const result = validateField(fieldName, value);
            if (!result.valid) {
                showFieldError(fieldName, result.message);
                isValid = false;
            } else {
                clearFieldError(fieldName);
            }
        });

        if (!isValid) {
            // Focus first error field
            const firstError = form.querySelector('.error');
            if (firstError) {
                firstError.focus();
            }
            return;
        }

        // Show loading state
        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.classList.add('loading');
            submitBtn.disabled = true;
        }

        // Send form data to server API
        try {
            const response = await fetch('/api/contact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.error || 'Failed to submit form');
            }

            // Show success message
            form.querySelectorAll('.elegant-form-row, .elegant-checkboxes, .elegant-submit-btn').forEach(el => {
                el.style.display = 'none';
            });
            formSuccess.hidden = false;
            formSuccess.scrollIntoView({ behavior: 'smooth', block: 'center' });

        } catch (error) {
            console.error('Form submission error:', error);
            formError.hidden = false;
            if (submitBtn) {
                submitBtn.classList.remove('loading');
                submitBtn.disabled = false;
            }
        }
    });
}

// Initialize contact form when DOM is ready
document.addEventListener('DOMContentLoaded', initContactForm);

// ============================================
// COOKIE CONSENT MANAGEMENT - GDPR Compliant
// ============================================
function initCookieConsent() {
    const banner = document.getElementById('cookieBanner');
    const settingsPanel = document.getElementById('cookieSettingsPanel');
    const acceptBtn = document.getElementById('acceptCookies');
    const rejectBtn = document.getElementById('rejectCookies');
    const settingsBtn = document.getElementById('cookieSettings');
    const saveBtn = document.getElementById('saveSettings');
    const cancelBtn = document.getElementById('cancelSettings');
    const analyticsCookies = document.getElementById('analyticsCookies');
    const marketingCookies = document.getElementById('marketingCookies');

    if (!banner) return;

    const COOKIE_NAME = 'im_cookie_consent';
    const COOKIE_EXPIRY = 365; // days

    // Check if consent already given
    const existingConsent = getCookie(COOKIE_NAME);
    if (!existingConsent) {
        // Show banner after a short delay
        setTimeout(() => {
            banner.hidden = false;
        }, 1500);
    } else {
        // Apply saved preferences
        const preferences = JSON.parse(existingConsent);
        applyPreferences(preferences);
    }

    // Accept all cookies
    acceptBtn?.addEventListener('click', () => {
        const preferences = {
            essential: true,
            analytics: true,
            marketing: true,
            timestamp: new Date().toISOString()
        };
        saveConsent(preferences);
        hideBanner();
    });

    // Reject non-essential cookies
    rejectBtn?.addEventListener('click', () => {
        const preferences = {
            essential: true,
            analytics: false,
            marketing: false,
            timestamp: new Date().toISOString()
        };
        saveConsent(preferences);
        hideBanner();
    });

    // Show settings panel
    settingsBtn?.addEventListener('click', () => {
        settingsPanel.hidden = false;
    });

    // Cancel settings
    cancelBtn?.addEventListener('click', () => {
        settingsPanel.hidden = true;
    });

    // Save custom preferences
    saveBtn?.addEventListener('click', () => {
        const preferences = {
            essential: true,
            analytics: analyticsCookies?.checked || false,
            marketing: marketingCookies?.checked || false,
            timestamp: new Date().toISOString()
        };
        saveConsent(preferences);
        hideBanner();
    });

    function saveConsent(preferences) {
        setCookie(COOKIE_NAME, JSON.stringify(preferences), COOKIE_EXPIRY);
        applyPreferences(preferences);
    }

    function applyPreferences(preferences) {
        // Apply analytics preference
        if (preferences.analytics) {
            // Enable analytics (Google Analytics, etc.)
            // window.gtag && window.gtag('consent', 'update', { analytics_storage: 'granted' });
            console.log('Analytics cookies enabled');
        } else {
            // Disable analytics
            // window.gtag && window.gtag('consent', 'update', { analytics_storage: 'denied' });
            console.log('Analytics cookies disabled');
        }

        // Apply marketing preference
        if (preferences.marketing) {
            // Enable marketing cookies
            // window.gtag && window.gtag('consent', 'update', { ad_storage: 'granted' });
            console.log('Marketing cookies enabled');
        } else {
            // Disable marketing cookies
            // window.gtag && window.gtag('consent', 'update', { ad_storage: 'denied' });
            console.log('Marketing cookies disabled');
        }
    }

    function hideBanner() {
        banner.hidden = true;
        settingsPanel.hidden = true;
    }

    function setCookie(name, value, days) {
        const expires = new Date();
        expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
        document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires.toUTCString()};path=/;SameSite=Lax;Secure`;
    }

    function getCookie(name) {
        const nameEQ = name + "=";
        const ca = document.cookie.split(';');
        for (let i = 0; i < ca.length; i++) {
            let c = ca[i];
            while (c.charAt(0) === ' ') c = c.substring(1, c.length);
            if (c.indexOf(nameEQ) === 0) {
                return decodeURIComponent(c.substring(nameEQ.length, c.length));
            }
        }
        return null;
    }
}

// Initialize cookie consent
document.addEventListener('DOMContentLoaded', initCookieConsent);

// ============================================
// ANIMATED NUMBER COUNTER
// ============================================
function initAnimatedCounters() {
    const counters = document.querySelectorAll('[data-counter]');
    if (!counters.length) return;

    const animateCounter = (element) => {
        const target = parseInt(element.getAttribute('data-counter'));
        const suffix = element.getAttribute('data-suffix') || '';
        const prefix = element.getAttribute('data-prefix') || '';
        const duration = 2000;
        const start = 0;
        const startTime = performance.now();

        const updateCounter = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Easing function (ease-out-cubic)
            const easeOut = 1 - Math.pow(1 - progress, 3);
            const current = Math.floor(start + (target - start) * easeOut);

            element.textContent = prefix + current.toLocaleString() + suffix;

            if (progress < 1) {
                requestAnimationFrame(updateCounter);
            } else {
                element.textContent = prefix + target.toLocaleString() + suffix;
            }
        };

        requestAnimationFrame(updateCounter);
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && !entry.target.classList.contains('counted')) {
                entry.target.classList.add('counted');
                animateCounter(entry.target);
            }
        });
    }, { threshold: 0.5 });

    counters.forEach(counter => observer.observe(counter));
}

document.addEventListener('DOMContentLoaded', initAnimatedCounters);

// ============================================
// PARTNER LOGOS INFINITE SCROLL
// ============================================
function initPartnerLogosScroll() {
    const track = document.querySelector('.partners-track');
    if (!track) return;

    // Clone items for seamless loop
    const items = track.querySelectorAll('.partner-logo');
    items.forEach(item => {
        const clone = item.cloneNode(true);
        track.appendChild(clone);
    });

    // Pause on hover
    track.addEventListener('mouseenter', () => {
        track.style.animationPlayState = 'paused';
    });

    track.addEventListener('mouseleave', () => {
        track.style.animationPlayState = 'running';
    });
}

document.addEventListener('DOMContentLoaded', initPartnerLogosScroll);

// ============================================
// TESTIMONIALS - Simple Grid (no slider needed)
// ============================================
// Testimonials now use CSS Grid layout - no JavaScript needed
// All cards are visible at once in a responsive grid

// ============================================
// NEWSLETTER SIGNUP
// ============================================
function initNewsletterSignup() {
    const forms = document.querySelectorAll('.newsletter-form');

    forms.forEach(form => {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const emailInput = form.querySelector('input[type="email"]');
            const submitBtn = form.querySelector('button[type="submit"]');
            const successMsg = form.querySelector('.newsletter-success');
            const errorMsg = form.querySelector('.newsletter-error');

            if (!emailInput || !emailInput.value) return;

            // Validate email
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(emailInput.value)) {
                if (errorMsg) {
                    errorMsg.textContent = 'Please enter a valid email address';
                    errorMsg.hidden = false;
                }
                return;
            }

            // Show loading
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<span class="spinner"></span>';
            }

            try {
                // Simulate API call (replace with actual endpoint)
                await new Promise(resolve => setTimeout(resolve, 1000));

                // Success
                if (successMsg) successMsg.hidden = false;
                if (errorMsg) errorMsg.hidden = true;
                emailInput.value = '';

                // Hide success after 5 seconds
                setTimeout(() => {
                    if (successMsg) successMsg.hidden = true;
                }, 5000);

            } catch (error) {
                if (errorMsg) {
                    errorMsg.textContent = 'Something went wrong. Please try again.';
                    errorMsg.hidden = false;
                }
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = 'Subscribe';
                }
            }
        });
    });
}

document.addEventListener('DOMContentLoaded', initNewsletterSignup);

// ============================================
// STICKY MOBILE CTA
// ============================================
function initStickyMobileCTA() {
    const stickyCTA = document.querySelector('.sticky-mobile-cta');
    if (!stickyCTA || window.innerWidth > 768) return;

    let lastScrollY = window.scrollY;
    let ticking = false;

    const updateCTA = () => {
        const scrollY = window.scrollY;
        const heroHeight = document.querySelector('.hero')?.offsetHeight || 600;

        // Show after scrolling past hero
        if (scrollY > heroHeight) {
            stickyCTA.classList.add('visible');
        } else {
            stickyCTA.classList.remove('visible');
        }

        // Hide when scrolling down, show when scrolling up
        if (scrollY > lastScrollY && scrollY > heroHeight + 200) {
            stickyCTA.classList.add('hidden');
        } else {
            stickyCTA.classList.remove('hidden');
        }

        lastScrollY = scrollY;
        ticking = false;
    };

    window.addEventListener('scroll', () => {
        if (!ticking) {
            requestAnimationFrame(updateCTA);
            ticking = true;
        }
    }, { passive: true });
}

document.addEventListener('DOMContentLoaded', initStickyMobileCTA);

// ============================================
// LANGUAGE SWITCHER
// ============================================
function initLanguageSwitcher() {
    const langDropdown = document.querySelector('.lang-dropdown');
    const langBtn = document.querySelector('.lang-btn');

    if (!langDropdown || !langBtn) return;

    // Get all language options
    const langOptions = langDropdown.querySelectorAll('a[data-lang]');

    langOptions.forEach(option => {
        option.addEventListener('click', (e) => {
            e.preventDefault();
            const lang = option.getAttribute('data-lang');

            if (window.langManager) {
                window.langManager.setLanguage(lang);
            }

            // Update button text
            const btnText = langBtn.querySelector('span:first-child') || langBtn;
            if (btnText) {
                btnText.textContent = lang.toUpperCase();
            }

            // Close dropdown
            langDropdown.classList.remove('active');
        });
    });
}

document.addEventListener('DOMContentLoaded', initLanguageSwitcher);

// ============================================
// TIMELINE ANIMATION
// ============================================
function initTimelineAnimation() {
    const timeline = document.querySelector('.company-timeline');
    if (!timeline) return;

    const items = timeline.querySelectorAll('.timeline-item');

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, { threshold: 0.3, rootMargin: '0px 0px -50px 0px' });

    items.forEach(item => observer.observe(item));
}

document.addEventListener('DOMContentLoaded', initTimelineAnimation);

// ============================================
// VIDEO HERO BACKGROUND
// ============================================
function initVideoHero() {
    const video = document.querySelector('.hero-video');
    if (!video) return;

    // Reduce quality on mobile for performance
    if (window.innerWidth < 768) {
        const mobileSrc = video.getAttribute('data-mobile-src');
        if (mobileSrc) {
            video.src = mobileSrc;
        }
    }

    // Pause video when not visible
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                video.play().catch(() => {});
            } else {
                video.pause();
            }
        });
    }, { threshold: 0.25 });

    observer.observe(video);

    // Respect reduced motion preference
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        video.pause();
        video.style.display = 'none';
    }
}

document.addEventListener('DOMContentLoaded', initVideoHero);

// ============================================
// HERO STATS - WebGL Particle Animation
// ============================================
function initHeroStatsAnimation() {
    const statsContainer = document.querySelector('.hero-stats');
    const statNumbers = document.querySelectorAll('.hero-stats .stat-number');

    if (!statsContainer || !statNumbers.length) return;

    // Create canvas for particle effects
    const canvas = document.createElement('canvas');
    canvas.className = 'stats-particles-canvas';
    canvas.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 1;
    `;
    statsContainer.style.position = 'relative';
    statsContainer.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    let particles = [];
    let animationId;
    let isAnimating = false;

    function resizeCanvas() {
        const rect = statsContainer.getBoundingClientRect();
        canvas.width = rect.width * window.devicePixelRatio;
        canvas.height = rect.height * window.devicePixelRatio;
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    }
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Particle class
    class Particle {
        constructor(x, y, color) {
            this.x = x;
            this.y = y;
            this.originX = x;
            this.originY = y;
            this.color = color;
            this.size = Math.random() * 3 + 1;
            this.speedX = (Math.random() - 0.5) * 8;
            this.speedY = (Math.random() - 0.5) * 8 - 2;
            this.life = 1;
            this.decay = Math.random() * 0.02 + 0.01;
            this.gravity = 0.1;
        }

        update() {
            this.speedY += this.gravity;
            this.x += this.speedX;
            this.y += this.speedY;
            this.life -= this.decay;
            this.speedX *= 0.99;
        }

        draw() {
            ctx.save();
            ctx.globalAlpha = this.life;
            ctx.fillStyle = this.color;
            ctx.shadowBlur = 10;
            ctx.shadowColor = this.color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    // Create burst of particles at position
    function createParticleBurst(x, y, count = 20) {
        const colors = ['#D4AF37', '#FFD700', '#FFA500', '#FFFFFF', '#E6C055'];
        for (let i = 0; i < count; i++) {
            const color = colors[Math.floor(Math.random() * colors.length)];
            particles.push(new Particle(x, y, color));
        }
    }

    // Animation loop
    function animate() {
        ctx.clearRect(0, 0, canvas.width / window.devicePixelRatio, canvas.height / window.devicePixelRatio);

        particles = particles.filter(p => p.life > 0);
        particles.forEach(p => {
            p.update();
            p.draw();
        });

        if (particles.length > 0 || isAnimating) {
            animationId = requestAnimationFrame(animate);
        }
    }

    // Animated counter with particle effects
    function animateCounter(element, target, duration = 2500) {
        const rect = element.getBoundingClientRect();
        const containerRect = statsContainer.getBoundingClientRect();
        const centerX = rect.left - containerRect.left + rect.width / 2;
        const centerY = rect.top - containerRect.top + rect.height / 2;

        let startTime = null;
        let currentValue = 0;
        let lastParticleTime = 0;

        function updateCounter(timestamp) {
            if (!startTime) startTime = timestamp;
            const elapsed = timestamp - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Easing function (easeOutExpo)
            const easeProgress = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
            currentValue = Math.floor(easeProgress * target);

            // Format number with locale
            element.textContent = currentValue.toLocaleString();

            // Create particles during animation
            if (timestamp - lastParticleTime > 50 && progress < 0.9) {
                createParticleBurst(
                    centerX + (Math.random() - 0.5) * rect.width,
                    centerY + (Math.random() - 0.5) * rect.height,
                    3
                );
                lastParticleTime = timestamp;
            }

            // Final burst when complete
            if (progress >= 1) {
                createParticleBurst(centerX, centerY, 30);
                element.style.transform = 'scale(1.1)';
                setTimeout(() => {
                    element.style.transform = 'scale(1)';
                }, 200);
                return;
            }

            requestAnimationFrame(updateCounter);
        }

        requestAnimationFrame(updateCounter);
    }

    // Intersection Observer to trigger animation
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && !statsContainer.classList.contains('animated')) {
                statsContainer.classList.add('animated');
                isAnimating = true;
                animate();

                statNumbers.forEach((stat, index) => {
                    const target = parseInt(stat.getAttribute('data-count')) || 0;
                    setTimeout(() => {
                        animateCounter(stat, target, 2000);
                    }, index * 300);
                });

                // Stop particle animation after counters complete
                setTimeout(() => {
                    isAnimating = false;
                }, 4000);
            }
        });
    }, { threshold: 0.3 });

    observer.observe(statsContainer);
}

// ============================================
// GLOWING NUMBER EFFECT (CSS Enhancement)
// ============================================
function addGlowingNumberStyles() {
    const style = document.createElement('style');
    style.textContent = `
        .hero-stats .stat-number {
            transition: transform 0.3s ease, text-shadow 0.3s ease;
        }

        .hero-stats.animated .stat-number {
            text-shadow:
                0 0 10px rgba(212, 175, 55, 0.5),
                0 0 20px rgba(212, 175, 55, 0.3),
                0 0 30px rgba(212, 175, 55, 0.2);
        }

        .hero-stats .stat-item {
            transition: background 0.3s ease;
        }

        .hero-stats .stat-item:hover {
            background: rgba(212, 175, 55, 0.1);
        }

        .stats-particles-canvas {
            opacity: 0.8;
        }

        @media (max-width: 768px) {
            .hero-stats.animated .stat-number {
                text-shadow:
                    0 0 8px rgba(212, 175, 55, 0.6),
                    0 0 15px rgba(212, 175, 55, 0.4);
            }
        }
    `;
    document.head.appendChild(style);
}

document.addEventListener('DOMContentLoaded', addGlowingNumberStyles);

// ============================================
// UNIVERSAL HOVER TRIGGER SYSTEM
// Allows triggering effects on other elements via hover
// Usage:
//   Trigger: data-hover-trigger="myId"
//   Target:  data-hover-target="myId"
// ============================================
class HoverTriggerSystem {
    constructor() {
        this.triggers = new Map();
        this.targets = new Map();
        this.connectorLine = null;
        this.enabled = true; // Can be disabled (e.g., in admin edit mode)
        this.init();
    }

    // Enable/Disable the hover trigger system
    setEnabled(enabled) {
        this.enabled = enabled;
        console.log(`HoverTriggerSystem ${enabled ? 'enabled' : 'disabled'}`);

        // Remove all active states when disabled
        if (!enabled) {
            document.querySelectorAll('.hover-triggered').forEach(el => {
                el.classList.remove('hover-triggered');
            });
            this.hideConnectorLine();
        }
    }

    // Check if in admin/edit mode
    isInEditMode() {
        // Check various indicators of edit mode
        return (
            window.adminEditMode === true ||
            document.body.classList.contains('admin-edit-mode') ||
            document.body.classList.contains('editing') ||
            window.parent !== window || // In iframe (admin preview)
            document.querySelector('.admin-editable.selected') !== null
        );
    }

    init() {
        // Find all triggers and targets
        document.querySelectorAll('[data-hover-trigger]').forEach(trigger => {
            const targetId = trigger.dataset.hoverTrigger;
            if (!this.triggers.has(targetId)) {
                this.triggers.set(targetId, []);
            }
            this.triggers.get(targetId).push(trigger);

            // Bind events
            trigger.addEventListener('mouseenter', () => this.handleTriggerEnter(targetId, trigger));
            trigger.addEventListener('mouseleave', () => this.handleTriggerLeave(targetId));
        });

        // Find all targets
        document.querySelectorAll('[data-hover-target]').forEach(target => {
            const targetId = target.dataset.hoverTarget;
            if (!this.targets.has(targetId)) {
                this.targets.set(targetId, []);
            }
            this.targets.get(targetId).push(target);

            // Also allow targets to trigger back (bidirectional)
            target.addEventListener('mouseenter', () => this.handleTargetEnter(targetId, target));
            target.addEventListener('mouseleave', () => this.handleTargetLeave(targetId));
        });

        // Create connector line SVG (optional visual connection)
        this.createConnectorLine();

        console.log(`HoverTriggerSystem initialized: ${this.triggers.size} trigger groups, ${this.targets.size} target groups`);
    }

    createConnectorLine() {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.classList.add('hover-connector-line');
        svg.setAttribute('width', '100%');
        svg.setAttribute('height', '100%');
        svg.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 9998;';

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('stroke', 'url(#goldGradient)');
        path.setAttribute('stroke-width', '2');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke-dasharray', '8 4');

        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        defs.innerHTML = `
            <linearGradient id="goldGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" style="stop-color:#d4af37;stop-opacity:0.8" />
                <stop offset="100%" style="stop-color:#e8c547;stop-opacity:0.4" />
            </linearGradient>
        `;

        svg.appendChild(defs);
        svg.appendChild(path);
        document.body.appendChild(svg);
        this.connectorLine = { svg, path };
    }

    handleTriggerEnter(targetId, triggerElement) {
        // Skip if disabled or in edit mode
        if (!this.enabled || this.isInEditMode()) return;

        const targets = this.targets.get(targetId);
        if (!targets) return;

        targets.forEach(target => {
            target.classList.add('hover-triggered');

            // Scroll target into view if needed (optional)
            if (target.dataset.hoverScrollIntoView !== undefined) {
                target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }

            // Draw connector line if enabled
            if (triggerElement.dataset.hoverShowLine !== undefined) {
                this.drawConnectorLine(triggerElement, target);
            }
        });

        // Add blur to siblings if parent has hover-blur-siblings class
        targets.forEach(target => {
            const parent = target.parentElement;
            if (parent && parent.classList.contains('hover-blur-siblings')) {
                parent.classList.add('has-active-hover');
            }
        });

        // GSAP animation if available
        if (typeof gsap !== 'undefined') {
            targets.forEach(target => {
                gsap.to(target, {
                    scale: 1.02,
                    duration: 0.3,
                    ease: 'power2.out'
                });
            });
        }
    }

    handleTriggerLeave(targetId) {
        const targets = this.targets.get(targetId);
        if (!targets) return;

        targets.forEach(target => {
            target.classList.remove('hover-triggered');

            const parent = target.parentElement;
            if (parent) {
                parent.classList.remove('has-active-hover');
            }
        });

        // Hide connector line
        this.hideConnectorLine();

        // GSAP reset
        if (typeof gsap !== 'undefined') {
            targets.forEach(target => {
                gsap.to(target, {
                    scale: 1,
                    duration: 0.3,
                    ease: 'power2.out'
                });
            });
        }
    }

    handleTargetEnter(targetId, targetElement) {
        // Skip if disabled or in edit mode
        if (!this.enabled || this.isInEditMode()) return;

        // Highlight the corresponding triggers (bidirectional)
        const triggers = this.triggers.get(targetId);
        if (!triggers) return;

        triggers.forEach(trigger => {
            trigger.classList.add('hover-triggered');
        });

        targetElement.classList.add('hover-triggered');
    }

    handleTargetLeave(targetId) {
        const triggers = this.triggers.get(targetId);
        if (!triggers) return;

        triggers.forEach(trigger => {
            trigger.classList.remove('hover-triggered');
        });

        const targets = this.targets.get(targetId);
        if (targets) {
            targets.forEach(target => {
                target.classList.remove('hover-triggered');
            });
        }
    }

    drawConnectorLine(from, to) {
        if (!this.connectorLine) return;

        const fromRect = from.getBoundingClientRect();
        const toRect = to.getBoundingClientRect();

        const fromX = fromRect.left + fromRect.width / 2;
        const fromY = fromRect.top + fromRect.height / 2;
        const toX = toRect.left + toRect.width / 2;
        const toY = toRect.top + toRect.height / 2;

        // Create curved path
        const midX = (fromX + toX) / 2;
        const midY = Math.min(fromY, toY) - 50;

        const d = `M ${fromX} ${fromY} Q ${midX} ${midY} ${toX} ${toY}`;
        this.connectorLine.path.setAttribute('d', d);
        this.connectorLine.svg.classList.add('active');

        // Animate dash
        const length = this.connectorLine.path.getTotalLength();
        this.connectorLine.path.style.strokeDasharray = length;
        this.connectorLine.path.style.strokeDashoffset = length;

        if (typeof gsap !== 'undefined') {
            gsap.to(this.connectorLine.path, {
                strokeDashoffset: 0,
                duration: 0.5,
                ease: 'power2.out'
            });
        } else {
            this.connectorLine.path.style.strokeDashoffset = 0;
        }
    }

    hideConnectorLine() {
        if (!this.connectorLine) return;
        this.connectorLine.svg.classList.remove('active');
    }

    // Public method to programmatically trigger
    trigger(targetId) {
        this.handleTriggerEnter(targetId, document.querySelector(`[data-hover-trigger="${targetId}"]`));
    }

    // Public method to programmatically untrigger
    untrigger(targetId) {
        this.handleTriggerLeave(targetId);
    }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    window.hoverTriggerSystem = new HoverTriggerSystem();

    // Note: Location markers use their own hover system (initInteractiveMap)
    // Do NOT add hover-trigger/hover-target attributes to .location-marker
    // as it conflicts with the custom map info box system
});

// ============================================
// CEO MESSAGE MODAL WITH GSAP ANIMATION
// ============================================

// Initialize CEO Modal - runs when DOM is ready
function initCEOModal() {
    const modal = document.getElementById('ceo-message-modal');
    const btn = document.getElementById('open-ceo-modal');

    if (!btn || !modal) {
        console.warn('[CEO Modal] Button or modal not found');
        return;
    }

    // Prevent double initialization
    if (btn.dataset.initialized === 'true') return;
    btn.dataset.initialized = 'true';

    const closeBtn = modal.querySelector('.ceo-modal-close');
    const backdrop = modal.querySelector('.ceo-modal-backdrop');

    function openCEOModal() {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';

        // Reset all elements first - Premium Layout
        const photoSection = modal.querySelector('.ceo-photo-section');
        const messageHeader = modal.querySelector('.ceo-message-header');
        const greeting = modal.querySelector('.ceo-greeting');
        const paragraphs = modal.querySelectorAll('.ceo-paragraph');
        const closing = modal.querySelector('.ceo-closing');
        const signature = modal.querySelector('.ceo-message-signature');
        const footer = modal.querySelector('.ceo-message-footer');
        const corners = modal.querySelectorAll('.ceo-modal-corner');

        const allElements = [photoSection, messageHeader, greeting, ...paragraphs, closing, signature, footer];
        allElements.forEach(el => {
            if (el) {
                el.style.opacity = '0';
                el.style.transform = 'translateY(40px) scale(0.95)';
            }
        });

        // Corner animations reset
        corners.forEach(corner => {
            corner.style.opacity = '0';
            corner.style.transform = 'scale(0)';
        });

        // GSAP Animation - Premium Zusammensetz-Effekt
        setTimeout(() => {
            if (typeof gsap !== 'undefined') {
                const tl = gsap.timeline({ defaults: { ease: 'power4.out' } });

                // Ecken erscheinen zuerst mit Rotation
                tl.to(corners, {
                    opacity: 1,
                    scale: 1,
                    rotation: 0,
                    duration: 0.5,
                    stagger: 0.08,
                    ease: 'back.out(1.7)'
                });

                // Foto-Sektion kommt von links
                tl.to(photoSection, {
                    opacity: 1,
                    y: 0,
                    scale: 1,
                    x: 0,
                    duration: 0.8,
                    ease: 'power3.out'
                }, '-=0.2');

                // Header gleitet ein
                tl.to(messageHeader, {
                    opacity: 1,
                    y: 0,
                    scale: 1,
                    duration: 0.6
                }, '-=0.5');

                // Begrüßung
                tl.to(greeting, {
                    opacity: 1,
                    y: 0,
                    scale: 1,
                    duration: 0.5
                }, '-=0.3');

                // Absätze mit elegantem Stagger
                tl.to(paragraphs, {
                    opacity: 1,
                    y: 0,
                    scale: 1,
                    duration: 0.5,
                    stagger: 0.12
                }, '-=0.2');

                // Closing
                tl.to(closing, {
                    opacity: 1,
                    y: 0,
                    scale: 1,
                    duration: 0.4
                }, '-=0.1');

                // Signatur mit besonderem Effekt
                tl.to(signature, {
                    opacity: 1,
                    y: 0,
                    scale: 1,
                    duration: 0.6,
                    ease: 'elastic.out(1, 0.8)'
                }, '-=0.1');

                // Footer
                tl.to(footer, {
                    opacity: 1,
                    y: 0,
                    scale: 1,
                    duration: 0.5
                }, '-=0.3');

            } else {
                // Fallback ohne GSAP
                allElements.forEach((el, i) => {
                    if (el) {
                        setTimeout(() => {
                            el.style.opacity = '1';
                            el.style.transform = 'translateY(0) scale(1)';
                        }, i * 120);
                    }
                });
                corners.forEach((corner, i) => {
                    setTimeout(() => {
                        corner.style.opacity = '1';
                        corner.style.transform = 'scale(1)';
                    }, i * 80);
                });
            }
        }, 250);
    }

    function closeCEOModal() {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }

    // Event Listeners
    btn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        openCEOModal();
    });

    closeBtn?.addEventListener('click', closeCEOModal);
    backdrop?.addEventListener('click', closeCEOModal);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('active')) {
            closeCEOModal();
        }
    });

    console.log('[CEO Modal] Initialized successfully');
}

// Initialize CEO Modal on multiple events to ensure it works on all browsers
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCEOModal);
} else {
    // DOM already loaded
    initCEOModal();
}
// Also try on window load as fallback for Safari
window.addEventListener('load', initCEOModal);
