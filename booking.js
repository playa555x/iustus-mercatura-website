// ========================================
// Booking Page JavaScript
// ========================================

document.addEventListener('DOMContentLoaded', () => {
    initBooking();
});

// State
const bookingState = {
    currentStep: 1,
    selectedDate: null,
    selectedTime: null,
    selectedType: 'consultation',
    selectedDuration: 30,
    timezone: 'Europe/London',
    currentMonth: new Date().getMonth(),
    currentYear: new Date().getFullYear()
};

// Available time slots (would come from admin settings in real implementation)
const availableSlots = {
    // Default available hours (9 AM to 5 PM, Monday-Friday)
    defaultHours: [9, 10, 11, 14, 15, 16, 17],
    // Blocked dates (format: 'YYYY-MM-DD')
    blockedDates: [],
    // Custom availability per date (format: 'YYYY-MM-DD': [hours])
    customAvailability: {}
};

function initBooking() {
    // Initialize meeting type selection
    initMeetingTypes();

    // Initialize calendar
    renderCalendar();

    // Initialize timezone select
    initTimezone();

    // Initialize form
    initForm();

    // Initialize page transitions
    initPageTransitions();
}

// ========================================
// Meeting Type Selection
// ========================================

function initMeetingTypes() {
    const typeCards = document.querySelectorAll('.meeting-type-card');

    typeCards.forEach(card => {
        card.addEventListener('click', () => {
            // Remove active from all
            typeCards.forEach(c => c.classList.remove('active'));

            // Add active to clicked
            card.classList.add('active');

            // Update state
            bookingState.selectedType = card.dataset.type;
            bookingState.selectedDuration = parseInt(card.dataset.duration);

            // Update summary
            updateSummary();
        });
    });
}

// ========================================
// Calendar
// ========================================

function renderCalendar() {
    const calendarDays = document.getElementById('calendarDays');
    const currentMonthEl = document.getElementById('currentMonth');

    const { currentMonth, currentYear } = bookingState;

    // Update month/year display
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December'];
    currentMonthEl.textContent = `${monthNames[currentMonth]} ${currentYear}`;

    // Get first day of month and total days
    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();

    // Today for comparison
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Clear calendar
    calendarDays.innerHTML = '';

    // Previous month days
    for (let i = firstDay - 1; i >= 0; i--) {
        const dayEl = document.createElement('div');
        dayEl.className = 'calendar-day other-month';
        dayEl.textContent = daysInPrevMonth - i;
        calendarDays.appendChild(dayEl);
    }

    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
        const dayEl = document.createElement('div');
        dayEl.className = 'calendar-day';
        dayEl.textContent = day;

        const date = new Date(currentYear, currentMonth, day);
        const dateStr = formatDateString(date);

        // Check if today
        if (date.getTime() === today.getTime()) {
            dayEl.classList.add('today');
        }

        // Check if available (weekday and not in the past)
        const dayOfWeek = date.getDay();
        const isWeekday = dayOfWeek !== 0 && dayOfWeek !== 6;
        const isNotPast = date >= today;
        const isNotBlocked = !availableSlots.blockedDates.includes(dateStr);

        if (isWeekday && isNotPast && isNotBlocked) {
            dayEl.classList.add('available');
            dayEl.addEventListener('click', () => selectDate(date, dayEl));
        }

        // Check if selected
        if (bookingState.selectedDate &&
            formatDateString(bookingState.selectedDate) === dateStr) {
            dayEl.classList.add('selected');
        }

        calendarDays.appendChild(dayEl);
    }

    // Next month days to fill grid
    const totalCells = calendarDays.children.length;
    const remainingCells = 42 - totalCells; // 6 rows * 7 days

    for (let i = 1; i <= remainingCells; i++) {
        const dayEl = document.createElement('div');
        dayEl.className = 'calendar-day other-month';
        dayEl.textContent = i;
        calendarDays.appendChild(dayEl);
    }

    // Navigation
    document.getElementById('prevMonth').onclick = () => navigateMonth(-1);
    document.getElementById('nextMonth').onclick = () => navigateMonth(1);
}

function navigateMonth(direction) {
    bookingState.currentMonth += direction;

    if (bookingState.currentMonth > 11) {
        bookingState.currentMonth = 0;
        bookingState.currentYear++;
    } else if (bookingState.currentMonth < 0) {
        bookingState.currentMonth = 11;
        bookingState.currentYear--;
    }

    renderCalendar();
}

