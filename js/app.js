/* Voyage Control Hoyst App – prototype logic (vanilla JS, hash routing) */
(function () {
  const DB = window.DB;
  const root = document.getElementById("root");
  const HOIST_COLORS = ["#0b907b", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444", "#0891b2", "#db2777"];

  const state = {
    role: "admin", // 'admin' | 'passenger'
    chartMode: { requests: "week", reservations: "week", usage: "week" },
    calendar: { buildingId: DB.buildings[0].id, hoistId: null, weekStart: null },
    bookingFilters: {},
    requestFilters: {},
    expandedBookings: {},
  };

  /* ---------------- helpers ---------------- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function toast(msg) { const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2800); }
  function nav(hash) { location.hash = hash; }
  function parseHash() { return (location.hash.replace(/^#\/?/, "") || "home"); }
  function getUser(id) { return DB.users.find((u) => u.id === id); }
  function userName(id) { const u = getUser(id); return u ? u.name : "—"; }
  function getBuilding(id) { return DB.buildings.find((b) => b.id === id); }
  function buildingName(id) { const b = getBuilding(id); return b ? b.name : "—"; }
  function getHoyst(id) { return DB.hoysts.find((h) => h.id === id); }
  function hoystName(id) { const h = getHoyst(id); return h ? h.name : "—"; }
  function getTrade(id) { const t = DB.trades.find((x) => x.id === id); return t ? t.name : "—"; }
  function currentUser() { return getUser(DB.currentUserId[state.role]); }
  function isAdmin() { return state.role === "admin"; }
  function isAlertAdmin() { return isAdmin() && currentUser().roles.includes("alert-admin"); }
  function pad(n) { return String(n).padStart(2, "0"); }
  function fmtDT(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

  function closeModal() { const el = document.getElementById("modalBackdrop"); if (el) el.remove(); }
  function openModal(html) {
    document.body.insertAdjacentHTML("beforeend", `<div class="modal-backdrop" id="modalBackdrop">${html}</div>`);
    document.getElementById("modalBackdrop").addEventListener("click", (e) => { if (e.target.id === "modalBackdrop") closeModal(); });
    document.querySelectorAll("[data-close-modal]").forEach((el) => el.addEventListener("click", closeModal));
  }

  function downloadFile(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }
  function toCSV(headers, rows) {
    const esc2 = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
    return [headers.map(esc2).join(","), ...rows.map((r) => r.map(esc2).join(","))].join("\r\n");
  }
  function exportCSV(filename, headers, rows) { downloadFile(filename, toCSV(headers, rows), "text/csv"); toast(`Downloaded ${filename}`); }
  function exportExcel(filename, headers, rows) { downloadFile(filename, toCSV(headers, rows), "application/vnd.ms-excel"); toast(`Downloaded ${filename}`); }
  function exportPDF(title, headers, rows) {
    const w = window.open("", "_blank");
    w.document.write(`<html><head><title>${esc(title)}</title><style>
      body{font-family:Arial,sans-serif;padding:24px;} h1{font-size:18px;} table{border-collapse:collapse;width:100%;font-size:12px;}
      th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;} th{background:#f2f2f2;}
    </style></head><body>
      <h1>${esc(title)}</h1>
      <table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
      <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>
      <script>window.onload=()=>window.print();<\/script>
    </body></html>`);
    w.document.close();
    toast("Opening print dialog — choose \"Save as PDF\"");
  }

  /* ---------------- recurring booking expansion ---------------- */
  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  function parseDate(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
  function addDaysD(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
  function weekStart(d) { const r = new Date(d); const day = (r.getDay() + 6) % 7; return addDaysD(r, -day); } // Monday-based

  function expandRecurring(b, horizonDays) {
    if (!b.recurring) return [];
    const base = parseDate(b.date);
    const until = parseDate(b.recurring.until);
    const limit = horizonDays ? addDaysD(base, horizonDays) : until;
    const end = until < limit ? until : limit;
    const baseWeek = weekStart(base);
    const occurrences = [];
    for (let d = new Date(base); d <= end; d = addDaysD(d, 1)) {
      const dow = DOW[d.getDay()];
      if (!b.recurring.daysOfWeek.includes(dow)) continue;
      const weeksSince = Math.round((weekStart(d) - baseWeek) / (7 * 86400000));
      if (weeksSince % b.recurring.everyNWeeks !== 0) continue;
      if (fmtDT(d) === b.date) continue; // skip base occurrence itself
      occurrences.push(fmtDT(d));
    }
    return occurrences;
  }

  function bookingVisible(b) {
    if (isAdmin()) return true;
    if (b.isDeliveryLockout) return false;
    return b.bookedForId === currentUser().id;
  }

  /* ================================================================ */
  function render() {
    const page = parseHash();
    root.innerHTML = `
      <div class="app-shell">
        <div class="sidebar">${renderSidebar(page)}</div>
        <div style="flex:1; display:flex; flex-direction:column; min-width:0;">
          <div class="topbar">${renderTopbar()}</div>
          <div class="main" id="main">${renderPage(page)}</div>
        </div>
      </div>
    `;
    wireGlobal(page);
  }

  function renderSidebar(page) {
    const item = (label, hash, icon, adminOnly, lockLabel) => {
      const allowed = !adminOnly || isAdmin();
      const activeClass = page === hash.replace("#/", "") ? "active" : "";
      if (!allowed) return `<div class="nav-item" style="opacity:0.4;cursor:not-allowed;">${icon} ${label}<span class="lock">🔒 ${lockLabel || "Admin"}</span></div>`;
      return `<div class="nav-item ${activeClass}" data-nav="${hash}">${icon} ${label}</div>`;
    };
    return `
      <div class="brand">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M3 20 L9 8 L13 15 L17 4 L21 20" stroke="#0b907b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="3" cy="20" r="1.6" fill="#0b907b"/><circle cx="9" cy="8" r="1.6" fill="#0b907b"/><circle cx="13" cy="15" r="1.6" fill="#0b907b"/><circle cx="17" cy="4" r="1.6" fill="#0b907b"/><circle cx="21" cy="20" r="1.6" fill="#0b907b"/></svg>
        HOYST
      </div>
      <div class="nav-section-title">Overview</div>
      ${item("Home", "#/home", "🏠")}
      <div class="nav-section-title">Project Management</div>
      ${item("Manage Hoists", "#/manage-hoists", "🛠️", true)}
      ${item("Pair Hoists", "#/pair-hoysts", "🔗", true)}
      ${isAlertAdmin() || !isAdmin() ? item("Manage Alerts", "#/manage-alerts", "📢", false, "Alert Admin") : `<div class="nav-item" style="opacity:0.4;cursor:not-allowed;">📢 Manage Alerts<span class="lock">🔒 Alert Admin</span></div>`}
      <div class="nav-section-title">Bookings</div>
      ${item("Book a Hoist", "#/book", "➕")}
      ${item("Bookings List", "#/bookings", "📋")}
      ${item("Calendar View", "#/calendar", "📅")}
      <div class="nav-section-title">Requests</div>
      ${item("Hoist Requests", "#/requests", "📱")}
    `;
  }

  function renderTopbar() {
    const u = currentUser();
    const initials = u.name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
    return `
      <select class="select-pill" disabled><option>${esc(DB.project.name)}</option></select>
      <div class="role-switch">
        <button data-role="admin" class="${state.role === "admin" ? "active" : ""}">Admin view</button>
        <button data-role="passenger" class="${state.role === "passenger" ? "active" : ""}">Passenger view</button>
      </div>
      <div class="spacer"></div>
      <div class="bell">🔔<span class="dot"></span></div>
      <div class="hint" style="color:var(--text-muted); font-size:12.5px;">${esc(u.name)}</div>
      <div class="avatar">${initials}</div>
    `;
  }

  function wireGlobal(page) {
    document.querySelectorAll("[data-nav]").forEach((el) => el.addEventListener("click", () => nav(el.getAttribute("data-nav"))));
    document.querySelectorAll("[data-role]").forEach((el) => el.addEventListener("click", () => { state.role = el.getAttribute("data-role"); nav("#/home"); }));
    pageWireFns.forEach((fn) => fn());
  }

  let pageWireFns = [];

  function renderPage(page) {
    pageWireFns = [];
    switch (page) {
      case "home": return pageHome();
      case "manage-hoists": return isAdmin() ? pageManageHoists() : pageForbidden("Admin");
      case "pair-hoysts": return isAdmin() ? pagePairHoysts() : pageForbidden("Admin");
      case "manage-alerts": return isAlertAdmin() ? pageManageAlerts() : pageForbidden("Alert Admin");
      case "book": return pageBook();
      case "bookings": return pageBookings();
      case "calendar": return pageCalendar();
      case "requests": return pageRequests();
      default: return pageHome();
    }
  }

  function pageForbidden(role) {
    return `<div class="page-header"><h1>Restricted</h1></div><div class="panel"><div class="empty-state">This section requires the "${esc(role)}" role. Switch to Admin view (top right) to see it in this prototype.</div></div>`;
  }

  /* ================================================================ */
  /* HOME                                                               */
  /* ================================================================ */
  function pageHome() {
    const now = DB.TODAY;
    const activeAlerts = DB.alerts
      .filter((a) => new Date(a.activeFrom) <= now && now <= new Date(a.activeTill))
      .sort((a, b) => new Date(a.activeTill) - new Date(b.activeTill));

    const myBookings = DB.bookings.filter((b) => !b.isDeliveryLockout && b.bookedForId === currentUser().id).slice(0, 5);
    const awaitingApproval = DB.bookings.filter((b) => !b.isDeliveryLockout && b.status === "Pending").length;

    const alertsHtml = activeAlerts.length ? activeAlerts.map((a) => `
      <div class="alert-item">
        <span>⚠️</span>
        <span class="title">${esc(a.title)}</span>
        <span class="expiry">Expires ${esc(a.activeTill)}</span>
      </div>
    `).join("") : `<div class="hint">No active alerts right now.</div>`;

    const statCards = `
      <div class="stat-row">
        <div class="stat-card"><div class="label">Buildings</div><div class="value">${DB.homeCounts.buildings}</div></div>
        <div class="stat-card blue"><div class="label">Hoists</div><div class="value">${DB.homeCounts.hoists}</div></div>
        <div class="stat-card purple"><div class="label">Hoist Requests Today</div><div class="value">${DB.homeCounts.requestsToday}</div></div>
        <div class="stat-card orange"><div class="label">Reservations Today</div><div class="value">${DB.homeCounts.reservationsToday}</div></div>
        <div class="stat-card red"><div class="label">Block-outs Today</div><div class="value">${DB.homeCounts.blockoutsToday}</div></div>
      </div>
    `;

    const myBookingsHtml = !isAdmin() ? `
      <div class="panel">
        <div class="panel-title">My Bookings</div>
        ${myBookings.length ? `<table class="grid"><thead><tr><th>Building</th><th>Hoist</th><th>Date</th><th>Time</th><th>Status</th></tr></thead>
          <tbody>${myBookings.map((b) => `<tr><td>${buildingName(b.buildingId)}</td><td>${hoystName(b.hoistId)}</td><td>${b.date}</td><td>${b.timeStart}–${b.timeEnd}</td><td>${statusBadge(b.status)}</td></tr>`).join("")}</tbody></table>`
        : `<div class="hint">You have no bookings yet.</div>`}
      </div>
    ` : `<div class="helper-banner" ${awaitingApproval > 0 ? 'data-nav="#/bookings"' : ""} style="background:var(--teal-softer);border:1px solid var(--teal-soft);color:var(--teal-dark);padding:12px 16px;border-radius:8px;margin-bottom:18px;${awaitingApproval > 0 ? "cursor:pointer;" : ""}" title="${awaitingApproval > 0 ? "Go to Bookings List to review" : ""}">${awaitingApproval} booking${awaitingApproval === 1 ? "" : "s"} awaiting approval${awaitingApproval > 0 ? " — click to review →" : "."}</div>`;

    return `
      <div class="page-header"><div><h1>Home</h1><div class="subtitle">${esc(DB.project.name)} · ${state.role === "admin" ? "Admin view" : "Passenger view"}</div></div></div>
      <div class="alert-strip">${alertsHtml}</div>
      ${myBookingsHtml}
      ${statCards}
      <div class="panel">
        <div class="row"><div class="panel-title" style="margin:0;">Hoist Requests — last 7 days by Hoist</div><div class="spacer"></div>${rangeToggle("requests")}</div>
        ${renderStackedChart("chart-requests", buildColumns(state.chartMode.requests, "requests"), "absolute")}
      </div>
      <div class="panel">
        <div class="row"><div class="panel-title" style="margin:0;">Hoist Reservations — last 7 days by Hoist</div><div class="spacer"></div>${rangeToggle("reservations")}</div>
        ${renderStackedChart("chart-reservations", buildColumns(state.chartMode.reservations, "reservations"), "absolute")}
      </div>
      <div class="panel">
        <div class="row"><div class="panel-title" style="margin:0;">Hoist Usage — Requests vs Reservations vs Idle (100%)</div><div class="spacer"></div>${rangeToggle("usage")}</div>
        ${renderUsageChart(state.chartMode.usage)}
      </div>
    `;
  }

  function rangeToggle(key) {
    const modes = [["week", "Week (7d)"], ["fourWeeks", "4 Weeks"], ["twelveMonths", "12 Months"]];
    pageWireFns.push(() => {
      document.querySelectorAll(`[data-range="${key}"]`).forEach((el) => {
        el.addEventListener("click", () => { state.chartMode[key] = el.getAttribute("data-mode"); render(); location.hash = "#/home"; });
      });
    });
    return `<div class="pill-toggle">${modes.map(([m, l]) => `<button data-range="${key}" data-mode="${m}" class="${state.chartMode[key] === m ? "active" : ""}">${l}</button>`).join("")}</div>`;
  }

  function buildColumns(mode, metric) {
    const series = DB.chart[mode];
    return series.map((p) => ({
      label: p.label,
      segments: DB.hoysts.map((h, i) => ({ value: p.byHoist[h.id][metric], color: HOIST_COLORS[i % HOIST_COLORS.length], name: h.name })),
    }));
  }

  function renderStackedChart(id, columns, kind) {
    const maxTotal = Math.max(...columns.map((c) => c.segments.reduce((s, x) => s + x.value, 0)), 1);
    const legend = DB.hoysts.map((h, i) => `<span><span class="sw" style="background:${HOIST_COLORS[i % HOIST_COLORS.length]}"></span>${esc(h.name)}</span>`).join("");
    const cols = columns.map((c) => {
      const total = c.segments.reduce((s, x) => s + x.value, 0);
      const colHeightPct = (total / maxTotal) * 100;
      const segs = c.segments.map((s) => {
        const segPct = total ? (s.value / total) * 100 : 0;
        return `<div title="${esc(s.name)}: ${s.value}" style="height:${segPct}%; background:${s.color};"></div>`;
      }).join("");
      return `
        <div style="flex:1; display:flex; flex-direction:column; align-items:center; gap:6px;">
          <div style="width:100%; height:160px; display:flex; align-items:flex-end;">
            <div style="width:100%; height:${colHeightPct}%; display:flex; flex-direction:column-reverse; border-radius:3px; overflow:hidden;">${segs}</div>
          </div>
          <div style="font-size:11px; color:var(--text-dim);">${esc(c.label)}</div>
        </div>
      `;
    }).join("");
    return `<div class="legend">${legend}</div><div style="display:flex; gap:10px; align-items:flex-end;">${cols}</div>`;
  }

  function renderUsageChart(mode) {
    const series = DB.chart.usage[mode];
    const legend = `<span><span class="sw" style="background:#0b907b"></span>Requests</span><span><span class="sw" style="background:#3b82f6"></span>Reservations</span><span><span class="sw" style="background:#e5e7eb"></span>Idle</span>`;
    const cols = series.map((p) => `
      <div style="flex:1; display:flex; flex-direction:column; align-items:center; gap:6px;">
        <div style="width:100%; height:160px; display:flex; flex-direction:column-reverse; border-radius:3px; overflow:hidden;">
          <div title="Idle: ${p.idlePct}%" style="height:${p.idlePct}%; background:#e5e7eb;"></div>
          <div title="Reservations: ${p.reservationsPct}%" style="height:${p.reservationsPct}%; background:#3b82f6;"></div>
          <div title="Requests: ${p.requestsPct}%" style="height:${p.requestsPct}%; background:#0b907b;"></div>
        </div>
        <div style="font-size:11px; color:var(--text-dim);">${esc(p.label)}</div>
      </div>
    `).join("");
    return `<div class="legend">${legend}</div><div style="display:flex; gap:10px; align-items:flex-end;">${cols}</div>`;
  }

  function statusBadge(status) {
    const map = { Approved: "badge-approved", Declined: "badge-declined", Pending: "badge-pending", Fulfilled: "badge-fulfilled", Cancelled: "badge-cancelled" };
    return `<span class="badge ${map[status] || ""}">${esc(status)}</span>`;
  }

  /* ================================================================ */
  /* MANAGE HOISTS                                                      */
  /* ================================================================ */
  function pageManageHoists() {
    const rows = DB.buildings.map((b) => {
      const hoysts = DB.hoysts.filter((h) => h.buildingId === b.id);
      return `
      <div class="panel">
        <div class="panel-title">${esc(b.name)}</div>
        <table class="grid">
          <thead><tr><th>Hoist</th>${DB.shifts.map((s) => `<th>${esc(s.name)}<br><span style="font-weight:400;text-transform:none;">${s.start}–${s.end}</span></th>`).join("")}</tr></thead>
          <tbody>
            ${hoysts.map((h) => `
              <tr>
                <td><strong>${esc(h.name)}</strong><br><span class="hint">${esc(h.description)}</span></td>
                ${DB.shifts.map((s) => {
                  const a = DB.operatorAssignments[h.id][s.id];
                  const ops = DB.users.filter((u) => u.roles.includes("operator"));
                  return `<td>
                    <select data-op-select="${h.id}:${s.id}" style="width:100%; padding:6px 8px; border-radius:6px; border:1px solid var(--border);">
                      <option value="">— Unassigned —</option>
                      ${ops.map((o) => `<option value="${o.id}" ${a.operatorId === o.id ? "selected" : ""}>${esc(o.name)}</option>`).join("")}
                    </select>
                    ${!a.operatorId ? `<div class="hint" style="color:var(--red);">Hoist unavailable this shift</div>` : `<div class="hint">since ${a.since}</div>`}
                  </td>`;
                }).join("")}
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>`;
    }).join("");

    pageWireFns.push(() => {
      document.querySelectorAll("[data-op-select]").forEach((el) => {
        el.addEventListener("change", (e) => {
          const [hoistId, shiftId] = el.getAttribute("data-op-select").split(":");
          const a = DB.operatorAssignments[hoistId][shiftId];
          const prev = a.operatorId;
          const next = e.target.value || null;
          DB.auditLog.unshift({
            id: "al-" + Date.now(), timestamp: DB.today + " " + new Date().toTimeString().slice(0, 5),
            hoistId, shiftId, previousOperator: prev, newOperator: next, changedBy: currentUser().name, effectiveFrom: DB.today,
          });
          a.operatorId = next; a.since = DB.today;
          toast(`Operator updated for ${hoystName(hoistId)} · ${DB.shifts.find((s) => s.id === shiftId).name}`);
          render(); location.hash = "#/manage-hoists";
        });
      });
      const btn = document.getElementById("viewAuditBtn");
      if (btn) btn.addEventListener("click", openAuditLogModal);
    });

    return `
      <div class="page-header"><div><h1>Manage Hoists</h1><div class="subtitle">Assign an operator per shift for each hoist. Leaving a shift unassigned makes the hoist unavailable for that shift.</div></div><div class="spacer"></div><button class="btn btn-outline" id="viewAuditBtn">View Audit Log</button></div>
      ${rows}
    `;
  }

  function openAuditLogModal() {
    const rows = DB.auditLog.map((a) => [a.timestamp, hoystName(a.hoistId), DB.shifts.find((s) => s.id === a.shiftId)?.name || "—", a.previousOperator ? userName(a.previousOperator) : "Unassigned", a.newOperator ? userName(a.newOperator) : "Unassigned", a.changedBy, a.effectiveFrom]);
    openModal(`
      <div class="modal wide">
        <h2>Operator Change Audit Log</h2>
        <div class="modal-sub">Full history of operator assignment changes, for later review.</div>
        <table class="grid">
          <thead><tr><th>Timestamp</th><th>Hoist</th><th>Shift</th><th>Previous Operator</th><th>New Operator</th><th>Changed By</th><th>Effective From</th></tr></thead>
          <tbody>${DB.auditLog.map((a) => `<tr><td>${a.timestamp}</td><td>${hoystName(a.hoistId)}</td><td>${DB.shifts.find((s) => s.id === a.shiftId)?.name || "—"}</td><td>${a.previousOperator ? userName(a.previousOperator) : "Unassigned"}</td><td>${a.newOperator ? userName(a.newOperator) : "Unassigned"}</td><td>${a.changedBy}</td><td>${a.effectiveFrom}</td></tr>`).join("")}</tbody>
        </table>
        <div class="modal-actions">
          <button class="btn btn-outline" id="auditCsv">Export CSV</button>
          <button class="btn btn-outline" id="auditXls">Export Excel</button>
          <button class="btn btn-primary" data-close-modal>Close</button>
        </div>
      </div>
    `);
    document.getElementById("auditCsv").addEventListener("click", () => exportCSV("hoist-operator-audit-log.csv", ["Timestamp", "Hoist", "Shift", "Previous Operator", "New Operator", "Changed By", "Effective From"], rows));
    document.getElementById("auditXls").addEventListener("click", () => exportExcel("hoist-operator-audit-log.xls", ["Timestamp", "Hoist", "Shift", "Previous Operator", "New Operator", "Changed By", "Effective From"], rows));
  }

  /* ================================================================ */
  /* PAIR HOISTS                                                        */
  /* ================================================================ */
  function pagePairHoysts() {
    const pairedIds = new Set(DB.pairings.filter((p) => p.active).flatMap((p) => p.hoistIds));
    const byBuilding = DB.buildings.map((b) => {
      const hoysts = DB.hoysts.filter((h) => h.buildingId === b.id);
      return `
      <div class="panel">
        <div class="panel-title">${esc(b.name)}</div>
        <div class="stack">
          ${hoysts.map((h) => `
            <label class="row" style="cursor:pointer;">
              <input type="checkbox" data-pair-check="${h.id}" ${pairedIds.has(h.id) ? "disabled" : ""} />
              <span>${esc(h.name)}</span>
              ${pairedIds.has(h.id) ? `<span class="chip">already paired</span>` : ""}
            </label>
          `).join("")}
        </div>
        <div style="margin-top:12px;"><button class="btn btn-primary btn-sm" data-pair-building="${b.id}">Pair Selected</button></div>
      </div>`;
    }).join("");

    const existing = DB.pairings.map((p) => `
      <div class="panel">
        <div class="row">
          <div class="panel-title" style="margin:0;">${esc(buildingName(p.buildingId))} — ${p.hoistIds.map(hoystName).join(" ⇄ ")}</div>
          <div class="spacer"></div>
          <span class="chip ${p.active ? "" : "muted"}">${p.active ? "Active" : "Disabled"}</span>
          <label class="switch"><input type="checkbox" data-pair-active="${p.id}" ${p.active ? "checked" : ""}><span class="slider"></span></label>
        </div>
        <div class="hint" style="margin:10px 0;">Requests received for one hoist in this pairing are shared with all paired hoists.</div>
        <div class="row" style="flex-wrap:wrap; gap:8px;">
          ${p.hoistIds.map((hid) => `<button class="btn btn-sm btn-ghost" data-unpair="${p.id}:${hid}">Unpair ${esc(hoystName(hid))}</button>`).join("")}
        </div>
      </div>
    `).join("");

    pageWireFns.push(() => {
      document.querySelectorAll("[data-pair-building]").forEach((el) => {
        el.addEventListener("click", () => {
          const bId = el.getAttribute("data-pair-building");
          const checked = Array.from(document.querySelectorAll(`[data-pair-check]:checked`)).map((c) => c.getAttribute("data-pair-check"));
          if (checked.length < 2) { toast("Select at least 2 hoysts to pair"); return; }
          DB.pairings.push({ id: "pair-" + Date.now(), buildingId: bId, hoistIds: checked, active: true });
          toast("Hoysts paired");
          render(); location.hash = "#/pair-hoysts";
        });
      });
      document.querySelectorAll("[data-pair-active]").forEach((el) => {
        el.addEventListener("change", (e) => {
          const p = DB.pairings.find((x) => x.id === el.getAttribute("data-pair-active"));
          p.active = e.target.checked;
          toast(`Pairing ${p.active ? "enabled" : "disabled"}`);
          render(); location.hash = "#/pair-hoysts";
        });
      });
      document.querySelectorAll("[data-unpair]").forEach((el) => {
        el.addEventListener("click", () => {
          const [pairId, hoistId] = el.getAttribute("data-unpair").split(":");
          const p = DB.pairings.find((x) => x.id === pairId);
          p.hoistIds = p.hoistIds.filter((id) => id !== hoistId);
          if (p.hoistIds.length < 2) { DB.pairings = DB.pairings.filter((x) => x.id !== pairId); toast("Pairing dissolved — remaining hoyst is now free"); }
          else toast("Hoyst removed from pairing");
          render(); location.hash = "#/pair-hoysts";
        });
      });
    });

    return `
      <div class="page-header"><div><h1>Pair Hoists</h1><div class="subtitle">Admin only. Pair 2 or more hoysts within the same building so requests for one are shared by all.</div></div></div>
      <div class="panel-title" style="margin:0 0 10px;">Existing Pairings</div>
      ${existing || `<div class="panel"><div class="empty-state">No pairings yet.</div></div>`}
      <div class="panel-title" style="margin:20px 0 10px;">Create a New Pairing</div>
      ${byBuilding}
    `;
  }

  /* ================================================================ */
  /* MANAGE ALERTS                                                      */
  /* ================================================================ */
  function pageManageAlerts() {
    const rows = [...DB.alerts].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return `
      <div class="page-header"><div><h1>Manage Alerts</h1><div class="subtitle">Only visible to users with the Alert Admin role. Send alerts to everyone connected to the project.</div></div><div class="spacer"></div><button class="btn btn-primary" id="sendAlertBtn">+ Send Alert</button></div>
      <div class="filter-bar">
        <div class="field"><label>Building</label><select id="fAlertBuilding"><option value="">All</option>${DB.buildings.map((b) => `<option value="${b.id}">${esc(b.name)}</option>`).join("")}</select></div>
        <div class="field"><label>Hoist</label><select id="fAlertHoist"><option value="">All</option>${DB.hoysts.map((h) => `<option value="${h.id}">${esc(h.name)}</option>`).join("")}</select></div>
        <div class="field"><label>From</label><input type="date" id="fAlertFrom" /></div>
        <div class="field"><label>To</label><input type="date" id="fAlertTo" /></div>
        <button class="btn btn-ghost btn-sm" id="applyAlertFilter">Apply</button>
      </div>
      <div class="panel" id="alertsTableWrap">${renderAlertsTable(rows)}</div>
    `;
  }

  function renderAlertsTable(rows) {
    return `<table class="grid">
      <thead><tr><th>Title</th><th>Building</th><th>Hoist</th><th>Active From</th><th>Active Till</th><th>Created By</th></tr></thead>
      <tbody>${rows.length ? rows.map((a) => `<tr><td><strong>${esc(a.title)}</strong><br><span class="hint">${esc(a.text)}</span></td><td>${a.buildingId ? buildingName(a.buildingId) : "All"}</td><td>${a.hoistId ? hoystName(a.hoistId) : "All"}</td><td>${a.activeFrom}</td><td>${a.activeTill}</td><td>${a.createdBy}</td></tr>`).join("") : `<tr><td colspan="6" class="empty-state">No alerts match these filters.</td></tr>`}</tbody>
    </table>`;
  }

  const origPageManageAlerts = pageManageAlerts;
  pageManageAlerts = function () {
    const html = origPageManageAlerts();
    pageWireFns.push(() => {
      document.getElementById("sendAlertBtn").addEventListener("click", openSendAlertModal);
      document.getElementById("applyAlertFilter").addEventListener("click", () => {
        const bId = document.getElementById("fAlertBuilding").value;
        const hId = document.getElementById("fAlertHoist").value;
        const from = document.getElementById("fAlertFrom").value;
        const to = document.getElementById("fAlertTo").value;
        let rows = [...DB.alerts];
        if (bId) rows = rows.filter((a) => a.buildingId === bId);
        if (hId) rows = rows.filter((a) => a.hoistId === hId);
        if (from) rows = rows.filter((a) => a.activeFrom.slice(0, 10) >= from);
        if (to) rows = rows.filter((a) => a.activeTill.slice(0, 10) <= to);
        rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        document.getElementById("alertsTableWrap").innerHTML = renderAlertsTable(rows);
      });
    });
    return html;
  };

  function openSendAlertModal() {
    openModal(`
      <div class="modal">
        <h2>Send Alert</h2>
        <div class="modal-sub">Sent to everyone connected to this project.</div>
        <div class="field-row">
          <div class="field"><label>Building</label><select id="aBuilding"><option value="">All Buildings</option>${DB.buildings.map((b) => `<option value="${b.id}">${esc(b.name)}</option>`).join("")}</select></div>
          <div class="field"><label>Hoist</label><select id="aHoist"><option value="">All Hoists</option>${DB.hoysts.map((h) => `<option value="${h.id}">${esc(h.name)}</option>`).join("")}</select></div>
        </div>
        <div class="field"><label>Alert Title</label><input type="text" id="aTitle" placeholder="e.g. Hoist offline for repair" /></div>
        <div class="field"><label>Alert Text</label><textarea id="aText" placeholder="Details..."></textarea></div>
        <div class="field-row">
          <div class="field"><label>Active From (optional)</label><input type="date" id="aFrom" value="${DB.today}" /></div>
          <div class="field"><label>Active Till (optional)</label><input type="date" id="aTill" /></div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-ghost" data-close-modal>Cancel</button>
          <button class="btn btn-primary" id="saveAlert">Send Alert</button>
        </div>
      </div>
    `);
    document.getElementById("saveAlert").addEventListener("click", () => {
      const title = document.getElementById("aTitle").value.trim();
      const text = document.getElementById("aText").value.trim();
      if (!title || !text) { toast("Please enter a title and text"); return; }
      DB.alerts.unshift({
        id: "a-" + Date.now(), title, text,
        buildingId: document.getElementById("aBuilding").value || null,
        hoistId: document.getElementById("aHoist").value || null,
        activeFrom: (document.getElementById("aFrom").value || DB.today) + " 00:00",
        activeTill: (document.getElementById("aTill").value || DB.today) + " 23:59",
        createdBy: currentUser().name, createdAt: DB.today + " " + new Date().toTimeString().slice(0, 5),
      });
      closeModal(); toast("Alert sent"); render(); location.hash = "#/manage-alerts";
    });
  }

  /* ================================================================ */
  /* BOOK A HOIST                                                       */
  /* ================================================================ */
  function pageBook() {
    return `
      <div class="page-header"><div><h1>Book a Hoist</h1><div class="subtitle">Plan a hoyst booking for a certain period.</div></div></div>
      <div class="panel" style="max-width:640px;">
        <div class="field-row">
          <div class="field"><label>Building</label><select id="bBuilding">${DB.buildings.map((b) => `<option value="${b.id}">${esc(b.name)}</option>`).join("")}</select></div>
          <div class="field"><label>Hoist</label><select id="bHoist"></select></div>
        </div>
        <div class="field"><label>Trade</label><select id="bTrade">${DB.trades.map((t) => `<option value="${t.id}">${esc(t.division)} — ${esc(t.name)}</option>`).join("")}</select></div>
        <div class="field"><label>Activity Description</label><textarea id="bDesc" placeholder="e.g. Tile pallets to Level 4"></textarea></div>
        <div class="field-row">
          <div class="field"><label>Date</label><input type="date" id="bDate" value="${DB.today}" /></div>
          <div class="field"><label>Duration (minutes)</label><input type="number" id="bDuration" value="30" min="15" step="15" /></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Time Slot — Start</label><input type="time" id="bStart" value="09:00" /></div>
          <div class="field"><label>Time Slot — End</label><input type="time" id="bEnd" value="09:30" /></div>
        </div>
        ${isAdmin() ? `<div class="field"><label>Book on behalf of</label><select id="bBookFor"><option value="${currentUser().id}">Myself (${esc(currentUser().name)})</option>${DB.users.filter((u) => u.id !== currentUser().id).map((u) => `<option value="${u.id}">${esc(u.name)}</option>`).join("")}</select></div>` : ""}
        <div class="field row">
          <label style="margin:0;">Recurring booking</label>
          <label class="switch" style="margin-left:auto;"><input type="checkbox" id="bRecurring"><span class="slider"></span></label>
        </div>
        <div id="recurringFields" style="display:none;">
          <div class="field"><label>Repeats every <span id="everyLabel">1</span> week(s) on</label><input type="range" id="bEveryN" min="1" max="8" value="1" /></div>
          <div class="field">
            <div class="row" style="gap:6px;">
              ${["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d) => `<label class="row" style="gap:4px;"><input type="checkbox" class="dow-check" value="${d}" /> ${d[0]}</label>`).join("")}
            </div>
          </div>
          <div class="field"><label>Repeat Until</label><input type="date" id="bUntil" /></div>
        </div>
        <div class="modal-actions" style="justify-content:flex-start;">
          <button class="btn btn-primary" id="submitBooking">Submit Booking</button>
        </div>
      </div>
    `;
  }

  (function wireBookPage() {
    const orig = pageBook;
    pageBook = function () {
      const html = orig();
      pageWireFns.push(() => {
        const buildingSel = document.getElementById("bBuilding");
        const hoistSel = document.getElementById("bHoist");
        function refreshHoists() {
          const list = DB.hoysts.filter((h) => h.buildingId === buildingSel.value);
          hoistSel.innerHTML = list.map((h) => `<option value="${h.id}">${esc(h.name)}</option>`).join("");
        }
        buildingSel.addEventListener("change", refreshHoists);
        refreshHoists();

        const recurToggle = document.getElementById("bRecurring");
        const recurFields = document.getElementById("recurringFields");
        recurToggle.addEventListener("change", () => { recurFields.style.display = recurToggle.checked ? "block" : "none"; });
        const everyN = document.getElementById("bEveryN");
        everyN.addEventListener("input", () => { document.getElementById("everyLabel").textContent = everyN.value; });

        document.getElementById("submitBooking").addEventListener("click", () => {
          const desc = document.getElementById("bDesc").value.trim();
          if (!desc) { toast("Please enter an activity description"); return; }
          const recurring = recurToggle.checked ? {
            everyNWeeks: parseInt(everyN.value),
            daysOfWeek: Array.from(document.querySelectorAll(".dow-check:checked")).map((c) => c.value),
            until: document.getElementById("bUntil").value || DB.today,
          } : null;
          if (recurring && recurring.daysOfWeek.length === 0) { toast("Select at least one day of the week for the recurring booking"); return; }
          const bookedForId = isAdmin() ? document.getElementById("bBookFor").value : currentUser().id;
          DB.bookings.push({
            id: "BK-" + (2000 + DB.bookings.length), createdAt: DB.today + " " + new Date().toTimeString().slice(0, 5),
            buildingId: buildingSel.value, hoistId: hoistSel.value, tradeId: document.getElementById("bTrade").value,
            activityDescription: desc, date: document.getElementById("bDate").value,
            timeStart: document.getElementById("bStart").value, timeEnd: document.getElementById("bEnd").value,
            recurring, bookedById: currentUser().id, bookedForId, status: "Pending", isDeliveryLockout: false,
          });
          toast("Booking submitted — awaiting approval");
          nav("#/bookings");
        });
      });
      return html;
    };
  })();

  /* ================================================================ */
  /* BOOKINGS LIST                                                      */
  /* ================================================================ */
  function pageBookings() {
    return `
      <div class="page-header"><div><h1>Hoist Bookings</h1><div class="subtitle">${isAdmin() ? "Showing all bookings for this project." : "Showing your bookings."}</div></div></div>
      <div class="filter-bar">
        <div class="field"><label>Building</label><select id="fbBuilding"><option value="">All</option>${DB.buildings.map((b) => `<option value="${b.id}">${esc(b.name)}</option>`).join("")}</select></div>
        <div class="field"><label>Hoist</label><select id="fbHoist"><option value="">All</option>${DB.hoysts.map((h) => `<option value="${h.id}">${esc(h.name)}</option>`).join("")}</select></div>
        ${isAdmin() ? `<div class="field"><label>Booked By</label><select id="fbUser"><option value="">All</option>${DB.users.map((u) => `<option value="${u.id}">${esc(u.name)}</option>`).join("")}</select></div>` : ""}
        <div class="field"><label>Status</label><select id="fbStatus"><option value="">All</option><option>Approved</option><option>Declined</option><option>Pending</option></select></div>
        <div class="field"><label>Recurring?</label><select id="fbRecurring"><option value="">All</option><option value="yes">Yes</option><option value="no">No</option></select></div>
        <div class="field"><label>From</label><input type="date" id="fbFrom" /></div>
        <div class="field"><label>To</label><input type="date" id="fbTo" /></div>
        <button class="btn btn-ghost btn-sm" id="applyBookingFilter">Apply</button>
      </div>
      <div class="panel" id="bookingsTableWrap"></div>
    `;
  }

  function renderBookingsTable() {
    let rows = DB.bookings.filter(bookingVisible);
    const bId = document.getElementById("fbBuilding")?.value;
    const hId = document.getElementById("fbHoist")?.value;
    const uId = document.getElementById("fbUser")?.value;
    const st = document.getElementById("fbStatus")?.value;
    const rec = document.getElementById("fbRecurring")?.value;
    const from = document.getElementById("fbFrom")?.value;
    const to = document.getElementById("fbTo")?.value;
    if (bId) rows = rows.filter((b) => b.buildingId === bId);
    if (hId) rows = rows.filter((b) => b.hoistId === hId);
    if (uId) rows = rows.filter((b) => b.bookedForId === uId);
    if (st) rows = rows.filter((b) => b.status === st);
    if (rec === "yes") rows = rows.filter((b) => !!b.recurring);
    if (rec === "no") rows = rows.filter((b) => !b.recurring);
    if (from) rows = rows.filter((b) => b.date >= from);
    if (to) rows = rows.filter((b) => b.date <= to);
    rows.sort((a, b) => (a.date < b.date ? 1 : -1));

    const trs = rows.map((b) => {
      const isRecurring = !!b.recurring;
      const expanded = state.expandedBookings[b.id];
      const occurrences = isRecurring ? expandRecurring(b, 90) : [];
      const lockoutBadge = b.isDeliveryLockout ? `<span class="badge badge-lockout">Delivery Lock-out · ${esc(b.sourcePlatform)} ${esc(b.deliveryRef)}</span>` : "";
      const main = `
        <tr class="clickable" data-open-booking="${b.id}">
          <td>${isRecurring ? `<span class="expand-toggle" data-expand="${b.id}">${expanded ? "⇊" : "⇃"}</span> ` : ""}${esc(b.id)}</td>
          <td>${esc(b.createdAt)}</td>
          <td>${buildingName(b.buildingId)}</td>
          <td>${hoystName(b.hoistId)}</td>
          <td>${esc(b.date)}</td>
          <td>${b.timeStart}–${b.timeEnd}</td>
          <td>${isRecurring ? "Yes" : "No"}</td>
          <td>${b.isDeliveryLockout ? lockoutBadge : (b.bookedForId ? userName(b.bookedForId) : "—")}</td>
          <td>${statusBadge(b.status)}</td>
          <td style="white-space:nowrap;">
            ${!b.isDeliveryLockout && isAdmin() && b.status === "Pending" ? `<button class="btn btn-sm btn-primary" data-approve-booking="${b.id}">Approve</button> <button class="btn btn-sm btn-danger" data-reject-booking="${b.id}">Reject</button> ` : ""}
            ${!b.isDeliveryLockout && (isAdmin() || b.bookedForId === currentUser().id) ? `<button class="btn btn-sm btn-ghost" data-edit-booking="${b.id}">Edit</button> <button class="btn btn-sm btn-danger" data-cancel-booking="${b.id}">Cancel</button>` : ""}
          </td>
        </tr>
      `;
      const childRows = expanded ? occurrences.map((d) => `
        <tr class="recurring-child">
          <td></td><td></td><td></td><td></td>
          <td>${d}</td><td>${b.timeStart}–${b.timeEnd}</td><td></td><td></td><td></td><td></td>
        </tr>
      `).join("") : "";
      return main + childRows;
    }).join("");

    return `
      <table class="grid">
        <thead><tr><th>Booking ID</th><th>Created</th><th>Building</th><th>Hoist</th><th>Date</th><th>Time Slot</th><th>Recurring</th><th>Booked By</th><th>Status</th><th></th></tr></thead>
        <tbody>${trs || `<tr><td colspan="10" class="empty-state">No bookings match these filters.</td></tr>`}</tbody>
      </table>
    `;
  }

  (function wireBookingsPage() {
    const orig = pageBookings;
    pageBookings = function () {
      const html = orig();
      pageWireFns.push(() => {
        document.getElementById("bookingsTableWrap").innerHTML = renderBookingsTable();
        wireBookingsTable();
        document.getElementById("applyBookingFilter").addEventListener("click", () => {
          document.getElementById("bookingsTableWrap").innerHTML = renderBookingsTable();
          wireBookingsTable();
        });
      });
      return html;
    };
  })();

  function wireBookingsTable() {
    document.querySelectorAll("[data-expand]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = el.getAttribute("data-expand");
        state.expandedBookings[id] = !state.expandedBookings[id];
        document.getElementById("bookingsTableWrap").innerHTML = renderBookingsTable();
        wireBookingsTable();
      });
    });
    document.querySelectorAll("[data-open-booking]").forEach((el) => {
      el.addEventListener("click", (e) => {
        if (e.target.closest("[data-expand],[data-edit-booking],[data-cancel-booking]")) return;
        openBookingDetail(el.getAttribute("data-open-booking"));
      });
    });
    document.querySelectorAll("[data-edit-booking]").forEach((el) => {
      el.addEventListener("click", (e) => { e.stopPropagation(); toast("Edit booking form would open here (prototype)"); });
    });
    document.querySelectorAll("[data-cancel-booking]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const b = DB.bookings.find((x) => x.id === el.getAttribute("data-cancel-booking"));
        b.status = "Declined";
        toast("Booking cancelled");
        document.getElementById("bookingsTableWrap").innerHTML = renderBookingsTable();
        wireBookingsTable();
      });
    });
    document.querySelectorAll("[data-approve-booking]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const b = DB.bookings.find((x) => x.id === el.getAttribute("data-approve-booking"));
        b.status = "Approved";
        toast(`Booking ${b.id} approved`);
        document.getElementById("bookingsTableWrap").innerHTML = renderBookingsTable();
        wireBookingsTable();
      });
    });
    document.querySelectorAll("[data-reject-booking]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const b = DB.bookings.find((x) => x.id === el.getAttribute("data-reject-booking"));
        b.status = "Declined";
        toast(`Booking ${b.id} rejected`);
        document.getElementById("bookingsTableWrap").innerHTML = renderBookingsTable();
        wireBookingsTable();
      });
    });
  }

  function refreshBookingsListIfPresent() {
    const wrap = document.getElementById("bookingsTableWrap");
    if (wrap) { wrap.innerHTML = renderBookingsTable(); wireBookingsTable(); }
  }

  function openBookingDetail(id) {
    const b = DB.bookings.find((x) => x.id === id);
    if (b.isDeliveryLockout) {
      openModal(`
        <div class="modal">
          <h2>Delivery Lock-out</h2>
          <div class="modal-sub">${esc(b.sourcePlatform)} reference ${esc(b.deliveryRef)}</div>
          <div class="detail-row"><div class="k">Building</div><div class="v">${buildingName(b.buildingId)}</div></div>
          <div class="detail-row"><div class="k">Hoist</div><div class="v">${hoystName(b.hoistId)}</div></div>
          <div class="detail-row"><div class="k">Date</div><div class="v">${b.date}</div></div>
          <div class="detail-row"><div class="k">Time Slot</div><div class="v">${b.timeStart}–${b.timeEnd}</div></div>
          <div class="detail-row"><div class="k">Reason</div><div class="v">${esc(b.activityDescription)}</div></div>
          <div class="modal-actions"><button class="btn btn-primary" data-close-modal>Close</button></div>
        </div>
      `);
      return;
    }
    openModal(`
      <div class="modal">
        <h2>Booking ${esc(b.id)}</h2>
        <div class="modal-sub">Created ${esc(b.createdAt)}</div>
        <div class="detail-row"><div class="k">Building</div><div class="v">${buildingName(b.buildingId)}</div></div>
        <div class="detail-row"><div class="k">Hoist</div><div class="v">${hoystName(b.hoistId)}</div></div>
        <div class="detail-row"><div class="k">Trade</div><div class="v">${getTrade(b.tradeId)}</div></div>
        <div class="detail-row"><div class="k">Activity</div><div class="v">${esc(b.activityDescription)}</div></div>
        <div class="detail-row"><div class="k">Date</div><div class="v">${b.date}</div></div>
        <div class="detail-row"><div class="k">Time Slot</div><div class="v">${b.timeStart}–${b.timeEnd}</div></div>
        <div class="detail-row"><div class="k">Recurring</div><div class="v">${b.recurring ? `Yes — every ${b.recurring.everyNWeeks} week(s) on ${b.recurring.daysOfWeek.join(", ")}, until ${b.recurring.until}` : "No"}</div></div>
        <div class="detail-row"><div class="k">Booked By</div><div class="v">${userName(b.bookedById)}</div></div>
        <div class="detail-row"><div class="k">Booked For</div><div class="v">${userName(b.bookedForId)}</div></div>
        <div class="detail-row"><div class="k">Status</div><div class="v">${statusBadge(b.status)}</div></div>
        <div class="modal-actions">
          ${isAdmin() && b.status === "Pending" ? `<button class="btn btn-danger" id="modalRejectBooking">Reject</button><button class="btn btn-primary" id="modalApproveBooking">Approve</button>` : ""}
          <button class="btn btn-ghost" data-close-modal>Close</button>
        </div>
      </div>
    `);
    if (isAdmin() && b.status === "Pending") {
      document.getElementById("modalApproveBooking").addEventListener("click", () => {
        b.status = "Approved"; closeModal(); toast(`Booking ${b.id} approved`); refreshBookingsListIfPresent();
      });
      document.getElementById("modalRejectBooking").addEventListener("click", () => {
        b.status = "Declined"; closeModal(); toast(`Booking ${b.id} rejected`); refreshBookingsListIfPresent();
      });
    }
  }

  /* ================================================================ */
  /* CALENDAR VIEW                                                      */
  /* ================================================================ */
  const CAL_ROW_MIN = 15; // minutes represented by one grid row
  const CAL_ROW_PX = 12; // pixel height of one grid row
  const CAL_ROWS_PER_HOUR = 60 / CAL_ROW_MIN;
  const CAL_TOTAL_ROWS = (24 * 60) / CAL_ROW_MIN;
  const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  function ensureCalendarWeek() {
    if (!state.calendar.weekStart) {
      state.calendar.weekStart = fmtDT(weekStart(parseDate(DB.today)));
    }
  }

  function pageCalendar() {
    ensureCalendarWeek();
    const hoystsInBuilding = DB.hoysts.filter((h) => h.buildingId === state.calendar.buildingId);
    if (!state.calendar.hoistId || !hoystsInBuilding.find((h) => h.id === state.calendar.hoistId)) {
      state.calendar.hoistId = hoystsInBuilding[0]?.id || null;
    }
    const activeHoist = state.calendar.hoistId;

    const wkStartD = parseDate(state.calendar.weekStart);
    const wkEndD = addDaysD(wkStartD, 6);
    const weekLabel = `${MONTH_ABBR[wkStartD.getMonth()]} ${pad(wkStartD.getDate())} – ${MONTH_ABBR[wkEndD.getMonth()]} ${pad(wkEndD.getDate())}, ${wkEndD.getFullYear()}`;

    return `
      <div class="page-header">
        <div><h1>Hoist Calendar</h1><div class="subtitle">Availability, downtime, reservations and delivery lock-outs — week view, 15 minute slots.</div></div>
        <div class="spacer"></div>
        <select class="select-pill" id="calBuilding">${DB.buildings.map((b) => `<option value="${b.id}" ${b.id === state.calendar.buildingId ? "selected" : ""}>${esc(b.name)}</option>`).join("")}</select>
      </div>
      <div class="tabs">${hoystsInBuilding.map((h) => `<div class="tab ${h.id === activeHoist ? "active" : ""}" data-cal-tab="${h.id}">${esc(h.name)}</div>`).join("")}</div>
      <div class="row" style="margin-bottom:14px;">
        <div class="day-nav">
          <button data-week="-1">‹ Prev Week</button>
          <strong id="calWeekLabel">${weekLabel}</strong>
          <button data-week="1">Next Week ›</button>
        </div>
      </div>
      <div class="legend">
        <span><span class="sw" style="background:#eaf6f4"></span>Available (operator assigned)</span>
        <span><span class="sw" style="background:#f3f4f6"></span>Shift unavailable (no operator)</span>
        <span><span class="sw" style="background:#3b82f6"></span>My booking (approved)</span>
        <span><span class="sw" style="background:#f59e0b"></span>Other user's booking (approved)</span>
        <span><span class="sw" style="background:#fbbf24"></span>⏳ Awaiting approval</span>
        <span><span class="sw" style="background:#8b5cf6"></span>Delivery lock-out</span>
        <span><span class="sw" style="background:#ef4444"></span>Offline / Maintenance</span>
      </div>
      <div class="hint" style="margin-bottom:10px;">Tip: hover a calendar entry for a quick summary, click for full details, or (as admin) right-click a pending booking to approve/reject instantly.</div>
      <div class="panel" id="calGridWrap" style="padding:0; overflow:hidden;">${renderCalendarGrid(activeHoist, state.calendar.weekStart)}</div>
    `;
  }

  function toMin(t) { const [h, m] = t.split(":").map(Number); return h * 60 + m; }

  function bookingTooltip(b) {
    if (b.isDeliveryLockout) {
      return `<strong>Delivery Lock-out</strong><br>Platform: ${esc(b.sourcePlatform)}<br>Reference: ${esc(b.deliveryRef)}<br>${esc(b.timeStart)}–${esc(b.timeEnd)}`;
    }
    const statusText = b.status === "Pending" ? "⏳ Awaiting approval" : b.status;
    return `<strong>${esc(userName(b.bookedForId))}</strong><br>Status: ${esc(statusText)}<br>${esc(b.timeStart)}–${esc(b.timeEnd)}`;
  }

  function alertTooltip(a) {
    return `<strong>${esc(a.title)}</strong><br>${esc(a.activeFrom)} → ${esc(a.activeTill)}`;
  }

  function renderCalendarGrid(hoistId, weekStartStr) {
    if (!hoistId) return `<div class="empty-state">No hoyst available for this building.</div>`;
    const days = Array.from({ length: 7 }, (_, i) => fmtDT(addDaysD(parseDate(weekStartStr), i)));

    function shiftAvailable(shiftId) {
      return !!DB.operatorAssignments[hoistId][shiftId]?.operatorId;
    }

    const colors = { mineApproved: "#3b82f6", otherApproved: "#f59e0b", pending: "#fbbf24", lockout: "#8b5cf6", offline: "#ef4444", maintenance: "#ef4444" };
    const labels = { mineApproved: "Booked (you)", otherApproved: "Booked", pending: "⏳ Pending", lockout: "Lock-out", offline: "Offline", maintenance: "Maintenance" };

    // Background shift-availability bands, per day.
    let bandsHtml = "";
    days.forEach((date, di) => {
      DB.shifts.forEach((s) => {
        const sm = toMin(s.start), em0 = toMin(s.end);
        const spans = em0 > sm ? [[sm, em0]] : [[sm, 24 * 60], [0, em0]];
        const bg = shiftAvailable(s.id) ? "#eaf6f4" : "#f3f4f6";
        spans.forEach(([sMin, eMin]) => {
          const rowStart = Math.floor(sMin / CAL_ROW_MIN) + 1;
          const rowSpan = Math.max(1, Math.round((eMin - sMin) / CAL_ROW_MIN));
          bandsHtml += `<div style="grid-column:${di + 2}; grid-row:${rowStart} / span ${rowSpan}; background:${bg}; border-left:1px solid var(--border);"></div>`;
        });
      });
    });

    // Booking / alert blocks, per day, clipped to the visible day (0–24h). Declined bookings are hidden entirely.
    let blocksHtml = "";
    days.forEach((date, di) => {
      const dayBookings = DB.bookings.filter((b) => b.hoistId === hoistId && b.status !== "Declined" && (b.date === date || (b.recurring && expandRecurring(b, 180).includes(date))));
      dayBookings.forEach((b) => {
        const startMin = toMin(b.timeStart);
        let endMin = toMin(b.timeEnd);
        if (endMin <= startMin) endMin += 24 * 60;
        endMin = Math.min(endMin, 24 * 60);
        let type;
        if (b.isDeliveryLockout) type = "lockout";
        else if (b.status === "Pending") type = "pending";
        else type = (b.bookedForId === currentUser().id ? "mineApproved" : "otherApproved");
        const rowStart = Math.floor(startMin / CAL_ROW_MIN) + 1;
        const rowSpan = Math.max(1, Math.round((endMin - startMin) / CAL_ROW_MIN));
        blocksHtml += `<div class="cal-block" data-cal-block='${JSON.stringify({ id: b.id, kind: type })}' style="grid-column:${di + 2}; grid-row:${rowStart} / span ${rowSpan}; background:${colors[type]};"><span class="cal-block-label">${labels[type]}</span><div class="cal-tooltip">${bookingTooltip(b)}</div></div>`;
      });

      const alertsForHoist = DB.alerts.filter((a) => a.hoistId === hoistId && a.activeFrom.slice(0, 10) <= date && a.activeTill.slice(0, 10) >= date);
      alertsForHoist.forEach((a) => {
        const isMaint = /maintenance/i.test(a.title);
        const dayStart = new Date(date + "T00:00:00");
        const fromDt = new Date(a.activeFrom.replace(" ", "T"));
        const tillDt = new Date(a.activeTill.replace(" ", "T"));
        const startMin = fromDt <= dayStart ? 0 : Math.round((fromDt - dayStart) / 60000);
        const endOfDay = new Date(date + "T23:59:59");
        let endMin = tillDt >= endOfDay ? 24 * 60 : Math.round((tillDt - dayStart) / 60000);
        endMin = Math.max(endMin, startMin + CAL_ROW_MIN);
        const type = isMaint ? "maintenance" : "offline";
        const rowStart = Math.floor(startMin / CAL_ROW_MIN) + 1;
        const rowSpan = Math.max(1, Math.round((endMin - startMin) / CAL_ROW_MIN));
        blocksHtml += `<div class="cal-block" data-cal-block='${JSON.stringify({ id: a.id, kind: type })}' style="grid-column:${di + 2}; grid-row:${rowStart} / span ${rowSpan}; background:${colors[type]};"><span class="cal-block-label">${labels[type]}</span><div class="cal-tooltip">${alertTooltip(a)}</div></div>`;
      });
    });

    // Hour gutter labels (column 1).
    let gutterHtml = "";
    for (let h = 0; h < 24; h++) {
      const rowStart = h * CAL_ROWS_PER_HOUR + 1;
      gutterHtml += `<div class="cal-time" style="grid-column:1; grid-row:${rowStart} / span ${CAL_ROWS_PER_HOUR};">${String(h).padStart(2, "0")}:00</div>`;
    }

    const headerCells = days.map((date) => {
      const d = parseDate(date);
      const isToday = date === DB.today;
      return `<div class="cal-week-header-cell ${isToday ? "today" : ""}">${DOW_SHORT[d.getDay()]} ${pad(d.getMonth() + 1)}/${pad(d.getDate())}</div>`;
    }).join("");

    return `
      <div class="cal-week-header">
        <div class="cal-week-header-cell"></div>
        ${headerCells}
      </div>
      <div class="cal-week-scroll">
        <div class="cal-week-grid" style="grid-template-rows:repeat(${CAL_TOTAL_ROWS}, ${CAL_ROW_PX}px);">
          ${gutterHtml}
          ${bandsHtml}
          ${blocksHtml}
        </div>
      </div>
    `;
  }

  (function wireCalendarPage() {
    const orig = pageCalendar;
    pageCalendar = function () {
      const html = orig();
      pageWireFns.push(() => {
        document.getElementById("calBuilding").addEventListener("change", (e) => {
          state.calendar.buildingId = e.target.value; state.calendar.hoistId = null;
          render(); location.hash = "#/calendar";
        });
        document.querySelectorAll("[data-cal-tab]").forEach((el) => {
          el.addEventListener("click", () => { state.calendar.hoistId = el.getAttribute("data-cal-tab"); render(); location.hash = "#/calendar"; });
        });
        document.querySelectorAll("[data-week]").forEach((el) => {
          el.addEventListener("click", () => {
            const delta = parseInt(el.getAttribute("data-week"));
            const d = parseDate(state.calendar.weekStart);
            state.calendar.weekStart = fmtDT(addDaysD(d, 7 * delta));
            render(); location.hash = "#/calendar";
          });
        });
        wireCalBlocks();
        const scrollEl = document.querySelector(".cal-week-scroll");
        if (scrollEl) scrollEl.scrollTop = 6 * CAL_ROWS_PER_HOUR * CAL_ROW_PX; // default to ~06:00
      });
      return html;
    };
  })();

  function openCalBlockDetail(info) {
    if (info.kind === "offline" || info.kind === "maintenance") {
      const a = DB.alerts.find((x) => x.id === info.id);
      openModal(`<div class="modal"><h2>${esc(a.title)}</h2><div class="modal-sub">${a.activeFrom} → ${a.activeTill}</div><p>${esc(a.text)}</p><div class="modal-actions"><button class="btn btn-primary" data-close-modal>Close</button></div></div>`);
    } else {
      openBookingDetail(info.id);
    }
  }

  function setBookingStatus(id, status) {
    const b = DB.bookings.find((x) => x.id === id);
    if (!b) return;
    b.status = status;
    toast(`Booking ${b.id} ${status === "Approved" ? "approved" : "rejected"}`);
    refreshBookingsListIfPresent();
    render();
  }

  function closeContextMenu() {
    const el = document.getElementById("ctxMenu");
    if (el) el.remove();
  }

  function showContextMenu(x, y, items) {
    closeContextMenu();
    const menu = document.createElement("div");
    menu.className = "ctx-menu";
    menu.id = "ctxMenu";
    const maxX = window.innerWidth - 190;
    menu.style.left = Math.min(x, Math.max(0, maxX)) + "px";
    menu.style.top = y + "px";
    menu.innerHTML = items.map((it, i) => it.sep ? `<div class="ctx-menu-sep"></div>` : `<div class="ctx-menu-item ${it.cls || ""}" data-ctx-idx="${i}">${it.label}</div>`).join("");
    document.body.appendChild(menu);
    menu.querySelectorAll("[data-ctx-idx]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const idx = parseInt(el.getAttribute("data-ctx-idx"));
        closeContextMenu();
        items[idx].onClick();
      });
    });
    setTimeout(() => document.addEventListener("click", closeContextMenu, { once: true }), 0);
  }

  function wireCalBlocks() {
    document.querySelectorAll("[data-cal-block]").forEach((el) => {
      el.addEventListener("click", () => {
        const info = JSON.parse(el.getAttribute("data-cal-block"));
        openCalBlockDetail(info);
      });
      el.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        const info = JSON.parse(el.getAttribute("data-cal-block"));
        const items = [];
        if (info.kind === "offline" || info.kind === "maintenance") {
          items.push({ label: "View alert details", onClick: () => openCalBlockDetail(info) });
        } else {
          items.push({ label: "View details", onClick: () => openCalBlockDetail(info) });
          if (isAdmin() && info.kind === "pending") {
            items.push({ sep: true });
            items.push({ label: "✓ Approve booking", cls: "primary", onClick: () => setBookingStatus(info.id, "Approved") });
            items.push({ label: "✕ Reject booking", cls: "danger", onClick: () => setBookingStatus(info.id, "Declined") });
          }
        }
        showContextMenu(e.clientX, e.clientY, items);
      });
    });
  }

  /* ================================================================ */
  /* HOIST REQUESTS                                                     */
  /* ================================================================ */
  function pageRequests() {
    return `
      <div class="page-header"><div><h1>Hoist Requests</h1><div class="subtitle">Requests made via the mobile app. ${isAdmin() ? "Showing all requests." : "Showing your requests."}</div></div><div class="spacer"></div>
        <button class="btn btn-outline btn-sm" id="reqCsv">Export CSV</button>
        <button class="btn btn-outline btn-sm" id="reqXls">Export Excel</button>
        <button class="btn btn-outline btn-sm" id="reqPdf">Export PDF</button>
      </div>
      <div class="filter-bar">
        <div class="field"><label>Building</label><select id="rqBuilding"><option value="">All</option>${DB.buildings.map((b) => `<option value="${b.id}">${esc(b.name)}</option>`).join("")}</select></div>
        <div class="field"><label>Hoist</label><select id="rqHoist"><option value="">All</option>${DB.hoysts.map((h) => `<option value="${h.id}">${esc(h.name)}</option>`).join("")}</select></div>
        ${isAdmin() ? `<div class="field"><label>User</label><select id="rqUser"><option value="">All</option>${DB.users.map((u) => `<option value="${u.id}">${esc(u.name)}</option>`).join("")}</select></div>` : ""}
        <div class="field"><label>From Floor</label><input type="number" id="rqFromFloor" placeholder="Any" /></div>
        <div class="field"><label>To Floor</label><input type="number" id="rqToFloor" placeholder="Any" /></div>
        <div class="field"><label>Date From</label><input type="date" id="rqDateFrom" /></div>
        <div class="field"><label>Date To</label><input type="date" id="rqDateTo" /></div>
        <div class="field"><label>Time From</label><input type="time" id="rqTimeFrom" /></div>
        <div class="field"><label>Time To</label><input type="time" id="rqTimeTo" /></div>
        <button class="btn btn-ghost btn-sm" id="applyReqFilter">Apply</button>
      </div>
      <div class="panel" id="reqTableWrap"></div>
    `;
  }

  function filteredRequests() {
    let rows = isAdmin() ? [...DB.requests] : DB.requests.filter((r) => r.userId === currentUser().id);
    const bId = document.getElementById("rqBuilding")?.value;
    const hId = document.getElementById("rqHoist")?.value;
    const uId = document.getElementById("rqUser")?.value;
    const ff = document.getElementById("rqFromFloor")?.value;
    const tf = document.getElementById("rqToFloor")?.value;
    const df = document.getElementById("rqDateFrom")?.value;
    const dt = document.getElementById("rqDateTo")?.value;
    const tmf = document.getElementById("rqTimeFrom")?.value;
    const tmt = document.getElementById("rqTimeTo")?.value;
    if (bId) rows = rows.filter((r) => r.buildingId === bId);
    if (hId) rows = rows.filter((r) => r.hoistId === hId);
    if (uId) rows = rows.filter((r) => r.userId === uId);
    if (ff !== "" && ff != null) rows = rows.filter((r) => r.fromFloor === parseInt(ff));
    if (tf !== "" && tf != null) rows = rows.filter((r) => r.toFloor === parseInt(tf));
    if (df) rows = rows.filter((r) => r.date >= df);
    if (dt) rows = rows.filter((r) => r.date <= dt);
    if (tmf) rows = rows.filter((r) => r.time >= tmf);
    if (tmt) rows = rows.filter((r) => r.time <= tmt);
    // default sort: Date desc, Time desc, Building asc, Hoist asc, User asc, From floor asc, To floor asc
    rows.sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      if (a.time !== b.time) return a.time < b.time ? 1 : -1;
      const bn = buildingName(a.buildingId).localeCompare(buildingName(b.buildingId)); if (bn) return bn;
      const hn = hoystName(a.hoistId).localeCompare(hoystName(b.hoistId)); if (hn) return hn;
      const un = userName(a.userId).localeCompare(userName(b.userId)); if (un) return un;
      if (a.fromFloor !== b.fromFloor) return a.fromFloor - b.fromFloor;
      return a.toFloor - b.toFloor;
    });
    return rows;
  }

  function renderRequestsTable() {
    const rows = filteredRequests();
    return `
      <table class="grid">
        <thead><tr><th>Request ID</th><th>Date</th><th>Time</th><th>Building</th><th>Hoist</th><th>User</th><th>From Floor</th><th>To Floor</th><th>Status</th></tr></thead>
        <tbody>${rows.length ? rows.map((r) => `<tr><td>${esc(r.id)}</td><td>${r.date}</td><td>${r.time}</td><td>${buildingName(r.buildingId)}</td><td>${hoystName(r.hoistId)}</td><td>${userName(r.userId)}</td><td>${r.fromFloor}</td><td>${r.toFloor}</td><td>${statusBadge(r.status)}</td></tr>`).join("") : `<tr><td colspan="9" class="empty-state">No requests match these filters.</td></tr>`}</tbody>
      </table>
    `;
  }

  (function wireRequestsPage() {
    const orig = pageRequests;
    pageRequests = function () {
      const html = orig();
      pageWireFns.push(() => {
        document.getElementById("reqTableWrap").innerHTML = renderRequestsTable();
        document.getElementById("applyReqFilter").addEventListener("click", () => { document.getElementById("reqTableWrap").innerHTML = renderRequestsTable(); });
        const headers = ["Request ID", "Date", "Time", "Building", "Hoist", "User", "From Floor", "To Floor", "Status"];
        const rowsFn = () => filteredRequests().map((r) => [r.id, r.date, r.time, buildingName(r.buildingId), hoystName(r.hoistId), userName(r.userId), r.fromFloor, r.toFloor, r.status]);
        document.getElementById("reqCsv").addEventListener("click", () => exportCSV("hoist-requests.csv", headers, rowsFn()));
        document.getElementById("reqXls").addEventListener("click", () => exportExcel("hoist-requests.xls", headers, rowsFn()));
        document.getElementById("reqPdf").addEventListener("click", () => exportPDF("Hoist Requests", headers, rowsFn()));
      });
      return html;
    };
  })();

  /* ================================================================ */
  window.addEventListener("hashchange", render);
  window.addEventListener("DOMContentLoaded", () => {
    if (!location.hash) location.hash = "#/home";
    render();
  });
})();
