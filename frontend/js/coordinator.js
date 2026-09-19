/* ============================================================
   H4 — coordinator.js
   Coordinator portal: dashboard, resources, emergency, network,
   notifications, analytics, emergency mode, profile
   ============================================================ */

/* ---- Nav routing ---- */
const CoordNav = (() => {
  const SECTIONS = {
    dashboard:      { title: 'Dashboard',         subtitle: 'Overview of your hospital' },
    resources:      { title: 'Resource Management',subtitle: 'Update your hospital\'s resource counts' },
    emergency:      { title: 'Emergency Requests', subtitle: 'Incoming & outgoing resource requests' },
    network:        { title: 'Hospital Network',   subtitle: 'Connected hospitals in Mangalore' },
    notifications:  { title: 'Notifications',      subtitle: 'System alerts and updates' },
    analytics:      { title: 'Analytics',          subtitle: 'Resource utilization & request trends' },
    history:        { title: 'Resource History',   subtitle: 'Past resource changes at your hospital' },
    'emergency-mode':{ title: '🚨 Emergency Mode', subtitle: 'Rapid response — critical requests' },
    profile:        { title: 'Profile',            subtitle: 'Your account information' }
  };

  let currentSection = null;

  function navigate(sectionKey) {
    // Hide all sections
    document.querySelectorAll('.section').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

    const section = document.getElementById(`sec-${sectionKey}`);
    if (!section) return;
    section.classList.add('active');

    const navBtn = document.querySelector(`[data-section="${sectionKey}"]`);
    if (navBtn) navBtn.classList.add('active');

    const meta = SECTIONS[sectionKey] || {};
    document.getElementById('page-title').textContent    = meta.title || sectionKey;
    document.getElementById('page-subtitle').textContent = meta.subtitle || '';

    // Manage polling: stop previous, start for new section
    Poller.stopAll();

    switch (sectionKey) {
      case 'dashboard':     CoordDashboard.init();    break;
      case 'resources':     CoordResources.init();    break;
      case 'emergency':     CoordEmergency.init();    break;
      case 'network':       CoordNetwork.init();      break;
      case 'notifications': CoordNotifications.init();break;
      case 'analytics':     CoordAnalytics.init();    break;
      case 'history':       CoordHistory.init();      break;
      case 'emergency-mode':CoordEmergencyMode.init();break;
      case 'profile':       CoordProfile.init();      break;
    }

    currentSection = sectionKey;

    // Close sidebar on mobile
    const sidebar = document.querySelector('.sidebar');
    sidebar.classList.remove('open');
    document.querySelector('.sidebar-overlay')?.classList.remove('visible');
  }

  function init() {
    // Bind nav buttons
    document.querySelectorAll('.nav-item[data-section]').forEach(btn => {
      btn.addEventListener('click', () => navigate(btn.dataset.section));
    });

    // Sidebar toggle for mobile
    const toggle  = document.getElementById('sidebar-toggle');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    if (toggle) {
      toggle.addEventListener('click', () => {
        sidebar.classList.toggle('open');
        overlay?.classList.toggle('visible');
      });
    }
    if (overlay) overlay.addEventListener('click', () => {
      sidebar.classList.remove('open');
      overlay.classList.remove('visible');
    });

    navigate('dashboard');
  }

  return { navigate, init };
})();


