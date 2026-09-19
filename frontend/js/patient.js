/* ============================================================
   H4 — patient.js
   Patient portal: nearby hospitals, map, my requests, profile
   ============================================================ */

/* ---- Nav routing ---- */
const PatientNav = (() => {
  const SECTIONS = {
    overview:   { title: 'Nearby Hospitals',  subtitle: 'Find hospitals near you' },
    requests:   { title: 'My Requests',       subtitle: 'Track your resource & emergency requests' },
    profile:    { title: 'Profile',           subtitle: 'Your account information' }
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
      case 'overview': PatientOverview.init(); break;
      case 'requests': PatientRequests.init(); break;
      case 'profile':  PatientProfile.init();  break;
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


/* ---- Overview section: map + nearby hospitals ---- */
const PatientOverview = (() => {
  let _map      = null;
  let _markers  = [];
  let _hospitals = [];

  async function init() {
    const user = AUTH.getUser();
    const avatar = document.getElementById('sidebar-avatar');
    if (avatar) avatar.textContent = (user?.name || 'P')[0];
    const nameEl = document.getElementById('sidebar-user-name');
    if (nameEl) nameEl.textContent = user?.name || '';

    const banner = document.getElementById('location-banner');
    if (banner) banner.classList.remove('hidden');

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          if (banner) banner.classList.add('hidden');
          loadNearbyHospitals(pos.coords.latitude, pos.coords.longitude);
        },
        _err => {
          if (banner) banner.classList.add('hidden');
          // Fallback: Mangalore center
          loadNearbyHospitals(12.8698, 74.8431);
          Toast.warning('Location Unavailable', 'Showing hospitals near Mangalore city center');
        },
        { timeout: 8000, enableHighAccuracy: false }
      );
    } else {
      if (banner) banner.classList.add('hidden');
      loadNearbyHospitals(12.8698, 74.8431);
    }
  }

  async function loadNearbyHospitals(lat, lng) {
    const listEl    = document.getElementById('hospitals-list');
    const countEl   = document.getElementById('hospitals-count');
    if (listEl) listEl.innerHTML = `<div class="loading-state"><div class="spinner"></div><span>Finding nearby hospitals…</span></div>`;

    try {
      const data = await API.get(`/hospitals/nearby?lat=${lat}&lng=${lng}&radius=20`);
      _hospitals = data.hospitals || [];

      if (countEl) countEl.textContent = `${_hospitals.length} hospitals found`;

      renderHospitalCards(_hospitals, listEl);
      initMap(lat, lng, _hospitals);
    } catch (err) {
      if (listEl) listEl.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><div class="empty-title">Could Not Load</div><div class="empty-msg">${err.message}</div></div>`;
    }
  }

  function renderHospitalCards(hospitals, container) {
    if (!container) return;
    if (hospitals.length === 0) {
      container.innerHTML = `<div class="empty-state"><div class="empty-icon">🏥</div><div class="empty-title">No Hospitals Found</div><div class="empty-msg">No hospitals found within the search radius.</div></div>`;
      return;
    }
    container.innerHTML = hospitals.map(h => {
      const r      = h.resources;
      const status = RESOURCES.hospitalStatus(r);
      return `
        <div class="nearby-hospital-card ${status.toLowerCase()}" onclick="PatientOverview.focusHospital('${h.id}')">
          <div class="nearby-hospital-top">
            <div>
              <div class="nearby-hospital-name">${h.name}</div>
              <div class="nearby-hospital-area">📍 ${h.area}</div>
              <div class="nearby-hospital-type">${h.type}</div>
            </div>
            ${RESOURCES.statusBadge(status)}
          </div>
          <div class="nearby-hospital-resources">
            <div class="nearby-res-item">
              <div class="nearby-res-val">${r.icuBeds.available}</div>
              <div class="nearby-res-lbl">ICU Beds</div>
            </div>
            <div class="nearby-res-item">
              <div class="nearby-res-val">${r.emergencyBeds.available}</div>
              <div class="nearby-res-lbl">Emergency</div>
            </div>
            <div class="nearby-res-item">
              <div class="nearby-res-val">${r.generalBeds.available}</div>
              <div class="nearby-res-lbl">General</div>
            </div>
          </div>
          <div style="margin-top:var(--sp-3);display:flex;gap:var(--sp-2);align-items:center">
            <span class="text-xs text-muted">📞 ${h.phone || '—'}</span>
            <span style="margin-left:auto;font-size:var(--fs-xs);color:var(--color-text-muted)">Updated ${TimeUtil.relative(h.lastUpdated)}</span>
          </div>
        </div>`;
    }).join('');
  }

  function initMap(lat, lng, hospitals) {
    const mapEl = document.getElementById('patient-map');
    if (!mapEl || typeof L === 'undefined') return;

    if (_map) { _map.setView([lat, lng], 12); updateMarkers(hospitals); return; }

    _map = L.map('patient-map').setView([lat, lng], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors', maxZoom: 19
    }).addTo(_map);

    // User location marker
    L.marker([lat, lng], {
      icon: L.divIcon({
        html: `<div style="width:16px;height:16px;background:#6366F1;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3)"></div>`,
        iconSize: [16,16], className: ''
      })
    }).addTo(_map).bindPopup('<div style="font-weight:700;font-family:Inter,sans-serif">📍 Your Location</div>');

    updateMarkers(hospitals);
  }

  function updateMarkers(hospitals) {
    if (!_map) return;
    _markers.forEach(m => m.remove()); _markers = [];
    const colors = { NORMAL: '#22C55E', LOW: '#F59E0B', CRITICAL: '#EF4444' };
    hospitals.forEach(h => {
      if (!h.lat || !h.lng) return;
      const status = RESOURCES.hospitalStatus(h.resources);
      const color  = colors[status];
      const icon   = L.divIcon({
        html: `<div style="width:14px;height:14px;background:${color};border-radius:50%;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.25)"></div>`,
        iconSize: [14,14], className: ''
      });
      const r = h.resources;
      const popup = `
        <div style="font-family:Inter,sans-serif;min-width:160px">
          <div style="font-weight:700;margin-bottom:4px">${h.name}</div>
          <div style="font-size:12px;color:#64748b;margin-bottom:8px">${h.area}</div>
          <div style="font-size:12px">ICU: <b>${r.icuBeds.available}/${r.icuBeds.total}</b> · Emergency: <b>${r.emergencyBeds.available}/${r.emergencyBeds.total}</b></div>
          <div style="font-size:12px;margin-top:4px">General: <b>${r.generalBeds.available}/${r.generalBeds.total}</b></div>
        </div>`;
      const marker = L.marker([h.lat, h.lng], { icon }).addTo(_map).bindPopup(popup);
      _markers.push(marker);
    });
  }

  function focusHospital(hospitalId) {
    const h = _hospitals.find(h => h.id === hospitalId);
    if (h && _map) {
      _map.setView([h.lat, h.lng], 15);
      _markers.find((m, i) => {
        const hosp = _hospitals[i];
        return hosp && hosp.id === hospitalId;
      })?.openPopup();
    }
  }

  return { init, focusHospital };
})();


/* ---- My Requests section ---- */
const PatientRequests = (() => {
  const icons = {
    'Emergency Bed': '🛏️', 'ICU Bed': '🫀', 'Ambulance': '🚑',
    'General Bed': '🛏️', 'Blood': '🩸', 'Ventilator': '🫁'
  };

  function init() {
    Poller.start('patient-requests', refresh);
  }

  async function refresh() {
    try {
      const data = await API.get('/patient/requests');
      renderRequests(data.requests || []);
    } catch (err) {
      console.error('[PatientRequests] Error:', err);
    }
  }

  function renderRequests(requests) {
    const container = document.getElementById('patient-requests-list');
    if (!container) return;
    if (requests.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📋</div>
          <div class="empty-title">No Requests Yet</div>
          <div class="empty-msg">Submit a request for a hospital bed, ambulance, or other resource.</div>
          <button class="btn btn-primary" style="margin-top:var(--sp-5)" onclick="PatientRequests.openNewRequestModal()">➕ New Request</button>
        </div>`;
      return;
    }
    container.innerHTML = requests.map(r => `
      <div class="patient-request-card">
        <div class="patient-request-icon">${icons[r.resource] || '🏥'}</div>
        <div class="patient-request-body">
          <div class="patient-request-type">${r.resource}</div>
          <div class="patient-request-hospital">${r.hospital ? `Requested from ${r.hospital}` : 'Broadcast to network'}</div>
          <div class="patient-request-meta">
            ${RESOURCES.priorityBadge(r.priority)}
            ${RESOURCES.reqStatusBadge(r.status)}
            <span class="text-xs text-muted">${TimeUtil.relative(r.createdAt)}</span>
          </div>
        </div>
      </div>`).join('');
  }

  function openNewRequestModal() {
    Modal.open('modal-patient-request');
  }

  async function submitRequest(e) {
    e.preventDefault();
    const form = e.target;
    const body = {
      resource: form.querySelector('[name="resource"]').value,
      priority: form.querySelector('[name="priority"]').value,
      notes:    form.querySelector('[name="notes"]').value,
      hospital: null
    };
    if (!body.resource) { Toast.error('Required', 'Please select a resource type'); return; }
    const btn = form.querySelector('[type="submit"]');
    if (btn) { btn.classList.add('loading'); btn.disabled = true; }
    try {
      await API.post('/patient/requests', body);
      Toast.success('Request Submitted', 'Your request has been sent to the hospital network');
      form.reset(); Modal.close('modal-patient-request');
      refresh();
    } catch (err) {
      Toast.error('Submission Failed', err.message);
    } finally {
      if (btn) { btn.classList.remove('loading'); btn.disabled = false; }
    }
  }

  return { init, openNewRequestModal, submitRequest };
})();


