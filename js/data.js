/* =======================================================================
   Voyage Control - Hoyst App (Prototype)
   Mock data model, all in-memory. Runs from file:// or any static host.
   ======================================================================= */
(function () {
  const DB = {};

  /* ---------------- seeded RNG so chart numbers stay believable ------ */
  let seed = 42;
  function rnd() {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  }
  function rndInt(min, max) { return Math.floor(rnd() * (max - min + 1)) + min; }

  const TODAY = new Date("2026-07-10T09:00:00");
  function fmtDate(d) { return d.toISOString().slice(0, 10); }
  function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
  DB.TODAY = TODAY;
  DB.today = fmtDate(TODAY);

  DB.project = { id: "p1", name: "Riverside Tower – Block C" };

  DB.users = [
    { id: "u1", name: "Satish N", email: "satish.nv@neuralrays.ai", roles: ["admin", "alert-admin"] },
    { id: "u2", name: "Rahul Verma", email: "rahul.verma@sitecrew.com", roles: ["passenger"] },
    { id: "u3", name: "Priya Nair", email: "priya.nair@sitecrew.com", roles: ["passenger"] },
    { id: "u4", name: "Michael Otieno", email: "michael.o@sitecrew.com", roles: ["passenger"] },
    { id: "u5", name: "Dave Chen", email: "dave.chen@sitecrew.com", roles: ["passenger", "operator"] },
    { id: "u6", name: "Ola Okafor", email: "ola.okafor@sitecrew.com", roles: ["passenger", "operator"] },
    { id: "u7", name: "Grzegorz Kowalski", email: "greg.k@sitecrew.com", roles: ["passenger", "operator"] },
    { id: "u8", name: "Fatima Al-Sayed", email: "fatima.a@sitecrew.com", roles: ["passenger", "operator"] },
    { id: "u9", name: "Tom Brady", email: "tom.brady@sitecrew.com", roles: ["passenger"] },
    { id: "u10", name: "Elena Petrova", email: "elena.p@sitecrew.com", roles: ["passenger"] },
  ];

  DB.currentUserId = { admin: "u1", passenger: "u2" }; // toggled by role switcher

  DB.buildings = [
    { id: "loc-a", name: "Tower A", floors: 9 },
    { id: "loc-b", name: "Tower B", floors: 5 },
    { id: "loc-podium", name: "Podium Block", floors: 2 },
  ];

  DB.hoysts = [
    { id: "h1", buildingId: "loc-a", name: "Hoist A1", description: "Passenger/material hoist, north core, 2000kg" },
    { id: "h2", buildingId: "loc-a", name: "Hoist A2", description: "Material hoist, south core, 3200kg" },
    { id: "h3", buildingId: "loc-a", name: "Hoist A3", description: "Passenger hoist, east stair core" },
    { id: "h4", buildingId: "loc-b", name: "Hoist B1", description: "Passenger/material hoist, main core" },
    { id: "h5", buildingId: "loc-b", name: "Hoist B2", description: "Material hoist, rear core, 2500kg" },
    { id: "h6", buildingId: "loc-podium", name: "Hoist P1", description: "Low-rise passenger/material hoist" },
  ];

  DB.shifts = [
    { id: "s1", name: "Morning Shift", start: "06:00", end: "14:00" },
    { id: "s2", name: "Afternoon Shift", start: "14:00", end: "22:00" },
    { id: "s3", name: "Night Shift", start: "22:00", end: "06:00" },
  ];

  DB.trades = [
    { id: "t1", division: "Div 1", name: "General Contractor" },
    { id: "t2", division: "Div 2", name: "Surveying" },
    { id: "t3", division: "Div 3", name: "Concrete" },
    { id: "t4", division: "Div 4", name: "Masonry" },
    { id: "t5", division: "Div 5", name: "Metals" },
    { id: "t6", division: "Div 6", name: "Woods and Plastics" },
    { id: "t7", division: "Div 7", name: "Thermal and Moisture Protection" },
    { id: "t8", division: "Div 8", name: "Openings" },
    { id: "t11", division: "Div 9", name: "Finishes" },
    { id: "t12", division: "Div 15", name: "Mechanical" },
    { id: "t13", division: "Div 16", name: "Electrical" },
  ];

  /* ---------------- Operator assignment per hoist/shift -------------- */
  const operatorPool = ["u5", "u6", "u7", "u8"];
  DB.operatorAssignments = {}; // hoistId -> shiftId -> { operatorId, since }
  DB.hoysts.forEach((h, hi) => {
    DB.operatorAssignments[h.id] = {};
    DB.shifts.forEach((s, si) => {
      // Leave Night shift unassigned on Hoist A3 and Hoist B2 deliberately, to show "unavailable" state
      if ((h.id === "h3" && s.id === "s3") || (h.id === "h5" && s.id === "s3")) {
        DB.operatorAssignments[h.id][s.id] = { operatorId: null, since: DB.today };
      } else {
        const op = operatorPool[(hi + si) % operatorPool.length];
        DB.operatorAssignments[h.id][s.id] = { operatorId: op, since: fmtDate(addDays(TODAY, -rndInt(2, 20))) };
      }
    });
  });

  DB.auditLog = [
    { id: "al1", timestamp: "2026-07-08 09:14", hoistId: "h1", shiftId: "s1", previousOperator: "u6", newOperator: "u5", changedBy: "Satish N", effectiveFrom: "2026-07-08" },
    { id: "al2", timestamp: "2026-07-06 17:02", hoistId: "h2", shiftId: "s2", previousOperator: "u8", newOperator: "u6", changedBy: "Satish N", effectiveFrom: "2026-07-07" },
    { id: "al3", timestamp: "2026-07-04 08:41", hoistId: "h3", shiftId: "s3", previousOperator: "u7", newOperator: null, changedBy: "Satish N", effectiveFrom: "2026-07-04" },
    { id: "al4", timestamp: "2026-07-02 11:20", hoistId: "h4", shiftId: "s1", previousOperator: null, newOperator: "u5", changedBy: "Satish N", effectiveFrom: "2026-07-02" },
    { id: "al5", timestamp: "2026-06-29 15:55", hoistId: "h5", shiftId: "s3", previousOperator: "u8", newOperator: null, changedBy: "Satish N", effectiveFrom: "2026-06-29" },
    { id: "al6", timestamp: "2026-06-27 07:30", hoistId: "h6", shiftId: "s2", previousOperator: "u7", newOperator: "u8", changedBy: "Satish N", effectiveFrom: "2026-06-27" },
  ];

  /* ---------------- Pairings ------------------------------------------ */
  DB.pairings = [
    { id: "pair1", buildingId: "loc-a", hoistIds: ["h1", "h2"], active: true },
  ];

  /* ---------------- Alerts -------------------------------------------- */
  DB.alerts = [
    {
      id: "a1", title: "Hoist A3 offline for emergency repair", text: "Hoist A3 has developed a fault and is offline until further notice. Please use Hoist A1 or A2 for all Tower A movements.",
      buildingId: "loc-a", hoistId: "h3", activeFrom: "2026-07-09 08:00", activeTill: "2026-07-11 18:00", createdBy: "Satish N", createdAt: "2026-07-09 07:55",
    },
    {
      id: "a2", title: "Planned maintenance — Hoist B2", text: "Hoist B2 will be down for scheduled maintenance. Please plan material movements accordingly.",
      buildingId: "loc-b", hoistId: "h5", activeFrom: "2026-07-10 22:00", activeTill: "2026-07-11 06:00", createdBy: "Satish N", createdAt: "2026-07-08 12:00",
    },
    {
      id: "a3", title: "Site-wide safety briefing at 07:45 tomorrow", text: "All hoyst operators and passengers must attend the safety briefing at the Tower A ground floor muster point.",
      buildingId: null, hoistId: null, activeFrom: "2026-07-10 06:00", activeTill: "2026-07-11 08:00", createdBy: "Satish N", createdAt: "2026-07-09 16:30",
    },
    {
      id: "a4", title: "Weather advisory — high winds expected", text: "High winds forecast this afternoon. Podium Block Hoist P1 may be paused intermittently for safety.",
      buildingId: "loc-podium", hoistId: "h6", activeFrom: "2026-07-10 12:00", activeTill: "2026-07-10 20:00", createdBy: "Satish N", createdAt: "2026-07-10 06:45",
    },
  ];

  /* ---------------- Bookings ------------------------------------------ */
  let bookingSeq = 1000;
  function nextBookingId() { return "BK-" + bookingSeq++; }

  DB.bookings = [
    // Today / upcoming individual bookings
    { id: nextBookingId(), createdAt: "2026-07-08 10:12", buildingId: "loc-a", hoistId: "h1", tradeId: "t4", activityDescription: "Brick pallets to Level 5", date: "2026-07-10", timeStart: "09:00", timeEnd: "09:30", recurring: null, bookedById: "u2", bookedForId: "u2", status: "Approved", isDeliveryLockout: false },
    { id: nextBookingId(), createdAt: "2026-07-09 14:02", buildingId: "loc-a", hoistId: "h2", tradeId: "t3", activityDescription: "Concrete curing equipment", date: "2026-07-10", timeStart: "10:30", timeEnd: "11:15", recurring: null, bookedById: "u3", bookedForId: "u3", status: "Pending", isDeliveryLockout: false },
    { id: nextBookingId(), createdAt: "2026-07-09 09:45", buildingId: "loc-b", hoistId: "h4", tradeId: "t13", activityDescription: "Cable reels to Level 3", date: "2026-07-10", timeStart: "13:00", timeEnd: "13:45", recurring: null, bookedById: "u4", bookedForId: "u4", status: "Approved", isDeliveryLockout: false },
    { id: nextBookingId(), createdAt: "2026-07-07 16:20", buildingId: "loc-a", hoistId: "h1", tradeId: "t7", activityDescription: "Insulation boards", date: "2026-07-11", timeStart: "08:00", timeEnd: "08:45", recurring: null, bookedById: "u9", bookedForId: "u9", status: "Declined", isDeliveryLockout: false },
    { id: nextBookingId(), createdAt: "2026-07-06 11:00", buildingId: "loc-podium", hoistId: "h6", tradeId: "t1", activityDescription: "Site walk — general contractor", date: "2026-07-12", timeStart: "15:00", timeEnd: "15:30", recurring: null, bookedById: "u2", bookedForId: "u2", status: "Approved", isDeliveryLockout: false },
    // Admin booking on behalf of someone else
    { id: nextBookingId(), createdAt: "2026-07-09 08:15", buildingId: "loc-a", hoistId: "h3", tradeId: "t5", activityDescription: "Steel handrail sections to Level 4", date: "2026-07-13", timeStart: "07:00", timeEnd: "08:00", recurring: null, bookedById: "u1", bookedForId: "u10", status: "Approved", isDeliveryLockout: false },
    // Recurring bookings (base)
    { id: nextBookingId(), createdAt: "2026-07-01 09:00", buildingId: "loc-a", hoistId: "h2", tradeId: "t4", activityDescription: "Weekly masonry material top-up", date: "2026-07-07", timeStart: "09:00", timeEnd: "09:45", recurring: { everyNWeeks: 1, daysOfWeek: ["Mon", "Thu"], until: "2026-08-04" }, bookedById: "u3", bookedForId: "u3", status: "Approved", isDeliveryLockout: false },
    { id: nextBookingId(), createdAt: "2026-06-28 13:00", buildingId: "loc-b", hoistId: "h4", tradeId: "t12", activityDescription: "Mechanical crew daily plant run", date: "2026-07-06", timeStart: "14:15", timeEnd: "14:45", recurring: { everyNWeeks: 1, daysOfWeek: ["Mon", "Tue", "Wed", "Thu", "Fri"], until: "2026-07-25" }, bookedById: "u4", bookedForId: "u4", status: "Approved", isDeliveryLockout: false },
    // Delivery lock-outs originating from V2 / V3
    { id: nextBookingId(), createdAt: "2026-07-08 07:30", buildingId: "loc-a", hoistId: "h1", tradeId: null, activityDescription: "Delivery lock-out — bulk cement delivery", date: "2026-07-10", timeStart: "11:30", timeEnd: "12:30", recurring: null, bookedById: null, bookedForId: null, status: "Approved", isDeliveryLockout: true, sourcePlatform: "V3", deliveryRef: "V3-DEL-10234" },
    { id: nextBookingId(), createdAt: "2026-07-07 15:10", buildingId: "loc-b", hoistId: "h5", tradeId: null, activityDescription: "Delivery lock-out — window unit delivery", date: "2026-07-11", timeStart: "09:00", timeEnd: "10:00", recurring: null, bookedById: null, bookedForId: null, status: "Approved", isDeliveryLockout: true, sourcePlatform: "V2", deliveryRef: "V2-BOOK-5521" },
  ];

  /* ---------------- Hoist Requests (mobile app originated) ------------ */
  const reqStatuses = ["Fulfilled", "Cancelled", "Pending"];
  DB.requests = [];
  let reqSeq = 1;
  for (let d = -6; d <= 1; d++) {
    const date = fmtDate(addDays(TODAY, d));
    const count = rndInt(2, 4);
    for (let i = 0; i < count; i++) {
      const hoyst = DB.hoysts[rndInt(0, DB.hoysts.length - 1)];
      const user = DB.users[rndInt(1, DB.users.length - 1)];
      const fromFloor = rndInt(0, 8);
      const toFloor = Math.max(0, fromFloor + rndInt(-3, 3));
      DB.requests.push({
        id: "RQ-" + (2000 + reqSeq++),
        date,
        time: `${String(rndInt(6, 21)).padStart(2, "0")}:${["00","15","30","45"][rndInt(0,3)]}`,
        buildingId: hoyst.buildingId,
        hoistId: hoyst.id,
        userId: user.id,
        fromFloor,
        toFloor,
        status: reqStatuses[rndInt(0, 2)],
      });
    }
  }

  /* ---------------- Chart data: last 7 days / 4 weeks / 12 months ----- */
  function genSeries(periods, labelFn) {
    return periods.map((p) => {
      const byHoist = {};
      DB.hoysts.forEach((h) => {
        byHoist[h.id] = { requests: rndInt(1, 9), reservations: rndInt(1, 7) };
      });
      return { label: labelFn(p), byHoist };
    });
  }

  const last7 = [-6, -5, -4, -3, -2, -1, 0].map((d) => fmtDate(addDays(TODAY, d)));
  const last4weeks = ["Wk -3", "Wk -2", "Wk -1", "This Wk"];
  const last12months = ["Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul"];

  DB.chart = {
    week: genSeries(last7, (d) => d.slice(5)),
    fourWeeks: genSeries(last4weeks, (l) => l),
    twelveMonths: genSeries(last12months, (l) => l),
  };

  function genUsageSeries(periods, labelFn) {
    return periods.map((p) => {
      const requestsPct = rndInt(20, 45);
      const reservationsPct = rndInt(20, 40);
      const idlePct = Math.max(5, 100 - requestsPct - reservationsPct);
      return { label: labelFn(p), requestsPct, reservationsPct, idlePct };
    });
  }
  DB.chart.usage = {
    week: genUsageSeries(last7, (d) => d.slice(5)),
    fourWeeks: genUsageSeries(last4weeks, (l) => l),
    twelveMonths: genUsageSeries(last12months, (l) => l),
  };

  /* ---------------- Home page counts ----------------------------------- */
  DB.homeCounts = {
    buildings: DB.buildings.length,
    hoists: DB.hoysts.length,
    requestsToday: DB.requests.filter((r) => r.date === DB.today).length,
    reservationsToday: DB.bookings.filter((b) => b.date === DB.today && !b.isDeliveryLockout).length,
    blockoutsToday: DB.bookings.filter((b) => b.date === DB.today && b.isDeliveryLockout).length + 1, // +1 for planned maintenance alert
  };

  window.DB = DB;
})();