function selectDate(date, element) {
    // Remove previous selection
    document.querySelectorAll('.calendar-day.selected').forEach(el => {
        el.classList.remove('selected');
    });

    // Add new selection
    element.classList.add('selected');
    bookingState.selectedDate = date;

    // Go to step 2
    setTimeout(() => goToStep(2), 300);
}

function formatDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatDisplayDate(date) {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
}

// ========================================
// Time Slots
// ========================================

function initTimezone() {
    const select = document.getElementById('timezoneSelect');

    // Try to detect user's timezone
    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const options = Array.from(select.options);
    const match = options.find(opt => opt.value === userTimezone);

    if (match) {
        select.value = userTimezone;
        bookingState.timezone = userTimezone;
    }

    select.addEventListener('change', (e) => {
        bookingState.timezone = e.target.value;
        renderTimeSlots();
    });
}

function renderTimeSlots() {
    const container = document.getElementById('timeSlots');
    const dateDisplay = document.getElementById('selectedDateDisplay');

    if (!bookingState.selectedDate) return;

    // Update date display
    dateDisplay.textContent = formatDisplayDate(bookingState.selectedDate);

    // Get available hours for this date
    const dateStr = formatDateString(bookingState.selectedDate);
    const hours = availableSlots.customAvailability[dateStr] || availableSlots.defaultHours;

    // Clear container
    container.innerHTML = '';

    // Generate time slots
    hours.forEach(hour => {
        const slot = document.createElement('div');
        slot.className = 'time-slot';

        // Format time based on timezone
        const timeStr = formatTime(hour);
        slot.textContent = timeStr;
        slot.dataset.hour = hour;

        // Check if selected
        if (bookingState.selectedTime === hour) {
            slot.classList.add('selected');
        }

        slot.addEventListener('click', () => selectTime(hour, slot));
        container.appendChild(slot);
    });
}

function formatTime(hour) {
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour);
    return `${displayHour}:00 ${period}`;
}

function selectTime(hour, element) {
    // Remove previous selection
    document.querySelectorAll('.time-slot.selected').forEach(el => {
        el.classList.remove('selected');
    });

    // Add new selection
    element.classList.add('selected');
    bookingState.selectedTime = hour;

    // Update summary
    updateSummary();

    // Go to step 3
    setTimeout(() => goToStep(3), 300);
}

// ========================================
// Step Navigation
// ========================================

function goToStep(step) {
    bookingState.currentStep = step;

    // Update step indicators
    document.querySelectorAll('.step').forEach(el => {
        const stepNum = parseInt(el.dataset.step);
        el.classList.remove('active', 'completed');

        if (stepNum < step) {
            el.classList.add('completed');
        } else if (stepNum === step) {
            el.classList.add('active');
        }
    });

    // Show appropriate content
    document.querySelectorAll('.booking-step-content').forEach(el => {
        el.classList.remove('active');
    });

    const content = document.querySelector(`.booking-step-content[data-step="${step}"]`);
    if (content) {
        content.classList.add('active');
    }

    // Render time slots when going to step 2
    if (step === 2) {
        renderTimeSlots();
    }

    // Update summary when going to step 3
    if (step === 3) {
        updateSummary();
    }
}

function updateSummary() {
    const typeNames = {
        'consultation': 'Initial Consultation',
        'strategy': 'Strategy Session',
        'partnership': 'Partnership Discussion'
    };

    document.getElementById('summaryType').textContent = typeNames[bookingState.selectedType] || 'Initial Consultation';
    document.getElementById('summaryDuration').textContent = `${bookingState.selectedDuration} minutes`;

    if (bookingState.selectedDate && bookingState.selectedTime !== null) {
        const dateStr = bookingState.selectedDate.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
        const timeStr = formatTime(bookingState.selectedTime);
        document.getElementById('summaryDateTime').textContent = `${dateStr} at ${timeStr}`;
    }
}

// ========================================
// Form Handling
// ========================================

