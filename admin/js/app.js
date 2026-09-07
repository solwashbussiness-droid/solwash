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

  const hostname = window.location.hostname;
  const port = window.location.port;

  if (port === '3000' || port === '3001') {
    return `http://${hostname || 'localhost'}:5000/api`;
  }
  return '/api';
}

let API_BASE = getInitialApiBase();

// State
let authToken = localStorage.getItem('solwash_admin_token') || '';
let currentUser = null;
try {
  const cachedAdmin = localStorage.getItem('solwash_admin_user');
  if (cachedAdmin) currentUser = JSON.parse(cachedAdmin);
} catch (e) {}
let allCustomers = [];
let allOrders = [];
let currentOrderFilter = 'all';
let allServices = [];
let currentServiceCategory = 'all';

// Floating Toast Notification for Admin Portal
function showAdminToast(message, type = 'info', duration = 3500) {
  let container = document.getElementById('adminToastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'adminToastContainer';
    container.className = 'admin-toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `admin-toast ${type}`;
  
  let icon = 'ℹ️';
  if (type === 'success') icon = '✓';
  else if (type === 'error') icon = '⚠️';
  else if (type === 'warning') icon = '🔔';

  toast.innerHTML = `<span style="font-size:16px;">${icon}</span><span style="flex:1;">${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(50px)';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

function handleAdminSessionExpired() {
  localStorage.removeItem('solwash_admin_token');
  localStorage.removeItem('solwash_admin_user');
  authToken = '';
  currentUser = null;
  showAuthModal();
  showAdminToast('Session expired. Please sign in again.', 'warning');
}

// Centralized safe admin fetch helper
async function adminApiFetch(url, options = {}) {
  const headers = {
    'Authorization': `Bearer ${authToken}`,
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  let res;
  try {
    res = await fetch(url, { ...options, headers });
  } catch (netErr) {
    throw new Error(`Unable to connect to server at ${API_BASE}. Please ensure backend is running.`);
  }

  if (res.status === 401) {
    handleAdminSessionExpired();
    throw new Error('Session expired. Please sign in again.');
  }

  let data;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      data = await res.json();
    } catch (parseErr) {
      throw new Error('Invalid JSON response from server.');
    }
  } else {
    const text = await res.text();
    data = { success: res.ok, message: text || res.statusText };
  }

  if (!res.ok || !data.success) {
    throw new Error(data.message || `Request failed with status ${res.status}`);
  }

  return data;
}

// DOM Elements
const authModal = document.getElementById('authModal');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const logoutBtn = document.getElementById('logoutBtn');
const adminNameDisplay = document.getElementById('adminNameDisplay');
const adminAvatar = document.getElementById('adminAvatar');
const currentSectionTitle = document.getElementById('currentSectionTitle');

// Nav tabs
const navItems = document.querySelectorAll('.nav-item');
const viewSections = document.querySelectorAll('.view-section');

// Overview Stats
const statCustomers = document.getElementById('statCustomers');
const statOrders = document.getElementById('statOrders');
const statActive = document.getElementById('statActive');
const statRevenue = document.getElementById('statRevenue');
const recentOrdersTableBody = document.getElementById('recentOrdersTableBody');

// Users View
const usersTableBody = document.getElementById('usersTableBody');
const userSearchInput = document.getElementById('userSearchInput');

// Init application
document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  setupAuth();
  setupExportUsers();
  setupOrders();
  setupServices();
  
  if (authToken) {
    hideAuthModal();
    updateUserUI();
    fetchOverviewData();
    verifySession();
  } else {
    showAuthModal();
  }

  // Automatic background refresh every 10 seconds for real-time order & payment updates
  setInterval(() => {
    if (authToken) {
      const ordersSec = document.getElementById('orders-section');
      if (ordersSec && ordersSec.classList.contains('active')) {
        fetchOrdersData();
      }
      const overviewSec = document.getElementById('overview-section');
      if (overviewSec && overviewSec.classList.contains('active')) {
        fetchOverviewData();
      }
    }
  }, 10000);
});

// Setup Navigation between Overview and Users
function setupNavigation() {
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const targetId = item.getAttribute('data-target');
      
      navItems.forEach(i => i.classList.remove('active'));
      viewSections.forEach(s => s.classList.remove('active'));

      item.classList.add('active');
      const targetSection = document.getElementById(targetId);
      if (targetSection) {
        targetSection.classList.add('active');
      }

      if (targetId === 'overview-section') {
        currentSectionTitle.textContent = 'Dashboard Overview';
        fetchOverviewData();
      } else if (targetId === 'orders-section') {
        currentSectionTitle.textContent = 'Order Management';
        fetchOrdersData();
      } else if (targetId === 'users-section') {
        currentSectionTitle.textContent = 'User Management';
        fetchUsersData();
      } else if (targetId === 'services-section') {
        currentSectionTitle.textContent = 'Services & Pricing Management';
        fetchServicesData();
      }
    });
  });

  // Search filter for Users
  if (userSearchInput) {
    userSearchInput.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase().trim();
      renderUsersTable(query);
    });
  }
}

// Authentication handling
function setupAuth() {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.style.display = 'none';

    const email = document.getElementById('adminEmail').value.trim();
    const password = document.getElementById('adminPassword').value;

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.message || 'Login failed.');
      }

      if (result.data.user.role !== 'admin') {
        throw new Error('Access denied. Administrator privileges required.');
      }

      authToken = result.data.token;
      currentUser = result.data.user;
      localStorage.setItem('solwash_admin_token', authToken);
      localStorage.setItem('solwash_admin_user', JSON.stringify(currentUser));

      updateUserUI();
      hideAuthModal();
      fetchOverviewData();
    } catch (err) {
      if (err.name === 'TypeError' && err.message.toLowerCase().includes('fetch')) {
        loginError.textContent = `Server connection error (Failed to fetch). Make sure backend is running at ${API_BASE}`;
      } else {
        loginError.textContent = err.message || 'Login failed';
      }
      loginError.style.display = 'block';
    }
  });

  logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('solwash_admin_token');
    localStorage.removeItem('solwash_admin_user');
    authToken = '';
    currentUser = null;
    showAuthModal();
  });
}

async function verifySession() {
  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const result = await res.json();

    if (res.ok && result.success && result.data.role === 'admin') {
      currentUser = result.data;
      localStorage.setItem('solwash_admin_user', JSON.stringify(currentUser));
      updateUserUI();
      hideAuthModal();
    } else {
      throw new Error('Session invalid');
    }
  } catch (err) {
    localStorage.removeItem('solwash_admin_token');
    localStorage.removeItem('solwash_admin_user');
    authToken = '';
    currentUser = null;
    showAuthModal();
  }
}

function showAuthModal() {
  authModal.classList.remove('hidden');
}

function hideAuthModal() {
  authModal.classList.add('hidden');
}

function updateUserUI() {
  if (currentUser) {
    adminNameDisplay.textContent = currentUser.name || 'Administrator';
    adminAvatar.textContent = (currentUser.name || 'A').charAt(0).toUpperCase();
  }
}

// Charts instances
let weeklyTrendsChartInstance = null;
let servicesPieChartInstance = null;

// Load Overview Metrics & Recent Orders
async function fetchOverviewData() {
  try {
    const result = await adminApiFetch(`${API_BASE}/admin/stats`, { method: 'GET' });
    const data = result.data || {};
    statCustomers.textContent = data.total_customers || 0;
    statOrders.textContent = data.total_orders || 0;
    statActive.textContent = data.active_orders || 0;
    statRevenue.textContent = `₹${(data.revenue || 0).toLocaleString('en-IN')}`;

    renderCharts(data);
    renderRecentOrders(data.recent_orders || []);
  } catch (err) {
    console.error('Failed to load overview data:', err);
    if (!err.message.includes('Session expired')) {
      showAdminToast(`Failed to load metrics: ${err.message}`, 'error');
    }
  }
}

// Render Graph & Pie Chart
function renderCharts(data) {
  if (typeof Chart === 'undefined') return;

  // 1. Weekly Trends Line/Bar Graph (Show exact last 7 days from real DB)
  const weeklyTrends = data.weekly_trends || [];
  
  // Generate exact last 7 days dates
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().split('T')[0]);
  }

  const labels = days.map(dayStr => {
    const d = new Date(dayStr);
    return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' });
  });

  const orderCounts = days.map(dayStr => {
    const found = weeklyTrends.find(t => t.order_date === dayStr);
    return found ? found.count : 0;
  });

  const revenues = days.map(dayStr => {
    const found = weeklyTrends.find(t => t.order_date === dayStr);
    return found ? found.revenue : 0;
  });

  const ctxWeekly = document.getElementById('weeklyTrendsChart');
  if (ctxWeekly) {
    if (weeklyTrendsChartInstance) {
      weeklyTrendsChartInstance.destroy();
    }

    weeklyTrendsChartInstance = new Chart(ctxWeekly, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            type: 'line',
            label: 'Revenue (₹)',
            data: revenues,
            borderColor: '#2563eb',
            backgroundColor: 'rgba(37, 99, 235, 0.08)',
            borderWidth: 2,
            fill: true,
            tension: 0.3,
            yAxisID: 'y1'
          },
          {
            type: 'bar',
            label: 'Orders Count',
            data: orderCounts,
            backgroundColor: '#60a5fa',
            borderRadius: 6,
            barThickness: 16,
            yAxisID: 'y'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: { boxWidth: 12, font: { size: 12 } }
          },
          tooltip: {
            backgroundColor: '#0f172a',
            padding: 10
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            position: 'left',
            grid: { color: '#f1f5f9' },
            ticks: { precision: 0, font: { size: 11 } }
          },
          y1: {
            beginAtZero: true,
            position: 'right',
            grid: { drawOnChartArea: false },
            ticks: {
              callback: (val) => '₹' + val,
              font: { size: 11 }
            }
          },
          x: {
            grid: { display: false },
            ticks: { font: { size: 11 } }
          }
        }
      }
    });
  }

  // 2. Services / Category Share Pie Chart (Strictly actual orders data)
  const serviceBreakdown = data.service_breakdown || [];
  const hasServiceData = serviceBreakdown.length > 0 && serviceBreakdown.some(s => s.count > 0);

  const pieLabels = hasServiceData
    ? serviceBreakdown.map(s => (s.category || 'General').toUpperCase())
    : ['No Orders Yet'];

  const pieData = hasServiceData
    ? serviceBreakdown.map(s => s.count)
    : [1];

  const pieColors = hasServiceData
    ? ['#2563eb', '#0ea5e9', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899']
    : ['#e2e8f0'];

  const ctxPie = document.getElementById('servicesPieChart');
  if (ctxPie) {
    if (servicesPieChartInstance) {
      servicesPieChartInstance.destroy();
    }

    servicesPieChartInstance = new Chart(ctxPie, {
      type: 'doughnut',
      data: {
        labels: pieLabels,
        datasets: [{
          data: pieData,
          backgroundColor: pieColors,
          borderWidth: 2,
          borderColor: '#ffffff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              boxWidth: 10,
              padding: 12,
              font: { size: 11 }
            }
          }
        },
        cutout: '62%'
      }
    });
  }
}

function renderRecentOrders(orders) {
  if (!orders || orders.length === 0) {
    recentOrdersTableBody.innerHTML = `
      <tr>
        <td colspan="6" class="empty-state">No orders placed yet.</td>
      </tr>
    `;
    return;
  }

  recentOrdersTableBody.innerHTML = orders.map(order => {
    const statusClass = order.status === 'delivered' ? 'tag-green' : (order.status === 'cancelled' ? 'tag-amber' : 'tag-blue');
    return `
      <tr>
        <td><strong>#${order.order_number}</strong></td>
        <td>
          <div style="font-weight: 600;">${order.customer_name || 'N/A'}</div>
          ${order.customer_phone ? `<div style="font-size: 11px; color: var(--text-muted);"><a href="tel:${order.customer_phone}" style="color: inherit;">📞 ${order.customer_phone}</a></div>` : ''}
        </td>
        <td>
          <div>${order.service_title || 'General Wash'}</div>
          ${order.latitude && order.longitude ? `<div style="font-size: 11px;"><a href="https://www.google.com/maps?q=${order.latitude},${order.longitude}" target="_blank" style="color: #2563eb; font-weight: 600;">📍 Maps ↗</a></div>` : ''}
        </td>
        <td>${order.pickup_date || 'N/A'} (${order.pickup_slot || ''})</td>
        <td><strong>₹${order.total_amount || 0}</strong></td>
        <td><span class="tag-badge ${statusClass}">${order.status}</span></td>
      </tr>
    `;
  }).join('');
}

// Load Customers for Users Tab
async function fetchUsersData() {
  try {
    const result = await adminApiFetch(`${API_BASE}/admin/customers`, { method: 'GET' });
    allCustomers = result.data || [];
    renderUsersTable('');
  } catch (err) {
    console.error('Failed to load users:', err);
    if (usersTableBody) {
      usersTableBody.innerHTML = `
        <tr>
          <td colspan="7" class="empty-state" style="padding: 28px 16px; color: #ef4444;">
            <div style="font-weight: 600; margin-bottom: 6px;">⚠️ ${err.message}</div>
            <button type="button" onclick="fetchUsersData()" style="background: #1e40af; color: #fff; border: none; padding: 6px 14px; border-radius: 6px; font-size: 12px; cursor: pointer;">🔄 Retry Loading Customers</button>
          </td>
        </tr>
      `;
    }
    if (!err.message.includes('Session expired')) {
      showAdminToast(`Failed to load customers: ${err.message}`, 'error');
    }
  }
}

function renderUsersTable(filter = '') {
  const filtered = allCustomers.filter(c => {
    const term = filter.toLowerCase();
    return (
      (c.name && c.name.toLowerCase().includes(term)) ||
      (c.email && c.email.toLowerCase().includes(term)) ||
      (c.phone && c.phone.toLowerCase().includes(term))
    );
  });

  if (filtered.length === 0) {
    usersTableBody.innerHTML = `
      <tr>
        <td colspan="7" class="empty-state">No customers found.</td>
      </tr>
    `;
    return;
  }

  usersTableBody.innerHTML = filtered.map(user => {
    const createdDate = user.created_at ? new Date(user.created_at).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    }) : 'N/A';

    return `
      <tr id="user-row-${user.id}">
        <td>#${user.id}</td>
        <td><strong>${user.name}</strong></td>
        <td>${user.email}</td>
        <td>${user.phone || '<span style="color: #94a3b8;">Not provided</span>'}</td>
        <td>${user.address || '<span style="color: #94a3b8;">Not provided</span>'}</td>
        <td><span class="tag-badge tag-blue">${user.order_count || 0} Orders</span></td>
        <td>${createdDate}</td>
        <td style="text-align: right;">
          <button class="btn-delete-user" onclick="handleDeleteUser(${user.id}, '${escapeHtml(user.name)}')">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
              <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
            </svg>
            Delete
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// Helper to escape HTML quotes in onclick
function escapeHtml(str) {
  return (str || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

// Admin: Delete user handler
async function handleDeleteUser(userId, userName) {
  const confirmDelete = confirm(`Are you sure you want to delete user "${userName}" (ID #${userId})?\nThis action cannot be undone.`);
  if (!confirmDelete) return;

  try {
    await adminApiFetch(`${API_BASE}/admin/customers/${userId}`, { method: 'DELETE' });
    showAdminToast(`✓ User "${userName}" was deleted successfully.`, 'success');
    allCustomers = allCustomers.filter(u => u.id !== userId);
    const query = userSearchInput ? userSearchInput.value.toLowerCase().trim() : '';
    renderUsersTable(query);
    fetchOverviewData();
  } catch (err) {
    showAdminToast(`Failed to delete user: ${err.message}`, 'error');
  }
}

// Export Users List to CSV
function setupExportUsers() {
  const exportBtn = document.getElementById('exportUsersBtn');
  if (!exportBtn) return;

  exportBtn.addEventListener('click', () => {
    if (!allCustomers || allCustomers.length === 0) {
      showAdminToast('No user data available to export.', 'warning');
      return;
    }

    const headers = ['User ID', 'Name', 'Email', 'Phone', 'Address', 'Total Orders', 'Joined Date'];
    const csvRows = [headers.join(',')];

    allCustomers.forEach(u => {
      const row = [
        u.id,
        `"${(u.name || '').replace(/"/g, '""')}"`,
        `"${(u.email || '').replace(/"/g, '""')}"`,
        `"${(u.phone || '').replace(/"/g, '""')}"`,
        `"${(u.address || '').replace(/"/g, '""')}"`,
        u.order_count || 0,
        `"${u.created_at ? new Date(u.created_at).toISOString().split('T')[0] : ''}"`
      ];
      csvRows.push(row.join(','));
    });

    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `solwash_users_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  });
}

// ----------------------------------------------------
// ORDER MANAGEMENT (Completed, Failed, Pending)
// ----------------------------------------------------
function setupOrders() {
  const filterTabs = document.querySelectorAll('.filter-tab');
  const orderSearchInput = document.getElementById('orderSearchInput');
  const exportOrdersBtn = document.getElementById('exportOrdersBtn');

  // Status Filter Tabs click
  filterTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      filterTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentOrderFilter = tab.getAttribute('data-filter');
      
      const query = orderSearchInput ? orderSearchInput.value.toLowerCase().trim() : '';
      renderOrdersTable(query);
    });
  });

  // Search input
  if (orderSearchInput) {
    orderSearchInput.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase().trim();
      renderOrdersTable(query);
    });
  }

  // Export orders to CSV
  if (exportOrdersBtn) {
    exportOrdersBtn.addEventListener('click', () => {
      if (!allOrders || allOrders.length === 0) {
        alert('No orders available to export.');
        return;
      }

      const headers = ['Order Number', 'Customer', 'Phone', 'Service', 'Pickup Date', 'Pickup Slot', 'Amount', 'Payment Status', 'Payment Mode', 'Order Status'];
      const rows = [headers.join(',')];

      allOrders.forEach(o => {
        rows.push([
          `"${o.order_number}"`,
          `"${(o.customer_name || '').replace(/"/g, '""')}"`,
          `"${(o.customer_phone || '').replace(/"/g, '""')}"`,
          `"${(o.service_title || '').replace(/"/g, '""')}"`,
          `"${o.pickup_date || ''}"`,
          `"${o.pickup_slot || ''}"`,
          o.total_amount || 0,
          `"${o.payment_status || ''}"`,
          `"${o.payment_mode || ''}"`,
          `"${o.status || ''}"`
        ].join(','));
      });

      const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.setAttribute('href', url);
      a.setAttribute('download', `solwash_orders_export_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }
}

// Fetch all orders from backend
async function fetchOrdersData() {
  const ordersTableBody = document.getElementById('ordersTableBody');
  try {
    const result = await adminApiFetch(`${API_BASE}/orders`, { method: 'GET' });
    allOrders = result.data || [];
    updateOrderCounts();
    renderOrdersTable();
  } catch (err) {
    console.error('Failed to load orders:', err);
    if (ordersTableBody) {
      ordersTableBody.innerHTML = `
        <tr>
          <td colspan="8" class="empty-state" style="padding: 28px 16px; color: #ef4444;">
            <div style="font-weight: 600; margin-bottom: 6px;">⚠️ ${err.message}</div>
            <button type="button" onclick="fetchOrdersData()" style="background: #1e40af; color: #fff; border: none; padding: 6px 14px; border-radius: 6px; font-size: 12px; cursor: pointer;">🔄 Retry Loading Orders</button>
          </td>
        </tr>
      `;
    }
    if (!err.message.includes('Session expired')) {
      showAdminToast(`Failed to load orders: ${err.message}`, 'error');
    }
  }
}

// Update order status counters (Pending, Completed, Failed, All)
function updateOrderCounts() {
  const countAll = allOrders.length;
  const countPending = allOrders.filter(o => ['pending', 'confirmed', 'picked_up', 'in_process', 'ready', 'out_for_delivery'].includes(o.status)).length;
  const countCompleted = allOrders.filter(o => o.status === 'delivered').length;
  const countFailed = allOrders.filter(o => o.status === 'cancelled').length;

  const elAll = document.getElementById('count-all');
  const elPending = document.getElementById('count-pending');
  const elCompleted = document.getElementById('count-completed');
  const elFailed = document.getElementById('count-failed');

  if (elAll) elAll.textContent = countAll;
  if (elPending) elPending.textContent = countPending;
  if (elCompleted) elCompleted.textContent = countCompleted;
  if (elFailed) elFailed.textContent = countFailed;
}

// Filter and render orders table
function renderOrdersTable(query = '') {
  const ordersTableBody = document.getElementById('ordersTableBody');
  if (!ordersTableBody) return;

  let filtered = allOrders.slice();

  // Tab Filtering
  if (currentOrderFilter === 'pending') {
    filtered = filtered.filter(o => ['pending', 'confirmed', 'picked_up', 'in_process', 'ready', 'out_for_delivery'].includes(o.status));
  } else if (currentOrderFilter === 'completed') {
    filtered = filtered.filter(o => o.status === 'delivered');
  } else if (currentOrderFilter === 'failed') {
    filtered = filtered.filter(o => o.status === 'cancelled');
  }

  // Search Filtering
  if (query) {
    filtered = filtered.filter(o =>
      (o.order_number && o.order_number.toLowerCase().includes(query)) ||
      (o.customer_name && o.customer_name.toLowerCase().includes(query)) ||
      (o.customer_phone && o.customer_phone.toLowerCase().includes(query)) ||
      (o.service_title && o.service_title.toLowerCase().includes(query))
    );
  }

  if (filtered.length === 0) {
    ordersTableBody.innerHTML = `
      <tr>
        <td colspan="8" class="empty-state">No ${currentOrderFilter !== 'all' ? currentOrderFilter : ''} orders found.</td>
      </tr>
    `;
    return;
  }

  ordersTableBody.innerHTML = filtered.map(o => {
    let statusClass = 'tag-blue';
    if (o.status === 'delivered') statusClass = 'tag-green';
    else if (o.status === 'cancelled') statusClass = 'tag-red';
    else if (['pending', 'confirmed'].includes(o.status)) statusClass = 'tag-amber';

    const isPaid = o.payment_status === 'paid';
    const payClass = isPaid ? 'tag-green' : 'tag-amber';

    return `
      <tr id="order-row-${o.id}">
        <td><strong>#${o.order_number}</strong></td>
        <td>
          <div style="font-weight: 600;">${o.customer_name || 'Guest'}</div>
          ${o.customer_phone ? `<div style="font-size: 11px; margin-top: 2px;"><a href="tel:${o.customer_phone}" style="color: #2563eb; text-decoration: none; font-weight: 600;">📞 ${o.customer_phone}</a></div>` : '<div style="font-size: 11px; color: var(--text-muted);">No phone</div>'}
        </td>
        <td>
          <div style="font-weight: 600;">${o.service_title || 'General Wash'}</div>
          <div style="font-size: 11px; color: var(--text-muted); margin-top: 3px; max-width: 220px; line-height: 1.3;" title="${o.pickup_address || ''}">
            📍 ${o.pickup_address ? (o.pickup_address.length > 38 ? o.pickup_address.substring(0, 38) + '...' : o.pickup_address) : 'No address'}
          </div>
          ${o.latitude && o.longitude ? `
            <div style="margin-top: 4px;">
              <a href="https://www.google.com/maps?q=${o.latitude},${o.longitude}" target="_blank" style="display: inline-flex; align-items: center; gap: 3px; font-size: 11px; color: #1d4ed8; font-weight: 700; text-decoration: underline;">
                🗺️ View on Google Maps
              </a>
            </div>
          ` : ''}
        </td>
        <td>
          <div>${o.pickup_date || 'N/A'}</div>
          <div style="font-size: 11px; color: var(--text-muted);">${o.pickup_slot || ''}</div>
        </td>
        <td><strong>₹${o.total_amount || 0}</strong></td>
        <td>
          <span class="tag-badge ${payClass}" style="font-weight: 800; font-size: 11px;">${isPaid ? '✓ PAID' : 'PENDING'}</span>
          <div style="font-size: 11px; color: var(--text-muted); margin-top: 3px; font-weight: 500;">
            ${o.payment_mode === 'razorpay' ? '💳 Razorpay Online' : '💵 Pay After Service'}
          </div>
          ${o.razorpay_payment_id ? `<div style="font-size: 10px; color: #16a34a; font-family: monospace; font-weight: 600;">ID: ${o.razorpay_payment_id}</div>` : ''}
        </td>
        <td>
          <span class="tag-badge ${statusClass}">${o.status}</span>
        </td>
        <td style="text-align: right;">
          <div style="display: flex; align-items: center; justify-content: flex-end; gap: 8px;">
            <select class="status-select" onchange="handleUpdateOrderStatus(${o.id}, this.value)" title="Change Order Status">
              <option value="pending" ${o.status === 'pending' ? 'selected' : ''}>Pending</option>
              <option value="confirmed" ${o.status === 'confirmed' ? 'selected' : ''}>Confirmed</option>
              <option value="picked_up" ${o.status === 'picked_up' ? 'selected' : ''}>Picked Up</option>
              <option value="in_process" ${o.status === 'in_process' ? 'selected' : ''}>In Process</option>
              <option value="ready" ${o.status === 'ready' ? 'selected' : ''}>Ready</option>
              <option value="out_for_delivery" ${o.status === 'out_for_delivery' ? 'selected' : ''}>Out for Delivery</option>
              <option value="delivered" ${o.status === 'delivered' ? 'selected' : ''}>Delivered (Completed)</option>
              <option value="cancelled" ${o.status === 'cancelled' ? 'selected' : ''}>Cancelled (Failed)</option>
            </select>
            <button class="btn-action-delete" onclick="handleDeleteOrder(${o.id}, '${escapeHtml(o.order_number || '')}')" title="Delete Order">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
              </svg>
              <span>Delete</span>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Update order status on backend
async function handleUpdateOrderStatus(orderId, newStatus) {
  try {
    const payload = { status: newStatus };
    if (newStatus === 'delivered') {
      payload.payment_status = 'paid';
    }

    const result = await adminApiFetch(`${API_BASE}/orders/${orderId}/status`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });

    // Update local state
    const idx = allOrders.findIndex(o => o.id === orderId);
    if (idx !== -1) {
      allOrders[idx] = { ...allOrders[idx], ...result.data };
    }
    updateOrderCounts();
    const orderSearchInput = document.getElementById('orderSearchInput');
    const query = orderSearchInput ? orderSearchInput.value.toLowerCase().trim() : '';
    renderOrdersTable(query);
    fetchOverviewData();
    showAdminToast(`✓ Order #${orderId} status updated to "${newStatus.toUpperCase()}".`, 'success');
  } catch (err) {
    showAdminToast(`Failed to update status: ${err.message}`, 'error');
  }
}

// Permanently delete order from backend
async function handleDeleteOrder(orderId, orderNumber) {
  const confirmDelete = confirm(`Are you sure you want to delete Order #${orderNumber} (ID: ${orderId}) permanently?\n\nThis will remove the booking and all its records.`);
  if (!confirmDelete) return;

  try {
    await adminApiFetch(`${API_BASE}/orders/${orderId}`, { method: 'DELETE' });
    allOrders = allOrders.filter(o => o.id !== orderId);
    updateOrderCounts();
    const orderSearchInput = document.getElementById('orderSearchInput');
    const query = orderSearchInput ? orderSearchInput.value.toLowerCase().trim() : '';
    renderOrdersTable(query);
    fetchOverviewData();
    showAdminToast(`✓ Order #${orderNumber} deleted successfully.`, 'success');
  } catch (err) {
    showAdminToast(`Failed to delete order: ${err.message}`, 'error');
  }
}

// ----------------------------------------------------
// SERVICES MANAGEMENT (Add, Edit, Remove, Pricing)
// ----------------------------------------------------
function setupServices() {
  const openAddBtn = document.getElementById('openAddServiceModalBtn');
  const closeBtn = document.getElementById('closeServiceModalBtn');
  const cancelBtn = document.getElementById('cancelServiceModalBtn');
  const modal = document.getElementById('serviceModal');
  const form = document.getElementById('serviceForm');
  const searchInput = document.getElementById('serviceSearchInput');
  const categoryTabs = document.querySelectorAll('#serviceCategoryTabs .filter-tab');

  // Open Add Service modal
  if (openAddBtn) {
    openAddBtn.addEventListener('click', openAddServiceModal);
  }

  // Close modal buttons
  if (closeBtn) {
    closeBtn.addEventListener('click', closeServiceModal);
  }
  if (cancelBtn) {
    cancelBtn.addEventListener('click', closeServiceModal);
  }

  // Click outside modal box to close
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeServiceModal();
      }
    });
  }

  // Form submit
  if (form) {
    form.addEventListener('submit', handleSaveService);
  }

  // Live search input
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase().trim();
      renderServicesTable(query);
    });
  }

  // Category filter tabs
  categoryTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      categoryTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentServiceCategory = tab.getAttribute('data-cat') || 'all';

      const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
      renderServicesTable(query);
    });
  });

  // Live preview for capacity digit and unit
  const digitInput = document.getElementById('serviceCapacityDigit');
  const unitInput = document.getElementById('serviceCapacityUnit');
  if (digitInput) digitInput.addEventListener('input', updateCapacityUnitPreview);
  if (unitInput) unitInput.addEventListener('input', updateCapacityUnitPreview);
}

