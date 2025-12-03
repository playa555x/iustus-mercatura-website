/**
 * Iustus Mercatura - Interactive Website Script
 * Three.js 3D Globe, GSAP Animations, Sugar Particle Effects
 */

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
    requestAnimationFrame(animateGlobe);

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

// ============================================
// SUGAR PARTICLE CANVAS EFFECT
// ============================================
function initSugarParticles() {
    // Disabled for better performance - 80 particles with gradients cause frame drops
    return;

    const canvas = document.getElementById('sugarParticles');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const particles = [];
    const particleCount = 80;

    class SugarParticle {
        constructor() {
            this.reset();
        }

        reset() {
            this.x = Math.random() * canvas.width;
            this.y = Math.random() * canvas.height;
            this.size = Math.random() * 4 + 2;
            this.speedX = (Math.random() - 0.5) * 0.5;
            this.speedY = Math.random() * 0.5 + 0.2;
            this.opacity = Math.random() * 0.5 + 0.2;
            this.rotation = Math.random() * Math.PI * 2;
            this.rotationSpeed = (Math.random() - 0.5) * 0.02;

            // Crystal shape vertices (6-sided)
            this.vertices = 6;
            this.shapeOffset = Math.random() * 0.3;
        }

        update() {
            this.x += this.speedX;
            this.y += this.speedY;
            this.rotation += this.rotationSpeed;

            // Reset if out of bounds
            if (this.y > canvas.height + 20) {
                this.y = -20;
                this.x = Math.random() * canvas.width;
            }
            if (this.x < -20 || this.x > canvas.width + 20) {
                this.x = Math.random() * canvas.width;
            }
        }

        draw() {
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(this.rotation);

            // Draw crystal shape
            ctx.beginPath();
            for (let i = 0; i < this.vertices; i++) {
                const angle = (i / this.vertices) * Math.PI * 2;
                const radius = this.size * (1 + (i % 2) * this.shapeOffset);
                const x = Math.cos(angle) * radius;
                const y = Math.sin(angle) * radius;

                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();

            // Gradient fill
            const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, this.size);
            gradient.addColorStop(0, `rgba(255, 255, 255, ${this.opacity})`);
            gradient.addColorStop(0.5, `rgba(249, 245, 235, ${this.opacity * 0.8})`);
            gradient.addColorStop(1, `rgba(201, 162, 39, ${this.opacity * 0.3})`);

            ctx.fillStyle = gradient;
            ctx.fill();

            // Crystal edge highlight
            ctx.strokeStyle = `rgba(255, 255, 255, ${this.opacity * 0.5})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();

            ctx.restore();
        }
    }

    // Initialize particles
    for (let i = 0; i < particleCount; i++) {
        particles.push(new SugarParticle());
    }

    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        particles.forEach(particle => {
            particle.update();
            particle.draw();
        });

        requestAnimationFrame(animate);
    }

    animate();
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

    gsap.from('.hero-content .tagline', {
        opacity: 0,
        y: 50,
        duration: 1,
        delay: 0.3,
        ease: 'power3.out'
    });

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

    // Event Listener für alle Anchor Links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
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
// INTERACTIVE MAP - Bidirectional
// ============================================
function initInteractiveMap() {
    const markers = document.querySelectorAll('.location-marker');
    const cards = document.querySelectorAll('.location-card');
    let activeMarker = null;

    // Helper function to activate a location
    function activateLocation(locationId) {
        // Remove active from all markers and cards
        markers.forEach(m => m.classList.remove('active'));
        cards.forEach(c => c.classList.remove('active'));

        // Find and activate matching marker
        const marker = document.querySelector(`.location-marker[data-location="${locationId}"]`);
        if (marker) {
            marker.classList.add('active');
            activeMarker = marker;

            // Animate the marker-dot inside (smooth, no jumping)
            const dot = marker.querySelector('.marker-dot');
            const pulse = marker.querySelector('.marker-pulse');
            if (dot) {
                gsap.to(dot, {
                    attr: { r: 7 },
                    fill: '#ffffff',
                    duration: 0.25,
                    ease: 'power2.out'
                });
            }
            if (pulse) {
                gsap.to(pulse, {
                    attr: { r: 18 },
                    opacity: 0.7,
                    duration: 0.25,
                    ease: 'power2.out'
                });
            }
        }

        // Find and activate matching card
        const card = document.querySelector(`.location-card[data-location="${locationId}"]`);
        if (card) {
            card.classList.add('active');
            // Scroll card into view if needed
            card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        // Add blur effect class to locations list
        const locationsList = document.querySelector('.locations-list');
        if (locationsList) {
            locationsList.classList.add('has-active-card');
        }
    }

    // Helper function to deactivate all locations
    function deactivateAll() {
        markers.forEach(marker => {
            marker.classList.remove('active');

            // Reset the inner elements
            const dot = marker.querySelector('.marker-dot');
            const pulse = marker.querySelector('.marker-pulse');
            if (dot) {
                gsap.to(dot, {
                    attr: { r: 5 },
                    fill: '#c9a227',
                    duration: 0.2,
                    ease: 'power2.out'
                });
            }
            if (pulse) {
                gsap.to(pulse, {
                    attr: { r: 12 },
                    opacity: 0.4,
                    duration: 0.2,
                    ease: 'power2.out'
                });
            }
        });
        cards.forEach(card => {
            card.classList.remove('active');
        });
        activeMarker = null;

        // Remove blur effect class from locations list
        const locationsList = document.querySelector('.locations-list');
        if (locationsList) {
            locationsList.classList.remove('has-active-card');
        }
    }

    // Map marker hover events
    markers.forEach(marker => {
        marker.addEventListener('mouseenter', () => {
            const location = marker.dataset.location;
            activateLocation(location);
        });

        marker.addEventListener('mouseleave', () => {
            deactivateAll();
        });

        // Click to toggle persistent selection
        marker.addEventListener('click', () => {
            const location = marker.dataset.location;
            const isActive = marker.classList.contains('active');
            if (isActive) {
                deactivateAll();
            } else {
                activateLocation(location);
            }
        });
    });

    // Location card hover events - highlight corresponding map marker
    cards.forEach(card => {
        card.addEventListener('mouseenter', () => {
            const location = card.dataset.location;
            activateLocation(location);
        });

        card.addEventListener('mouseleave', () => {
            deactivateAll();
        });

        // Click to toggle persistent selection
        card.addEventListener('click', () => {
            const location = card.dataset.location;
            const isActive = card.classList.contains('active');
            if (isActive) {
                deactivateAll();
            } else {
                activateLocation(location);
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
        submitBtn.classList.add('loading');
        submitBtn.disabled = true;

        // Simulate form submission (replace with actual API call)
        try {
            // Simulate API delay
            await new Promise(resolve => setTimeout(resolve, 1500));

            // In production, you would send the data to your server:
            // const response = await fetch('/api/contact', {
            //     method: 'POST',
            //     headers: { 'Content-Type': 'application/json' },
            //     body: JSON.stringify(formData)
            // });

            // Show success message
            form.querySelectorAll('.form-row, .form-group, .btn-submit').forEach(el => {
                el.style.display = 'none';
            });
            formSuccess.hidden = false;
            formSuccess.scrollIntoView({ behavior: 'smooth', block: 'center' });

        } catch (error) {
            console.error('Form submission error:', error);
            formError.hidden = false;
            submitBtn.classList.remove('loading');
            submitBtn.disabled = false;
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