function initForm() {
    const form = document.getElementById('bookingForm');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const formData = new FormData(form);
        const data = {
            type: bookingState.selectedType,
            duration: bookingState.selectedDuration,
            date: formatDateString(bookingState.selectedDate),
            time: bookingState.selectedTime,
            timezone: bookingState.timezone,
            name: formData.get('name'),
            email: formData.get('email'),
            company: formData.get('company'),
            phone: formData.get('phone'),
            message: formData.get('message')
        };

        // Show loading state
        const submitBtn = form.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = `
            <svg class="spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10" stroke-dasharray="60" stroke-dashoffset="20"/>
            </svg>
            Processing...
        `;
        submitBtn.disabled = true;

        try {
            // Prepare booking data for API
            const nameParts = (data.name || '').trim().split(' ');
            const firstName = nameParts[0] || '';
            const lastName = nameParts.slice(1).join(' ') || '';

            const bookingData = {
                meetingType: data.type,
                date: data.date,
                time: data.time,
                timezone: data.timezone,
                firstName,
                lastName,
                email: data.email,
                phone: data.phone || '',
                company: data.company || '',
                topic: data.type === 'video' ? 'Video Conference' : data.type === 'phone' ? 'Phone Call' : 'In-Person Meeting',
                message: data.message || ''
            };

            // Send to API
            const response = await fetch('/api/booking', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bookingData)
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.error || 'Failed to submit booking');
            }

            // Store booking reference
            bookingState.bookingId = result.bookingId;

            // Show success
            showSuccess(data, result.bookingId);

        } catch (error) {
            console.error('Booking error:', error);
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
            alert('There was an error processing your booking. Please try again.');
        }
    });
}

function showSuccess(data, bookingId = null) {
    // Update confirmation details
    document.getElementById('confirmDate').textContent = formatDisplayDate(bookingState.selectedDate);
    document.getElementById('confirmTime').textContent = `${formatTime(bookingState.selectedTime)} (${getTimezoneAbbr(bookingState.timezone)})`;

    const typeNames = {
        'consultation': 'Initial Consultation',
        'strategy': 'Strategy Session',
        'partnership': 'Partnership Discussion',
        'video': 'Video Conference',
        'phone': 'Phone Call',
        'in-person': 'In-Person Meeting'
    };
    document.getElementById('confirmType').textContent = `${typeNames[bookingState.selectedType] || bookingState.selectedType} (${bookingState.selectedDuration} min)`;

    // Show booking reference if available
    const confirmRef = document.getElementById('confirmReference');
    if (confirmRef && bookingId) {
        confirmRef.textContent = bookingId;
        confirmRef.parentElement.style.display = 'block';
    }

    // Show success step
    document.querySelectorAll('.booking-step-content').forEach(el => {
        el.classList.remove('active');
    });

    document.querySelector('.booking-step-content[data-step="success"]').classList.add('active');

    // Update step indicators
    document.querySelectorAll('.step').forEach(el => {
        el.classList.add('completed');
        el.classList.remove('active');
    });
}

function getTimezoneAbbr(timezone) {
    const abbrs = {
        'Europe/London': 'GMT',
        'Europe/Berlin': 'CET',
        'America/New_York': 'EST',
        'America/Sao_Paulo': 'BRT',
        'Asia/Dubai': 'GST',
        'Africa/Kampala': 'EAT'
    };
    return abbrs[timezone] || timezone;
}

// ========================================
// Calendar Export
// ========================================

function addToCalendar() {
    if (!bookingState.selectedDate || bookingState.selectedTime === null) return;

    const typeNames = {
        'consultation': 'Initial Consultation - Iustus Mercatura',
        'strategy': 'Strategy Session - Iustus Mercatura',
        'partnership': 'Partnership Discussion - Iustus Mercatura'
    };

    const title = typeNames[bookingState.selectedType];
    const startDate = new Date(bookingState.selectedDate);
    startDate.setHours(bookingState.selectedTime, 0, 0);

    const endDate = new Date(startDate);
    endDate.setMinutes(endDate.getMinutes() + bookingState.selectedDuration);

    // Format for Google Calendar
    const formatGoogleDate = (date) => {
        return date.toISOString().replace(/-|:|\.\d{3}/g, '');
    };

    const googleUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${formatGoogleDate(startDate)}/${formatGoogleDate(endDate)}&details=${encodeURIComponent('Meeting with Iustus Mercatura team. Video call link will be sent via email.')}&location=${encodeURIComponent('Video Call')}`;

    window.open(googleUrl, '_blank');
}

// ========================================
// Page Transitions
// ========================================

function initPageTransitions() {
    const transitionLinks = document.querySelectorAll('[data-transition]');
    const overlay = document.querySelector('.page-transition-overlay');

    transitionLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            if (link.href && !link.href.includes('#')) {
                e.preventDefault();
                overlay.classList.add('active');

                setTimeout(() => {
                    window.location.href = link.href;
                }, 600);
            }
        });
    });

    // Remove overlay on page load
    window.addEventListener('load', () => {
        overlay.classList.remove('active');
    });
}

// Make goToStep available globally
window.goToStep = goToStep;
window.addToCalendar = addToCalendar;
