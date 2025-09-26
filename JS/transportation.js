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

/* ===== tabs ===== */
$$(".tab").forEach((tab) => {
  tab.onclick = () => {
    $$(".tab").forEach((x) => x.classList.remove("active"));
    tab.classList.add("active");
    const k = tab.dataset.tab;
    $$("main section").forEach((sec) => {
      const show = sec.getAttribute("data-panel") === k;
      sec.hidden = !show;
      tab.setAttribute("aria-selected", show ? "true" : "false");
    });
  };
});

/* ===== helpers ===== */
function fillTripSelects(model) {
  const sel = $("#tripSel"),
    msel = $("#mTripSel"),
    moveSel = $("#moveToTripSel");
  if (sel) sel.innerHTML = "";
  if (msel) msel.innerHTML = "";
  if (moveSel) moveSel.innerHTML = "";
  model.trips.forEach((t) => {
    sel?.add(new Option(t.name, t.id));
    msel?.add(new Option(t.name, t.id));
    moveSel?.add(new Option(t.name, t.id));
  });
}
function calcTripTotals(trip) {
  const { servicePct, taxPct } = loadCfg();
  const sub = trip.legs.reduce((s, l) => s + Number(l.price || 0), 0);
  const serv = Math.round(sub * (servicePct / 100));
  const tax = Math.round((sub + serv) * (taxPct / 100));
  return { sub, serv, tax, total: sub + serv + tax };
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
        <button class="btn-ghost small" data-collapse>Toggle</button>
        <div class="trip-name">${t.name}</div>
        <span class="pill">${t.legs.length} leg${
      t.legs.length === 1 ? "" : "s"
    }</span>
        <span class="pill">Total ${fmtINR(totals.total)}</span>
        <span class="small" style="margin-left:auto">Svc ${
          loadCfg().servicePct
        }% · Tax ${loadCfg().taxPct}%</span>
      </div>
      <div class="list" data-ti="${ti}"></div>
    `;

    const list = wrap.querySelector(".list");
    if (!t.legs.length) {
      const emp = document.createElement("div");
      emp.className = "muted small";
      emp.textContent = "No legs yet.";
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
        <label class="tick">
          <input type="checkbox" data-sel />
          <span class="fake"></span>
        </label>
        <div class="ico">${icon(l.mode)}</div>
        <div>
          <div class="item-top">
            <strong>${l.from || "—"} → ${l.to || "—"}</strong>
            <span class="pill pill-muted">${l.label}</span>
          </div>
          <div class="muted">${l.date || "—"} · <span class="pill">${
        l.mode
      }</span></div>

          <details class="edit">
            <summary>Edit</summary>
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
            <div class="btns" style="margin-top:6px; align-items:end; display:flex">
              <button class="btn-ghost" data-up>⬆️</button>
              <button class="btn-ghost" data-down>⬇️</button>
              <div class="grow"></div>
              <button class="btn-ghost danger" data-del>Remove</button>
              <button class="btn" data-save>Save</button>
            </div>
          </details>
        </div>
        <div style="text-align:right">
          <div>${fmtINR(l.price || 0)}</div>
          <button class="btn-ghost small" data-open>Edit</button>
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
        const det = row.querySelector("details.edit");
        det.open = true;
        det.scrollIntoView({ behavior: "smooth", block: "center" });
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

/* ===== manual records (unchanged) ===== */
$("#mAdd")?.addEventListener("click", () => {
  const m = loadT();
  m.manual.push({
    tripId: $("#mTripSel").value,
    provider: $("#mProv").value.trim(),
    from: $("#mFrom").value.trim(),
    to: $("#mTo").value.trim(),
    date: $("#mDate").value,
    ref: $("#mRef").value.trim(),
    amount: Number($("#mAmt").value || 0),
  });
  saveT(m);
  renderManual();
  toast("Saved record");
});
function renderManual() {
  const host = $("#manualList");
  if (!host) return;
  host.innerHTML = "";
  const m = loadT();
  if (!m.manual.length) {
    host.innerHTML = `<div class="muted">No records yet.</div>`;
    return;
  }
  m.manual.forEach((r, i) => {
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <label class="tick"><span class="fake"></span></label>
      <div class="ico">🧾</div>
      <div>
        <div><strong>${r.provider || "—"}</strong> — ${r.from || "—"} → ${
      r.to || "—"
    }</div>
        <div class="muted">${r.date || "—"} · Ref: ${r.ref || "—"}</div>
      </div>
      <div style="text-align:right">
        <div>${fmtINR(r.amount || 0)}</div>
        <button class="btn-ghost danger" data-del="${i}" style="margin-top:6px">Remove</button>
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
  const det = $$(`.item.selected details.edit`)[0];
  if (det) {
    det.open = true;
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
