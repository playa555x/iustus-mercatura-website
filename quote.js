/**
 * Request a Quote - Modern Multi-Step Form
 * Iustus Mercatura - Premium Design
 */

// ============================================
// THREE.JS BACKGROUND
// ============================================
let scene, camera, renderer, particles, animationId;

function initThreeBackground() {
    const canvas = document.getElementById('bg-canvas');
    if (!canvas || typeof THREE === 'undefined') return;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 5;

    renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        alpha: true,
        antialias: true
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Create particles
    const particleCount = 600;
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 25;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 25;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 25;

        // Gold to white gradient
        const goldIntensity = Math.random();
        colors[i * 3] = 0.83 + goldIntensity * 0.17;     // R (212/255)
        colors[i * 3 + 1] = 0.69 + goldIntensity * 0.31; // G (175/255)
        colors[i * 3 + 2] = 0.22 + goldIntensity * 0.78; // B (55/255)

        sizes[i] = Math.random() * 0.08 + 0.02;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
        size: 0.05,
        vertexColors: true,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true
    });

    particles = new THREE.Points(geometry, material);
    scene.add(particles);

    // Mouse interaction
    let mouseX = 0;
    let mouseY = 0;

    document.addEventListener('mousemove', (e) => {
        mouseX = (e.clientX / window.innerWidth) * 2 - 1;
        mouseY = -(e.clientY / window.innerHeight) * 2 + 1;
    });

    // Animation
    function animate() {
        animationId = requestAnimationFrame(animate);

        particles.rotation.x += 0.0002;
        particles.rotation.y += 0.0004;

        // Subtle mouse follow
        particles.rotation.x += mouseY * 0.0002;
        particles.rotation.y += mouseX * 0.0002;

        renderer.render(scene, camera);
    }
    animate();

    // Resize handler
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}

// ============================================
// PAGE TRANSITIONS
// ============================================
class PageTransition {
    constructor() {
        this.overlay = document.querySelector('.page-transition-overlay');
        this.init();
    }

    init() {
        // Handle all transition links
        document.querySelectorAll('[data-transition]').forEach(link => {
            link.addEventListener('click', (e) => {
                if (link.href && link.href !== window.location.href) {
                    e.preventDefault();
                    this.navigateTo(link.href);
                }
            });
        });
    }

    navigateTo(url) {
        if (!this.overlay) {
            window.location.href = url;
            return;
        }

        this.overlay.classList.add('active');

        setTimeout(() => {
            window.location.href = url;
        }, 600);
    }

    exit() {
        if (this.overlay) {
            this.overlay.classList.add('exit');
            setTimeout(() => {
                this.overlay.classList.remove('active', 'exit');
            }, 800);
        }
    }
}

// ============================================
// MULTI-STEP FORM
// ============================================
class QuoteForm {
    constructor() {
        this.currentStep = 1;
        this.totalSteps = 2;
        this.formData = {};
        this.form = document.getElementById('quoteForm');
        this.progressFill = document.getElementById('progressFill');
        this.prevBtn = document.getElementById('prevBtn');
        this.nextBtn = document.getElementById('nextBtn');
        this.submitBtn = document.getElementById('submitBtn');

        if (this.form) {
            this.init();
        }
    }

    init() {
        this.bindEvents();
        this.updateProgress();
        this.initProductCardEffects();
    }