/* ---- Dashboard section ---- */
const CoordDashboard = (() => {
  let _user = null;
  let _hospitalId = null;

  async function init() {
    _user = AUTH.getUser();
    if (!_user) return;
    _hospitalId = _user.hospital?.id;

    populateContextBar();
    Poller.start('dashboard', refresh);
  }

  function populateContextBar() {
    const u = _user;
    if (!u) return;
    const el = document.getElementById('ctx-hospital-name');
    if (el) el.textContent = u.hospital?.name || '—';
    const idEl = document.getElementById('ctx-hospital-id');
    if (idEl) idEl.textContent = u.hospital?.id || '';
    const coordEl = document.getElementById('ctx-coord-name');
    if (coordEl) coordEl.textContent = u.name || '';
    const avatarEl = document.getElementById('sidebar-avatar');
    if (avatarEl) avatarEl.textContent = (u.name || 'C')[0].toUpperCase();
    const nameEl = document.getElementById('sidebar-user-name');
    if (nameEl) nameEl.textContent = u.name || '';
    const roleEl = document.getElementById('sidebar-user-role');
    if (roleEl) roleEl.textContent = u.hospital?.name || 'Coordinator';
  }

  async function refresh() {
    await Promise.all([
      loadResources(),
      loadAlerts(),
      loadActiveRequests()
    ]);
  }

  async function loadResources() {
    try {
      const res = await API.get(`/hospitals/${_hospitalId}/resources`);
      renderResourceCards(res);
      updateOverallStatus(res);
    } catch (err) {
      console.error('[Dashboard] Resources error:', err);
    }
  }

  function renderResourceCards(resources) {
    const grid = document.getElementById('dash-resource-grid');
    if (!grid) return;

    // Sort: critical first, then low, then normal
    const sorted = Object.entries(resources).sort(([, a], [, b]) => {
      const rank = { CRITICAL: 0, LOW: 1, NORMAL: 2 };
      return rank[RESOURCES.computeStatus(a.available, a.total)] - rank[RESOURCES.computeStatus(b.available, b.total)];
    });

    grid.innerHTML = sorted.map(([key, data]) =>
      RESOURCES.buildResourceCard(key, data, _hospitalId, true)
    ).join('');
  }

  function updateOverallStatus(resources) {
    const status    = RESOURCES.hospitalStatus(resources);
    const el        = document.getElementById('ctx-hospital-status');
    if (el) el.innerHTML = RESOURCES.statusBadge(status);

    // Critical strip
    const strip = document.getElementById('critical-strip');
    if (strip) {
      if (status === 'CRITICAL') {
        strip.classList.remove('hidden');
        strip.querySelector('.strip-text').textContent =
          '⚠️ Your hospital is in CRITICAL status — immediate action required';
      } else {
        strip.classList.add('hidden');
      }
    }

    // Stats
    const all = Object.values(resources);
    const totalAvailable = all.reduce((s, r) => s + r.available, 0);
    const totalBeds = all.reduce((s, r) => s + r.total, 0);
    const el2 = document.getElementById('stat-total-available');
    if (el2) el2.textContent = totalAvailable;
    const el3 = document.getElementById('stat-total-beds');
    if (el3) el3.textContent = totalBeds;
  }

  async function loadAlerts() {
    // Use notifications as alerts for dashboard
    try {
      const data = await API.get('/notifications');
      const criticalNotifs = (data.notifications || []).filter(n => n.type === 'critical' && !n.read);
      const container = document.getElementById('dash-alerts');
      if (!container) return;
      if (criticalNotifs.length === 0) {
        container.innerHTML = `<div class="alert-banner alert-success"><span class="alert-icon">✅</span><div class="alert-body"><div class="alert-title">All Clear</div><div class="alert-msg">No critical alerts at this time.</div></div></div>`;
        return;
      }
      container.innerHTML = criticalNotifs.map(n => `
        <div class="alert-banner alert-critical">
          <span class="alert-icon">🚨</span>
          <div class="alert-body">
            <div class="alert-title">${n.title}</div>
            <div class="alert-msg">${n.message}</div>
          </div>
          <button class="alert-dismiss" onclick="this.closest('.alert-banner').remove()">✕</button>
        </div>`).join('');

      // Update nav badge
      Notifications.updateNavBadge();
    } catch {}
  }

  async function loadActiveRequests() {
    try {
      const data = await API.get('/emergency-requests');
      const active = (data.requests || []).filter(r => !['FULFILLED','CANCELLED','EXPIRED'].includes(r.status));
      const count  = document.getElementById('stat-active-requests');
      if (count) count.textContent = active.length;
      const badge  = document.getElementById('emergency-nav-badge');
      if (badge) { badge.textContent = active.length; badge.style.display = active.length ? 'flex' : 'none'; }

      const list = document.getElementById('dash-active-requests');
      if (!list) return;
      if (active.length === 0) {
        list.innerHTML = `<div class="empty-state" style="padding:var(--sp-8)"><div class="empty-icon">📭</div><div class="empty-title">No Active Requests</div><div class="empty-msg">No emergency requests at this time.</div></div>`;
        return;
      }
      list.innerHTML = active.slice(0, 5).map(r => `
        <div class="mini-request">
          ${RESOURCES.priorityBadge(r.priority)}
          <div class="mini-request-info">
            <div class="mini-request-hospital">${r.direction === 'incoming' ? r.requestingHospital : r.requestedHospital || 'Network'}</div>
            <div class="mini-request-detail">${RESOURCES.RESOURCE_TYPES[r.resource]?.label} × ${r.quantity} · ${r.direction}</div>
          </div>
          ${RESOURCES.reqStatusBadge(r.status)}
        </div>`).join('');
    } catch {}
  }

  return { init, refresh };
})();