function updateCapacityUnitPreview() {
  const digitInput = document.getElementById('serviceCapacityDigit');
  const unitInput = document.getElementById('serviceCapacityUnit');
  const preview = document.getElementById('capacityUnitPreview');
  if (!preview) return;

  const digit = digitInput ? digitInput.value.trim() : '';
  const unit = unitInput ? unitInput.value.trim() : '';
  const combined = digit ? `${digit} ${unit || 'kWh'}`.trim() : (unit || 'kWh');
  preview.innerHTML = `Display Unit: <strong>${combined}</strong>`;
}

function openAddServiceModal() {
  const modal = document.getElementById('serviceModal');
  const form = document.getElementById('serviceForm');
  const title = document.getElementById('serviceModalTitle');
  const saveBtn = document.getElementById('saveServiceBtn');
  const errorDiv = document.getElementById('serviceModalError');

  if (!modal || !form) return;

  form.reset();
  document.getElementById('serviceModalId').value = '';
  document.getElementById('serviceCategory').value = 'residential';
  document.getElementById('serviceCapacityDigit').value = '';
  document.getElementById('serviceCapacityUnit').value = 'kWh';
  updateCapacityUnitPreview();
  document.getElementById('serviceIsActive').value = '1';

  if (title) title.textContent = 'Add Solar Washing Service';
  if (saveBtn) saveBtn.querySelector('span').textContent = 'Create Solar Service';
  if (errorDiv) {
    errorDiv.textContent = '';
    errorDiv.style.display = 'none';
  }

  modal.classList.remove('hidden');
}

