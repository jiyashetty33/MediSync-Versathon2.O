/* ============================================================
   H4 — admin.js
   Admin portal: network overview, map, alerts, analytics
   ============================================================ */

/* ---- Nav routing ---- */
const AdminNav = (() => {
  const SECTIONS = {
    overview:  { title: 'Network Overview',   subtitle: 'All hospitals in the H4 network' },
    map:       { title: 'Network Map',        subtitle: 'Live hospital status across Mangalore' },
    analytics: { title: 'Network Analytics',  subtitle: 'Request volume, utilization & fulfillment trends' },
    profile:   { title: 'Admin Profile',      subtitle: 'Your admin account' }
  };

  function navigate(sectionKey) {
    document.querySelectorAll('.section').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    const section = document.getElementById(`sec-${sectionKey}`);
    if (section) section.classList.add('active');
    const navBtn = document.querySelector(`[data-section="${sectionKey}"]`);
    if (navBtn) navBtn.classList.add('active');
    const meta = SECTIONS[sectionKey] || {};
    document.getElementById('page-title').textContent    = meta.title || sectionKey;
    document.getElementById('page-subtitle').textContent = meta.subtitle || '';
    Poller.stopAll();
    switch (sectionKey) {
      case 'overview':  AdminOverview.init();  break;
      case 'map':       AdminMap.init();       break;
      case 'analytics': AdminAnalytics.init(); break;
      case 'profile':   AdminProfile.init();   break;
    }
    document.querySelector('.sidebar')?.classList.remove('open');
    document.querySelector('.sidebar-overlay')?.classList.remove('visible');
  }

  function init() {
    document.querySelectorAll('.nav-item[data-section]').forEach(btn => {
      btn.addEventListener('click', () => navigate(btn.dataset.section));
    });
    const toggle  = document.getElementById('sidebar-toggle');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    if (toggle) toggle.addEventListener('click', () => {
      sidebar.classList.toggle('open'); overlay?.classList.toggle('visible');
    });
    if (overlay) overlay.addEventListener('click', () => {
      sidebar.classList.remove('open'); overlay.classList.remove('visible');
    });
    navigate('overview');
  }

  return { navigate, init };
})();