/* ---- Resources section ---- */
const CoordResources = (() => {
  let _hospitalId = null;
  let _currentResources = {};
  let _editingKey = null;

  function init() {
    const user = AUTH.getUser();
    _hospitalId = user?.hospital?.id;
    loadAndRender();
  }

  async function loadAndRender() {
    try {
      const res = await API.get(`/hospitals/${_hospitalId}/resources`);
      _currentResources = res;
      renderEditGrid(res);
    } catch (err) {
      Toast.error('Failed to load resources', err.message);
    }
  }

  function renderEditGrid(resources) {
    const grid = document.getElementById('res-edit-grid');
    if (!grid) return;
    grid.innerHTML = Object.entries(resources).map(([key, data]) => {
      const meta   = RESOURCES.RESOURCE_TYPES[key] || { label: key, icon: '📦', iconBg: 'icon-bg-blue' };
      const status = RESOURCES.computeStatus(data.available, data.total);
      return `
        <div class="res-edit-card">
          <div class="res-edit-header">
            <div class="res-edit-header-info">
              <div class="res-edit-icon">${meta.icon}</div>
              <div>
                <div class="res-edit-name">${meta.label}</div>
                ${RESOURCES.statusBadge(status)}
              </div>
            </div>
          </div>
          <div class="res-edit-body">
            <div class="res-edit-current">
              <div class="res-edit-stat"><div class="res-edit-stat-val">${data.total}</div><div class="res-edit-stat-lbl">Total</div></div>
              <div class="res-edit-stat"><div class="res-edit-stat-val">${data.available}</div><div class="res-edit-stat-lbl">Available</div></div>
              <div class="res-edit-stat"><div class="res-edit-stat-val">${data.occupied}</div><div class="res-edit-stat-lbl">Occupied</div></div>
              <div class="res-edit-stat"><div class="res-edit-stat-val">${data.reserved}</div><div class="res-edit-stat-lbl">Reserved</div></div>
            </div>
            ${RESOURCES.utilBar(data.available, data.total)}
          </div>
          <div class="res-update-footer">
            <button class="btn btn-primary btn-sm" onclick="CoordResources.openEditModal('${key}', '${_hospitalId}')">✏️ Update</button>
          </div>
        </div>`;
    }).join('');
  }

  function openEditModal(resourceKey, hospitalId) {
    _editingKey = resourceKey;
    const data = _currentResources[resourceKey];
    if (!data) return;
    const meta = RESOURCES.RESOURCE_TYPES[resourceKey] || { label: resourceKey };

    // Populate modal
    document.getElementById('modal-res-title').textContent = `Update — ${meta.label}`;
    document.getElementById('res-modal-total').value     = data.total;
    document.getElementById('res-modal-available').value = data.available;
    document.getElementById('res-modal-occupied').value  = data.occupied;
    document.getElementById('res-modal-reserved').value  = data.reserved;
    document.getElementById('res-modal-reason').value    = '';

    Modal.open('modal-update-resource');
  }

  async function submitUpdate() {
    const total     = parseInt(document.getElementById('res-modal-total').value, 10);
    const available = parseInt(document.getElementById('res-modal-available').value, 10);
    const occupied  = parseInt(document.getElementById('res-modal-occupied').value, 10);
    const reserved  = parseInt(document.getElementById('res-modal-reserved').value, 10);
    const reason    = document.getElementById('res-modal-reason').value.trim();

    // Validate
    if (isNaN(total) || total < 0)         { Toast.error('Validation', 'Total must be ≥ 0'); return; }
    if (isNaN(available) || available < 0) { Toast.error('Validation', 'Available must be ≥ 0'); return; }
    if (available > total)                 { Toast.error('Validation', 'Available cannot exceed Total'); return; }
    if (occupied + reserved > total)       { Toast.error('Validation', 'Occupied + Reserved cannot exceed Total'); return; }

    const body = { [_editingKey]: { total, available, occupied, reserved, reason } };

    Modal.confirm({
      title: 'Confirm Resource Update',
      message: `Update ${RESOURCES.RESOURCE_TYPES[_editingKey]?.label || _editingKey}: ${available} available of ${total} total?`,
      icon: '📋', confirmText: 'Update', danger: false,
      onConfirm: async () => {
        const btn = document.getElementById('res-modal-submit');
        if (btn) { btn.classList.add('loading'); btn.disabled = true; }
        try {
          await API.put(`/hospitals/${_hospitalId}/resources`, body);
          // Optimistic update
          _currentResources[_editingKey] = { total, available, occupied, reserved };
          Modal.close('modal-update-resource');
          Toast.success('Updated', `${RESOURCES.RESOURCE_TYPES[_editingKey]?.label} updated successfully`);
          renderEditGrid(_currentResources);
        } catch (err) {
          Toast.error('Update Failed', err.message);
        } finally {
          if (btn) { btn.classList.remove('loading'); btn.disabled = false; }
        }
      }
    });
  }

  return { init, openEditModal, submitUpdate };
})();