/* ---- Profile section ---- */
const PatientProfile = (() => {
  function init() {
    const u = AUTH.getUser();
    if (!u) return;
    const fields = {
      'patient-profile-name':  u.name,
      'patient-profile-email': u.email,
      'patient-profile-phone': u.phone,
      'patient-profile-dob':   u.dob ? TimeUtil.formatDate(u.dob) : '—',
      'patient-profile-blood': u.bloodGroup
    };
    Object.entries(fields).forEach(([id, val]) => {
      const el = document.getElementById(id); if (el) el.textContent = val || '—';
    });
    const avatar = document.getElementById('patient-profile-avatar');
    if (avatar) avatar.textContent = (u.name || 'P')[0].toUpperCase();
  }
  return { init };
})();


/* ============================================================
   LOGIN PAGE
   ============================================================ */
async function handlePatientLogin(e) {
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
    await AUTH.login('patient', { email, password: pass });
    window.location.href = '/patient-dashboard.html';
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
  const isLogin     = document.getElementById('patient-login-form');
  const isDashboard = document.getElementById('patient-dashboard');

  if (isLogin) {
    document.getElementById('patient-login-form').addEventListener('submit', handlePatientLogin);
  }

  if (isDashboard) {
    if (!AUTH.requireAuth('patient')) return;

    document.getElementById('logout-btn')?.addEventListener('click', () => AUTH.logout('patient'));

    document.getElementById('btn-new-request')?.addEventListener('click', () => PatientRequests.openNewRequestModal());

    document.getElementById('patient-request-form')?.addEventListener('submit', PatientRequests.submitRequest);

    const toggle  = document.getElementById('sidebar-toggle');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    if (toggle) toggle.addEventListener('click', () => {
      sidebar.classList.toggle('open'); overlay?.classList.toggle('visible');
    });
    if (overlay) overlay.addEventListener('click', () => {
      sidebar.classList.remove('open'); overlay.classList.remove('visible');
    });

    PatientNav.init();
  }
});