function openEditServiceModal(serviceId) {
  const modal = document.getElementById('serviceModal');
  const title = document.getElementById('serviceModalTitle');
  const saveBtn = document.getElementById('saveServiceBtn');
  const errorDiv = document.getElementById('serviceModalError');

  const service = allServices.find(s => s.id === serviceId);
  if (!service || !modal) return;

  document.getElementById('serviceModalId').value = service.id;
  document.getElementById('serviceTitle').value = service.title || '';
  document.getElementById('serviceCategory').value = service.category || 'residential';
  document.getElementById('serviceBasePrice').value = service.base_price !== undefined ? service.base_price : '';

  const unitVal = (service.price_unit || '').trim();
  const match = unitVal.match(/^([\d.]+)\s*(.*)$/);
  if (match) {
    document.getElementById('serviceCapacityDigit').value = match[1];
    document.getElementById('serviceCapacityUnit').value = match[2] || 'kWh';
  } else {
    document.getElementById('serviceCapacityDigit').value = '';
    document.getElementById('serviceCapacityUnit').value = unitVal || 'kWh';
  }
  updateCapacityUnitPreview();

  document.getElementById('serviceIsActive').value = service.is_active !== undefined ? String(service.is_active) : '1';
  document.getElementById('serviceDescription').value = service.description || '';

  if (title) title.textContent = `Edit Solar Service: ${service.title}`;
  if (saveBtn) saveBtn.querySelector('span').textContent = 'Update Solar Service';
  if (errorDiv) {
    errorDiv.textContent = '';
    errorDiv.style.display = 'none';
  }

  modal.classList.remove('hidden');
}

