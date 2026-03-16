const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const fmtINR = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");

/* ===== config (service/tax) ===== */
const CFG_KEY = "transportCfgV1";
function loadCfg() {
  try {
    return JSON.parse(
      localStorage.getItem(CFG_KEY) || '{"servicePct":0.5,"taxPct":12}'
    );
  } catch {
    return { servicePct: 0.5, taxPct: 12 };
  }
}
function saveCfg(cfg) {
  localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
}

/* ===== storage ===== */
function loadT() {
  try {
    return JSON.parse(
      localStorage.getItem("transportDraftV5") ||
        '{"trips":[{"id":"t1","name":"Trip 1","legs":[]}],"manual":[]}'
    );
  } catch {
    return { trips: [{ id: "t1", name: "Trip 1", legs: [] }], manual: [] };
  }
}
function saveT(v) {
  localStorage.setItem("transportDraftV5", JSON.stringify(v));
}
function toast(t) {
  alert(t);
}

/* ===== helpers ===== */
function fillTripSelects(model) {
  const sel = $("#tripSel"),
    moveSel = $("#moveToTripSel");
  if (sel) sel.innerHTML = "";
  if (moveSel) moveSel.innerHTML = "";
  model.trips.forEach((t) => {
    sel?.add(new Option(t.name, t.id));
    moveSel?.add(new Option(t.name, t.id));
  });
}
function calcTripTotals(trip) {
  const globalRates = loadCfg();
  // Prefer per-trip settings if they exist, otherwise fallback to global
  const servicePct = trip.servicePct !== undefined ? trip.servicePct : globalRates.servicePct;
  const taxPct = trip.taxPct !== undefined ? trip.taxPct : globalRates.taxPct;
  
  const sub = trip.legs.reduce((s, l) => s + Number(l.price || 0), 0);
  const serv = Math.round(sub * (servicePct / 100));
  const tax = Math.round((sub + serv) * (taxPct / 100));
  return { sub, serv, tax, total: sub + serv + tax, servicePct, taxPct };
}
function icon(mode) {
  return mode === "flight"
    ? "✈️"
    : mode === "train"
    ? "🚆"
    : mode === "bus"
    ? "🚌"
    : "🚗";
}

/* ===== Internal vs External Widget Toggle ===== */
$$(".mini-tab").forEach((tab) => {
  tab.onclick = () => {
    $$(".mini-tab").forEach((x) => x.classList.remove("active"));
    tab.classList.add("active");
    
    // Hide all booking flows internally
    $$(".booking-flow").forEach((sec) => sec.classList.add("panel-hidden"));
    
    // Show the active one
    const flowId = `booking-${tab.dataset.btype}`;
    const target = $(`#${flowId}`);
    if(target) target.classList.remove("panel-hidden");
  };
});

function initForm() {
  // Set default mode
  $("#mode").value = "flight";
  // Set default date to today
  $("#date").valueAsDate = new Date();
}

/* ===== selection ===== */
const selection = new Set(); // `${ti}:${li}`
function updateBulkBar() {
  const bar = $("#bulkBar");
  if (!bar) return;
  $("#selCount").textContent = selection.size;
  bar.hidden = selection.size === 0;
}
function clearSelection() {
  selection.clear();
  $$(".item").forEach((el) => el.classList.remove("selected"));
  updateBulkBar();
}

