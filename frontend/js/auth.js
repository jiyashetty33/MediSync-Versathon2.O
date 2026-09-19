/* ============================================================
   H4 — auth.js
   Login, logout, token/session storage, auth guards
   ============================================================ */

const AUTH = (() => {
  const TOKEN_KEY  = 'h4_token';
  const USER_KEY   = 'h4_user';
  const PORTAL_KEY = 'h4_portal';

  /* ---- Storage helpers ---- */
  function setToken(token)   { localStorage.setItem(TOKEN_KEY, token); }
  function getToken()        { return localStorage.getItem(TOKEN_KEY); }
  function setUser(user)     { localStorage.setItem(USER_KEY, JSON.stringify(user)); }
  function getUser()         { try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; } }
  function setPortal(portal) { localStorage.setItem(PORTAL_KEY, portal); }
  function getPortal()       { return localStorage.getItem(PORTAL_KEY); }
  function clear()           { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); localStorage.removeItem(PORTAL_KEY); }
  function isLoggedIn()      { return !!getToken(); }

  /* ---- Auth guard: call at top of each dashboard page ---- */
  function requireAuth(expectedPortal) {
    if (!isLoggedIn() || getPortal() !== expectedPortal) {
      window.location.href = `/${expectedPortal}-login.html`;
      return false;
    }
    return true;
  }

  /* ---- Login handler (called from login page forms) ---- */
  async function login(portal, credentials) {
    const endpoint = `/auth/${portal}/login`;
    const data = await API.post(endpoint, credentials);
    if (data && data.token) {
      setToken(data.token);
      setUser(data.user);
      setPortal(portal);
      return data.user;
    }
    throw new Error('Login failed — no token received');
  }

  /* ---- Logout ---- */
  async function logout(portal) {
    try { await API.post('/auth/logout', {}); } catch {}
    clear();
    window.location.href = `/${portal || getPortal() || 'coordinator'}-login.html`;
  }

  return { setToken, getToken, setUser, getUser, setPortal, getPortal, clear, isLoggedIn, requireAuth, login, logout };
})();


/* ============================================================
   H4 — Toast notification system (global, used everywhere)
   ============================================================ */
const Toast = (() => {
  function show(type, title, message, duration = 4000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.innerHTML = `
      <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
      <div class="toast-body">
        <div class="toast-title">${title}</div>
        ${message ? `<div class="toast-msg">${message}</div>` : ''}
      </div>
    `;
    container.appendChild(t);

    setTimeout(() => {
      t.classList.add('removing');
      setTimeout(() => t.remove(), 320);
    }, duration);
  }

  return {
    success: (title, msg, dur)  => show('success', title, msg, dur),
    error:   (title, msg, dur)  => show('error',   title, msg, dur),
    warning: (title, msg, dur)  => show('warning', title, msg, dur),
    info:    (title, msg, dur)  => show('info',    title, msg, dur)
  };
})();


/* ============================================================
   H4 — Modal utility (global)
   ============================================================ */
const Modal = (() => {
  function open(id) {
    const el = document.getElementById(id);
    if (el) { el.classList.remove('hidden'); el.style.display = 'flex'; }
  }
  function close(id) {
    const el = document.getElementById(id);
    if (el) { el.classList.add('hidden'); el.style.display = 'none'; }
  }
  function confirm({ title, message, icon = '⚠️', confirmText = 'Confirm', danger = false, onConfirm }) {
    // Use the shared confirm modal
    const modal = document.getElementById('modal-confirm');
    if (!modal) return;
    modal.querySelector('.confirm-icon').textContent  = icon;
    modal.querySelector('.confirm-title').textContent = title;
    modal.querySelector('.confirm-msg').textContent   = message;
    const btn = modal.querySelector('#confirm-ok-btn');
    btn.textContent = confirmText;
    btn.className   = `btn ${danger ? 'btn-danger' : 'btn-primary'}`;
    // Clone to remove old listeners
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', () => { close('modal-confirm'); onConfirm && onConfirm(); });
    open('modal-confirm');
  }
  // Close on overlay click
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
      e.target.classList.add('hidden');
      e.target.style.display = 'none';
    }
    if (e.target.classList.contains('modal-close') || e.target.closest('.modal-close')) {
      const overlay = e.target.closest('.modal-overlay');
      if (overlay) { overlay.classList.add('hidden'); overlay.style.display = 'none'; }
    }
  });
  // ESC key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay:not(.hidden)').forEach(el => {
        el.classList.add('hidden'); el.style.display = 'none';
      });
    }
  });

  return { open, close, confirm };
})();


/* ============================================================
   H4 — Polling manager
   ============================================================ */
const Poller = (() => {
  const timers = {};

  function start(key, fn, interval = API.POLL_DELAY) {
    stop(key);
    fn(); // fire immediately
    timers[key] = setInterval(() => {
      if (!document.hidden) fn();
    }, interval);
  }

  function stop(key) {
    if (timers[key]) { clearInterval(timers[key]); delete timers[key]; }
  }

  function stopAll() { Object.keys(timers).forEach(stop); }

  return { start, stop, stopAll };
})();


/* ============================================================
   H4 — Time formatter
   ============================================================ */
const TimeUtil = {
  relative(isoStr) {
    const diff = Date.now() - new Date(isoStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1)  return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)  return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  },
  format(isoStr) {
    return new Date(isoStr).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true
    });
  },
  formatDate(isoStr) {
    return new Date(isoStr).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric'
    });
  },
  countdown(isoStr) {
    const diff = new Date(isoStr).getTime() - Date.now();
    if (diff <= 0) return 'Overdue';
    const hrs  = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    if (hrs > 0) return `${hrs}h ${mins}m remaining`;
    return `${mins}m remaining`;
  }
};