function closeServiceModal() {
  const modal = document.getElementById('serviceModal');
  if (modal) {
    modal.classList.add('hidden');
  }
}

async function handleSaveService(e) {
  e.preventDefault();
  const errorDiv = document.getElementById('serviceModalError');
  const saveBtn = document.getElementById('saveServiceBtn');
  const saveBtnText = saveBtn ? saveBtn.querySelector('span') : null;

  if (errorDiv) errorDiv.style.display = 'none';

  const serviceId = document.getElementById('serviceModalId').value.trim();
  const title = document.getElementById('serviceTitle').value.trim();
  const category = document.getElementById('serviceCategory').value;
  const basePriceVal = document.getElementById('serviceBasePrice').value;
  const digit = document.getElementById('serviceCapacityDigit').value.trim();
  const unit = document.getElementById('serviceCapacityUnit').value.trim() || 'kWh';
  const priceUnit = digit ? `${digit} ${unit}`.trim() : unit;
  const isActiveVal = document.getElementById('serviceIsActive').value;
  const description = document.getElementById('serviceDescription').value.trim();

  if (!title) {
    if (errorDiv) {
      errorDiv.textContent = 'Service title is required.';
      errorDiv.style.display = 'block';
    }
    return;
  }

  const basePrice = parseFloat(basePriceVal);
  if (isNaN(basePrice) || basePrice < 0) {
    if (errorDiv) {
      errorDiv.textContent = 'Please enter a valid price.';
      errorDiv.style.display = 'block';
    }
    return;
  }

  const payload = {
    title,
    category,
    base_price: basePrice,
    price_unit: priceUnit,
    is_active: parseInt(isActiveVal, 10),
    description
  };

  const isEdit = Boolean(serviceId);
  const url = isEdit ? `${API_BASE}/services/${serviceId}` : `${API_BASE}/services`;
  const method = isEdit ? 'PUT' : 'POST';

  if (saveBtnText) saveBtnText.textContent = isEdit ? 'Updating...' : 'Saving...';
  if (saveBtn) saveBtn.disabled = true;

  try {
    await adminApiFetch(url, {
      method: method,
      body: JSON.stringify(payload)
    });

    closeServiceModal();
    await fetchServicesData();
    fetchOverviewData();
    showAdminToast(isEdit ? '✓ Solar service updated successfully.' : '✓ Solar service created successfully.', 'success');
  } catch (err) {
    if (errorDiv) {
      errorDiv.textContent = err.message;
      errorDiv.style.display = 'block';
    } else {
      showAdminToast(err.message, 'error');
    }
  } finally {
    if (saveBtn) saveBtn.disabled = false;
    if (saveBtnText) saveBtnText.textContent = isEdit ? 'Update Solar Service' : 'Save Solar Service';
  }
}