/* ---- Emergency Requests section ---- */
const CoordEmergency = (() => {
  let _requests = [];

  async function init() {
    await Emergency.loadHospitals();
    Emergency.populateHospitalSelect('req-target-hospital');
    Emergency.populateResourceSelect('req-resource');
    Poller.start('emergency', refresh);
  }

  async function refresh() {
    try {
      const data = await API.get('/emergency-requests');
      _requests = data.requests || [];
      Emergency.renderIncomingTable(_requests, 'incoming-requests-body');
      Emergency.renderOutgoingTable(_requests, 'outgoing-requests-body');
    } catch (err) {
      console.error('[Emergency] refresh error:', err);
    }
  }

  return { init, refresh };
})();


/* ---- Hospital Network section ---- */
const CoordNetwork = (() => {
  let _map = null;
  let _markers = [];

  async function init() {
    await loadNetworkTable();
    initMap();
  }

  async function loadNetworkTable() {
    const loading = document.getElementById('network-loading');
    const tableBody = document.getElementById('network-table-body');
    if (loading) loading.classList.remove('hidden');
    try {
      const data = await API.get('/hospitals');
      const myId = AUTH.getUser()?.hospital?.id;
      const hospitals = (data.hospitals || []).filter(h => h.id !== myId);
      renderNetworkTable(hospitals, tableBody);
      populateMapMarkers(hospitals);
      if (loading) loading.classList.add('hidden');
    } catch (err) {
      if (loading) loading.classList.add('hidden');
      Toast.error('Network Error', err.message);
    }
  }

  function renderNetworkTable(hospitals, container) {
    if (!container) return;
    if (hospitals.length === 0) {
      container.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">🏥</div><div class="empty-title">No Other Hospitals</div></div></td></tr>`;
      return;
    }
    container.innerHTML = hospitals.map(h => {
      const r = h.resources;
      return `
        <tr class="network-hospital-row hospital-row-${h.status.toLowerCase()}">
          <td>
            <div class="flex items-center gap-2">
              ${RESOURCES.statusDot(h.status)}
              <span class="font-bold text-sm">${h.id}</span>
            </div>
          </td>
          <td>
            <div class="font-semibold text-sm">${h.name}</div>
            <div class="text-xs text-muted">${h.area}</div>
          </td>
          <td>${RESOURCES.statusBadge(h.status)}</td>
          <td class="col-num text-sm">${r.icuBeds.available}<span class="text-muted">/${r.icuBeds.total}</span></td>
          <td class="col-num text-sm">${r.emergencyBeds.available}<span class="text-muted">/${r.emergencyBeds.total}</span></td>
          <td class="col-num text-sm">${r.generalBeds.available}<span class="text-muted">/${r.generalBeds.total}</span></td>
          <td class="col-num text-sm">${r.ventilators.available}<span class="text-muted">/${r.ventilators.total}</span></td>
          <td style="font-size:var(--fs-xs);color:var(--color-text-muted)">${TimeUtil.relative(h.lastUpdated)}</td>
        </tr>`;
    }).join('');
  }

  function initMap() {
    if (_map) return; // Already initialized
    const mapEl = document.getElementById('network-map');
    if (!mapEl || typeof L === 'undefined') return;

    _map = L.map('network-map').setView([12.8698, 74.8431], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors', maxZoom: 19
    }).addTo(_map);
  }

  function populateMapMarkers(hospitals) {
    if (!_map || typeof L === 'undefined') return;

    // Clear old markers
    _markers.forEach(m => m.remove());
    _markers = [];

    const statusColors = { NORMAL: '#22C55E', LOW: '#F59E0B', CRITICAL: '#EF4444' };

    // Also add current hospital
    const myHospital = AUTH.getUser()?.hospital;
    const allHospitals = myHospital
      ? [{ ...myHospital, resources: API._mock?.resources?.[myHospital.id] || {} }, ...hospitals]
      : hospitals;

    allHospitals.forEach(h => {
      if (!h.lat || !h.lng) return;
      const color = statusColors[h.status] || '#6B7280';
      const isMe  = h.id === AUTH.getUser()?.hospital?.id;

      const icon = L.divIcon({
        html: `<div style="
          width:${isMe?18:14}px;height:${isMe?18:14}px;
          background:${color};border-radius:50%;
          border:${isMe?'3px solid #0A2540':'2px solid white'};
          box-shadow:0 2px 8px rgba(0,0,0,0.3);
        "></div>`,
        iconSize: [isMe?18:14, isMe?18:14],
        className: ''
      });

      const r = h.resources || {};
      const popup = `
        <div style="font-family:Inter,sans-serif;min-width:180px">
          <div class="map-popup-name">${isMe?'🏥 (Your Hospital) ':''}${h.name}</div>
          <div class="map-popup-area">${h.area}</div>
          <div style="margin-bottom:6px">${RESOURCES.statusBadge(h.status)}</div>
          <div class="map-popup-stats">
            <div class="map-popup-stat">ICU: <span>${r.icuBeds?.available || '—'}/${r.icuBeds?.total || '—'}</span></div>
            <div class="map-popup-stat">Emergency: <span>${r.emergencyBeds?.available || '—'}/${r.emergencyBeds?.total || '—'}</span></div>
            <div class="map-popup-stat">General: <span>${r.generalBeds?.available || '—'}/${r.generalBeds?.total || '—'}</span></div>
            <div class="map-popup-stat">Ventilators: <span>${r.ventilators?.available || '—'}/${r.ventilators?.total || '—'}</span></div>
          </div>
        </div>`;

      const marker = L.marker([h.lat, h.lng], { icon })
        .addTo(_map)
        .bindPopup(popup, { maxWidth: 280 });
      _markers.push(marker);
    });
  }

  return { init };
})();


