/* ============================================================
   H4 — resources.js
   Single source of truth for all status/priority/badge configs
   ============================================================ */

const RESOURCES = (() => {

  /* ---- Resource type metadata ---- */
  const RESOURCE_TYPES = {
    generalBeds:    { label: 'General Beds',     icon: '🛏️',  iconBg: 'icon-bg-blue'   },
    icuBeds:        { label: 'ICU Beds',          icon: '🫀',  iconBg: 'icon-bg-red'    },
    emergencyBeds:  { label: 'Emergency Beds',    icon: '🚨',  iconBg: 'icon-bg-amber'  },
    isolationBeds:  { label: 'Isolation Beds',    icon: '🦠',  iconBg: 'icon-bg-purple' },
    ventilators:    { label: 'Ventilators',       icon: '🫁',  iconBg: 'icon-bg-cyan'   },
    bloodInventory: { label: 'Blood Inventory',   icon: '🩸',  iconBg: 'icon-bg-red'    }
  };

  /* ---- Hospital / Resource Status ---- */
  const STATUS_CONFIG = {
    NORMAL:   { label: 'Normal',   cls: 'badge-normal',   dot: 'normal',   threshold: 30 },
    LOW:      { label: 'Low',      cls: 'badge-low',      dot: 'low',      threshold: 15 },
    CRITICAL: { label: 'Critical', cls: 'badge-critical', dot: 'critical', threshold: 0  }
  };

  /* ---- Request Priority ---- */
  const PRIORITY_CONFIG = {
    LOW:      { label: 'Low',      cls: 'badge-p-low'      },
    MEDIUM:   { label: 'Medium',   cls: 'badge-p-medium'   },
    HIGH:     { label: 'High',     cls: 'badge-p-high'     },
    CRITICAL: { label: 'Critical', cls: 'badge-p-critical' }
  };

  /* ---- Request Status ---- */
  const REQUEST_STATUS_CONFIG = {
    PENDING:   { label: 'Pending',   cls: 'badge-s-pending',   terminal: false },
    SEARCHING: { label: 'Searching', cls: 'badge-s-searching', terminal: false },
    SENT:      { label: 'Sent',      cls: 'badge-s-sent',      terminal: false },
    ACCEPTED:  { label: 'Accepted',  cls: 'badge-s-accepted',  terminal: false },
    REJECTED:  { label: 'Rejected',  cls: 'badge-s-rejected',  terminal: true  },
    FULFILLED: { label: 'Fulfilled', cls: 'badge-s-fulfilled', terminal: true  },
    CANCELLED: { label: 'Cancelled', cls: 'badge-s-cancelled', terminal: true  },
    EXPIRED:   { label: 'Expired',   cls: 'badge-s-expired',   terminal: true  }
  };

  /* ---- Compute resource status from available/total ---- */
  function computeStatus(available, total) {
    if (total === 0) return 'NORMAL';
    const pct = (available / total) * 100;
    if (pct <= 10) return 'CRITICAL';
    if (pct <= 25) return 'LOW';
    return 'NORMAL';
  }

  /* ---- Compute utilization % ---- */
  function utilPct(resource) {
    if (!resource || resource.total === 0) return 0;
    return Math.round(((resource.total - resource.available) / resource.total) * 100);
  }

  /* ---- Render badge HTML ---- */
  function statusBadge(status) {
    const cfg = STATUS_CONFIG[status] || STATUS_CONFIG['NORMAL'];
    return `<span class="badge ${cfg.cls}">${cfg.label}</span>`;
  }

  function priorityBadge(priority) {
    const cfg = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG['MEDIUM'];
    return `<span class="badge ${cfg.cls}">${cfg.label}</span>`;
  }

  function reqStatusBadge(status) {
    const cfg = REQUEST_STATUS_CONFIG[status] || REQUEST_STATUS_CONFIG['PENDING'];
    return `<span class="badge ${cfg.cls}">${cfg.label}</span>`;
  }

  function statusDot(status) {
    const s = (status || 'NORMAL').toLowerCase();
    return `<span class="status-dot ${s}"></span>`;
  }

  /* ---- Render utilization bar ---- */
  function utilBar(available, total) {
    const pct    = total ? Math.round(((total - available) / total) * 100) : 0;
    const status = computeStatus(available, total).toLowerCase();
    return `
      <div class="util-bar-wrap">
        <div class="util-bar-labels">
          <span>Utilization</span><span>${pct}%</span>
        </div>
        <div class="util-bar">
          <div class="util-fill ${status}" style="width:${pct}%"></div>
        </div>
      </div>`;
  }

  /* ---- Build a full resource card ---- */
  function buildResourceCard(key, data, hospitalId, editable = false) {
    const meta   = RESOURCE_TYPES[key] || { label: key, icon: '📦', iconBg: 'icon-bg-blue' };
    const status = computeStatus(data.available, data.total);
    const pct    = utilPct(data);

    return `
      <div class="res-card ${status.toLowerCase()}" id="rc-${key}">
        <div class="res-card-icon ${meta.iconBg}">${meta.icon}</div>
        <div class="res-card-label">${meta.label}</div>
        <div class="res-card-value">${data.available}</div>
        <div class="res-card-subtitle">of ${data.total} available</div>
        <div class="res-card-stats">
          <div class="res-stat"><div class="res-stat-val">${data.occupied}</div><div class="res-stat-lbl">Occupied</div></div>
          <div class="res-stat"><div class="res-stat-val">${data.reserved}</div><div class="res-stat-lbl">Reserved</div></div>
          <div class="res-stat"><div class="res-stat-val">${pct}%</div><div class="res-stat-lbl">Used</div></div>
        </div>
        ${utilBar(data.available, data.total)}
        <div class="res-card-footer">
          ${statusBadge(status)}
          ${editable ? `<button class="btn btn-sm btn-secondary" onclick="CoordResources.openEditModal('${key}','${hospitalId}')">✏️ Update</button>` : ''}
        </div>
      </div>`;
  }

  /* ---- Compute overall hospital status from resources object ---- */
  function hospitalStatus(resources) {
    const statuses = Object.values(resources).map(r => computeStatus(r.available, r.total));
    if (statuses.includes('CRITICAL')) return 'CRITICAL';
    if (statuses.includes('LOW'))      return 'LOW';
    return 'NORMAL';
  }

  return {
    RESOURCE_TYPES, STATUS_CONFIG, PRIORITY_CONFIG, REQUEST_STATUS_CONFIG,
    computeStatus, utilPct, statusBadge, priorityBadge, reqStatusBadge,
    statusDot, utilBar, buildResourceCard, hospitalStatus
  };
})();
