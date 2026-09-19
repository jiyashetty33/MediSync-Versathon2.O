/* ============================================================
   H4 — api.js
   Centralized fetch wrapper + DEMO MODE mock data
   ============================================================ */

const API = (() => {
  /* ---- Config ---- */
  const BASE_URL   = 'http://localhost:5000/api';
  const DEMO_MODE  = false;  // Backend is live
  const POLL_DELAY = 5000;   // ms

  /* ------------------------------------------------------------------
     MOCK DATA — realistic Mangalore hospital network
     ------------------------------------------------------------------ */
  const MOCK = {
    coordinator: {
      id: 'C001', name: 'Dr. Priya Shetty',
      email: 'priya.shetty@kmchospital.in',
      hospital: {
        id: 'H001', name: 'KMC Hospital', area: 'Attavar, Mangalore',
        lat: 12.8698, lng: 74.8431, status: 'LOW',
        phone: '+91-824-2445858', type: 'Multi-Specialty'
      }
    },
    patient: {
      id: 'P001', name: 'Ramesh Kumar', email: 'ramesh@gmail.com',
      phone: '+91-9876543210', dob: '1985-06-15', bloodGroup: 'B+'
    },
    admin: { id: 'A001', name: 'Admin User', email: 'admin@h4network.in', role: 'Network Admin' },

    resources: {
      H001: {
        generalBeds:   { total: 200, available: 52, occupied: 132, reserved: 16 },
        icuBeds:       { total: 30,  available: 4,  occupied: 23,  reserved: 3  },
        emergencyBeds: { total: 20,  available: 3,  occupied: 15,  reserved: 2  },
        isolationBeds: { total: 15,  available: 11, occupied: 3,   reserved: 1  },
        ventilators:   { total: 20,  available: 4,  occupied: 13,  reserved: 3  },
        bloodInventory:{ total: 60,  available: 38, occupied: 0,   reserved: 12 }
      }
    },

    hospitals: [
      {
        id: 'H001', name: 'KMC Hospital', area: 'Attavar, Mangalore',
        lat: 12.8698, lng: 74.8431, status: 'LOW', type: 'Multi-Specialty',
        phone: '+91-824-2445858', lastUpdated: new Date(Date.now()-120000).toISOString(),
        resources: {
          generalBeds:   { total: 200, available: 52, occupied: 132, reserved: 16 },
          icuBeds:       { total: 30,  available: 4,  occupied: 23,  reserved: 3  },
          emergencyBeds: { total: 20,  available: 3,  occupied: 15,  reserved: 2  },
          isolationBeds: { total: 15,  available: 11, occupied: 3,   reserved: 1  },
          ventilators:   { total: 20,  available: 4,  occupied: 13,  reserved: 3  },
          bloodInventory:{ total: 60,  available: 38, occupied: 0,   reserved: 12 }
        }
      },
      {
        id: 'H002', name: 'Wenlock District Hospital', area: 'Hampankatta, Mangalore',
        lat: 12.8729, lng: 74.8407, status: 'CRITICAL', type: 'Government',
        phone: '+91-824-2425888', lastUpdated: new Date(Date.now()-300000).toISOString(),
        resources: {
          generalBeds:   { total: 300, available: 12, occupied: 278, reserved: 10 },
          icuBeds:       { total: 40,  available: 1,  occupied: 37,  reserved: 2  },
          emergencyBeds: { total: 25,  available: 2,  occupied: 21,  reserved: 2  },
          isolationBeds: { total: 20,  available: 8,  occupied: 10,  reserved: 2  },
          ventilators:   { total: 25,  available: 2,  occupied: 21,  reserved: 2  },
          bloodInventory:{ total: 40,  available: 5,  occupied: 0,   reserved: 15 }
        }
      },
      {
        id: 'H003', name: 'AJ Hospital & Research Centre', area: 'Kuntikan, Mangalore',
        lat: 12.8542, lng: 74.8401, status: 'NORMAL', type: 'Multi-Specialty',
        phone: '+91-824-2225533', lastUpdated: new Date(Date.now()-60000).toISOString(),
        resources: {
          generalBeds:   { total: 350, available: 148, occupied: 178, reserved: 24 },
          icuBeds:       { total: 50,  available: 22,  occupied: 24,  reserved: 4  },
          emergencyBeds: { total: 30,  available: 14,  occupied: 13,  reserved: 3  },
          isolationBeds: { total: 25,  available: 19,  occupied: 4,   reserved: 2  },
          ventilators:   { total: 30,  available: 14,  occupied: 12,  reserved: 4  },
          bloodInventory:{ total: 80,  available: 65,  occupied: 0,   reserved: 10 }
        }
      },
      {
        id: 'H004', name: 'Father Muller Medical College', area: 'Kankanady, Mangalore',
        lat: 12.8981, lng: 74.8467, status: 'NORMAL', type: 'Medical College',
        phone: '+91-824-2238000', lastUpdated: new Date(Date.now()-90000).toISOString(),
        resources: {
          generalBeds:   { total: 400, available: 210, occupied: 162, reserved: 28 },
          icuBeds:       { total: 60,  available: 28,  occupied: 27,  reserved: 5  },
          emergencyBeds: { total: 35,  available: 18,  occupied: 14,  reserved: 3  },
          isolationBeds: { total: 30,  available: 22,  occupied: 6,   reserved: 2  },
          ventilators:   { total: 35,  available: 19,  occupied: 12,  reserved: 4  },
          bloodInventory:{ total: 100, available: 74,  occupied: 0,   reserved: 18 }
        }
      },
      {
        id: 'H005', name: 'Yenepoya Medical College', area: 'Deralakatte, Mangalore',
        lat: 12.8287, lng: 74.9232, status: 'LOW', type: 'Medical College',
        phone: '+91-824-2204668', lastUpdated: new Date(Date.now()-180000).toISOString(),
        resources: {
          generalBeds:   { total: 320, available: 68,  occupied: 228, reserved: 24 },
          icuBeds:       { total: 45,  available: 7,   occupied: 34,  reserved: 4  },
          emergencyBeds: { total: 28,  available: 5,   occupied: 20,  reserved: 3  },
          isolationBeds: { total: 22,  available: 14,  occupied: 6,   reserved: 2  },
          ventilators:   { total: 28,  available: 6,   occupied: 18,  reserved: 4  },
          bloodInventory:{ total: 70,  available: 28,  occupied: 0,   reserved: 14 }
        }
      }
    ],

    emergencyRequests: [
      {
        id: 'ER001', requestingHospitalId: 'H002', requestingHospital: 'Wenlock District Hospital',
        requestedHospitalId: null, requestedHospital: 'Network Broadcast',
        resource: 'icuBeds', resourceLabel: 'ICU Beds', quantity: 3,
        priority: 'CRITICAL', reason: 'Mass casualty incident — road accident on NH66 with 8 patients',
        createdAt: new Date(Date.now()-900000).toISOString(),
        requiredBy: new Date(Date.now()+1800000).toISOString(),
        status: 'SEARCHING', direction: 'incoming'
      },
      {
        id: 'ER002', requestingHospitalId: 'H001', requestingHospital: 'KMC Hospital',
        requestedHospitalId: 'H003', requestedHospital: 'AJ Hospital',
        resource: 'ventilators', resourceLabel: 'Ventilators', quantity: 2,
        priority: 'HIGH', reason: 'Post-surgical ICU patients requiring ventilator support',
        createdAt: new Date(Date.now()-3600000).toISOString(),
        requiredBy: new Date(Date.now()+7200000).toISOString(),
        status: 'ACCEPTED', direction: 'outgoing'
      },
      {
        id: 'ER003', requestingHospitalId: 'H005', requestingHospital: 'Yenepoya Medical College',
        requestedHospitalId: 'H001', requestedHospital: 'KMC Hospital',
        resource: 'bloodInventory', resourceLabel: 'Blood Units (O-)', quantity: 5,
        priority: 'HIGH', reason: 'Emergency surgery — O-negative blood required immediately',
        createdAt: new Date(Date.now()-1800000).toISOString(),
        requiredBy: new Date(Date.now()+3600000).toISOString(),
        status: 'PENDING', direction: 'incoming'
      },
      {
        id: 'ER004', requestingHospitalId: 'H001', requestingHospital: 'KMC Hospital',
        requestedHospitalId: 'H004', requestedHospital: 'Father Muller',
        resource: 'generalBeds', resourceLabel: 'General Beds', quantity: 10,
        priority: 'MEDIUM', reason: 'Capacity overflow from orthopedic ward',
        createdAt: new Date(Date.now()-7200000).toISOString(),
        requiredBy: new Date(Date.now()+14400000).toISOString(),
        status: 'FULFILLED', direction: 'outgoing'
      }
    ],

    notifications: [
      { id: 'N001', title: 'Critical Alert', message: 'Wenlock Hospital has reached critical ICU capacity.', type: 'critical', read: false, createdAt: new Date(Date.now()-600000).toISOString() },
      { id: 'N002', title: 'Request Accepted', message: 'AJ Hospital accepted your ventilator request (ER002).', type: 'success', read: false, createdAt: new Date(Date.now()-1800000).toISOString() },
      { id: 'N003', title: 'New Incoming Request', message: 'Yenepoya Medical College needs 5 units of O- blood.', type: 'info', read: true, createdAt: new Date(Date.now()-3600000).toISOString() },
      { id: 'N004', title: 'Resource Update', message: 'Your ICU bed availability is now LOW (4 remaining).', type: 'warning', read: true, createdAt: new Date(Date.now()-7200000).toISOString() },
      { id: 'N005', title: 'Request Fulfilled', message: 'General bed transfer to Father Muller has been confirmed.', type: 'success', read: true, createdAt: new Date(Date.now()-86400000).toISOString() }
    ],

    resourceHistory: [
      { id: 'RH001', resource: 'ICU Beds', previousAvailable: 8, newAvailable: 4, action: 'OCCUPIED', reason: 'Admitted 4 new ICU patients', coordinatorName: 'Dr. Priya Shetty', timestamp: new Date(Date.now()-3600000).toISOString() },
      { id: 'RH002', resource: 'Ventilators', previousAvailable: 7, newAvailable: 4, action: 'OCCUPIED', reason: 'Post-op cases', coordinatorName: 'Dr. Priya Shetty', timestamp: new Date(Date.now()-7200000).toISOString() },
      { id: 'RH003', resource: 'General Beds', previousAvailable: 60, newAvailable: 52, action: 'TRANSFERRED', reason: 'Transfer to overflow ward', coordinatorName: 'Dr. Priya Shetty', timestamp: new Date(Date.now()-14400000).toISOString() },
      { id: 'RH004', resource: 'Blood Inventory', previousAvailable: 30, newAvailable: 38, action: 'RESTOCKED', reason: 'Blood bank replenishment', coordinatorName: 'Dr. Priya Shetty', timestamp: new Date(Date.now()-86400000).toISOString() },
      { id: 'RH005', resource: 'Emergency Beds', previousAvailable: 5, newAvailable: 3, action: 'OCCUPIED', reason: 'Road accident patients admitted', coordinatorName: 'Dr. Priya Shetty', timestamp: new Date(Date.now()-172800000).toISOString() }
    ],

    analyticsData: {
      labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      generalBedUtil: [58, 62, 70, 74, 72, 68, 74],
      icuUtil:        [72, 78, 82, 85, 88, 83, 87],
      emergencyUtil:  [55, 60, 68, 72, 75, 70, 85],
      requestVolume:  [3, 5, 4, 7, 6, 4, 8],
      statusBreakdown: { fulfilled: 12, accepted: 3, rejected: 2, pending: 4, expired: 1 }
    },

    patientRequests: [
      { id: 'PR001', resource: 'Emergency Bed', hospital: 'KMC Hospital', priority: 'HIGH', status: 'ACCEPTED', createdAt: new Date(Date.now()-1800000).toISOString() },
      { id: 'PR002', resource: 'Ambulance', hospital: null, priority: 'CRITICAL', status: 'FULFILLED', createdAt: new Date(Date.now()-86400000).toISOString() }
    ],

    adminStats: {
      totalHospitals: 5, criticalHospitals: 1, lowHospitals: 2, normalHospitals: 2,
      activeRequests: 8, fulfilledToday: 12, totalBeds: 1570, availableBeds: 490,
      networkUtilization: 68.8
    },
    adminAnalytics: {
      labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      networkUtil:    [62, 65, 70, 72, 74, 70, 73],
      requestVolume:  [12, 18, 15, 22, 20, 14, 25],
      fulfillmentRate:[85, 80, 88, 82, 86, 90, 84]
    }
  };

  /* ------------------------------------------------------------------
     Token helpers
     ------------------------------------------------------------------ */
  function getToken()    { return localStorage.getItem('h4_token'); }
  function getPortal()   { return localStorage.getItem('h4_portal'); }

  /* ------------------------------------------------------------------
     Core request function
     ------------------------------------------------------------------ */
  async function request(method, path, body = null) {
    if (DEMO_MODE) return mockDispatch(method, path, body);

    const headers = { 'Content-Type': 'application/json' };
    const token   = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);

    try {
      const res = await fetch(`${BASE_URL}${path}`, opts);

      if (res.status === 401) {
        // Token expired / unauthorized
        const portal = getPortal() || 'coordinator';
        window.location.href = `/${portal}-login.html`;
        return null;
      }

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.message || data.error || `HTTP ${res.status}`);
      }

      return data;
    } catch (err) {
      if (err.name === 'TypeError') {
        throw new Error('Cannot reach server. Please check your connection.');
      }
      throw err;
    }
  }

  /* ------------------------------------------------------------------
     DEMO mock dispatcher — simulates all API endpoints
     ------------------------------------------------------------------ */
  async function mockDispatch(method, path, body) {
    await delay(Math.random() * 300 + 150); // simulate network latency

    /* AUTH */
    if (path === '/auth/coordinator/login' && method === 'POST') {
      if (body.password) return { token: 'demo_token_coordinator', user: MOCK.coordinator };
      throw new Error('Invalid credentials');
    }
    if (path === '/auth/patient/login' && method === 'POST') {
      return { token: 'demo_token_patient', user: MOCK.patient };
    }
    if (path === '/auth/admin/login' && method === 'POST') {
      return { token: 'demo_token_admin', user: MOCK.admin };
    }
    if (path === '/auth/logout' && method === 'POST') {
      return { success: true };
    }

    /* RESOURCES */
    if (path.match(/^\/hospitals\/H\d+\/resources$/) && method === 'GET') {
      const hid = path.split('/')[2];
      return MOCK.resources[hid] || MOCK.resources['H001'];
    }
    if (path.match(/^\/hospitals\/H\d+\/resources$/) && method === 'PUT') {
      // Simulate update
      const hid = path.split('/')[2];
      if (MOCK.resources[hid]) Object.assign(MOCK.resources[hid], body);
      return { success: true, resources: MOCK.resources[hid] };
    }
    if (path.match(/^\/hospitals\/H\d+\/resources\/history$/)) {
      return { history: MOCK.resourceHistory };
    }

    /* HOSPITALS */
    if (path === '/hospitals' && method === 'GET') {
      return { hospitals: MOCK.hospitals };
    }
    if (path.match(/^\/hospitals\/nearby\?/)) {
      return { hospitals: MOCK.hospitals };
    }
    if (path.match(/^\/hospitals\/H\d+$/) && method === 'GET') {
      const hid = path.split('/')[2];
      return MOCK.hospitals.find(h => h.id === hid) || MOCK.hospitals[0];
    }

    /* EMERGENCY REQUESTS */
    if (path.match(/^\/emergency-requests/) && method === 'GET') {
      const dir = path.includes('incoming') ? 'incoming' : path.includes('outgoing') ? 'outgoing' : null;
      const reqs = dir
        ? MOCK.emergencyRequests.filter(r => r.direction === dir)
        : MOCK.emergencyRequests;
      return { requests: reqs };
    }
    if (path === '/emergency-requests' && method === 'POST') {
      const newReq = {
        id: 'ER' + String(Date.now()).slice(-4),
        requestingHospitalId: 'H001', requestingHospital: 'KMC Hospital',
        requestedHospitalId: body.targetHospitalId || null,
        requestedHospital: body.targetHospital || 'Network Broadcast',
        resource: body.resource, resourceLabel: body.resourceLabel || body.resource,
        quantity: body.quantity, priority: body.priority, reason: body.reason,
        createdAt: new Date().toISOString(), requiredBy: body.requiredBy,
        status: 'PENDING', direction: 'outgoing'
      };
      MOCK.emergencyRequests.unshift(newReq);
      return { success: true, request: newReq };
    }
    if (path.match(/^\/emergency-requests\/ER\w+\/respond$/) && method === 'POST') {
      const rid = path.split('/')[2];
      const req  = MOCK.emergencyRequests.find(r => r.id === rid);
      if (req) req.status = body.action === 'accept' ? 'ACCEPTED' : 'REJECTED';
      return { success: true };
    }

    /* NOTIFICATIONS */
    if (path === '/notifications' && method === 'GET') {
      return { notifications: MOCK.notifications };
    }
    if (path.match(/^\/notifications\/N\w+\/read$/) && method === 'POST') {
      const nid = path.split('/')[2];
      const n   = MOCK.notifications.find(n => n.id === nid);
      if (n) n.read = true;
      return { success: true };
    }
    if (path === '/notifications/read-all' && method === 'POST') {
      MOCK.notifications.forEach(n => n.read = true);
      return { success: true };
    }

    /* ANALYTICS */
    if (path.match(/analytics/)) {
      return MOCK.analyticsData;
    }
    if (path.match(/admin\/analytics/)) {
      return MOCK.adminAnalytics;
    }
    if (path.match(/admin\/stats/)) {
      return MOCK.adminStats;
    }

    /* PATIENT REQUESTS */
    if (path === '/patient/requests' && method === 'GET') {
      return { requests: MOCK.patientRequests };
    }
    if (path === '/patient/requests' && method === 'POST') {
      const pr = { id: 'PR' + Date.now(), ...body, status: 'PENDING', createdAt: new Date().toISOString() };
      MOCK.patientRequests.unshift(pr);
      return { success: true, request: pr };
    }

    /* USER PROFILE */
    if (path === '/auth/me') {
      const portal = getPortal();
      if (portal === 'patient') return MOCK.patient;
      if (portal === 'admin')   return MOCK.admin;
      return MOCK.coordinator;
    }

    // Fallback
    console.warn('[API] Unhandled mock path:', method, path);
    return { data: null };
  }

  function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

  /* ------------------------------------------------------------------
     Public API
     ------------------------------------------------------------------ */
  return {
    get:    (path)        => request('GET',    path),
    post:   (path, body)  => request('POST',   path, body),
    put:    (path, body)  => request('PUT',    path, body),
    delete: (path)        => request('DELETE', path),
    DEMO_MODE,
    POLL_DELAY,
    // Expose mock for testing
    _mock: DEMO_MODE ? MOCK : null
  };
})();