async function handleDeleteService(serviceId, serviceTitle) {
  const confirmDelete = confirm(`Are you sure you want to remove the solar washing service "${serviceTitle}" (ID #${serviceId})?\n\nThis will remove it from the catalog. Historical order records will be preserved.`);
  if (!confirmDelete) return;

  try {
    await adminApiFetch(`${API_BASE}/services/${serviceId}`, { method: 'DELETE' });
    allServices = allServices.filter(s => s.id !== serviceId);
    updateServiceCounts();
    const searchInput = document.getElementById('serviceSearchInput');
    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
    renderServicesTable(query);
    fetchOverviewData();
    showAdminToast(`✓ Service "${serviceTitle}" deleted successfully.`, 'success');
  } catch (err) {
    showAdminToast(`Failed to delete service: ${err.message}`, 'error');
  }
}

async function handleToggleServiceStatus(serviceId, currentActive) {
  const newActive = currentActive === 1 ? 0 : 1;
  try {
    await adminApiFetch(`${API_BASE}/services/${serviceId}`, {
      method: 'PUT',
      body: JSON.stringify({ is_active: newActive })
    });

    const idx = allServices.findIndex(s => s.id === serviceId);
    if (idx !== -1) {
      allServices[idx].is_active = newActive;
    }
    updateServiceCounts();
    const searchInput = document.getElementById('serviceSearchInput');
    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
    renderServicesTable(query);
    showAdminToast(`✓ Service visibility set to ${newActive === 1 ? 'ACTIVE' : 'INACTIVE'}.`, 'info');
  } catch (err) {
    showAdminToast(`Failed to toggle status: ${err.message}`, 'error');
  }
}