/* ===== render ===== */
function render() {
  const model = loadT();
  fillTripSelects(model);

  const tripsHost = $("#trips");
  if (tripsHost) tripsHost.innerHTML = "";

  let grand = 0;
  const parts = [];
  const modeTotals = { flight: 0, train: 0, bus: 0, car: 0 };

  model.trips.forEach((t, ti) => {
    const totals = calcTripTotals(t);
    grand += totals.total;
    parts.push(`${t.name} ${fmtINR(totals.total)}`);

    const wrap = document.createElement("div");
    wrap.className = "trip";
    wrap.innerHTML = `
      <div class="trip-h">
        <div class="trip-name">${t.name}</div>
        <span class="pill">${t.legs.length} leg${
      t.legs.length === 1 ? "" : "s"
    }</span>
        <span class="pill">Due ${fmtINR(totals.total)}</span>
        <div class="grow"></div>
        <span class="small muted">Svc ${totals.servicePct}% · Tax ${totals.taxPct}%</span>
        
        <button class="btn-ghost small" data-edit-trip aria-label="Edit Trip Details">Edit Trip</button>
        <button class="btn-ghost small" data-collapse style="margin-left:8px;" aria-label="Toggle Trip">↕</button>
      </div>

      <div class="edit-wrap trip-edit-wrap">
          <div class="row">
              <label>Rename Trip <input type="text" data-trip-name="${ti}" value="${t.name}" /></label>
          </div>
          <div class="btns" style="margin-top: 16px; justify-content: flex-end;">
              <button class="btn-ghost danger small" data-trip-del="${ti}">Delete Trip</button>
              <button class="btn small" data-trip-save="${ti}">Save Changes</button>
          </div>
      </div>

      <div class="timeline-container list" data-ti="${ti}"></div>
    `;

    // Hook trip edit controls
    const tripEditWrap = wrap.querySelector('.trip-edit-wrap');
    wrap.querySelector('[data-edit-trip]').onclick = () => {
        tripEditWrap.classList.toggle('open');
    };
    
    wrap.querySelector(`[data-trip-save="${ti}"]`).onclick = () => {
        const m = loadT();
        const tripNode = wrap.querySelector(`.trip-edit-wrap`);
        
        const newName = tripNode.querySelector(`[data-trip-name="${ti}"]`).value.trim();
        
        if(newName) m.trips[ti].name = newName;
        
        saveT(m);
        render();
        toast("Trip updated");
    };

    wrap.querySelector(`[data-trip-del="${ti}"]`).onclick = () => {
        if(confirm(`Are you sure you want to permanently delete "${t.name}" and all its legs?`)) {
            const m = loadT();
            m.trips.splice(ti, 1);
            saveT(m);
            // Re-select first trip if none active
            if(m.trips.length === 0) {
               addTripIfNeeded();
            }
            render();
            toast("Trip deleted");
        }
    };

    const list = wrap.querySelector(".list");
    if (!t.legs.length) {
      const emp = document.createElement("div");
      emp.className = "muted small";
      emp.style.marginLeft = "80px";
      emp.textContent = "No legs scheduled yet.";
      list.appendChild(emp);
    }

    t.legs.forEach((l, li) => {
      if (!l.label) l.label = `Leg ${li + 1}`;
      const key = `${ti}:${li}`;
      modeTotals[l.mode] = (modeTotals[l.mode] || 0) + Number(l.price || 0);

      const row = document.createElement("div");
      row.className = "item";
      if (selection.has(key)) row.classList.add("selected");
      row.innerHTML = `
        <div class="item-left">
          <div class="timeline-node">${icon(l.mode)}</div>
        </div>
        
        <div class="item-center">
          <label class="tick">
            <input type="checkbox" data-sel />
            <span class="fake"></span>
          </label>
          <div class="item-top">
            <div class="route-text">${l.from || "—"} <span>${icon(l.mode)}</span> ${l.to || "—"}</div>
            <span class="meta-tag">${l.label}</span>
          </div>
          <div class="item-meta-row">
              <div>${l.date || "—"}</div>
              <div><strong>${l.mode.toUpperCase()}</strong></div>
          </div>
        </div>
        
        <div class="item-right">
          <div class="item-price">${fmtINR(l.price || 0)}</div>
          <button class="btn-ghost small" data-open>Details</button>
        </div>
        <div class="edit-wrap">
          <div class="edit">
            <div class="row2" style="margin-top:6px">
              <label>Label <input data-ed="label" value="${
                l.label || ""
              }"/></label>
              <label>Mode
                <select data-ed="mode">
                  <option ${
                    l.mode === "flight" ? "selected" : ""
                  } value="flight">Flight</option>
                  <option ${
                    l.mode === "train" ? "selected" : ""
                  } value="train">Train</option>
                  <option ${
                    l.mode === "bus" ? "selected" : ""
                  } value="bus">Bus</option>
                  <option ${
                    l.mode === "car" ? "selected" : ""
                  } value="car">Car</option>
                </select>
              </label>
            </div>
            <div class="row2" style="margin-top:6px">
              <label>From <input data-ed="from" value="${
                l.from || ""
              }"/></label>
              <label>To <input data-ed="to" value="${l.to || ""}"/></label>
            </div>
            <div class="row2" style="margin-top:6px">
              <label>Date <input data-ed="date" type="date" value="${
                l.date || ""
              }"/></label>
              <label>Price (₹) <input data-ed="price" type="number" min="0" value="${
                l.price || 0
              }"/></label>
            </div>
            <div class="btns" style="margin-top:16px; align-items:end; display:flex">
              <button class="btn-ghost" data-up>⬆️ Move</button>
              <button class="btn-ghost" data-down>⬇️ Move</button>
              <div class="grow"></div>
              <button class="btn-ghost danger" data-del>Remove</button>
              <button class="btn" data-save>Save</button>
            </div>
          </div>
        </div>
      `;

      // selection
      const cb = row.querySelector("[data-sel]");
      cb.checked = selection.has(key);
      cb.onchange = (e) => {
        if (e.target.checked) {
          selection.add(key);
          row.classList.add("selected");
        } else {
          selection.delete(key);
          row.classList.remove("selected");
        }
        updateBulkBar();
      };

      // quick open
      row.querySelector("[data-open]").onclick = () => {
        const wrap = row.querySelector(".edit-wrap");
        wrap.classList.toggle("open");
        if(wrap.classList.contains("open")) {
            wrap.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      };

      // move up/down
      row.querySelector("[data-up]").onclick = () => {
        const m = loadT();
        if (li > 0) {
          const a = m.trips[ti].legs;
          [a[li - 1], a[li]] = [a[li], a[li - 1]];
          saveT(m);
          render();
        }
      };
      row.querySelector("[data-down]").onclick = () => {
        const m = loadT();
        const a = m.trips[ti].legs;
        if (li < a.length - 1) {
          [a[li + 1], a[li]] = [a[li], a[li + 1]];
          saveT(m);
          render();
        }
      };

      // remove
      row.querySelector("[data-del]").onclick = () => {
        const m = loadT();
        m.trips[ti].legs.splice(li, 1);
        saveT(m);
        selection.delete(key);
        render();
      };

      // save
      row.querySelector("[data-save]").onclick = () => {
        const m = loadT();
        const ed = (k) => row.querySelector(`[data-ed="${k}"]`).value;
        m.trips[ti].legs[li] = {
          label: (ed("label") || `Leg ${li + 1}`).trim(),
          mode: ed("mode"),
          from: ed("from").trim(),
          to: ed("to").trim(),
          date: ed("date"),
          price: Number(ed("price") || 0),
        };
        saveT(m);
        render();
        toast("Saved");
      };

      list.appendChild(row);
    });

    // collapse
    wrap.querySelector("[data-collapse]").onclick = () => {
      const cur = wrap.querySelector(".list");
      cur.style.display = cur.style.display === "none" ? "" : "none";
    };

    tripsHost?.appendChild(wrap);
  });

  // totals
  $("#grand").textContent = fmtINR(grand);
  $("#breakdown").textContent = parts.length
    ? parts.length === 1
      ? parts[0]
      : parts.join(" + ") + " = " + fmtINR(grand)
    : "—";

  // mode chips
  const chipsHost = $("#modeTotals");
  if (chipsHost) {
    chipsHost.innerHTML = "";
    Object.entries(modeTotals).forEach(([k, v]) => {
      const chip = document.createElement("span");
      chip.className = "chip";
      const label = k[0].toUpperCase() + k.slice(1);
      chip.textContent = `${label}: ${fmtINR(v)}`;
      chipsHost.appendChild(chip);
    });
  }

  updateBulkBar();
}

/* ===== add leg & trips ===== */
function addTripIfNeeded() {
  const m = loadT();
  if (!m.trips.length) {
    m.trips.push({ id: "t1", name: "Trip 1", legs: [] });
    saveT(m);
  }
}
$("#newTrip").onclick = () => {
  const m = loadT();
  const idx = m.trips.length + 1;
  m.trips.push({ id: "t" + idx, name: "Trip " + idx, legs: [] });
  saveT(m);
  render();
};
$("#tripSel").addEventListener("change", () => {
  const m = loadT();
  const t = m.trips.find((x) => x.id === $("#tripSel").value);
  $("#tripName").value = t?.name || "";
});
$("#tripName").addEventListener("change", () => {
  const m = loadT();
  const t = m.trips.find((x) => x.id === $("#tripSel").value);
  if (t) {
    t.name = $("#tripName").value.trim() || t.name;
    saveT(m);
    render();
  }
});
$("#add").onclick = () => {
  addTripIfNeeded();
  const m = loadT();
  const tId = $("#tripSel").value || m.trips[0].id;
  const t = m.trips.find((x) => x.id === tId);
  const leg = {
    label: `Leg ${t.legs.length + 1}`,
    mode: $("#mode").value,
    from: $("#from").value.trim(),
    to: $("#to").value.trim(),
    date: $("#date").value,
    price: Number($("#price").value || 0),
  };
  if (!leg.from || !leg.to || !leg.date) {
    toast("Please fill From, To, Date.");
    return;
  }
  t.legs.push(leg);
  saveT(m);
  render();
  $("#price").value = "";
  $("#from").value = "";
  $("#to").value = "";
  $("#date").value = "";
};

$("#newTripExternal")?.addEventListener("click", () => {
  $("#newTrip").click(); // Trigger same core logic
  setTimeout(() => {
     $(`[data-btype="external"]`)?.click(); // Keep external mode active
  }, 10);
});

/* ===== manual records ===== */
$("#mAdd")?.addEventListener("click", () => {
  const m = loadT();
  const rawProvider = $("#mProv").value.trim();
  const rawFrom = $("#mFrom").value.trim();
  const rawTo = $("#mTo").value.trim();
  const rawDate = $("#mDate").value;
  const rawRef = $("#mRef").value.trim();
  const rawAmt = Number($("#mAmt").value || 0);

  if (!rawProvider || !rawFrom || !rawTo) {
    toast("Provider, From, and To are required.");
    return;
  }

  // Use the main tripSel since we are now unified in one widget!
  const selTId = $("#tripSel").value || m.trips[0]?.id;

  m.manual.push({
    provider: rawProvider,
    from: rawFrom,
    to: rawTo,
    date: rawDate,
    ref: rawRef,
    amount: rawAmt,
    tripId: selTId 
  });
  saveT(m);

  renderManual();
  toast("External record saved.");

  // Reset external inputs
  $("#mProv").value = "";
  $("#mFrom").value = "";
  $("#mTo").value = "";
  $("#mDate").value = "";
  $("#mRef").value = "";
  $("#mAmt").value = "";
});
function renderManual() {
  const host = $("#manualList");
  if (!host) return;
  host.innerHTML = "";
  const m = loadT();
  if (!m.manual.length) {
    return; // Handled by CSS empty pseudo
  }
  m.manual.forEach((r, i) => {
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div class="item-left">
        <div class="timeline-node">🧾</div>
      </div>
      <div class="item-center">
        <div class="route-text">${r.provider || "—"} <span>▶</span> ${r.from || "—"} to ${r.to || "—"}</div>
        <div class="item-meta-row">
            <div>${r.date || "—"}</div>
            <div>Ref: <strong>${r.ref || "—"}</strong></div>
        </div>
      </div>
      <div class="item-right">
        <div class="item-price">${fmtINR(r.amount || 0)}</div>
        <button class="btn-ghost danger small" data-del="${i}">Remove</button>
      </div>`;
    div.querySelector("[data-del]").onclick = () => {
      const m2 = loadT();
      m2.manual.splice(i, 1);
      saveT(m2);
      renderManual();
    };
    host.appendChild(div);
  });
}

/* ===== bulk actions ===== */
$("#bulkClear")?.addEventListener("click", clearSelection);
$("#bulkDelete")?.addEventListener("click", () => {
  if (!selection.size) return;
  const m = loadT();
  const byTrip = {};
  for (const key of selection) {
    const [ti, li] = key.split(":").map(Number);
    (byTrip[ti] ||= []).push(li);
  }
  Object.entries(byTrip).forEach(([sti, arr]) => {
    const ti = Number(sti);
    arr.sort((a, b) => b - a).forEach((li) => m.trips[ti]?.legs?.splice(li, 1));
  });
  saveT(m);
  clearSelection();
  render();
  toast("Removed selected legs");
});
$("#bulkEdit")?.addEventListener("click", () => {
  if (selection.size !== 1) {
    toast("Select exactly one leg to edit.");
    return;
  }
  const det = $$(`.item.selected .edit-wrap`)[0];
  if (det) {
    det.classList.add("open");
    det.scrollIntoView({ behavior: "smooth", block: "center" });
  }
});
$("#moveToTrip")?.addEventListener("click", () => {
  if (!selection.size) {
    toast("Select some legs first.");
    return;
  }
  const targetId = $("#moveToTripSel").value;
  const m = loadT();
  const target = m.trips.find((t) => t.id === targetId);
  if (!target) return;
  const moves = [];
  for (const key of selection) {
    const [ti, li] = key.split(":").map(Number);
    const srcTrip = m.trips[ti];
    if (srcTrip?.legs?.[li]) moves.push({ ti, li });
  }
  moves
    .sort((a, b) => (a.ti !== b.ti ? b.ti - a.ti : b.li - a.li))
    .forEach(({ ti, li }) => {
      const [leg] = m.trips[ti].legs.splice(li, 1);
      target.legs.push(leg);
    });
  saveT(m);
  clearSelection();
  render();
  toast("Moved to selected trip");
});

/* ===== per-trip actions ===== */
$("#dupTrip")?.addEventListener("click", () => {
  const m = loadT();
  const tId = $("#tripSel").value || m.trips[0].id;
  const src = m.trips.find((x) => x.id === tId);
  if (!src) return;
  const idx = m.trips.length + 1;
  const copy = JSON.parse(JSON.stringify(src));
  copy.id = "t" + idx;
  copy.name = src.name + " (copy)";
  saveT({ ...m, trips: [...m.trips, copy] });
  render();
  toast("Trip duplicated");
});
$("#clearTrip")?.addEventListener("click", () => {
  const m = loadT();
  const tId = $("#tripSel").value || m.trips[0].id;
  const t = m.trips.find((x) => x.id === tId);
  if (!t) return;
  if (!confirm(`Clear all legs in "${t.name}"?`)) return;
  t.legs = [];
  saveT(m);
  render();
  toast("Trip cleared");
});

/* ===== rates ===== */
function syncRateInputs() {
  const { servicePct, taxPct } = loadCfg();
  $("#svcPct").value = servicePct;
  $("#taxPct").value = taxPct;
}
$("#saveRates")?.addEventListener("click", () => {
  const cfg = {
    servicePct: Number($("#svcPct").value || 0),
    taxPct: Number($("#taxPct").value || 0),
  };
  saveCfg(cfg);
  render();
  toast("Rates updated");
});
$("#resetRates")?.addEventListener("click", () => {
  saveCfg({ servicePct: 0.5, taxPct: 12 });
  syncRateInputs();
  render();
});

/* ===== boot ===== */
(function boot() {
  const m = loadT();
  fillTripSelects(m);
  $("#tripName").value = m.trips[0]?.name || "Trip 1";
  syncRateInputs();
  render();
  renderManual();
})();
