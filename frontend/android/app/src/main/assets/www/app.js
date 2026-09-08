function getInitialApiBase() {
  const params = new URLSearchParams(window.location.search);
  if (params.has('api')) {
    const apiParam = params.get('api').trim().replace(/\/$/, '');
    localStorage.setItem('solwash_api_url', apiParam);
    return apiParam;
  }
  if (window.SOLWASH_API_URL) return window.SOLWASH_API_URL;
  const saved = localStorage.getItem('solwash_api_url');
  if (saved) return saved.trim().replace(/\/$/, '');

  return 'http://localhost:5000/api';
}

let API_BASE = getInitialApiBase();

// State
let authToken = localStorage.getItem('solwash_customer_token') || '';
let currentCustomer = null;
try {
  const cachedUser = localStorage.getItem('solwash_customer_user');
  if (cachedUser) {
    currentCustomer = JSON.parse(cachedUser);
  }
} catch (e) {
  console.warn('Failed to parse cached user:', e);
}
let currentSelectedService = null;
let availableServices = [];

// DOM Elements
const navTabs = document.querySelectorAll('.nav-tab');
const screenTabs = document.querySelectorAll('.screen-tab');
const headerUserName = document.getElementById('headerUserName');
const profileAuthBtn = document.getElementById('profileAuthBtn');

// Modals
const bookingModal = document.getElementById('bookingModal');
const loginModal = document.getElementById('loginModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const closeLoginModalBtn = document.getElementById('closeLoginModalBtn');
const bookingForm = document.getElementById('bookingForm');
const mobileLoginForm = document.getElementById('mobileLoginForm');
const modalServiceTitle = document.getElementById('modalServiceTitle');

// Init
document.addEventListener('DOMContentLoaded', () => {
  setupNetworkStatusMonitor();
  setupSplashOnboarding();
  setupNavigation();
  setupServiceToggles();
  setupBookingFilters();
  setupEventListeners();
  setupOtpAuthentication();
  loadPublicServices();

  // Check if redirected from Google OAuth with token
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('token')) {
    authToken = urlParams.get('token');
    const uName = urlParams.get('name') || 'Customer';
    const uEmail = urlParams.get('email') || '';
    currentCustomer = { id: 1, name: decodeURIComponent(uName), email: decodeURIComponent(uEmail), role: 'customer' };
    localStorage.setItem('solwash_customer_token', authToken);
    localStorage.setItem('solwash_customer_user', JSON.stringify(currentCustomer));
    if (window.history && window.history.replaceState) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }

  if (authToken) {
    updateCustomerUI();
    showScreen('tab-home');
    verifyCustomer();
  } else {
    // Show OTP Login Screen first
    showScreen('tab-login');
    updateCustomerUI();
  }
});

// Setup Full-Screen Onboarding / Splash Flow
function setupSplashOnboarding() {
  const splashContainer = document.getElementById('splash-onboarding');
  if (!splashContainer) return;

  // If already completed onboarding previously, hide immediately
  if (localStorage.getItem('solwash_onboarded') === 'true') {
    splashContainer.style.display = 'none';
    return;
  }

  const slides = splashContainer.querySelectorAll('.splash-slide');
  const dots = splashContainer.querySelectorAll('.splash-dot');
  const skipBtn = document.getElementById('skipSplashBtn');
  let currentIndex = 0;

  function updateDots() {
    dots.forEach((dot, idx) => {
      if (idx === currentIndex) {
        dot.classList.add('active');
      } else {
        dot.classList.remove('active');
      }
    });
  }

  function goToSlide(idx) {
    if (idx < 0) idx = 0;
    if (idx >= slides.length) {
      finishOnboarding();
      return;
    }
    currentIndex = idx;
    slides.forEach((slide, i) => {
      if (i === currentIndex) {
        slide.classList.add('active');
      } else {
        slide.classList.remove('active');
      }
    });
    updateDots();
  }

  function finishOnboarding() {
    localStorage.setItem('solwash_onboarded', 'true');
    splashContainer.classList.add('splash-fade-out');
    setTimeout(() => {
      splashContainer.style.display = 'none';
    }, 400);
  }

  if (skipBtn) {
    skipBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      finishOnboarding();
    });
  }

  // Handle action buttons
  splashContainer.querySelectorAll('.btn-splash-next').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = btn.getAttribute('data-action');
      if (action === 'start') {
        finishOnboarding();
      } else {
        goToSlide(currentIndex + 1);
      }
    });
  });

  // Slide clicks to advance
  slides.forEach((slide, idx) => {
    slide.addEventListener('click', (e) => {
      if (e.target.closest('.btn-splash-next')) return;
      if (idx === slides.length - 1) {
        finishOnboarding();
      } else {
        goToSlide(idx + 1);
      }
    });
  });

  // Dynamic dots click
  dots.forEach((dot, idx) => {
    dot.addEventListener('click', (e) => {
      e.stopPropagation();
      goToSlide(idx);
    });
  });

  // Touch swipe support
  let touchStartX = 0;
  splashContainer.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
  }, { passive: true });

  splashContainer.addEventListener('touchend', (e) => {
    const touchEndX = e.changedTouches[0].screenX;
    const diff = touchStartX - touchEndX;
    if (diff > 45) {
      goToSlide(currentIndex + 1);
    } else if (diff < -45) {
      goToSlide(currentIndex - 1);
    }
  }, { passive: true });
}