    bindEvents() {
        // Next button
        this.nextBtn?.addEventListener('click', () => this.nextStep());

        // Previous button
        this.prevBtn?.addEventListener('click', () => this.prevStep());

        // Form submission
        this.form?.addEventListener('submit', (e) => this.handleSubmit(e));

        // Product selection animation
        document.querySelectorAll('.product-card input').forEach(input => {
            input.addEventListener('change', () => {
                this.animateSelection(input.closest('.product-card'));
            });
        });

        // Real-time validation
        this.form?.querySelectorAll('input, select, textarea').forEach(field => {
            field.addEventListener('blur', () => this.validateField(field));
            field.addEventListener('input', () => {
                if (field.closest('.form-group')?.classList.contains('error')) {
                    this.validateField(field);
                }
            });
        });

        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
                e.preventDefault();
                if (this.currentStep < this.totalSteps) {
                    this.nextStep();
                }
            }
        });
    }

    initProductCardEffects() {
        document.querySelectorAll('.product-card').forEach(card => {
            card.addEventListener('mousemove', (e) => {
                const rect = card.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;

                const centerX = rect.width / 2;
                const centerY = rect.height / 2;

                const rotateX = (y - centerY) / 20;
                const rotateY = (centerX - x) / 20;

                card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-4px)`;
            });

            card.addEventListener('mouseleave', () => {
                card.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) translateY(0)';
            });
        });
    }

    animateSelection(card) {
        if (typeof gsap !== 'undefined') {
            // Remove selection from other cards
            document.querySelectorAll('.product-card').forEach(c => {
                if (c !== card) {
                    gsap.to(c, { scale: 1, duration: 0.3 });
                }
            });

            // Animate selected card
            gsap.fromTo(card,
                { scale: 0.95 },
                { scale: 1, duration: 0.4, ease: 'elastic.out(1.2, 0.5)' }
            );

            // Create ripple effect
            this.createRipple(card);
        }
    }

    createRipple(element) {
        const ripple = document.createElement('div');
        ripple.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            width: 0;
            height: 0;
            border-radius: 50%;
            background: rgba(212, 175, 55, 0.3);
            transform: translate(-50%, -50%);
            pointer-events: none;
            z-index: 10;
        `;
        element.querySelector('.card-content').appendChild(ripple);

        gsap.to(ripple, {
            width: 300,
            height: 300,
            opacity: 0,
            duration: 0.6,
            ease: 'power2.out',
            onComplete: () => ripple.remove()
        });
    }

    validateField(field) {
        const group = field.closest('.form-group') || field.closest('.checkbox-label');
        if (!group) return true;

        let isValid = true;
        let errorMessage = '';

        // Required check
        if (field.required && !field.value.trim()) {
            isValid = false;
            errorMessage = 'This field is required';
        }

        // Email validation
        if (field.type === 'email' && field.value) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(field.value)) {
                isValid = false;
                errorMessage = 'Please enter a valid email';
            }
        }

        // Phone validation
        if (field.type === 'tel' && field.value) {
            const phoneRegex = /^[\+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{1,4}[-\s\.]?[0-9]{1,9}$/;
            if (!phoneRegex.test(field.value.replace(/\s/g, ''))) {
                isValid = false;
                errorMessage = 'Please enter a valid phone number';
            }
        }

        // Number validation
        if (field.type === 'number' && field.value) {
            const min = parseFloat(field.min);
            const value = parseFloat(field.value);
            if (!isNaN(min) && value < min) {
                isValid = false;
                errorMessage = `Minimum value is ${min}`;
            }
        }

        // Checkbox validation
        if (field.type === 'checkbox' && field.required && !field.checked) {
            isValid = false;
            errorMessage = 'You must agree to continue';
        }

        // Update UI
        this.updateFieldUI(group, isValid, errorMessage);

        return isValid;
    }

    updateFieldUI(group, isValid, errorMessage) {
        // Remove existing error message
        const existingError = group.querySelector('.error-message');
        if (existingError) existingError.remove();

        if (!isValid) {
            group.classList.add('error');
            const errorEl = document.createElement('span');
            errorEl.className = 'error-message';
            errorEl.textContent = errorMessage;
            group.appendChild(errorEl);

            // Shake animation
            if (typeof gsap !== 'undefined') {
                gsap.to(group, {
                    x: [-5, 5, -5, 5, 0],
                    duration: 0.4,
                    ease: 'power2.inOut'
                });
            }
        } else {
            group.classList.remove('error');
        }
    }

    validateStep(step) {
        const stepElement = document.querySelector(`.form-step[data-step="${step}"]`);
        if (!stepElement) return true;

        const fields = stepElement.querySelectorAll('input:not([type="checkbox"]), select, textarea');
        const requiredCheckboxes = stepElement.querySelectorAll('input[type="checkbox"][required]');

        let isValid = true;

        fields.forEach(field => {
            if (field.required && !this.validateField(field)) {
                isValid = false;
            }
        });

        requiredCheckboxes.forEach(checkbox => {
            if (!this.validateField(checkbox)) {
                isValid = false;
            }
        });

        // Special validation for step 1 (product selection)
        if (step === 1) {
            const productSelected = document.querySelector('input[name="product"]:checked');
            if (!productSelected) {
                isValid = false;
                this.showProductSelectionError();
            }
        }

        return isValid;
    }

    showProductSelectionError() {
        const productGrid = document.querySelector('.product-grid');
        if (productGrid && typeof gsap !== 'undefined') {
            gsap.to('.product-card', {
                x: [-5, 5, -5, 5, 0],
                duration: 0.4,
                stagger: 0.05,
                ease: 'power2.inOut'
            });
        }

        // Show tooltip
        const firstCard = document.querySelector('.product-card');
        if (firstCard) {
            const tooltip = document.createElement('div');
            tooltip.className = 'selection-error-tooltip';
            tooltip.textContent = 'Please select a product';
            tooltip.style.cssText = `
                position: absolute;
                top: -40px;
                left: 50%;
                transform: translateX(-50%);
                background: var(--error-color, #ef4444);
                color: white;
                padding: 8px 16px;
                border-radius: 8px;
                font-size: 13px;
                z-index: 100;
                animation: fadeIn 0.3s ease;
            `;
            firstCard.style.position = 'relative';
            firstCard.appendChild(tooltip);

            setTimeout(() => tooltip.remove(), 3000);
        }
    }

    nextStep() {
        if (!this.validateStep(this.currentStep)) {
            return;
        }

        if (this.currentStep < this.totalSteps) {
            this.collectData();
            this.transitionStep(this.currentStep, this.currentStep + 1);
            this.currentStep++;
            this.updateProgress();

            // Generate review on last step
            if (this.currentStep === this.totalSteps) {
                this.generateReview();
            }

            // Scroll to top of form
            document.querySelector('.form-wrapper')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    prevStep() {
        if (this.currentStep > 1) {
            this.transitionStep(this.currentStep, this.currentStep - 1, true);
            this.currentStep--;
            this.updateProgress();

            // Scroll to top of form
            document.querySelector('.form-wrapper')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    transitionStep(from, to, reverse = false) {
        const fromStep = document.querySelector(`.form-step[data-step="${from}"]`);
        const toStep = document.querySelector(`.form-step[data-step="${to}"]`);

        if (!fromStep || !toStep) return;

        if (typeof gsap !== 'undefined') {
            // Animate out
            gsap.to(fromStep, {
                opacity: 0,
                x: reverse ? 50 : -50,
                duration: 0.3,
                ease: 'power2.in',
                onComplete: () => {
                    fromStep.classList.remove('active');
                    toStep.classList.add('active');

                    // Reset position and animate in
                    gsap.fromTo(toStep,
                        { opacity: 0, x: reverse ? -50 : 50 },
                        { opacity: 1, x: 0, duration: 0.4, ease: 'power2.out' }
                    );
                }
            });
        } else {
            fromStep.classList.remove('active');
            toStep.classList.add('active');
        }
    }

    updateProgress() {
        // Update progress bar
        const progress = (this.currentStep / this.totalSteps) * 100;

        if (typeof gsap !== 'undefined') {
            gsap.to(this.progressFill, {
                width: `${progress}%`,
                duration: 0.5,
                ease: 'power2.out'
            });
        } else if (this.progressFill) {
            this.progressFill.style.width = `${progress}%`;
        }

        // Update step indicators
        document.querySelectorAll('.progress-steps .step').forEach((step, index) => {
            const stepNum = index + 1;
            step.classList.remove('active', 'completed');

            if (stepNum < this.currentStep) {
                step.classList.add('completed');
            } else if (stepNum === this.currentStep) {
                step.classList.add('active');
            }
        });

        // Update buttons
        this.prevBtn?.classList.toggle('visible', this.currentStep > 1);

        if (this.currentStep === this.totalSteps) {
            if (this.nextBtn) this.nextBtn.style.display = 'none';
            if (this.submitBtn) this.submitBtn.style.display = 'inline-flex';
        } else {
            if (this.nextBtn) this.nextBtn.style.display = 'inline-flex';
            if (this.submitBtn) this.submitBtn.style.display = 'none';
        }
    }

    collectData() {
        const formData = new FormData(this.form);

        // Reset certifications array
        this.formData.certifications = [];

        formData.forEach((value, key) => {
            if (key === 'certifications') {
                this.formData.certifications.push(value);
            } else {
                this.formData[key] = value;
            }
        });
    }

    generateReview() {
        const reviewContent = document.getElementById('reviewContent');
        if (!reviewContent) return;

        const productNames = {
            sugar_ic45: 'Sugar IC45',
            sugar_vhp: 'Sugar VHP',
            soybeans: 'Soybeans',
            corn: 'Yellow Corn'
        };

        const frequencyNames = {
            'one-time': 'One-time order',
            'monthly': 'Monthly',
            'quarterly': 'Quarterly',
            'annual': 'Annual contract'
        };

        const packagingNames = {
            'bulk': 'Bulk (Ship\'s Hold)',
            'bigbag': 'Big Bags (1-2 MT)',
            'bags_50kg': 'Bags 50kg',
            'bags_25kg': 'Bags 25kg',
            'container': 'Container (FCL)'
        };

        const paymentNames = {
            'lc_sight': 'L/C at Sight',
            'lc_30': 'L/C 30 days',
            'lc_60': 'L/C 60 days',
            'lc_90': 'L/C 90 days',
            'tt_advance': 'T/T in Advance',
            'tt_against_docs': 'T/T Against Documents',
            'open_to_discuss': 'Open to Discussion'
        };

        const certifications = this.formData.certifications?.length > 0
            ? this.formData.certifications.map(c => c.charAt(0).toUpperCase() + c.slice(1).replace('-', ' ')).join(', ')
            : 'None';

        reviewContent.innerHTML = `
            <div class="review-section">
                <h4>Product Details</h4>
                <div class="review-item">
                    <span class="label">Product</span>
                    <span class="value">${productNames[this.formData.product] || this.formData.product || 'N/A'}</span>
                </div>
                <div class="review-item">
                    <span class="label">Quantity</span>
                    <span class="value">${this.formData.quantity ? this.formData.quantity + ' MT' : 'N/A'}</span>
                </div>
                <div class="review-item">
                    <span class="label">Frequency</span>
                    <span class="value">${frequencyNames[this.formData.frequency] || 'N/A'}</span>
                </div>
                <div class="review-item">
                    <span class="label">Quality</span>
                    <span class="value">${this.formData.quality ? this.formData.quality.charAt(0).toUpperCase() + this.formData.quality.slice(1) + ' Grade' : 'N/A'}</span>
                </div>
                <div class="review-item">
                    <span class="label">Packaging</span>
                    <span class="value">${packagingNames[this.formData.packaging] || 'N/A'}</span>
                </div>
                <div class="review-item">
                    <span class="label">Certifications</span>
                    <span class="value">${certifications}</span>
                </div>
            </div>

            <div class="review-section">
                <h4>Logistics</h4>
                <div class="review-item">
                    <span class="label">Incoterm</span>
                    <span class="value">${this.formData.incoterm || 'N/A'}</span>
                </div>
                <div class="review-item">
                    <span class="label">Destination Port</span>
                    <span class="value">${this.formData.destination_port || 'N/A'}</span>
                </div>
                <div class="review-item">
                    <span class="label">Country</span>
                    <span class="value">${this.formData.destination_country || 'N/A'}</span>
                </div>
                <div class="review-item">
                    <span class="label">Delivery</span>
                    <span class="value">${this.formData.delivery_date || 'N/A'}</span>
                </div>
                <div class="review-item">
                    <span class="label">Payment</span>
                    <span class="value">${paymentNames[this.formData.payment_terms] || 'N/A'}</span>
                </div>
                <div class="review-item">
                    <span class="label">Inspection</span>
                    <span class="value">${this.formData.inspection ? this.formData.inspection.toUpperCase().replace('_', ' ') : 'N/A'}</span>
                </div>
            </div>

            <div class="review-section">
                <h4>Contact Information</h4>
                <div class="review-item">
                    <span class="label">Company</span>
                    <span class="value">${this.formData.company_name || 'N/A'}</span>
                </div>
                <div class="review-item">
                    <span class="label">Contact</span>
                    <span class="value">${this.formData.contact_name || 'N/A'}</span>
                </div>
                <div class="review-item">
                    <span class="label">Email</span>
                    <span class="value">${this.formData.email || 'N/A'}</span>
                </div>
                <div class="review-item">
                    <span class="label">Phone</span>
                    <span class="value">${this.formData.phone || 'N/A'}</span>
                </div>
                <div class="review-item">
                    <span class="label">Country</span>
                    <span class="value">${this.formData.country || 'N/A'}</span>
                </div>
                <div class="review-item">
                    <span class="label">Position</span>
                    <span class="value">${this.formData.position || 'N/A'}</span>
                </div>
            </div>

            <div class="review-section">
                <h4>Additional Notes</h4>
                <div class="review-item" style="flex-direction: column; gap: 8px;">
                    <span class="value" style="text-align: left; max-width: 100%;">${this.formData.additional_notes || 'None provided'}</span>
                </div>
            </div>
        `;

        // Animate review sections
        if (typeof gsap !== 'undefined') {
            gsap.from('.review-section', {
                y: 20,
                opacity: 0,
                duration: 0.4,
                stagger: 0.1,
                ease: 'power2.out'
            });
        }
    }

    async handleSubmit(e) {
        e.preventDefault();

        if (!this.validateStep(this.currentStep)) {
            return;
        }

        this.collectData();
        this.submitBtn?.classList.add('loading');
        if (this.submitBtn) this.submitBtn.disabled = true;

        try {
            // Prepare quote data for API
            const quoteData = {
                product: this.formData.product,
                quantity: this.formData.quantity,
                frequency: this.formData.frequency,
                quality: this.formData.quality,
                packaging: this.formData.packaging,
                certifications: this.formData.certifications || [],
                incoterm: this.formData.incoterm,
                destination_port: this.formData.destination_port,
                destination_country: this.formData.destination_country,
                delivery_date: this.formData.delivery_date,
                payment_terms: this.formData.payment_terms,
                inspection: this.formData.inspection,
                company_name: this.formData.company_name,
                contact_name: this.formData.contact_name,
                email: this.formData.email,
                phone: this.formData.phone,
                country: this.formData.country,
                position: this.formData.position,
                additional_notes: this.formData.additional_notes
            };

            // Send to API
            const response = await fetch('/api/quote', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(quoteData)
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.error || 'Failed to submit quote request');
            }

            // Store locally for reference
            const encodedData = btoa(JSON.stringify({
                reference: result.reference,
                timestamp: new Date().toISOString(),
                data: this.formData
            }));
            localStorage.setItem('latestQuote', encodedData);

            // Show success
            this.showSuccess(result.reference);

            console.log('Quote submitted:', result);

        } catch (error) {
            console.error('Submission error:', error);
            this.showError(error.message || 'There was an error submitting your request. Please try again.');
        } finally {
            this.submitBtn?.classList.remove('loading');
            if (this.submitBtn) this.submitBtn.disabled = false;
        }
    }

    showSuccess(referenceNumber) {
        document.getElementById('referenceNumber').textContent = referenceNumber;

        // Hide current step and show success
        document.querySelector('.form-step.active')?.classList.remove('active');
        document.querySelector('.form-step[data-step="success"]')?.classList.add('active');

        // Hide navigation
        document.querySelector('.form-navigation').style.display = 'none';
        document.querySelector('.progress-container').style.display = 'none';

        // Animate success
        if (typeof gsap !== 'undefined') {
            gsap.from('.success-animation', {
                scale: 0,
                rotation: -180,
                duration: 0.8,
                ease: 'back.out(2)'
            });

            // Create confetti effect
            this.createConfetti();
        }
    }

    createConfetti() {
        const container = document.querySelector('.success-particles');
        if (!container) return;

        const colors = ['#d4af37', '#e8c547', '#10b981', '#ffffff'];

        for (let i = 0; i < 30; i++) {
            const particle = document.createElement('div');
            particle.style.cssText = `
                position: absolute;
                width: 8px;
                height: 8px;
                background: ${colors[Math.floor(Math.random() * colors.length)]};
                border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
            `;

            container.appendChild(particle);

            gsap.fromTo(particle,
                {
                    x: 0,
                    y: 0,
                    opacity: 1,
                    scale: 1
                },
                {
                    x: (Math.random() - 0.5) * 200,
                    y: (Math.random() - 0.5) * 200,
                    opacity: 0,
                    scale: 0,
                    duration: 1 + Math.random(),
                    ease: 'power2.out',
                    delay: Math.random() * 0.3,
                    onComplete: () => particle.remove()
                }
            );
        }
    }

    showError(message) {
        // Create error toast
        const toast = document.createElement('div');
        toast.className = 'error-toast';
        toast.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="15" y1="9" x2="9" y2="15"></line>
                <line x1="9" y1="9" x2="15" y2="15"></line>
            </svg>
            <span>${message}</span>
        `;
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: var(--error-color, #ef4444);
            color: white;
            padding: 16px 24px;
            border-radius: 12px;
            display: flex;
            align-items: center;
            gap: 12px;
            z-index: 1000;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        `;
        toast.querySelector('svg').style.cssText = 'width: 20px; height: 20px;';

        document.body.appendChild(toast);

        if (typeof gsap !== 'undefined') {
            gsap.from(toast, {
                y: 50,
                opacity: 0,
                duration: 0.3
            });

            gsap.to(toast, {
                y: 50,
                opacity: 0,
                duration: 0.3,
                delay: 4,
                onComplete: () => toast.remove()
            });
        } else {
            setTimeout(() => toast.remove(), 4000);
        }
    }

    generateChecksum(data) {
        const str = JSON.stringify(data);
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString(16);
    }
}

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    // Initialize Three.js background
    initThreeBackground();

    // Initialize page transitions
    const pageTransition = new PageTransition();
    pageTransition.exit();

    // Initialize form
    new QuoteForm();

    // GSAP entrance animations
    if (typeof gsap !== 'undefined') {
        gsap.from('.quote-header', {
            y: -30,
            opacity: 0,
            duration: 0.6,
            ease: 'power3.out'
        });

        gsap.from('.progress-container', {
            y: 20,
            opacity: 0,
            duration: 0.6,
            delay: 0.15,
            ease: 'power3.out'
        });

        gsap.from('.form-wrapper', {
            y: 30,
            opacity: 0,
            duration: 0.6,
            delay: 0.3,
            ease: 'power3.out'
        });
    }

    // Initialize floating particles animation timing
    document.querySelectorAll('.floating-particles .particle').forEach((particle, index) => {
        particle.style.animationDelay = `${index * 3}s`;
    });
});

// Export quote data function (for CRM integration)
window.exportQuoteData = function() {
    const encoded = localStorage.getItem('latestQuote');
    if (encoded) {
        try {
            return JSON.parse(atob(encoded));
        } catch (e) {
            return null;
        }
    }
    return null;
};