/* ---- Notifications section ---- */
const CoordNotifications = (() => {
  function init() {
    Notifications.startPolling('notif-list');
  }
  return { init };
})();


/* ---- Analytics section ---- */
const CoordAnalytics = (() => {
  let _chartsBuilt = false;

  async function init() {
    if (_chartsBuilt) return;
    try {
      const data = await API.get(`/hospitals/${AUTH.getUser()?.hospital?.id}/analytics`);
      Analytics.createUtilTrendChart('chart-util-trend', data);
      Analytics.createRequestVolumeChart('chart-req-volume', data);
      Analytics.createStatusBreakdownChart('chart-status-breakdown', data);
      _chartsBuilt = true;
    } catch (err) {
      Toast.error('Analytics Error', err.message);
    }
  }

  return { init };
})();


/* ---- Resource History section ---- */
const CoordHistory = (() => {
  async function init() {
    const hid = AUTH.getUser()?.hospital?.id;
    const loading = document.getElementById('history-loading');
    if (loading) loading.classList.remove('hidden');
    try {
      const data = await API.get(`/hospitals/${hid}/resources/history`);
      renderHistoryTable(data.history || []);
      if (loading) loading.classList.add('hidden');
    } catch (err) {
      if (loading) loading.classList.add('hidden');
      Toast.error('History Error', err.message);
    }
  }

  function renderHistoryTable(history) {
    const container = document.getElementById('history-table-body');
    if (!container) return;
    if (history.length === 0) {
      container.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">No History</div><div class="empty-msg">Resource changes will be logged here.</div></div></td></tr>`;
      return;
    }
    const actionMap = {
      OCCUPIED:    'history-action-occupied',
      TRANSFERRED: 'history-action-transferred',
      RESTOCKED:   'history-action-restocked',
      RESERVED:    'history-action-reserved'
    };
    container.innerHTML = history.map(h => `
      <tr>
        <td><strong class="text-sm">${h.resource}</strong></td>
        <td><span class="history-action-badge ${actionMap[h.action] || ''}">${h.action}</span></td>
        <td class="col-num">${h.previousAvailable} → <strong>${h.newAvailable}</strong></td>
        <td style="font-size:var(--fs-xs)">${h.reason || '—'}</td>
        <td style="font-size:var(--fs-xs)">${h.coordinatorName || '—'}</td>
        <td style="font-size:var(--fs-xs)">${TimeUtil.format(h.timestamp)}</td>
      </tr>`).join('');
  }

  return { init };
})();