// Setup Offline / No Internet Connection Monitor
function setupNetworkStatusMonitor() {
  const overlay = document.getElementById('noInternetOverlay');
  const retryBtn = document.getElementById('retryConnectionBtn');
  if (!overlay) return;

  function showOfflineScreen() {
    overlay.classList.remove('hidden');
  }

  function hideOfflineScreen() {
    overlay.classList.add('hidden');
  }

  // Expose globally for network request catch blocks
  window.showOfflineScreen = showOfflineScreen;
  window.hideOfflineScreen = hideOfflineScreen;

  // Test if internet connection and server are reachable
  async function testInternetConnection() {
    if (!navigator.onLine) {
      return false;
    }
    try {
      const res = await fetch(`${API_BASE}/health?ping=${Date.now()}`, {
        cache: 'no-store'
      });
      return res.ok;
    } catch (e) {
      return false;
    }
  }

  // Native online/offline events
  window.addEventListener('offline', () => {
    showOfflineScreen();
    showToast('Internet connection lost!');
  });

  window.addEventListener('online', async () => {
    const isWorking = await testInternetConnection();
    if (isWorking) {
      hideOfflineScreen();
      showToast('✓ Internet Connected!');
      loadPublicServices();
      if (authToken) loadCustomerBookings();
    }
  });

  // Retry Connection button
  if (retryBtn) {
    retryBtn.addEventListener('click', async () => {
      retryBtn.classList.add('loading');
      const textSpan = retryBtn.querySelector('span');
      if (textSpan) textSpan.textContent = 'Checking...';

      const isOnline = await testInternetConnection();
      setTimeout(() => {
        retryBtn.classList.remove('loading');
        if (textSpan) textSpan.textContent = 'Retry Connection';

        if (isOnline) {
          hideOfflineScreen();
          showToast('✓ Connection restored!');
          loadPublicServices();
          if (authToken) loadCustomerBookings();
        } else {
          showToast('Still offline. Please check your internet connection.');
        }
      }, 700);
    });
  }

  // Initial check on load
  if (!navigator.onLine) {
    showOfflineScreen();
  }
}

// Reset OTP Authentication UI back to initial state (Step 1: Email input)
function resetOtpForm() {
  const sendOtpForm = document.getElementById('sendOtpForm');
  const verifyOtpForm = document.getElementById('verifyOtpForm');
  const otpEmailInput = document.getElementById('otpEmailInput');
  const otpCodeInput = document.getElementById('otpCodeInput');
  const sendOtpBtn = document.getElementById('sendOtpBtn');
  const verifyOtpBtn = document.getElementById('verifyOtpBtn');

  if (sendOtpForm) {
    sendOtpForm.classList.remove('hidden');
    if (typeof sendOtpForm.reset === 'function') sendOtpForm.reset();
  }
  if (verifyOtpForm) {
    verifyOtpForm.classList.add('hidden');
    if (typeof verifyOtpForm.reset === 'function') verifyOtpForm.reset();
  }
  if (otpEmailInput) otpEmailInput.value = '';
  if (otpCodeInput) otpCodeInput.value = '';
  if (sendOtpBtn) {
    sendOtpBtn.disabled = false;
    sendOtpBtn.innerHTML = '<span>Send OTP Code</span>';
  }
  if (verifyOtpBtn) {
    verifyOtpBtn.disabled = false;
    verifyOtpBtn.innerHTML = '<span>Verify OTP & Login</span>';
  }
  if (typeof window.clearPendingOtpEmail === 'function') {
    window.clearPendingOtpEmail();
  }
}

// Screen switcher helper
function showScreen(screenId) {
  const bottomNav = document.querySelector('.bottom-nav-container');

  screenTabs.forEach(s => s.classList.remove('active'));
  navTabs.forEach(t => t.classList.remove('active'));

  const target = document.getElementById(screenId);
  if (target) target.classList.add('active');

  const matchingNav = document.querySelector(`[data-tab="${screenId}"]`);
  if (matchingNav) matchingNav.classList.add('active');

  const appScreen = document.querySelector('.app-screen');
  if (appScreen) appScreen.scrollTop = 0;

  // If on login screen, strictly hide the floating bottom navigation and reset to email input step
  if (screenId === 'tab-login') {
    resetOtpForm();
    if (bottomNav) {
      bottomNav.classList.add('hidden');
      bottomNav.classList.add('nav-hidden');
    }
  } else {
    if (bottomNav) {
      bottomNav.classList.remove('hidden');
      bottomNav.classList.remove('nav-hidden');
    }
  }

  if (screenId === 'tab-bookings') {
    loadCustomerBookings();
  } else if (screenId === 'tab-services' || screenId === 'tab-home') {
    loadPublicServices();
  }
}

// Navigation Bottom Bar
function setupNavigation() {
  navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetId = tab.getAttribute('data-tab');
      showScreen(targetId);
    });
  });
}

// Service Tab Pill Toggle (One-Time / Plans)
function setupServiceToggles() {
  const btnOneTime = document.getElementById('btnOneTime');
  const btnPlans = document.getElementById('btnPlans');

  if (btnOneTime && btnPlans) {
    btnOneTime.addEventListener('click', () => {
      btnOneTime.classList.add('active');
      btnPlans.classList.remove('active');
    });

    btnPlans.addEventListener('click', () => {
      btnPlans.classList.add('active');
      btnOneTime.classList.remove('active');
      showToast('Monthly Solar Maintenance Plans coming soon!');
    });
  }
}

// Booking Filters (All, Pending, Accepted, In Process)
function setupBookingFilters() {
  const filterPills = document.querySelectorAll('.filter-pill');
  filterPills.forEach(pill => {
    pill.addEventListener('click', () => {
      filterPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const filter = pill.getAttribute('data-filter');
      filterBookingsList(filter);
    });
  });
}

