// ============================================
// MULTI-LANGUAGE SUPPORT
// ============================================

const translations = {
    en: {
        // Navigation
        nav: {
            about: "About",
            products: "Products",
            services: "Services",
            locations: "Locations",
            sustainability: "Sustainability",
            contact: "Get in Touch"
        },
        // Hero Section
        hero: {
            tagline: "GLOBAL COMMODITIES TRADING",
            title: "Building Bridges Between <span class='highlight'>Producers</span> & Global Markets",
            subtitle: "Iustus Mercatura - Latin for \"Just Trade\" - connects Brazilian agricultural excellence with worldwide demand through ethical sourcing and transparent transactions.",
            cta_primary: "Explore Products",
            cta_secondary: "Contact Us",
            stats: {
                volume: "Annual Volume",
                countries: "Countries Served",
                partners: "Trade Partners",
                experience: "Years Combined Exp."
            }
        },
        // About Section
        about: {
            label: "About Iustus Mercatura",
            title: "Where Tradition Meets <span class='highlight'>Innovation</span>",
            description: "Founded on the principles of fair trade and sustainable commerce, Iustus Mercatura has established itself as a trusted bridge between Brazilian agricultural producers and global markets.",
            description2: "Our name, derived from Latin meaning \"Just Trade,\" reflects our unwavering commitment to ethical business practices, transparent transactions, and mutually beneficial partnerships.",
            features: {
                ethical: {
                    title: "Ethical Sourcing",
                    desc: "Direct partnerships with certified producers ensuring fair compensation and sustainable practices."
                },
                quality: {
                    title: "Quality Assured",
                    desc: "Rigorous quality control at every stage, from harvest to delivery, meeting international standards."
                },
                global: {
                    title: "Global Network",
                    desc: "Strategic presence across key markets enabling efficient logistics and reliable supply chains."
                },
                finance: {
                    title: "Trade Finance",
                    desc: "Flexible financing solutions tailored to support both producers and buyers in their growth."
                }
            }
        },
        // Products Section
        products: {
            label: "Our Products",
            title: "Premium Brazilian <span class='highlight'>Commodities</span>",
            sugar_ic45: {
                name: "Brazilian Sugar IC45",
                desc: "Premium refined cane sugar with 99.8% polarization and max 45 ICUMSA color rating. Ideal for direct consumption and food industry.",
                spec1: "Polarization: 99.8% min",
                spec2: "ICUMSA: 45 max",
                spec3: "Moisture: 0.04% max"
            },
            sugar_vhp: {
                name: "Sugar VHP IC600/1200",
                desc: "Very High Polarization sugar ideal for refining. Available in IC600 and IC1200 grades for industrial processing.",
                spec1: "Polarization: 99.4% min",
                spec2: "ICUMSA: 600-1200",
                spec3: "Raw cane sugar"
            },
            soybeans: {
                name: "Yellow Soybeans",
                desc: "Premium grade soybeans from Brazil's finest agricultural regions. Non-GMO options available.",
                spec1: "Protein: 36% min",
                spec2: "Moisture: 14% max",
                spec3: "Foreign matter: 1% max"
            },
            corn: {
                name: "Yellow Corn",
                desc: "High-quality feed corn meeting international specifications for animal nutrition and industrial use.",
                spec1: "Moisture: 14% max",
                spec2: "Broken: 3% max",
                spec3: "Aflatoxin: 20ppb max"
            },
            cta: "Request Quote"
        },
        // Services Section
        services: {
            label: "Our Services",
            title: "End-to-End <span class='highlight'>Solutions</span>",
            producers: {
                title: "For Producers",
                desc: "Access global markets, secure fair prices, and benefit from our extensive buyer network and trade finance solutions."
            },
            buyers: {
                title: "For Buyers",
                desc: "Source premium commodities with guaranteed quality, competitive pricing, and reliable delivery schedules."
            },
            finance: {
                title: "Trade Finance",
                desc: "Flexible financing options including letters of credit, pre-export financing, and structured trade solutions."
            },
            logistics: {
                title: "Logistics",
                desc: "Complete supply chain management from origin to destination, including shipping, insurance, and customs clearance."
            }
        },
        // Locations Section
        locations: {
            label: "Global Presence",
            title: "Worldwide <span class='highlight'>Operations</span>",
            hq: "Headquarters",
            office: "Regional Office"
        },
        // Team Section
        team: {
            label: "Leadership",
            title: "Meet Our <span class='highlight'>Team</span>"
        },
        // Sustainability Section
        sustainability: {
            label: "Our Commitment",
            title: "Sustainability & <span class='highlight'>Responsibility</span>",
            intro: "At Iustus Mercatura, sustainability is not just a goal - it's the foundation of everything we do. We are committed to creating lasting positive impact across our entire supply chain.",
            un_global: {
                title: "UN Global Compact",
                desc: "We adhere strictly to the United Nations Global Compact principles, ensuring our operations respect human rights, labor standards, and environmental protection."
            },
            iso: {
                title: "ISO 9001 Certified",
                desc: "Our quality management system meets the highest international standards, ensuring consistent excellence and continuous improvement in all operations."
            },
            ethical: {
                title: "Ethical Sourcing",
                desc: "We partner only with producers who share our commitment to fair labor practices, environmental stewardship, and community development."
            },
            carbon: {
                title: "Carbon Neutral Goal",
                desc: "We are actively working towards carbon neutrality by 2030, implementing sustainable logistics and supporting reforestation initiatives worldwide."
            },
            stats: {
                traceable: "Traceable Supply Chain",
                partners: "Certified Partners",
                target: "Carbon Neutral Target",
                farmers: "Farmers Supported"
            }
        },
        // Contact Section
        contact: {
            label: "Get In Touch",
            title: "Let's Work <span class='highlight'>Together</span>",
            intro: "Whether you're looking to expand your horizons or streamline your operations, our expertise and resources are here to support your goals.",
            form: {
                title: "Send us a Message",
                subtitle: "Fill out the form below and we'll get back to you within 24 hours.",
                firstName: "First Name",
                lastName: "Last Name",
                email: "Email Address",
                phone: "Phone Number",
                company: "Company Name",
                inquiry: "Inquiry Type",
                inquiryOptions: {
                    select: "Select an option",
                    buying: "Buying Commodities",
                    selling: "Selling / Partnership",
                    finance: "Trade Finance",
                    logistics: "Logistics & Shipping",
                    investment: "Investment Opportunities",
                    careers: "Career Opportunities",
                    media: "Media & Press",
                    other: "Other Inquiry"
                },
                message: "Message",
                messagePlaceholder: "Tell us about your requirements, expected volumes, timeline, or any questions you have...",
                privacy: "I agree to the <a href='privacy.html' target='_blank'>Privacy Policy</a> and consent to the processing of my data.",
                newsletter: "Subscribe to our newsletter for market insights and company updates.",
                submit: "Send Message",
                success: {
                    title: "Message Sent Successfully!",
                    desc: "Thank you for contacting us. Our team will review your message and get back to you within 24 hours."
                },
                error: {
                    title: "Something Went Wrong",
                    desc: "Please try again or contact us directly at"
                }
            },
            offices: "Global Offices"
        },
        // Footer
        footer: {
            tagline: "Connecting farmers to consumers to deliver essential food, feed and fuel to the world.",
            company: "Company",
            products: "Products",
            services: "Services",
            legal: "Legal",
            links: {
                about: "About Us",
                leadership: "Leadership",
                careers: "Careers",
                locations: "Locations",
                privacy: "Privacy Policy",
                terms: "Terms of Service",
                imprint: "Imprint",
                compliance: "Compliance"
            },
            copyright: "© 2025 Iustus Mercatura Holding Inc. All rights reserved."
        },
        // Cookie Banner
        cookies: {
            title: "We Value Your Privacy",
            desc: "We use cookies to enhance your browsing experience, analyze site traffic, and personalize content. By clicking \"Accept All\", you consent to our use of cookies.",
            settings: "Cookie Settings",
            reject: "Reject All",
            accept: "Accept All",
            preferences: "Cookie Preferences",
            essential: "Essential Cookies",
            essentialDesc: "Required for the website to function properly. Cannot be disabled.",
            analytics: "Analytics Cookies",
            analyticsDesc: "Help us understand how visitors interact with our website.",
            marketing: "Marketing Cookies",
            marketingDesc: "Used to deliver relevant advertisements and track campaign performance.",
            save: "Save Preferences",
            cancel: "Cancel",
            alwaysActive: "Always Active"
        },
        // Common
        common: {
            learnMore: "Learn More",
            readMore: "Read More",
            viewAll: "View All",
            required: "required"
        },
        // Partners Section
        partners: {
            label: "Trusted By",
            title: "Our Global <span class='highlight'>Partners</span>"
        },
        // Testimonials Section
        testimonials: {
            label: "Client Testimonials",
            title: "What Our <span class='highlight'>Partners Say</span>"
        },
        // Newsletter
        newsletter: {
            title: "Stay Updated",
            subtitle: "Subscribe to our newsletter for market insights and company updates.",
            button: "Subscribe",
            disclaimer: "By subscribing, you agree to our Privacy Policy.",
            success: "Thank you for subscribing!",
            error: "Something went wrong. Please try again."
        },
        // CTA
        cta: {
            contact: "Contact Us",
            getQuote: "Get Quote",
            learnMore: "Learn More"
        }
    },
    de: {
        // Navigation
        nav: {
            about: "Über Uns",
            products: "Produkte",
            services: "Leistungen",
            locations: "Standorte",
            sustainability: "Nachhaltigkeit",
            contact: "Kontakt"
        },
        // Hero Section
        hero: {
            tagline: "GLOBALER ROHSTOFFHANDEL",
            title: "Brücken zwischen <span class='highlight'>Produzenten</span> & globalen Märkten",
            subtitle: "Iustus Mercatura - Lateinisch für \"Gerechter Handel\" - verbindet brasilianische Agrarexzellenz mit weltweiter Nachfrage durch ethische Beschaffung und transparente Transaktionen.",
            cta_primary: "Produkte entdecken",
            cta_secondary: "Kontaktieren Sie uns",
            stats: {
                volume: "Jahresvolumen",
                countries: "Belieferte Länder",
                partners: "Handelspartner",
                experience: "Jahre Erfahrung"
            }
        },
        // About Section
        about: {
            label: "Über Iustus Mercatura",
            title: "Wo Tradition auf <span class='highlight'>Innovation</span> trifft",
            description: "Gegründet auf den Prinzipien des fairen Handels und nachhaltigen Wirtschaftens, hat sich Iustus Mercatura als vertrauenswürdige Brücke zwischen brasilianischen Agrarproduzenten und globalen Märkten etabliert.",
            description2: "Unser Name, abgeleitet vom lateinischen \"Gerechter Handel\", spiegelt unser unerschütterliches Engagement für ethische Geschäftspraktiken, transparente Transaktionen und beiderseitig vorteilhafte Partnerschaften wider.",
            features: {
                ethical: {
                    title: "Ethische Beschaffung",
                    desc: "Direkte Partnerschaften mit zertifizierten Produzenten, die faire Vergütung und nachhaltige Praktiken gewährleisten."
                },
                quality: {
                    title: "Qualitätsgarantie",
                    desc: "Strenge Qualitätskontrolle in jeder Phase, von der Ernte bis zur Lieferung, gemäß internationaler Standards."
                },
                global: {
                    title: "Globales Netzwerk",
                    desc: "Strategische Präsenz in Schlüsselmärkten für effiziente Logistik und zuverlässige Lieferketten."
                },
                finance: {
                    title: "Handelsfinanzierung",
                    desc: "Flexible Finanzierungslösungen, maßgeschneidert zur Unterstützung von Produzenten und Käufern."
                }
            }
        },
        // Products Section
        products: {
            label: "Unsere Produkte",
            title: "Premium Brasilianische <span class='highlight'>Rohstoffe</span>",
            sugar_ic45: {
                name: "Brasilianischer Zucker IC45",
                desc: "Premium raffinierter Rohrzucker mit 99,8% Polarisation und max. 45 ICUMSA. Ideal für direkten Verbrauch und Lebensmittelindustrie.",
                spec1: "Polarisation: 99,8% min",
                spec2: "ICUMSA: 45 max",
                spec3: "Feuchtigkeit: 0,04% max"
            },
            sugar_vhp: {
                name: "Zucker VHP IC600/1200",
                desc: "Very High Polarization Zucker ideal für Raffinerien. Verfügbar in IC600 und IC1200 Qualitäten für industrielle Verarbeitung.",
                spec1: "Polarisation: 99,4% min",
                spec2: "ICUMSA: 600-1200",
                spec3: "Roher Rohrzucker"
            },
            soybeans: {
                name: "Gelbe Sojabohnen",
                desc: "Premium-Sojabohnen aus Brasiliens besten Anbauregionen. Gentechnikfreie Optionen verfügbar.",
                spec1: "Protein: 36% min",
                spec2: "Feuchtigkeit: 14% max",
                spec3: "Fremdkörper: 1% max"
            },
            corn: {
                name: "Gelber Mais",
                desc: "Hochwertiger Futtermais nach internationalen Spezifikationen für Tierernährung und industrielle Nutzung.",
                spec1: "Feuchtigkeit: 14% max",
                spec2: "Bruch: 3% max",
                spec3: "Aflatoxin: 20ppb max"
            },
            cta: "Angebot anfordern"
        },
        // Services Section
        services: {
            label: "Unsere Leistungen",
            title: "Komplettlösungen aus <span class='highlight'>einer Hand</span>",
            producers: {
                title: "Für Produzenten",
                desc: "Zugang zu globalen Märkten, faire Preise und Vorteile durch unser umfangreiches Käufernetzwerk und Handelsfinanzierungslösungen."
            },
            buyers: {
                title: "Für Käufer",
                desc: "Premium-Rohstoffe mit garantierter Qualität, wettbewerbsfähigen Preisen und zuverlässigen Lieferterminen."
            },
            finance: {
                title: "Handelsfinanzierung",
                desc: "Flexible Finanzierungsoptionen einschließlich Akkreditive, Vorexportfinanzierung und strukturierte Handelslösungen."
            },
            logistics: {
                title: "Logistik",
                desc: "Komplettes Supply Chain Management vom Ursprung bis zum Ziel, einschließlich Versand, Versicherung und Zollabwicklung."
            }
        },
        // Locations Section
        locations: {
            label: "Globale Präsenz",
            title: "Weltweite <span class='highlight'>Standorte</span>",
            hq: "Hauptsitz",
            office: "Regionalbüro"
        },
        // Team Section
        team: {
            label: "Führungsteam",
            title: "Unser <span class='highlight'>Team</span>"
        },
        // Sustainability Section
        sustainability: {
            label: "Unser Engagement",
            title: "Nachhaltigkeit & <span class='highlight'>Verantwortung</span>",
            intro: "Bei Iustus Mercatura ist Nachhaltigkeit nicht nur ein Ziel - sie ist das Fundament all unseres Handelns. Wir sind verpflichtet, nachhaltige positive Auswirkungen entlang unserer gesamten Lieferkette zu schaffen.",
            un_global: {
                title: "UN Global Compact",
                desc: "Wir halten uns strikt an die Prinzipien des UN Global Compact und stellen sicher, dass unsere Geschäftstätigkeit Menschenrechte, Arbeitsstandards und Umweltschutz respektiert."
            },
            iso: {
                title: "ISO 9001 Zertifiziert",
                desc: "Unser Qualitätsmanagementsystem erfüllt höchste internationale Standards und gewährleistet konstante Exzellenz und kontinuierliche Verbesserung."
            },
            ethical: {
                title: "Ethische Beschaffung",
                desc: "Wir arbeiten nur mit Produzenten zusammen, die unser Engagement für faire Arbeitspraktiken, Umweltschutz und Gemeindeentwicklung teilen."
            },
            carbon: {
                title: "Klimaneutralitätsziel",
                desc: "Wir arbeiten aktiv auf Klimaneutralität bis 2030 hin, durch nachhaltige Logistik und Unterstützung von Aufforstungsinitiativen weltweit."
            },
            stats: {
                traceable: "Rückverfolgbare Lieferkette",
                partners: "Zertifizierte Partner",
                target: "Klimaneutralitätsziel",
                farmers: "Unterstützte Landwirte"
            }
        },
        // Contact Section
        contact: {
            label: "Kontaktieren Sie uns",
            title: "Lassen Sie uns <span class='highlight'>zusammenarbeiten</span>",
            intro: "Ob Sie neue Horizonte erschließen oder Ihre Abläufe optimieren möchten - unsere Expertise und Ressourcen stehen Ihnen zur Verfügung.",
            form: {
                title: "Nachricht senden",
                subtitle: "Füllen Sie das Formular aus und wir melden uns innerhalb von 24 Stunden.",
                firstName: "Vorname",
                lastName: "Nachname",
                email: "E-Mail-Adresse",
                phone: "Telefonnummer",
                company: "Firmenname",
                inquiry: "Anfragetyp",
                inquiryOptions: {
                    select: "Bitte auswählen",
                    buying: "Rohstoffe kaufen",
                    selling: "Verkauf / Partnerschaft",
                    finance: "Handelsfinanzierung",
                    logistics: "Logistik & Versand",
                    investment: "Investitionsmöglichkeiten",
                    careers: "Karrieremöglichkeiten",
                    media: "Medien & Presse",
                    other: "Sonstige Anfrage"
                },
                message: "Nachricht",
                messagePlaceholder: "Beschreiben Sie Ihre Anforderungen, erwartete Mengen, Zeitplan oder Fragen...",
                privacy: "Ich stimme der <a href='privacy.html' target='_blank'>Datenschutzerklärung</a> zu und willige in die Verarbeitung meiner Daten ein.",
                newsletter: "Newsletter abonnieren für Markteinblicke und Unternehmensneuigkeiten.",
                submit: "Nachricht senden",
                success: {
                    title: "Nachricht erfolgreich gesendet!",
                    desc: "Vielen Dank für Ihre Kontaktaufnahme. Unser Team wird sich innerhalb von 24 Stunden bei Ihnen melden."
                },
                error: {
                    title: "Etwas ist schiefgelaufen",
                    desc: "Bitte versuchen Sie es erneut oder kontaktieren Sie uns direkt unter"
                }
            },
            offices: "Globale Standorte"
        },
        // Footer
        footer: {
            tagline: "Wir verbinden Landwirte mit Verbrauchern, um essentielle Nahrung, Futter und Treibstoff in die Welt zu liefern.",
            company: "Unternehmen",
            products: "Produkte",
            services: "Leistungen",
            legal: "Rechtliches",
            links: {
                about: "Über Uns",
                leadership: "Führungsteam",
                careers: "Karriere",
                locations: "Standorte",
                privacy: "Datenschutz",
                terms: "AGB",
                imprint: "Impressum",
                compliance: "Compliance"
            },
            copyright: "© 2025 Iustus Mercatura Holding Inc. Alle Rechte vorbehalten."
        },
        // Cookie Banner
        cookies: {
            title: "Wir schätzen Ihre Privatsphäre",
            desc: "Wir verwenden Cookies, um Ihr Browsing-Erlebnis zu verbessern, den Website-Traffic zu analysieren und Inhalte zu personalisieren. Mit \"Alle akzeptieren\" stimmen Sie der Verwendung von Cookies zu.",
            settings: "Cookie-Einstellungen",
            reject: "Alle ablehnen",
            accept: "Alle akzeptieren",
            preferences: "Cookie-Einstellungen",
            essential: "Essentielle Cookies",
            essentialDesc: "Erforderlich für die Funktionalität der Website. Kann nicht deaktiviert werden.",
            analytics: "Analyse-Cookies",
            analyticsDesc: "Helfen uns zu verstehen, wie Besucher mit unserer Website interagieren.",
            marketing: "Marketing-Cookies",
            marketingDesc: "Werden verwendet, um relevante Werbung zu liefern und Kampagnenleistung zu verfolgen.",
            save: "Einstellungen speichern",
            cancel: "Abbrechen",
            alwaysActive: "Immer aktiv"
        },
        // Common
        common: {
            learnMore: "Mehr erfahren",
            readMore: "Weiterlesen",
            viewAll: "Alle anzeigen",
            required: "erforderlich"
        },
        // Partners Section
        partners: {
            label: "Vertrauenspartner",
            title: "Unsere globalen <span class='highlight'>Partner</span>"
        },
        // Testimonials Section
        testimonials: {
            label: "Kundenstimmen",
            title: "Was unsere <span class='highlight'>Partner sagen</span>"
        },
        // Newsletter
        newsletter: {
            title: "Bleiben Sie informiert",
            subtitle: "Newsletter abonnieren für Markteinblicke und Unternehmensneuigkeiten.",
            button: "Abonnieren",
            disclaimer: "Mit dem Abonnieren stimmen Sie unserer Datenschutzerklärung zu.",
            success: "Vielen Dank für Ihre Anmeldung!",
            error: "Etwas ist schief gelaufen. Bitte versuchen Sie es erneut."
        },
        // CTA
        cta: {
            contact: "Kontakt aufnehmen",
            getQuote: "Angebot anfordern",
            learnMore: "Mehr erfahren"
        }
    }
};

