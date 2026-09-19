/* ============================================================
   H4 — analytics.js
   Chart.js factory functions for all portals
   ============================================================ */

const Analytics = (() => {
  // Chart.js default overrides
  if (typeof Chart !== 'undefined') {
    Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
    Chart.defaults.font.size   = 12;
    Chart.defaults.color       = '#64748b';
    Chart.defaults.plugins.legend.labels.boxWidth = 12;
    Chart.defaults.plugins.legend.labels.padding  = 16;
  }

  const PALETTE = {
    cyan:    { fill: 'rgba(0,180,216,0.12)', stroke: '#00B4D8' },
    red:     { fill: 'rgba(239,68,68,0.12)', stroke: '#EF4444' },
    amber:   { fill: 'rgba(245,158,11,0.12)', stroke: '#F59E0B' },
    green:   { fill: 'rgba(34,197,94,0.12)', stroke: '#22C55E' },
    purple:  { fill: 'rgba(139,92,246,0.12)', stroke: '#8B5CF6' },
    blue:    { fill: 'rgba(59,130,246,0.12)', stroke: '#3B82F6' }
  };

  /* ---- Destroy chart if exists ---- */
  function destroy(id) {
    const existing = Chart.getChart(id);
    if (existing) existing.destroy();
  }

  /* ---- Resource utilization trends (Line) ---- */
  function createUtilTrendChart(canvasId, data) {
    destroy(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    return new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.labels,
        datasets: [
          {
            label: 'General Beds', data: data.generalBedUtil,
            borderColor: PALETTE.cyan.stroke, backgroundColor: PALETTE.cyan.fill,
            tension: 0.4, fill: true, borderWidth: 2, pointRadius: 4, pointHoverRadius: 6
          },
          {
            label: 'ICU Beds', data: data.icuUtil,
            borderColor: PALETTE.red.stroke, backgroundColor: PALETTE.red.fill,
            tension: 0.4, fill: true, borderWidth: 2, pointRadius: 4, pointHoverRadius: 6
          },
          {
            label: 'Emergency Beds', data: data.emergencyUtil,
            borderColor: PALETTE.amber.stroke, backgroundColor: PALETTE.amber.fill,
            tension: 0.4, fill: true, borderWidth: 2, pointRadius: 4, pointHoverRadius: 6
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top' },
          tooltip: {
            callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y}%` }
          }
        },
        scales: {
          y: {
            min: 0, max: 100, grid: { color: '#f1f5f9' },
            ticks: { callback: v => `${v}%` }
          },
          x: { grid: { color: '#f1f5f9' } }
        }
      }
    });
  }

  /* ---- Request volume per day (Bar) ---- */
  function createRequestVolumeChart(canvasId, data) {
    destroy(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    return new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.labels,
        datasets: [{
          label: 'Emergency Requests',
          data: data.requestVolume,
          backgroundColor: 'rgba(0,180,216,0.75)',
          borderColor: '#00B4D8',
          borderWidth: 1, borderRadius: 6, borderSkipped: false
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { stepSize: 2 } },
          x: { grid: { display: false } }
        }
      }
    });
  }

  /* ---- Request status breakdown (Doughnut) ---- */
  function createStatusBreakdownChart(canvasId, data) {
    destroy(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    const sb  = data.statusBreakdown;
    return new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Fulfilled', 'Accepted', 'Rejected', 'Pending', 'Expired'],
        datasets: [{
          data: [sb.fulfilled, sb.accepted, sb.rejected, sb.pending, sb.expired],
          backgroundColor: ['#22C55E', '#00B4D8', '#EF4444', '#6B7280', '#DC2626'],
          borderWidth: 2, borderColor: '#fff', hoverOffset: 8
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
          legend: { position: 'bottom' },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.label}: ${ctx.parsed} requests`
            }
          }
        }
      }
    });
  }

  /* ---- Network-wide utilization (Line) ---- */
  function createNetworkUtilChart(canvasId, data) {
    destroy(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    return new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.labels,
        datasets: [{
          label: 'Network Utilization',
          data: data.networkUtil,
          borderColor: '#00B4D8', backgroundColor: 'rgba(0,180,216,0.1)',
          tension: 0.4, fill: true, borderWidth: 2.5, pointRadius: 5, pointHoverRadius: 7
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { min: 0, max: 100, grid: { color: '#f1f5f9' }, ticks: { callback: v => `${v}%` } },
          x: { grid: { color: '#f1f5f9' } }
        }
      }
    });
  }

  /* ---- Network request volume (Bar) ---- */
  function createNetworkVolumeChart(canvasId, data) {
    destroy(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    return new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.labels,
        datasets: [
          {
            label: 'Total Requests', data: data.requestVolume,
            backgroundColor: 'rgba(59,130,246,0.7)', borderColor: '#3B82F6',
            borderWidth: 1, borderRadius: 5, borderSkipped: false
          },
          {
            label: 'Fulfilled', data: data.requestVolume.map((v, i) => Math.round(v * data.fulfillmentRate[i] / 100)),
            backgroundColor: 'rgba(34,197,94,0.7)', borderColor: '#22C55E',
            borderWidth: 1, borderRadius: 5, borderSkipped: false
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top' } },
        scales: {
          y: { beginAtZero: true, grid: { color: '#f1f5f9' } },
          x: { grid: { display: false } }
        }
      }
    });
  }

  /* ---- Hospital status breakdown (Doughnut) — Admin ---- */
  function createHospitalStatusChart(canvasId, stats) {
    destroy(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    return new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Normal', 'Low', 'Critical'],
        datasets: [{
          data: [stats.normalHospitals, stats.lowHospitals, stats.criticalHospitals],
          backgroundColor: ['#22C55E', '#F59E0B', '#EF4444'],
          borderWidth: 2, borderColor: '#fff', hoverOffset: 6
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '60%',
        plugins: { legend: { position: 'bottom' } }
      }
    });
  }

  /* ---- Fulfillment rate trend (Line) ---- */
  function createFulfillmentChart(canvasId, data) {
    destroy(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    return new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.labels,
        datasets: [{
          label: 'Fulfillment Rate',
          data: data.fulfillmentRate,
          borderColor: '#22C55E', backgroundColor: 'rgba(34,197,94,0.1)',
          tension: 0.4, fill: true, borderWidth: 2, pointRadius: 4
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { min: 0, max: 100, ticks: { callback: v => `${v}%` }, grid: { color: '#f1f5f9' } },
          x: { grid: { color: '#f1f5f9' } }
        }
      }
    });
  }

  return {
    createUtilTrendChart, createRequestVolumeChart, createStatusBreakdownChart,
    createNetworkUtilChart, createNetworkVolumeChart, createHospitalStatusChart,
    createFulfillmentChart
  };
})();
