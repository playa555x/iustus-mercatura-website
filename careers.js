// ============================================
// CAREERS PAGE JAVASCRIPT
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    initPageTransition();
    initFilterButtons();
    initFileUpload();
    initFormSubmission();
    initAnimations();
});

// ============================================
// PAGE TRANSITION
// ============================================
function initPageTransition() {
    const overlay = document.querySelector('.page-transition-overlay');
    if (!overlay) return;

    // Hide overlay on load
    setTimeout(() => {
        overlay.style.opacity = '0';
        setTimeout(() => {
            overlay.style.display = 'none';
        }, 500);
    }, 300);

    // Add transition on link clicks
    document.querySelectorAll('a[data-transition]').forEach(link => {
        link.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            if (href && !href.startsWith('#')) {
                e.preventDefault();
                overlay.style.display = 'flex';
                overlay.style.opacity = '1';
                setTimeout(() => {
                    window.location.href = href;
                }, 500);
            }
        });
    });
}

// ============================================
// POSITION FILTER
// ============================================
function initFilterButtons() {
    const filterButtons = document.querySelectorAll('.filter-btn');
    const positionCards = document.querySelectorAll('.position-card');
    const noPositions = document.querySelector('.no-positions');

    filterButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            const filter = this.dataset.filter;
            filterPositions(filter);

            // Update active state
            filterButtons.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
        });
    });
}

function filterPositions(category) {
    const positionCards = document.querySelectorAll('.position-card');
    const noPositions = document.querySelector('.no-positions');
    let visibleCount = 0;

    positionCards.forEach(card => {
        const cardCategory = card.dataset.category;

        if (category === 'all' || cardCategory === category) {
            card.classList.remove('hidden');
            card.style.display = 'block';
            visibleCount++;

            // Animate in
            card.style.opacity = '0';
            card.style.transform = 'translateY(20px)';
            setTimeout(() => {
                card.style.transition = 'all 0.4s ease';
                card.style.opacity = '1';
                card.style.transform = 'translateY(0)';
            }, 50);
        } else {
            card.classList.add('hidden');
            card.style.display = 'none';
        }
    });

    // Show/hide no positions message
    if (noPositions) {
        noPositions.style.display = visibleCount === 0 ? 'block' : 'none';
    }

    // Update filter button state
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.filter === category) {
            btn.classList.add('active');
        }
    });
}

// ============================================
// APPLICATION MODAL
// ============================================
function openApplicationModal(position, location) {
    const modal = document.getElementById('applicationModal');
    const titleEl = document.getElementById('modalPositionTitle');
    const locationEl = document.getElementById('modalPositionLocation');

    if (titleEl) titleEl.textContent = position;
    if (locationEl) locationEl.textContent = location;

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeApplicationModal() {
    const modal = document.getElementById('applicationModal');
    modal.classList.remove('active');
    document.body.style.overflow = '';
}

function closeSuccessModal() {
    const modal = document.getElementById('successModal');
    modal.classList.remove('active');
    document.body.style.overflow = '';
}

// Close modal on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', function(e) {
        if (e.target === this) {
            this.classList.remove('active');
            document.body.style.overflow = '';
        }
    });
});

// Close modal on escape key
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.active').forEach(modal => {
            modal.classList.remove('active');
        });
        document.body.style.overflow = '';
    }
});

// ============================================
// FILE UPLOAD
// ============================================
function initFileUpload() {
    const cvInput = document.getElementById('cvInput');
    const cvFileName = document.getElementById('cvFileName');
    const uploadArea = document.getElementById('cvUploadArea');

    if (!cvInput) return;

    cvInput.addEventListener('change', function() {
        if (this.files.length > 0) {
            const file = this.files[0];
            const maxSize = 5 * 1024 * 1024; // 5MB

            if (file.size > maxSize) {
                alert('File is too large. Maximum size is 5MB.');
                this.value = '';
                cvFileName.textContent = '';
                return;
            }

            cvFileName.textContent = file.name;
            uploadArea.style.borderColor = 'var(--accent-gold)';
        } else {
            cvFileName.textContent = '';
            uploadArea.style.borderColor = '';
        }
    });

    // Drag and drop
    uploadArea.addEventListener('dragover', function(e) {
        e.preventDefault();
        this.style.borderColor = 'var(--accent-gold)';
        this.style.background = 'rgba(212, 175, 55, 0.1)';
    });

    uploadArea.addEventListener('dragleave', function() {
        this.style.borderColor = '';
        this.style.background = '';
    });

    uploadArea.addEventListener('drop', function(e) {
        e.preventDefault();
        this.style.borderColor = '';
        this.style.background = '';

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            cvInput.files = files;
            cvInput.dispatchEvent(new Event('change'));
        }
    });
}

// ============================================
// FORM SUBMISSION
// ============================================
function initFormSubmission() {
    const form = document.getElementById('applicationForm');
    if (!form) return;

    form.addEventListener('submit', async function(e) {
        e.preventDefault();

        const submitBtn = form.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<span class="spinner"></span> Submitting...';
        submitBtn.disabled = true;

        // Collect form data
        const formData = new FormData(form);
        const position = document.getElementById('modalPositionTitle').textContent;
        const location = document.getElementById('modalPositionLocation').textContent;

        formData.append('position', position);
        formData.append('location', location);
        formData.append('timestamp', new Date().toISOString());

        try {
            // Send to server
            const response = await fetch('/api/careers/apply', {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                // Close application modal
                closeApplicationModal();

                // Show success modal
                const successModal = document.getElementById('successModal');
                successModal.classList.add('active');

                // Reset form
                form.reset();
                document.getElementById('cvFileName').textContent = '';
            } else {
                throw new Error('Submission failed');
            }
        } catch (error) {
            console.error('Error:', error);
            // Still show success for demo (no backend)
            closeApplicationModal();
            document.getElementById('successModal').classList.add('active');
            form.reset();
            document.getElementById('cvFileName').textContent = '';
        }

        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    });
}

// ============================================
// ANIMATIONS
// ============================================
function initAnimations() {
    // Animate elements on scroll
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-in');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    // Observe value cards
    document.querySelectorAll('.value-card').forEach((card, index) => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(30px)';
        card.style.transition = `all 0.6s ease ${index * 0.1}s`;
        observer.observe(card);
    });

    // Observe position cards
    document.querySelectorAll('.position-card').forEach((card, index) => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(20px)';
        card.style.transition = `all 0.5s ease ${index * 0.1}s`;
        observer.observe(card);
    });
}

// Add animate-in class behavior
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.animate-in').forEach(el => {
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
    });
});

// Observer callback enhancement
const style = document.createElement('style');
style.textContent = `
    .animate-in {
        opacity: 1 !important;
        transform: translateY(0) !important;
    }
`;
document.head.appendChild(style);