/* ---- Overview section ---- */
const AdminOverview = (() => {
  async function init() {
    const user = AUTH.getUser();
    const avatarEl = document.getElementById('sidebar-avatar');
    if (avatarEl) avatarEl.textContent = (user?.name || 'A')[0];
    const nameEl = document.getElementById('sidebar-user-name');
    if (nameEl) nameEl.textContent = user?.name || '';

    Poller.start('admin-overview', refresh);
  }

  async function refresh() {
    await Promise.all([loadStats(), loadHospitals(), loadAlerts()]);
  }

  async function loadStats() {
    try {
      const stats = await API.get('/admin/stats');
      const fields = {
        'stat-total-hospitals':   stats.totalHospitals,
        'stat-normal-hospitals':  stats.normalHospitals,
        'stat-low-hospitals':     stats.lowHospitals,
        'stat-critical-hospitals':stats.criticalHospitals,
        'stat-active-requests':   stats.activeRequests,
        'stat-fulfilled-today':   stats.fulfilledToday,
        'stat-network-util':      `${stats.networkUtilization}%`,
        'stat-available-beds':    stats.availableBeds
      };
      Object.entries(fields).forEach(([id, val]) => {
        const el = document.getElementById(id); if (el) el.textContent = val;
      });
    } catch {}
  }

  async function loadHospitals() {
    const body = document.getElementById('admin-hospitals-tbody');
    if (!body) return;
    body.innerHTML = `<tr><td colspan="9"><div class="loading-state"><div class="spinner-sm spinner"></div><span>Loading…</span></div></td></tr>`;
    try {
      const data = await API.get('/hospitals');
      const hospitals = data.hospitals || [];
      renderHospitalTable(hospitals, body);
    } catch (err) {
      body.innerHTML = `<tr><td colspan="9" class="text-center text-muted" style="padding:var(--sp-8)">Error: ${err.message}</td></tr>`;
    }
  }

  function renderHospitalTable(hospitals, tbody) {
    if (hospitals.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><div class="empty-icon">🏥</div><div class="empty-title">No Hospitals</div></div></td></tr>`;
      return;
    }

    // Sort: critical first
    const sorted = [...hospitals].sort((a, b) => {
      const r = { CRITICAL: 0, LOW: 1, NORMAL: 2 };
      return (r[a.status] ?? 3) - (r[b.status] ?? 3);
    });

    tbody.innerHTML = sorted.map(h => {
      const r = h.resources;
      return `
        <tr class="hospital-row-${h.status.toLowerCase()}">
          <td>
            <div class="flex items-center gap-2">
              ${RESOURCES.statusDot(h.status)}
              <code style="font-size:var(--fs-xs)">${h.id}</code>
            </div>
          </td>
          <td>
            <div class="hospital-name-cell">
              <span class="name">${h.name}</span>
              <span class="area">${h.area}</span>
              <span class="type">${h.type}</span>
            </div>
          </td>
          <td>${RESOURCES.statusBadge(h.status)}</td>
          <td>
            <div class="resource-mini">
              <span class="avail">${r.icuBeds.available}</span>
              <span class="total">/ ${r.icuBeds.total}</span>
            </div>
          </td>
          <td>
            <div class="resource-mini">
              <span class="avail">${r.emergencyBeds.available}</span>
              <span class="total">/ ${r.emergencyBeds.total}</span>
            </div>
          </td>
          <td>
            <div class="resource-mini">
              <span class="avail">${r.generalBeds.available}</span>
              <span class="total">/ ${r.generalBeds.total}</span>
            </div>
          </td>
          <td>
            <div class="resource-mini">
              <span class="avail">${r.ventilators.available}</span>
              <span class="total">/ ${r.ventilators.total}</span>
            </div>
          </td>
          <td>
            <div class="resource-mini">
              <span class="avail">${r.bloodInventory.available}</span>
              <span class="total">/ ${r.bloodInventory.total}</span>
            </div>
          </td>
          <td class="last-updated-cell">${TimeUtil.relative(h.lastUpdated)}</td>
        </tr>`;
    }).join('');
  }

  async function loadAlerts() {
    const container = document.getElementById('admin-alerts-list');
    if (!container) return;

    const criticalHospitals = [];
    try {
      const data = await API.get('/hospitals');
      (data.hospitals || []).forEach(h => {
        if (h.status === 'CRITICAL') criticalHospitals.push(h);
        // Also check resource-level critical
        Object.entries(h.resources || {}).forEach(([key, r]) => {
          if (RESOURCES.computeStatus(r.available, r.total) === 'CRITICAL') {
            criticalHospitals.push({ ...h, _criticalResource: RESOURCES.RESOURCE_TYPES[key]?.label || key });
          }
        });
      });
    } catch {}

    const alertStrip = document.getElementById('network-critical-strip');
    if (alertStrip) {
      if (criticalHospitals.length > 0) {
        alertStrip.classList.remove('hidden');
        alertStrip.querySelector('.strip-text').textContent =
          `⚠️ ${criticalHospitals.length} critical situation(s) in the network — immediate attention required`;
      } else {
        alertStrip.classList.add('hidden');
      }
    }

    if (criticalHospitals.length === 0) {
      container.innerHTML = `
        <div class="admin-alert-item" style="background:rgba(255,255,255,0.05)">
          <div class="admin-alert-icon">✅</div>
          <div class="admin-alert-body">
            <div class="admin-alert-title">Network Stable</div>
            <div class="admin-alert-message">All hospitals are operating within normal or low-alert thresholds.</div>
          </div>
        </div>`;
      return;
    }

    container.innerHTML = criticalHospitals.slice(0, 5).map(h => `
      <div class="admin-alert-item">
        <div class="admin-alert-icon">🚨</div>
        <div class="admin-alert-body">
          <div class="admin-alert-title">${h.name}${h._criticalResource ? ` — ${h._criticalResource}` : ''}</div>
          <div class="admin-alert-message">${h.area} · Status: ${h.status}</div>
        </div>
        <div class="admin-alert-time">${TimeUtil.relative(h.lastUpdated)}</div>
      </div>`).join('');
  }

  return { init };
})();


/* ---- Network Map section ---- */
const AdminMap = (() => {
  let _map     = null;
  let _markers = [];

  async function init() {
    initMap();
    const data = await API.get('/hospitals');
    populateMarkers(data.hospitals || []);
  }

  function initMap() {
    const mapEl = document.getElementById('admin-map');
    if (!mapEl || typeof L === 'undefined' || _map) return;
    _map = L.map('admin-map').setView([12.8698, 74.8431], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors', maxZoom: 19
    }).addTo(_map);
  }

  function populateMarkers(hospitals) {
    if (!_map) return;
    _markers.forEach(m => m.remove()); _markers = [];
    const colors = { NORMAL: '#22C55E', LOW: '#F59E0B', CRITICAL: '#EF4444' };

    hospitals.forEach(h => {
      if (!h.lat || !h.lng) return;
      const color = colors[h.status] || '#6B7280';
      const icon  = L.divIcon({
        html: `<div style="width:16px;height:16px;background:${color};border-radius:50%;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3)"></div>`,
        iconSize: [16,16], className: ''
      });
      const r = h.resources;
      const popup = `
        <div style="font-family:Inter,sans-serif;min-width:200px">
          <div style="font-weight:800;font-size:14px;margin-bottom:3px">${h.name}</div>
          <div style="font-size:12px;color:#64748b;margin-bottom:6px">${h.area} · ${h.type}</div>
          <div style="margin-bottom:6px">${RESOURCES.statusBadge(h.status)}</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:12px">
            <div>ICU: <b>${r.icuBeds.available}/${r.icuBeds.total}</b></div>
            <div>Emergency: <b>${r.emergencyBeds.available}/${r.emergencyBeds.total}</b></div>
            <div>General: <b>${r.generalBeds.available}/${r.generalBeds.total}</b></div>
            <div>Ventilators: <b>${r.ventilators.available}/${r.ventilators.total}</b></div>
          </div>
          <div style="font-size:11px;color:#94a3b8;margin-top:6px">Updated ${TimeUtil.relative(h.lastUpdated)}</div>
        </div>`;
      const marker = L.marker([h.lat, h.lng], { icon }).addTo(_map).bindPopup(popup, { maxWidth: 260 });
      _markers.push(marker);
    });
  }

  return { init };
})();


/* ---- Analytics section ---- */
const AdminAnalytics = (() => {
  let _built = false;

  async function init() {
    if (_built) return;
    try {
      const [data, stats] = await Promise.all([
        API.get('/admin/analytics'),
        API.get('/admin/stats')
      ]);
      Analytics.createNetworkUtilChart('chart-network-util', data);
      Analytics.createNetworkVolumeChart('chart-network-volume', data);
      Analytics.createHospitalStatusChart('chart-hospital-status', stats);
      Analytics.createFulfillmentChart('chart-fulfillment', data);
      _built = true;
    } catch (err) {
      Toast.error('Analytics Error', err.message);
    }
  }

  return { init };
})();


/* ---- Admin profile ---- */
const AdminProfile = (() => {
  function init() {
    const u = AUTH.getUser();
    if (!u) return;
    const fields = {
      'admin-profile-name':  u.name,
      'admin-profile-email': u.email,
      'admin-profile-role':  u.role,
      'admin-profile-id':    u.id
    };
    Object.entries(fields).forEach(([id, val]) => {
      const el = document.getElementById(id); if (el) el.textContent = val || '—';
    });
  }
  return { init };
})();


/* ============================================================
   LOGIN PAGE
   ============================================================ */
async function handleAdminLogin(e) {
  e.preventDefault();
  const form  = e.target;
  const btn   = form.querySelector('[type="submit"]');
  const errEl = document.getElementById('login-error');
  const email = form.querySelector('#email').value.trim();
  const pass  = form.querySelector('#password').value;
  if (!email || !pass) {
    errEl.textContent = 'All fields are required.'; errEl.classList.remove('hidden'); return;
  }
  btn.classList.add('loading'); btn.disabled = true;
  errEl.classList.add('hidden');
  try {
    await AUTH.login('admin', { email, password: pass });
    window.location.href = '/admin-dashboard.html';
  } catch (err) {
    errEl.textContent = err.message || 'Login failed.';
    errEl.classList.remove('hidden');
    btn.classList.remove('loading'); btn.disabled = false;
  }
}


/* ============================================================
   BOOT
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  const isLogin     = document.getElementById('admin-login-form');
  const isDashboard = document.getElementById('admin-dashboard');

  if (isLogin) {
    document.getElementById('admin-login-form').addEventListener('submit', handleAdminLogin);
  }

  if (isDashboard) {
    if (!AUTH.requireAuth('admin')) return;
    document.getElementById('logout-btn')?.addEventListener('click', () => AUTH.logout('admin'));
    AdminNav.init();
  }
});
