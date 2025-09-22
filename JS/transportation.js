const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const fmtINR = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");
const SERVICE_RATE_PCT = 0.5,
  TAX_RATE_PCT = 12;

function loadT() {
  try {
    return JSON.parse(
      localStorage.getItem("transportDraftV2") ||
        '{"trips":[{"id":"t1","name":"Trip 1","legs":[]}] ,"manual":[]}'
    );
  } catch {
    return { trips: [{ id: "t1", name: "Trip 1", legs: [] }], manual: [] };
  }
}
function saveT(v) {
  localStorage.setItem("transportDraftV2", JSON.stringify(v));
}

function toast(t) {
  alert(t);
} // keep simple/to match your UI

/* ------- tabs ------- */
$$(".tab").forEach((tab) => {
  tab.onclick = () => {
    $$(".tab").forEach((x) => x.classList.remove("active"));
    tab.classList.add("active");
    const k = tab.dataset.tab;
    $$("section.grid").forEach((sec) => {
      sec.hidden = sec.getAttribute("data-panel") !== k;
    });
  };
});

/* ------- trips UI helpers ------- */
function fillTripSelects(model) {
  const sel = $("#tripSel"),
    msel = $("#mTripSel");
  sel.innerHTML = "";
  msel.innerHTML = "";
  model.trips.forEach((t) => {
    sel.add(new Option(t.name, t.id));
    msel.add(new Option(t.name, t.id));
  });
}

function calcTripTotals(trip) {
  const sub = trip.legs.reduce((s, l) => s + Number(l.price || 0), 0);
  const serv = Math.round(sub * (SERVICE_RATE_PCT / 100));
  const tax = Math.round((sub + serv) * (TAX_RATE_PCT / 100));
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

function render() {
  const model = loadT();
  fillTripSelects(model);

  const tripsHost = $("#trips");
  tripsHost.innerHTML = "";
  let grand = 0;

  model.trips.forEach((t, ti) => {
    const totals = calcTripTotals(t);
    grand += totals.total;
    const wrap = document.createElement("div");
    wrap.className = "trip";
    wrap.innerHTML = `
      <div class="trip-h">
        <div class="trip-name">${t.name}</div>
        <span class="pill">${t.legs.length} leg${
      t.legs.length === 1 ? "" : "s"
    }</span>
        <span class="pill">Total ${fmtINR(totals.total)}</span>
        <span class="small" style="margin-left:auto">Service 0.5% · Tax 12%</span>
      </div>
      <div class="list" data-ti="${ti}"></div>
    `;
    const list = wrap.querySelector(".list");
    t.legs.forEach((l, li) => {
      const row = document.createElement("div");
      row.className = "item";
      row.innerHTML = `
        <div class="ico">${icon(l.mode)}</div>
        <div>
          <div><strong>${l.from || "—"} → ${l.to || "—"}</strong></div>
          <div class="muted">${l.date || "—"} · <span class="pill">${
        l.mode
      }</span></div>
          <details class="edit"><summary>Edit</summary>
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
            <div class="row2" style="margin-top:6px">
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
              <div class="btns" style="align-items:end;display:flex">
                <button class="btn-ghost danger" data-del>Remove</button>
                <button class="btn" data-save>Save</button>
              </div>
            </div>
          </details>
        </div>
        <div style="text-align:right">
          <div>${fmtINR(l.price || 0)}</div>
        </div>
      `;
      row.querySelector("[data-del]").onclick = () => {
        const m = loadT();
        m.trips[ti].legs.splice(li, 1);
        saveT(m);
        render();
      };
      row.querySelector("[data-save]").onclick = () => {
        const m = loadT();
        const ed = (k) => row.querySelector(`[data-ed="${k}"]`).value;
        m.trips[ti].legs[li] = {
          mode: ed("mode"),
          from: ed("from"),
          to: ed("to"),
          date: ed("date"),
          price: Number(ed("price") || 0),
        };
        saveT(m);
        render();
        toast("Saved");
      };
      list.appendChild(row);
    });
    tripsHost.appendChild(wrap);
  });

  $("#grand").textContent = fmtINR(grand);
}

/* ------- add leg & trips ------- */
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
  toast("Leg added");
  $("#price").value = "";
};

/* ------- manual records ------- */
$("#mAdd").onclick = () => {
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
};

function renderManual() {
  const host = $("#manualList");
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

/* ------- boot ------- */
(function boot() {
  const m = loadT();
  fillTripSelects(m);
  $("#tripName").value = m.trips[0]?.name || "Trip 1";
  render();
  renderManual();
})();