// Event Listeners
function setupEventListeners() {
  // Hero Book button & Explore button
  const heroBookBtn = document.getElementById('heroBookBtn');
  const exploreMoreBtn = document.getElementById('exploreMoreBtn');

  if (heroBookBtn) {
    heroBookBtn.addEventListener('click', () => {
      showScreen('tab-services');
    });
  }

  if (exploreMoreBtn) {
    exploreMoreBtn.addEventListener('click', () => {
      // switch to services tab
      const servicesNav = document.querySelector('[data-tab="tab-services"]');
      if (servicesNav) servicesNav.click();
    });
  }

  // Profile Login/Logout button
  if (profileAuthBtn) {
    profileAuthBtn.addEventListener('click', () => {
      if (authToken) {
        // Logout
        authToken = '';
        currentCustomer = null;
        localStorage.removeItem('solwash_customer_token');
        localStorage.removeItem('solwash_customer_user');
        updateCustomerUI();
        resetOtpForm();
        showToast('Logged out successfully');
        showScreen('tab-login');
      } else {
        resetOtpForm();
        showScreen('tab-login');
      }
    });
  }

  // Modal Closers
  if (closeModalBtn) closeModalBtn.addEventListener('click', () => bookingModal.classList.add('hidden'));
  if (closeLoginModalBtn) closeLoginModalBtn.addEventListener('click', () => loginModal.classList.add('hidden'));

  // GPS Location button click
  const detectLocationBtn = document.getElementById('detectLocationBtn');
  if (detectLocationBtn) {
    detectLocationBtn.addEventListener('click', () => {
      detectCurrentLocation(true);
    });
  }

  // Payment Choice Selection (Online Razorpay vs Offline Pay After Service)
  const payMethodRazorpay = document.getElementById('payMethodRazorpay');
  const payMethodOffline = document.getElementById('payMethodOffline');
  const selectedPaymentModeInput = document.getElementById('selectedPaymentMode');
  const submitBookingBtn = document.getElementById('submitBookingBtn');

  function updatePaymentOptionUI(mode) {
    if (selectedPaymentModeInput) selectedPaymentModeInput.value = mode;

    const price = currentSelectedService ? currentSelectedService.price : 299;
    if (mode === 'razorpay') {
      if (payMethodRazorpay) payMethodRazorpay.classList.add('active');
      if (payMethodOffline) payMethodOffline.classList.remove('active');
      if (submitBookingBtn) {
        submitBookingBtn.innerHTML = `<span>Proceed to Pay Online (₹${price})</span>`;
      }
    } else {
      if (payMethodOffline) payMethodOffline.classList.add('active');
      if (payMethodRazorpay) payMethodRazorpay.classList.remove('active');
      if (submitBookingBtn) {
        submitBookingBtn.innerHTML = `<span>Confirm & Pay After Service (₹${price})</span>`;
      }
    }
  }

  if (payMethodRazorpay) {
    payMethodRazorpay.addEventListener('click', () => updatePaymentOptionUI('razorpay'));
  }
  if (payMethodOffline) {
    payMethodOffline.addEventListener('click', () => updatePaymentOptionUI('cash_on_delivery'));
  }

  // Booking Form Submission
  if (bookingForm) {
    bookingForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const date = document.getElementById('bookDate').value;
      const slot = document.getElementById('bookSlot').value;
      const address = document.getElementById('bookAddress').value.trim();
      const rawPhone = document.getElementById('bookPhone').value.trim();
      const latitude = document.getElementById('bookLatitude').value;
      const longitude = document.getElementById('bookLongitude').value;
      const paymentMode = selectedPaymentModeInput ? selectedPaymentModeInput.value : 'razorpay';

      if (!authToken) {
        bookingModal.classList.add('hidden');
        showToast('Please login to complete your booking');
        openLoginModal();
        return;
      }

      if (!rawPhone || rawPhone.length < 10) {
        showToast('Please enter a valid 10-digit mobile number.');
        return;
      }

      const formattedPhone = rawPhone.startsWith('+91') ? rawPhone : `+91${rawPhone}`;
      const submitBtn = document.getElementById('submitBookingBtn');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span>Processing Booking...</span>`;
      }

      try {
        // Step 1: Create Order on SolWash Backend
        const res = await fetch(`${API_BASE}/orders`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          },
          body: JSON.stringify({
            service_id: currentSelectedService ? currentSelectedService.id : 1,
            pickup_date: date,
            pickup_slot: slot,
            pickup_address: address,
            customer_phone: formattedPhone,
            payment_mode: paymentMode,
            latitude: latitude ? parseFloat(latitude) : null,
            longitude: longitude ? parseFloat(longitude) : null,
            notes: `Solar Care Service: ${currentSelectedService ? currentSelectedService.title : 'Solar Wash'}`,
            items: [{
              item_name: currentSelectedService ? currentSelectedService.title : 'Solar Wash',
              quantity: 1,
              unit_price: currentSelectedService ? currentSelectedService.price : 0
            }]
          })
        });

        const result = await res.json();
        if (!res.ok || !result.success) {
          throw new Error(result.message || 'Failed to place booking');
        }

        if (currentCustomer) {
          currentCustomer.phone = formattedPhone;
          localStorage.setItem('solwash_customer_user', JSON.stringify(currentCustomer));
        }

        const createdOrder = result.data;

        // Step 2: Handle Offline Pay After Service
        if (paymentMode === 'cash_on_delivery') {
          bookingModal.classList.add('hidden');
          showToast(`Booking #${createdOrder.order_number} confirmed! Pay ₹${createdOrder.total_amount} after service.`);
          showScreen('tab-bookings');
          document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
          const allPill = document.querySelector('.filter-pill[data-filter="all"]');
          if (allPill) allPill.classList.add('active');
          await loadCustomerBookings();
          return;
        }

        // Step 3: Handle Online Razorpay Payment
        if (paymentMode === 'razorpay') {
          showToast('Initializing Razorpay Checkout...');

          // Call backend to create Razorpay Order
          const rzpOrderRes = await fetch(`${API_BASE}/payments/razorpay-order`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
              amount: createdOrder.total_amount,
              receipt: createdOrder.order_number,
              notes: {
                solwash_order_id: String(createdOrder.id),
                service: currentSelectedService ? currentSelectedService.title : 'Solar Wash'
              }
            })
          });

          const rzpOrderData = await rzpOrderRes.json();
          if (!rzpOrderRes.ok || !rzpOrderData.success) {
            throw new Error(rzpOrderData.message || 'Payment gateway initialization failed');
          }

          const rzpData = rzpOrderData.data;

          // Open Razorpay Standard Checkout
          if (typeof Razorpay !== 'undefined' && !rzpData.is_mock) {
            const rzpOptions = {
              key: rzpData.key_id,
              amount: rzpData.amount,
              currency: rzpData.currency || 'INR',
              name: 'SolWash Solar Care',
              description: `Solar Care: ${currentSelectedService ? currentSelectedService.title : 'Wash Service'}`,
              image: 'https://cdn-icons-png.flaticon.com/512/869/869869.png',
              order_id: rzpData.order_id,
              prefill: {
                name: currentCustomer ? currentCustomer.name : 'Customer',
                email: currentCustomer ? currentCustomer.email : '',
                contact: formattedPhone
              },
              theme: { color: '#111d38' },
              handler: async function (response) {
                showToast('Verifying payment with bank...');
                try {
                  const verifyRes = await fetch(`${API_BASE}/payments/verify`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${authToken}`
                    },
                    body: JSON.stringify({
                      order_id: createdOrder.id,
                      razorpay_order_id: response.razorpay_order_id,
                      razorpay_payment_id: response.razorpay_payment_id,
                      razorpay_signature: response.razorpay_signature,
                      is_mock: false
                    })
                  });
                  const verifyResult = await verifyRes.json();
                  bookingModal.classList.add('hidden');
                  showToast(`✓ Payment Successful! Booking #${createdOrder.order_number} marked PAID.`);
                  showScreen('tab-bookings');
                  document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
                  const allPill = document.querySelector('.filter-pill[data-filter="all"]');
                  if (allPill) allPill.classList.add('active');
                  await loadCustomerBookings();
                } catch (vErr) {
                  bookingModal.classList.add('hidden');
                  showToast(`Booking #${createdOrder.order_number} saved.`);
                  showScreen('tab-bookings');
                  await loadCustomerBookings();
                }
              },
              modal: {
                ondismiss: async function () {
                  bookingModal.classList.add('hidden');
                  showToast(`Payment cancelled. Booking #${createdOrder.order_number} saved.`);
                  showScreen('tab-bookings');
                  await loadCustomerBookings();
                }
              }
            };

            const rzpInstance = new Razorpay(rzpOptions);
            rzpInstance.on('payment.failed', function (resp) {
              showToast(`Payment failed: ${resp.error.description || 'Try again'}`);
            });
            rzpInstance.open();
          } else {
            // Interactive Sandbox / Test Payment Modal
            const confirmPay = confirm(
              `⚡ Razorpay Payment Gateway (Online Sandbox)\n\n` +
              `Order: #${createdOrder.order_number}\n` +
              `Total Payable: ₹${createdOrder.total_amount}\n` +
              `Pay via: UPI (GPay / PhonePe) / Cards\n\n` +
              `Click [OK] to complete Online Payment.\n` +
              `Click [Cancel] to pay after service.`
            );

            if (confirmPay) {
              const testPayId = `pay_rzp_${Date.now()}`;
              await fetch(`${API_BASE}/payments/verify`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({
                  order_id: createdOrder.id,
                  razorpay_order_id: rzpData.order_id,
                  razorpay_payment_id: testPayId,
                  razorpay_signature: 'sandbox_test_sig',
                  is_mock: true
                })
              });
              bookingModal.classList.add('hidden');
              showToast(`✓ Payment Successful! Booking #${createdOrder.order_number} marked PAID.`);
              showScreen('tab-bookings');
              document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
              const allPill = document.querySelector('.filter-pill[data-filter="all"]');
              if (allPill) allPill.classList.add('active');
              await loadCustomerBookings();
            } else {
              bookingModal.classList.add('hidden');
              showToast(`Booking #${createdOrder.order_number} saved. (Pending Online Payment)`);
              showScreen('tab-bookings');
              await loadCustomerBookings();
            }
          }
        }
      } catch (err) {
        showToast(`Booking error: ${err.message}`);
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          const price = currentSelectedService ? currentSelectedService.price : 299;
          const currentMode = selectedPaymentModeInput ? selectedPaymentModeInput.value : 'razorpay';
          if (currentMode === 'razorpay') {
            submitBtn.innerHTML = `<span>Proceed to Pay Online (₹${price})</span>`;
          } else {
            submitBtn.innerHTML = `<span>Confirm & Pay After Service (₹${price})</span>`;
          }
        }
      }
    });
  }

  // Login Form Submission
  if (mobileLoginForm) {
    mobileLoginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('mobileEmail').value.trim();
      const password = document.getElementById('mobilePassword').value;

      try {
        const res = await fetch(`${API_BASE}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });

        const result = await res.json();
        if (res.ok && result.success) {
          authToken = result.data.token;
          currentCustomer = result.data.user;
          localStorage.setItem('solwash_customer_token', authToken);
          localStorage.setItem('solwash_customer_user', JSON.stringify(currentCustomer));
          
          loginModal.classList.add('hidden');
          updateCustomerUI();
          showToast(`Welcome, ${currentCustomer.name}!`);
          showScreen('tab-home');
        } else {
          showToast(result.message || 'Login failed');
        }
      } catch (err) {
        showToast(`Login error: ${err.message}`);
      }
    });
  }

  // Set default booking date to tomorrow
  const bookDateInput = document.getElementById('bookDate');
  if (bookDateInput) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    bookDateInput.value = tomorrow.toISOString().split('T')[0];
  }
}

function openBookingModal(title, price, id = 1, unit = '3 kWh') {
  currentSelectedService = { title, price, id, unit };
  if (modalServiceTitle) modalServiceTitle.textContent = `Book ${title} (₹${price} / ${unit})`;
  bookingModal.classList.remove('hidden');

  // Update prices in breakdown
  const priceTag = document.getElementById('modalServicePriceTag');
  const totalTag = document.getElementById('modalTotalPayableTag');
  if (priceTag) priceTag.textContent = `₹${price}`;
  if (totalTag) totalTag.textContent = `₹${price}`;

  // Default to Online Razorpay
  const payInput = document.getElementById('selectedPaymentMode');
  if (payInput) payInput.value = 'razorpay';
  const payMethodRazorpay = document.getElementById('payMethodRazorpay');
  const payMethodOffline = document.getElementById('payMethodOffline');
  if (payMethodRazorpay) payMethodRazorpay.classList.add('active');
  if (payMethodOffline) payMethodOffline.classList.remove('active');

  const submitBtn = document.getElementById('submitBookingBtn');
  if (submitBtn) {
    submitBtn.innerHTML = `<span>Proceed to Pay Online (₹${price})</span>`;
  }

  // Pre-fill phone if available in customer profile
  const phoneInput = document.getElementById('bookPhone');
  if (phoneInput) {
    if (currentCustomer && currentCustomer.phone) {
      phoneInput.value = currentCustomer.phone.replace(/^\+91/, '');
    } else {
      phoneInput.value = '';
    }
  }

  // Set default booking date to tomorrow if empty
  const bookDateInput = document.getElementById('bookDate');
  if (bookDateInput && !bookDateInput.value) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    bookDateInput.value = tomorrow.toISOString().split('T')[0];
  }

  // Trigger location detection on opening booking modal
  detectCurrentLocation(false);
}

// Geolocation detection
async function detectCurrentLocation(userInitiated = true) {
  const statusBadge = document.getElementById('locationStatusBadge');
  const addressInput = document.getElementById('bookAddress');
  const latInput = document.getElementById('bookLatitude');
  const lngInput = document.getElementById('bookLongitude');
  const detectBtn = document.getElementById('detectLocationBtn');

  if (!navigator.geolocation) {
    if (userInitiated) {
      showToast('Geolocation is not supported by your browser.');
    }
    return;
  }

  if (statusBadge) {
    statusBadge.classList.remove('hidden');
    statusBadge.className = 'location-status-badge info';
    statusBadge.innerHTML = `<span>⏳ Detecting GPS location... please allow location permission</span>`;
  }
  if (detectBtn) {
    detectBtn.disabled = true;
    detectBtn.innerHTML = `<span>Detecting...</span>`;
  }

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      const accuracy = Math.round(position.coords.accuracy);

      if (latInput) latInput.value = lat;
      if (lngInput) lngInput.value = lng;

      if (statusBadge) {
        statusBadge.classList.remove('hidden');
        statusBadge.className = 'location-status-badge success';
        statusBadge.innerHTML = `<span>📍 GPS Acquired (±${accuracy}m) • Resolving address...</span>`;
      }
      if (detectBtn) {
        detectBtn.disabled = false;
        detectBtn.innerHTML = `<span>📍 GPS Acquired</span>`;
      }

      // Reverse geocode with OpenStreetMap Nominatim
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`, {
          headers: { 'Accept-Language': 'en' }
        });
        if (res.ok) {
          const geoData = await res.json();
          if (geoData && geoData.display_name && addressInput) {
            addressInput.value = geoData.display_name;
            if (statusBadge) {
              statusBadge.innerHTML = `<span>📍 Exact Rooftop Location Detected</span>`;
            }
          }
        }
      } catch (err) {
        console.warn('Reverse geocoding fetch error:', err);
        if (addressInput && !addressInput.value) {
          addressInput.value = `Latitude: ${lat.toFixed(6)}, Longitude: ${lng.toFixed(6)}`;
        }
      }
      if (userInitiated) {
        showToast('Current location detected successfully!');
      }
    },
    (error) => {
      if (detectBtn) {
        detectBtn.disabled = false;
        detectBtn.innerHTML = `<span>📍 Current Location</span>`;
      }
      if (statusBadge) {
        if (error.code === error.PERMISSION_DENIED) {
          statusBadge.classList.remove('hidden');
          statusBadge.className = 'location-status-badge warning';
          statusBadge.innerHTML = `<span>⚠️ Location permission denied. Please enter address manually.</span>`;
          if (userInitiated) {
            showToast('Location permission denied. Please enter address manually.');
          }
        } else {
          statusBadge.classList.remove('hidden');
          statusBadge.className = 'location-status-badge warning';
          statusBadge.innerHTML = `<span>⚠️ Unable to retrieve GPS position. Please enter address manually.</span>`;
        }
      }
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    }
  );
}