async function fetchServicesData() {
  const tableBody = document.getElementById('servicesTableBody');
  try {
    const result = await adminApiFetch(`${API_BASE}/services/admin/all`, { method: 'GET' });
    allServices = result.data || [];
    updateServiceCounts();
    const searchInput = document.getElementById('serviceSearchInput');
    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
    renderServicesTable(query);
  } catch (err) {
    console.error('Failed to load services:', err);
    if (tableBody) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="7" class="empty-state" style="padding: 28px 16px; color: #ef4444;">
            <div style="font-weight: 600; margin-bottom: 6px;">⚠️ ${err.message}</div>
            <button type="button" onclick="fetchServicesData()" style="background: #1e40af; color: #fff; border: none; padding: 6px 14px; border-radius: 6px; font-size: 12px; cursor: pointer;">🔄 Retry Loading Services</button>
          </td>
        </tr>
      `;
    }
    if (!err.message.includes('Session expired')) {
      showAdminToast(`Failed to load services: ${err.message}`, 'error');
    }
  }
}

function updateServiceCounts() {
  const totalCount = allServices.length;
  const activeCount = allServices.filter(s => s.is_active === 1).length;
  const inactiveCount = allServices.filter(s => s.is_active === 0).length;

  const countResidential = allServices.filter(s => (s.category || '').toLowerCase() === 'residential').length;
  const countCommercial = allServices.filter(s => (s.category || '').toLowerCase() === 'commercial').length;
  const countDeepClean = allServices.filter(s => (s.category || '').toLowerCase() === 'deep_clean').length;
  const countRobotic = allServices.filter(s => (s.category || '').toLowerCase() === 'robotic').length;
  const countInspection = allServices.filter(s => (s.category || '').toLowerCase() === 'inspection').length;
  const countAmc = allServices.filter(s => (s.category || '').toLowerCase() === 'amc').length;

  // Starting / minimum price among active services
  const activePrices = allServices.filter(s => s.is_active === 1).map(s => Number(s.base_price) || 0);
  const minPrice = activePrices.length > 0 ? Math.min(...activePrices) : 0;

  const elTotal = document.getElementById('statTotalServices');
  const elActive = document.getElementById('statActiveServices');
  const elInactive = document.getElementById('statInactiveServices');
  const elMinPrice = document.getElementById('statMinPrice');

  if (elTotal) elTotal.textContent = totalCount;
  if (elActive) elActive.textContent = activeCount;
  if (elInactive) elInactive.textContent = inactiveCount;
  if (elMinPrice) elMinPrice.textContent = `₹${minPrice}`;

  // Tabs counts
  const elAll = document.getElementById('count-service-all');
  const elResidential = document.getElementById('count-service-residential');
  const elCommercial = document.getElementById('count-service-commercial');
  const elDeepClean = document.getElementById('count-service-deepclean');
  const elRobotic = document.getElementById('count-service-robotic');
  const elInspection = document.getElementById('count-service-inspection');
  const elAmc = document.getElementById('count-service-amc');

  if (elAll) elAll.textContent = totalCount;
  if (elResidential) elResidential.textContent = countResidential;
  if (elCommercial) elCommercial.textContent = countCommercial;
  if (elDeepClean) elDeepClean.textContent = countDeepClean;
  if (elRobotic) elRobotic.textContent = countRobotic;
  if (elInspection) elInspection.textContent = countInspection;
  if (elAmc) elAmc.textContent = countAmc;
}

function renderServicesTable(query = '') {
  const tableBody = document.getElementById('servicesTableBody');
  if (!tableBody) return;

  let filtered = allServices.slice();

  // Filter by category tab
  if (currentServiceCategory !== 'all') {
    filtered = filtered.filter(s => (s.category || '').toLowerCase() === currentServiceCategory);
  }

  // Filter by search query
  if (query) {
    filtered = filtered.filter(s =>
      (s.title && s.title.toLowerCase().includes(query)) ||
      (s.description && s.description.toLowerCase().includes(query)) ||
      (s.category && s.category.toLowerCase().includes(query)) ||
      (String(s.base_price).includes(query)) ||
      (s.price_unit && s.price_unit.toLowerCase().includes(query))
    );
  }

  if (filtered.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="7" class="empty-state">No solar services found matching the criteria.</td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = filtered.map(s => {
    const rawCat = (s.category || 'general').toLowerCase();
    let catLabel = 'General Solar';
    let catClass = 'badge-cat-general';

    if (rawCat === 'residential') { catLabel = 'Rooftop Solar'; catClass = 'badge-cat-residential'; }
    else if (rawCat === 'commercial') { catLabel = 'Commercial C&I'; catClass = 'badge-cat-commercial'; }
    else if (rawCat === 'deep_clean') { catLabel = 'Deep Chemical Clean'; catClass = 'badge-cat-deepclean'; }
    else if (rawCat === 'robotic') { catLabel = 'Robotic Clean'; catClass = 'badge-cat-robotic'; }
    else if (rawCat === 'inspection') { catLabel = 'Health & Audit'; catClass = 'badge-cat-inspection'; }
    else if (rawCat === 'amc') { catLabel = 'AMC Contract'; catClass = 'badge-cat-amc'; }

    const isActive = s.is_active === 1;
    const statusPillClass = isActive ? 'active' : 'inactive';
    const statusText = isActive ? 'Active' : 'Inactive';

    const createdDate = s.created_at ? new Date(s.created_at).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    }) : 'Standard';

    return `
      <tr id="service-row-${s.id}">
        <td><span style="color: var(--text-muted); font-size: 13px;">#${s.id}</span></td>
        <td>
          <div style="font-weight: 700; color: var(--text-main); font-size: 14px;">${escapeHtml(s.title)}</div>
          <div style="font-size: 12px; color: var(--text-muted); margin-top: 3px; max-width: 320px; line-height: 1.4;">
            ${escapeHtml(s.description || 'De-ionized solar panel wash & care.')}
          </div>
        </td>
        <td>
          <span class="badge-cat ${catClass}">${catLabel}</span>
        </td>
        <td>
          <div class="service-price-text">₹${s.base_price}</div>
          <div class="service-unit-text">${escapeHtml(s.price_unit || '3 kWh')}</div>
        </td>
        <td>
          <button class="status-toggle-badge ${statusPillClass}" onclick="handleToggleServiceStatus(${s.id}, ${s.is_active})" title="Click to toggle active status">
            <span class="dot"></span>
            <span>${statusText}</span>
          </button>
        </td>
        <td>
          <div style="font-size: 13px; color: var(--text-muted);">${createdDate}</div>
        </td>
        <td style="text-align: right;">
          <div class="service-actions-cell">
            <button class="btn-action-edit" onclick="openEditServiceModal(${s.id})" title="Edit Service">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
              </svg>
              <span>Edit</span>
            </button>
            <button class="btn-action-delete" onclick="handleDeleteService(${s.id}, '${escapeHtml(s.title)}')" title="Delete Service">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
              </svg>
              <span>Delete</span>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