/* ---- Emergency Mode section ---- */
const CoordEmergencyMode = (() => {
  async function init() {
    Poller.start('emergency-mode', refresh);
  }

  async function refresh() {
    try {
      const data = await API.get('/emergency-requests');
      const requests = data.requests || [];
      Emergency.renderEmergencyMode(requests, 'emerg-mode-critical-list');
    } catch {}
  }

  return { init };
})();


/* ---- Profile section ---- */
const CoordProfile = (() => {
  function init() {
    const u = AUTH.getUser();
    if (!u) return;
    const fields = {
      'profile-name':     u.name,
      'profile-email':    u.email,
      'profile-hospital': u.hospital?.name,
      'profile-area':     u.hospital?.area,
      'profile-hospital-id': u.hospital?.id,
      'profile-hospital-type': u.hospital?.type,
      'profile-phone':    u.hospital?.phone
    };
    Object.entries(fields).forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val || '—';
    });
    const avatar = document.getElementById('profile-avatar');
    if (avatar) avatar.textContent = (u.name || 'C')[0].toUpperCase();
  }
  return { init };
})();


/* ============================================================
   LOGIN PAGE logic (coordinator-login.html)
   ============================================================ */
async function handleCoordLogin(e) {
  e.preventDefault();
  const form  = e.target;
  const btn   = form.querySelector('[type="submit"]');
  const errEl = document.getElementById('login-error');

  const hospitalId = form.querySelector('#hospital-id').value.trim();
  const email      = form.querySelector('#email').value.trim();
  const password   = form.querySelector('#password').value;

  if (!hospitalId || !email || !password) {
    errEl.textContent = 'All fields are required.';
    errEl.classList.remove('hidden');
    return;
  }

  btn.classList.add('loading'); btn.disabled = true;
  errEl.classList.add('hidden');

  try {
    await AUTH.login('coordinator', { hospitalId, email, password });
    window.location.href = '/coordinator-dashboard.html';
  } catch (err) {
    errEl.textContent = err.message || 'Login failed. Please check your credentials.';
    errEl.classList.remove('hidden');
    btn.classList.remove('loading'); btn.disabled = false;
  }
}


/* ============================================================
   BOOT
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  const isLogin     = document.getElementById('coord-login-form');
  const isDashboard = document.getElementById('coord-dashboard');

  if (isLogin) {
    // Login page
    document.getElementById('coord-login-form').addEventListener('submit', handleCoordLogin);
  }

  if (isDashboard) {
    // Guard auth
    if (!AUTH.requireAuth('coordinator')) return;

    // Start notifications polling (always)
    Notifications.fetchAndRender('notif-list');

    // Wire logout
    document.getElementById('logout-btn')?.addEventListener('click', () => {
      Modal.confirm({
        title: 'Log Out?', message: 'Are you sure you want to log out?',
        icon: '👋', confirmText: 'Log Out', danger: false,
        onConfirm: () => AUTH.logout('coordinator')
      });
    });

    // Wire new request modal
    document.getElementById('btn-new-request')?.addEventListener('click', () => {
      Emergency.populateHospitalSelect('req-target-hospital');
      Emergency.populateResourceSelect('req-resource');
      // Set minimum datetime for required-by
      const dtInput = document.getElementById('req-required-by');
      if (dtInput) dtInput.min = new Date(Date.now() + 60*60*1000).toISOString().slice(0,16);
      Modal.open('modal-new-request');
    });

    document.getElementById('new-request-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      Emergency.submitRequest('new-request-form');
    });

    // Wire resource update modal submit
    document.getElementById('res-modal-submit')?.addEventListener('click', CoordResources.submitUpdate);

    // Wire mark-all-read button
    document.getElementById('btn-mark-all-read')?.addEventListener('click', () => {
      Notifications.markAllRead('notif-list');
    });

    // Emergency mode broadcast button
    document.getElementById('btn-broadcast-emergency')?.addEventListener('click', () => {
      Emergency.populateHospitalSelect('req-target-hospital');
      Emergency.populateResourceSelect('req-resource');
      // Prefill priority to CRITICAL
      const form = document.getElementById('new-request-form');
      if (form) { const p = form.querySelector('[name="priority"]'); if (p) p.value = 'CRITICAL'; }
      Modal.open('modal-new-request');
    });

    // Initialize nav
    CoordNav.init();
  }
});
