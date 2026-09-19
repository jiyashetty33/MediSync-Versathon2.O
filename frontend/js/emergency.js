/* ============================================================
   H4 — notifications.js
   Notification list rendering + polling
   ============================================================ */

const Notifications = (() => {
  let _notifications = [];
  let _onUpdate = null;

  const typeIcons = {
    critical: '🚨', warning: '⚠️', success: '✅', info: 'ℹ️', default: '🔔'
  };

  /* ---- Fetch & render notifications list ---- */
  async function fetchAndRender(containerId) {
    try {
      const data = await API.get('/notifications');
      _notifications = data.notifications || [];
      renderList(containerId);
      updateNavBadge();
    } catch (err) {
      console.error('[Notifications] fetch error:', err);
    }
  }

  function renderList(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const unreadCount = _notifications.filter(n => !n.read).length;

    // Update unread count heading if present
    const heading = document.getElementById('notif-unread-count');
    if (heading) heading.textContent = unreadCount > 0 ? `${unreadCount} unread` : 'All caught up';

    if (_notifications.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🔔</div>
          <div class="empty-title">No Notifications</div>
          <div class="empty-msg">You're all caught up. Notifications will appear here.</div>
        </div>`;
      return;
    }

    container.innerHTML = _notifications.map(n => `
      <div class="notif-item ${n.read ? '' : 'unread'}" id="notif-${n.id}" onclick="Notifications.markRead('${n.id}', '${containerId}')">
        ${!n.read ? '<div class="notif-item-dot"></div>' : '<div style="width:8px;flex-shrink:0"></div>'}
        <div class="notif-item-body">
          <div class="notif-item-title">${typeIcons[n.type] || typeIcons.default} ${n.title}</div>
          <div class="notif-item-msg">${n.message}</div>
        </div>
        <div class="notif-item-time">${TimeUtil.relative(n.createdAt)}</div>
      </div>`).join('');
  }

  async function markRead(notifId, containerId) {
    try {
      await API.post(`/notifications/${notifId}/read`, {});
      const n = _notifications.find(n => n.id === notifId);
      if (n) n.read = true;
      renderList(containerId);
      updateNavBadge();
    } catch {}
  }

  async function markAllRead(containerId) {
    try {
      await API.post('/notifications/read-all', {});
      _notifications.forEach(n => n.read = true);
      renderList(containerId);
      updateNavBadge();
      Toast.success('Done', 'All notifications marked as read');
    } catch (err) {
      Toast.error('Failed', err.message);
    }
  }

  function updateNavBadge() {
    const unread = _notifications.filter(n => !n.read).length;
    const badge  = document.getElementById('notif-nav-badge');
    if (!badge) return;
    if (unread > 0) { badge.textContent = unread; badge.style.display = 'flex'; }
    else            { badge.style.display = 'none'; }
  }

  function startPolling(containerId) {
    Poller.start('notifications', () => fetchAndRender(containerId));
  }

  function stopPolling() { Poller.stop('notifications'); }

  return { fetchAndRender, renderList, markRead, markAllRead, startPolling, stopPolling, updateNavBadge };
})();


/* ============================================================
   H4 — emergency.js
   Emergency request form logic + Emergency Mode
   ============================================================ */

const Emergency = (() => {
  let _hospitals = [];

  /* ---- Load hospital list for form dropdowns ---- */
  async function loadHospitals() {
    try {
      const data = await API.get('/hospitals');
      _hospitals = (data.hospitals || []).filter(h => h.id !== (AUTH.getUser()?.hospital?.id));
    } catch {}
  }

  /* ---- Populate target hospital dropdown ---- */
  function populateHospitalSelect(selectId) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    sel.innerHTML = `<option value="">Broadcast to All Hospitals</option>` +
      _hospitals.map(h => `<option value="${h.id}">${h.name} — ${h.area}</option>`).join('');
  }

  /* ---- Populate resource type dropdown ---- */
  function populateResourceSelect(selectId) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    sel.innerHTML = Object.entries(RESOURCES.RESOURCE_TYPES)
      .map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
  }

  /* ---- Render incoming requests table ---- */
  function renderIncomingTable(requests, containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const incoming = requests.filter(r => r.direction === 'incoming');
    if (incoming.length === 0) {
      el.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div><div class="empty-title">No Incoming Requests</div><div class="empty-msg">No hospitals have requested resources from you right now.</div></div>`;
      return;
    }
    el.innerHTML = `
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Request ID</th><th>From Hospital</th><th>Resource</th>
              <th>Qty</th><th>Priority</th><th>Required By</th>
              <th>Status</th><th class="col-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${incoming.map(r => `
              <tr>
                <td><code style="font-size:var(--fs-xs);color:var(--color-text-muted)">${r.id}</code></td>
                <td>
                  <div class="font-semibold" style="font-size:var(--fs-sm)">${r.requestingHospital}</div>
                  <div style="font-size:var(--fs-xs);color:var(--color-text-muted)">${r.reason.substring(0,50)}${r.reason.length>50?'…':''}</div>
                </td>
                <td>${RESOURCES.RESOURCE_TYPES[r.resource]?.label || r.resourceLabel}</td>
                <td class="col-num font-bold">${r.quantity}</td>
                <td>${RESOURCES.priorityBadge(r.priority)}</td>
                <td style="font-size:var(--fs-xs)">${TimeUtil.countdown(r.requiredBy)}</td>
                <td>${RESOURCES.reqStatusBadge(r.status)}</td>
                <td class="col-actions">
                  ${(!['FULFILLED','REJECTED','CANCELLED','EXPIRED'].includes(r.status)) ? `
                    <button class="btn btn-sm btn-success" onclick="Emergency.respondToRequest('${r.id}','accept')">✓ Accept</button>
                    <button class="btn btn-sm btn-danger" style="margin-left:4px" onclick="Emergency.respondToRequest('${r.id}','reject')">✗ Reject</button>
                  ` : '<span class="text-muted text-xs">—</span>'}
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  /* ---- Render outgoing requests table ---- */
  function renderOutgoingTable(requests, containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const outgoing = requests.filter(r => r.direction === 'outgoing');
    if (outgoing.length === 0) {
      el.innerHTML = `<div class="empty-state"><div class="empty-icon">📤</div><div class="empty-title">No Outgoing Requests</div><div class="empty-msg">Create a new request to ask the network for resources.</div></div>`;
      return;
    }
    el.innerHTML = `
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Request ID</th><th>Sent To</th><th>Resource</th>
              <th>Qty</th><th>Priority</th><th>Required By</th>
              <th>Status</th><th>Created</th>
            </tr>
          </thead>
          <tbody>
            ${outgoing.map(r => `
              <tr>
                <td><code style="font-size:var(--fs-xs);color:var(--color-text-muted)">${r.id}</code></td>
                <td>
                  <div class="font-semibold" style="font-size:var(--fs-sm)">${r.requestedHospital || 'Network Broadcast'}</div>
                  <div style="font-size:var(--fs-xs);color:var(--color-text-muted)">${r.reason.substring(0,50)}${r.reason.length>50?'…':''}</div>
                </td>
                <td>${RESOURCES.RESOURCE_TYPES[r.resource]?.label || r.resourceLabel}</td>
                <td class="col-num font-bold">${r.quantity}</td>
                <td>${RESOURCES.priorityBadge(r.priority)}</td>
                <td style="font-size:var(--fs-xs)">${TimeUtil.countdown(r.requiredBy)}</td>
                <td>${RESOURCES.reqStatusBadge(r.status)}</td>
                <td style="font-size:var(--fs-xs)">${TimeUtil.relative(r.createdAt)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  /* ---- Respond to incoming request ---- */
  async function respondToRequest(requestId, action) {
    const label = action === 'accept' ? 'Accept' : 'Reject';
    Modal.confirm({
      title: `${label} Request?`,
      message: action === 'accept'
        ? 'You are confirming that you can fulfill this resource request. This will notify the requesting hospital.'
        : 'You are declining this resource request. The requesting hospital will be notified.',
      icon: action === 'accept' ? '✅' : '❌',
      confirmText: label,
      danger: action === 'reject',
      onConfirm: async () => {
        try {
          await API.post(`/emergency-requests/${requestId}/respond`, { action });
          Toast.success('Done', `Request ${action === 'accept' ? 'accepted' : 'rejected'} successfully`);
          // Refresh the requests section
          if (typeof CoordEmergency !== 'undefined') CoordEmergency.refresh();
        } catch (err) {
          Toast.error('Failed', err.message);
        }
      }
    });
  }

  /* ---- Submit new emergency request ---- */
  async function submitRequest(formId) {
    const form = document.getElementById(formId);
    if (!form) return;

    const resourceKey = form.querySelector('[name="resource"]').value;
    const body = {
      targetHospitalId: form.querySelector('[name="targetHospital"]').value || null,
      targetHospital:   form.querySelector('[name="targetHospital"]').selectedOptions[0]?.text || null,
      resource:         resourceKey,
      resourceLabel:    RESOURCES.RESOURCE_TYPES[resourceKey]?.label || resourceKey,
      quantity:         parseInt(form.querySelector('[name="quantity"]').value, 10),
      priority:         form.querySelector('[name="priority"]').value,
      reason:           form.querySelector('[name="reason"]').value,
      requiredBy:       form.querySelector('[name="requiredBy"]').value
    };

    // Validate
    const errors = [];
    if (!body.resource)           errors.push('Resource type is required');
    if (!body.quantity || body.quantity < 1) errors.push('Quantity must be at least 1');
    if (!body.priority)           errors.push('Priority is required');
    if (!body.reason.trim())      errors.push('Reason is required');
    if (!body.requiredBy)         errors.push('Required-by time is required');

    if (errors.length) { Toast.error('Validation Error', errors[0]); return; }

    const btn = form.querySelector('[type="submit"]');
    if (btn) { btn.classList.add('loading'); btn.disabled = true; }

    try {
      await API.post('/emergency-requests', body);
      Toast.success('Request Sent', 'Your emergency resource request has been broadcast to the network');
      form.reset();
      Modal.close('modal-new-request');
      if (typeof CoordEmergency !== 'undefined') CoordEmergency.refresh();
    } catch (err) {
      Toast.error('Failed to send request', err.message);
    } finally {
      if (btn) { btn.classList.remove('loading'); btn.disabled = false; }
    }
  }

  /* ---- Emergency Mode — critical request list ---- */
  function renderEmergencyMode(requests, containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const critical = requests.filter(r => r.priority === 'CRITICAL' && !['FULFILLED','CANCELLED','EXPIRED'].includes(r.status));
    if (critical.length === 0) {
      el.innerHTML = `<div class="empty-state" style="color:#fff;opacity:0.7"><div class="empty-icon">✅</div><div class="empty-title" style="color:#fff">No Critical Requests</div><div class="empty-msg" style="color:rgba(255,255,255,0.6)">There are no active critical resource requests right now.</div></div>`;
      return;
    }
    el.innerHTML = critical.map(r => `
      <div class="emerg-request-card" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:var(--r-xl);padding:var(--sp-5);margin-bottom:var(--sp-4)">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:var(--sp-3);flex-wrap:wrap">
          <div>
            <div style="font-weight:700;font-size:var(--fs-lg);color:#fff">${r.requestingHospital}</div>
            <div style="font-size:var(--fs-sm);color:rgba(255,255,255,0.6);margin-top:2px">${RESOURCES.RESOURCE_TYPES[r.resource]?.label} × ${r.quantity}</div>
          </div>
          <div style="text-align:right">
            ${RESOURCES.priorityBadge(r.priority)}
            <div style="font-size:var(--fs-xs);color:rgba(255,255,255,0.5);margin-top:4px">${TimeUtil.countdown(r.requiredBy)}</div>
          </div>
        </div>
        <div style="font-size:var(--fs-sm);color:rgba(255,255,255,0.75);margin-top:var(--sp-3);padding-top:var(--sp-3);border-top:1px solid rgba(255,255,255,0.1)">${r.reason}</div>
        ${r.direction === 'incoming' ? `
          <div style="margin-top:var(--sp-4);display:flex;gap:var(--sp-3)">
            <button class="btn btn-success btn-sm" onclick="Emergency.respondToRequest('${r.id}','accept')">✓ Accept Request</button>
            <button class="btn btn-danger btn-sm" onclick="Emergency.respondToRequest('${r.id}','reject')">✗ Reject</button>
          </div>` : ''}
      </div>`).join('');
  }

  return {
    loadHospitals, populateHospitalSelect, populateResourceSelect,
    renderIncomingTable, renderOutgoingTable, respondToRequest,
    submitRequest, renderEmergencyMode
  };
})();