// Language Manager Class
class LanguageManager {
    constructor() {
        this.currentLang = localStorage.getItem('im_language') || 'en';
        this.init();
    }

    init() {
        document.documentElement.lang = this.currentLang;
        this.updateLanguageSelector();
    }

    setLanguage(lang) {
        if (translations[lang]) {
            this.currentLang = lang;
            localStorage.setItem('im_language', lang);
            document.documentElement.lang = lang;
            this.updateLanguageSelector();
            this.translatePage();

            // Dispatch event for other scripts
            window.dispatchEvent(new CustomEvent('languageChanged', { detail: { language: lang } }));
        }
    }

    t(key) {
        const keys = key.split('.');
        let value = translations[this.currentLang];

        for (const k of keys) {
            if (value && value[k]) {
                value = value[k];
            } else {
                // Fallback to English
                value = translations['en'];
                for (const k2 of keys) {
                    if (value && value[k2]) {
                        value = value[k2];
                    } else {
                        return key; // Return key if not found
                    }
                }
                break;
            }
        }

        return value;
    }

    updateLanguageSelector() {
        const selectors = document.querySelectorAll('.lang-selector .lang-btn');
        selectors.forEach(btn => {
            const langText = btn.querySelector('span:first-child') || btn;
            if (langText) {
                langText.textContent = this.currentLang.toUpperCase();
            }
        });
    }

    translatePage() {
        // Translate elements with data-i18n attribute
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            const translation = this.t(key);

            if (el.tagName === 'INPUT' && el.type !== 'submit') {
                el.placeholder = translation;
            } else if (el.tagName === 'OPTION') {
                el.textContent = translation;
            } else {
                el.innerHTML = translation;
            }
        });

        // Translate elements with data-i18n-placeholder
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            el.placeholder = this.t(key);
        });

        // Translate elements with data-i18n-aria
        document.querySelectorAll('[data-i18n-aria]').forEach(el => {
            const key = el.getAttribute('data-i18n-aria');
            el.setAttribute('aria-label', this.t(key));
        });
    }
}

// Initialize Language Manager
const langManager = new LanguageManager();

// Export for global use
window.langManager = langManager;
window.translations = translations;