async function loadPublicServices() {
  const container = document.getElementById('servicesListContainer');
  const homeContainer = document.getElementById('homeServicesContainer');

  try {
    const res = await fetch(`${API_BASE}/services`);
    const result = await res.json();
    if (res.ok && result.success) {
      availableServices = result.data || [];

      // 1. Render Home Screen Featured Container
      if (homeContainer) {
        if (availableServices.length === 0) {
          homeContainer.innerHTML = `
            <div style="text-align: center; padding: 28px 16px; color: #64748b; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0;">
              <div style="font-size: 14px; font-weight: 600; color: #0f172a;">No solar services available</div>
              <div style="font-size: 12px; margin-top: 4px;">Services added in the Admin Panel will appear here live.</div>
            </div>
          `;
        } else {
          // Show top services on Home screen
          const featured = availableServices[0];
          const safeTitle = (featured.title || '').replace(/'/g, "\\'");
          const unit = featured.price_unit || '3 kWh';
          homeContainer.innerHTML = `
            <div class="service-deal-card">
              <div class="deal-top">
                <div class="price-wrap">
                  <span class="currency">₹</span><span class="price-val">${featured.base_price}</span>
                  <span class="discount-badge" style="text-transform: uppercase;">${unit}</span>
                </div>
                <button class="btn-outline-book" onclick="openBookingModal('${safeTitle}', ${featured.base_price}, ${featured.id}, '${unit}')">Book Now</button>
              </div>
              <div class="deal-title">${featured.title}</div>
              <div style="font-size: 12px; color: #64748b; margin-top: 4px; line-height: 1.4;">${featured.description || 'Professional SolWash de-ionized solar panel cleaning.'}</div>
              <div class="deal-tags" style="margin-top: 10px;">
                <span class="check-tag">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="#1e3a8a"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
                  ${(featured.category || 'Solar').toUpperCase()}
                </span>
                <span class="check-tag">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="#10b981"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
                  Pure DI Water Wash
                </span>
              </div>
            </div>
          `;
        }
      }

      // 2. Render Services Screen List Container
      if (container) {
        if (availableServices.length === 0) {
          container.innerHTML = `
            <div style="text-align: center; padding: 36px 16px; color: #64748b; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0;">
              <div style="font-size: 14px; font-weight: 600; color: #0f172a;">No solar services listed yet</div>
              <div style="font-size: 12px; margin-top: 4px;">Services added by admin in the portal will appear here immediately.</div>
            </div>
          `;
        } else {
          container.innerHTML = availableServices.map(s => {
            const safeTitle = (s.title || '').replace(/'/g, "\\'");
            const unit = s.price_unit || '3 kWh';
            return `
              <div class="service-deal-card" style="margin-bottom: 14px;">
                <div class="deal-top">
                  <div class="price-wrap">
                    <span class="currency">₹</span><span class="price-val">${s.base_price}</span>
                    <span class="discount-badge" style="text-transform: uppercase;">${unit}</span>
                  </div>
                  <button class="btn-outline-book" onclick="openBookingModal('${safeTitle}', ${s.base_price}, ${s.id}, '${unit}')">Book Now</button>
                </div>
                <div class="deal-title">${s.title}</div>
                <div style="font-size: 12px; color: #64748b; margin-top: 4px; line-height: 1.4;">${s.description || 'Professional SolWash de-ionized solar panel cleaning.'}</div>
                <div class="deal-tags" style="margin-top: 10px;">
                  <span class="check-tag">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="#1e3a8a"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
                    ${(s.category || 'Solar').toUpperCase()}
                  </span>
                  <span class="check-tag">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="#10b981"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
                    Pure DI Water Wash
                  </span>
                </div>
              </div>
            `;
          }).join('');
        }
      }
    }
  } catch (err) {
    console.error('Failed to load dynamic services in customer preview:', err);
  }
}

function openLoginModal() {
  loginModal.classList.remove('hidden');
}

// Verify customer token
async function verifyCustomer() {
  if (!authToken) {
    showScreen('tab-login');
    updateCustomerUI();
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const result = await res.json();
    if (res.ok && result.success) {
      currentCustomer = result.data;
      localStorage.setItem('solwash_customer_user', JSON.stringify(currentCustomer));
      updateCustomerUI();
      // Ensure the screen is not showing tab-login when logged in
      const loginTab = document.getElementById('tab-login');
      if (loginTab && loginTab.classList.contains('active')) {
        showScreen('tab-home');
      }
    } else {
      authToken = '';
      currentCustomer = null;
      localStorage.removeItem('solwash_customer_token');
      localStorage.removeItem('solwash_customer_user');
      updateCustomerUI();
      resetOtpForm();
      showScreen('tab-login');
      showToast('Session expired. Please login again.');
    }
  } catch (e) {
    console.warn('Customer session verify warning:', e);
    updateCustomerUI();
  }
}

function updateCustomerUI() {
  if (currentCustomer) {
    headerUserName.textContent = currentCustomer.name.split(' ')[0] || 'User';
    profileAuthBtn.textContent = 'Logout';
  } else {
    headerUserName.textContent = 'User';
    profileAuthBtn.textContent = 'Login';
  }
}

let customerBookingsList = [];

// Load My Bookings
async function loadCustomerBookings() {
  const emptyView = document.getElementById('emptyBookingsView');
  const activeList = document.getElementById('activeBookingsList');

  if (!authToken) {
    emptyView.style.display = 'flex';
    activeList.style.display = 'none';
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/orders/my-orders`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const result = await res.json();

    if (res.ok && result.success && result.data.length > 0) {
      customerBookingsList = result.data;
      filterBookingsList('all');
    } else {
      emptyView.style.display = 'flex';
      activeList.style.display = 'none';
    }
  } catch (err) {
    emptyView.style.display = 'flex';
    activeList.style.display = 'none';
  }
}

function filterBookingsList(filter) {
  const emptyView = document.getElementById('emptyBookingsView');
  const activeList = document.getElementById('activeBookingsList');

  let filtered = customerBookingsList.slice();
  if (filter === 'pending') {
    filtered = filtered.filter(b => b.status === 'pending');
  } else if (filter === 'accepted') {
    filtered = filtered.filter(b => ['confirmed', 'picked_up'].includes(b.status));
  } else if (filter === 'in_progress') {
    filtered = filtered.filter(b => ['in_process', 'ready', 'out_for_delivery'].includes(b.status));
  }

  if (filtered.length === 0) {
    emptyView.style.display = 'flex';
    activeList.style.display = 'none';
  } else {
    emptyView.style.display = 'none';
    activeList.style.display = 'block';
    activeList.innerHTML = filtered.map(b => {
      const isPaid = String(b.payment_status || '').toLowerCase() === 'paid';
      const isRazorpay = b.payment_mode === 'razorpay';

      return `
      <div class="service-deal-card" style="margin-bottom: 12px; border-color: ${isPaid ? '#86efac' : '#e2e8f0'}; background: ${isPaid ? '#f0fdf4' : '#ffffff'};">
        <div class="deal-top">
          <div>
            <strong>#${b.order_number}</strong>
            <div style="font-size: 11px; color: #64748b; margin-top: 2px;">${b.pickup_date} (${b.pickup_slot})</div>
          </div>
          <div style="display: flex; gap: 6px; align-items: center;">
            ${isPaid
              ? `<span style="font-size: 11.5px; font-weight: 800; color: #15803d; background: #dcfce7; border: 1.5px solid #4ade80; padding: 3px 9px; border-radius: 6px; display: inline-flex; align-items: center; gap: 3px;">
                   <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                   PAID
                 </span>`
              : `<span style="font-size: 11px; font-weight: 700; color: #b45309; background: #fef3c7; border: 1px solid #fde68a; padding: 3px 7px; border-radius: 6px;">
                   PENDING
                 </span>`
            }
            <span style="font-size: 11px; font-weight: 700; color: #1e3a8a; background: #eff6ff; padding: 3px 8px; border-radius: 6px;">
              ${(b.status || 'PENDING').toUpperCase()}
            </span>
          </div>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-top: 10px;">
          <span style="font-size: 15px; font-weight: 700; color: #0f172a;">₹${b.total_amount}</span>
          <span style="font-size: 12px; color: #2563eb; font-weight: 600;">${b.service_title || 'Solar Wash'}</span>
        </div>
        <div style="margin-top: 6px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
          ${isPaid
            ? `<span style="font-size: 11px; font-weight: 700; color: #15803d; background: #dcfce7; padding: 3px 8px; border-radius: 999px; display: inline-flex; align-items: center; gap: 4px;">
                 <span>💳</span> Paid Online (Razorpay)
               </span>`
            : (isRazorpay
                ? `<span style="font-size: 11px; font-weight: 600; color: #b45309; background: #fef3c7; padding: 3px 8px; border-radius: 999px;">
                     💳 Razorpay (Awaiting Payment)
                   </span>`
                : `<span style="font-size: 11px; font-weight: 600; color: #475569; background: #f1f5f9; padding: 3px 8px; border-radius: 999px;">
                     💵 Pay After Service (Cash / QR)
                   </span>`
              )
          }
          ${b.razorpay_payment_id ? `<span style="font-size: 10px; color: #15803d; font-family: monospace; font-weight: 600;">Txn: ${b.razorpay_payment_id}</span>` : ''}
        </div>
        <div style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed ${isPaid ? '#bbf7d0' : '#e2e8f0'}; font-size: 11px; color: #475569; display: flex; flex-direction: column; gap: 4px;">
          <div><strong>📍 Address:</strong> ${b.pickup_address || 'Rooftop address provided'}</div>
          ${b.customer_phone ? `<div><strong>📞 Phone:</strong> <a href="tel:${b.customer_phone}" style="color: inherit;">${b.customer_phone}</a></div>` : ''}
          ${b.latitude && b.longitude ? `
            <div style="margin-top: 2px;">
              <a href="https://www.google.com/maps?q=${b.latitude},${b.longitude}" target="_blank" style="display: inline-flex; align-items: center; gap: 4px; color: #1d4ed8; text-decoration: none; font-weight: 600;">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z"></path>
                  <circle cx="12" cy="10" r="3"></circle>
                </svg>
                View on Google Maps
              </a>
            </div>
          ` : ''}
        </div>
      </div>
    `;
    }).join('');
  }
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.style.display = 'block';
  setTimeout(() => {
    toast.style.display = 'none';
  }, 2800);
}

// ----------------------------------------------------
// MANDATORY EMAIL OTP AUTHENTICATION
// ----------------------------------------------------
function setupOtpAuthentication() {
  const sendOtpForm = document.getElementById('sendOtpForm');
  const verifyOtpForm = document.getElementById('verifyOtpForm');
  const otpEmailInput = document.getElementById('otpEmailInput');
  const sentEmailDisplay = document.getElementById('sentEmailDisplay');
  const changeEmailBtn = document.getElementById('changeEmailBtn');
  const resendOtpBtn = document.getElementById('resendOtpBtn');
  const otpCodeInput = document.getElementById('otpCodeInput');
  const otpNameInput = document.getElementById('otpNameInput');
  const sendOtpBtn = document.getElementById('sendOtpBtn');
  const verifyOtpBtn = document.getElementById('verifyOtpBtn');

  let pendingEmail = '';

  window.clearPendingOtpEmail = () => {
    pendingEmail = '';
  };

  // STEP 1: Send OTP to Email
  if (sendOtpForm) {
    sendOtpForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = otpEmailInput.value.trim();
      if (!email || !email.includes('@')) {
        showToast('Please enter a valid email address.');
        return;
      }

      sendOtpBtn.disabled = true;
      sendOtpBtn.innerHTML = 'Sending OTP...';

      try {
        const res = await fetch(`${API_BASE}/auth/send-otp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });

        const data = await res.json();
        if (res.ok && data.success) {
          pendingEmail = email;
          if (sentEmailDisplay) sentEmailDisplay.textContent = email;

          // Switch to Step 2
          sendOtpForm.classList.add('hidden');
          verifyOtpForm.classList.remove('hidden');

          // If backend provided dev/fallback OTP (e.g. SMTP not configured on server), auto-fill it
          if (data.otp) {
            otpCodeInput.value = data.otp;
            showToast(`✓ OTP: ${data.otp} (Auto-filled)`);
          } else {
            otpCodeInput.value = '';
            showToast(`✓ OTP code sent to ${email}. Check your email inbox!`);
          }
          otpCodeInput.focus();
        } else {
          showToast(data.message || 'Failed to send OTP.');
        }
      } catch (err) {
        showToast(`Connection error: ${err.message}`);
      } finally {
        sendOtpBtn.disabled = false;
        sendOtpBtn.innerHTML = '<span>Send OTP Code</span>';
      }
    });
  }

  // STEP 2: Verify OTP
  if (verifyOtpForm) {
    verifyOtpForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const otp = otpCodeInput.value.trim();

      if (!otp || otp.length < 4) {
        showToast('Please enter the 4-digit OTP.');
        return;
      }

      verifyOtpBtn.disabled = true;
      verifyOtpBtn.innerHTML = 'Verifying...';

      try {
        const res = await fetch(`${API_BASE}/auth/verify-otp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: pendingEmail,
            otp
          })
        });

        const data = await res.json();
        if (res.ok && data.success) {
          authToken = data.data.token;
          currentCustomer = data.data.user;
          localStorage.setItem('solwash_customer_token', authToken);
          localStorage.setItem('solwash_customer_user', JSON.stringify(currentCustomer));

          updateCustomerUI();
          showToast(`Welcome, ${currentCustomer.name}!`);

          // Reset OTP forms so it starts fresh on any next logout/visit
          resetOtpForm();

          // Redirect to Home Screen
          showScreen('tab-home');
        } else {
          showToast(data.message || 'Invalid OTP code.');
        }
      } catch (err) {
        showToast(`Verification error: ${err.message}`);
      } finally {
        verifyOtpBtn.disabled = false;
        verifyOtpBtn.innerHTML = '<span>Verify & Enter App</span>';
      }
    });
  }

  // Change Email Action
  if (changeEmailBtn) {
    changeEmailBtn.addEventListener('click', () => {
      resetOtpForm();
      const emailInput = document.getElementById('otpEmailInput');
      if (emailInput) emailInput.focus();
    });
  }

  // Resend OTP Action
  if (resendOtpBtn) {
    resendOtpBtn.addEventListener('click', async () => {
      if (!pendingEmail) return;
      resendOtpBtn.textContent = 'Sending...';
      try {
        const res = await fetch(`${API_BASE}/auth/send-otp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: pendingEmail })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          if (data.otp) {
            otpCodeInput.value = data.otp;
            showToast(`✓ New OTP: ${data.otp} (Auto-filled)`);
          } else {
            otpCodeInput.value = '';
            showToast(`✓ New OTP sent to ${pendingEmail}. Check your inbox!`);
          }
          otpCodeInput.focus();
        } else {
          showToast(data.message || 'Failed to resend OTP.');
        }
      } catch (err) {
        showToast('Error resending OTP.');
      } finally {
        resendOtpBtn.textContent = 'Resend OTP';
      }
    });
  }

  // ----------------------------------------------------
  // DIRECT GOOGLE LOGIN CLICK HANDLERS
  // ----------------------------------------------------
  const googleBtn = document.getElementById('googleDirectLoginBtn');

  // Google Client ID (Optional)
  const GOOGLE_CLIENT_ID = window.GOOGLE_CLIENT_ID || "";

  // Listen for popup OAuth messages
  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SOLWASH_GOOGLE_AUTH_SUCCESS') {
      const { token, user } = event.data;
      authToken = token;
      currentCustomer = user;
      localStorage.setItem('solwash_customer_token', authToken);
      localStorage.setItem('solwash_customer_user', JSON.stringify(currentCustomer));
      updateCustomerUI();
      resetOtpForm();
      showToast(`Welcome, ${currentCustomer.name}!`);
      showScreen('tab-home');
    }
  });

  // Global handler for Android native Deep Link callback (solwash://auth)
  window.handleDeepLinkAuth = (token, name, email) => {
    authToken = token;
    currentCustomer = { id: 1, name: decodeURIComponent(name), email: decodeURIComponent(email), role: 'customer' };
    localStorage.setItem('solwash_customer_token', authToken);
    localStorage.setItem('solwash_customer_user', JSON.stringify(currentCustomer));
    updateCustomerUI();
    resetOtpForm();
    showToast(`✓ Google Sign-in: Welcome, ${currentCustomer.name}!`);
    showScreen('tab-home');
  };

  // Initialize and Render Official Google GSI Button if supported in environment
  function setupGoogleSignIn() {
    if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
      try {
        google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleGoogleCredentialResponse,
          auto_select: false,
          cancel_on_tap_outside: true
        });

        const container = document.getElementById('googleBtnContainer');
        if (container) {
          google.accounts.id.renderButton(container, {
            theme: 'outline',
            size: 'large',
            type: 'icon',
            shape: 'circle'
          });
        }
      } catch (e) {
        console.warn('Google GSI initialization warning:', e);
      }
    }
  }

  setupGoogleSignIn();

  // Handle Google Token returned from Google GSI
  async function handleGoogleCredentialResponse(response) {
    showToast('Verifying Google Account with server...');
    try {
      const res = await fetch(`${API_BASE}/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: response.credential })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        authToken = data.data.token;
        currentCustomer = data.data.user;
        localStorage.setItem('solwash_customer_token', authToken);
        localStorage.setItem('solwash_customer_user', JSON.stringify(currentCustomer));

        updateCustomerUI();
        resetOtpForm();
        showToast(`Welcome, ${currentCustomer.name}!`);
        showScreen('tab-home');
      } else {
        showToast(data.message || 'Google authentication failed.');
      }
    } catch (err) {
      showToast('Error verifying Google token.');
    }
  }

  // Attach click to Google Button (Direct OAuth flow works 100% on both Web and Android APK!)
  if (googleBtn) {
    googleBtn.addEventListener('click', () => {
      showToast('Opening Google Sign-In...');
      const isAndroidApp = window.location.href.includes('androidplatform.net') || navigator.userAgent.includes('Android');
      const authUrl = `${API_BASE}/auth/google/login?platform=${isAndroidApp ? 'app' : 'web'}`;

      if (isAndroidApp) {
        // In Android WebView, this triggers shouldOverrideUrlLoading which opens real Chrome browser
        window.location.href = authUrl;
      } else {
        // In desktop/browser, open popup window or navigate
        const popup = window.open(authUrl, 'solwash_google_auth', 'width=520,height=620,status=no,toolbar=no');
        if (!popup || popup.closed || typeof popup.closed === 'undefined') {
          window.location.href = authUrl;
        }
      }
  }
}


