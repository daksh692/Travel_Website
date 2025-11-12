const API_HOST = `http://${location.hostname}:3001`;
const API_BASE = `${API_HOST}/api`;

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const todayISO = () => new Date().toISOString().slice(0, 10);

const fmtINR = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");
const PKG_LABELS = ["Basic", "Plus", "Premium"];

const SERVICE_RATE_PCT = 0.5;
const TAX_RATE_PCT = 12;

/* ===== Toasts ===== */
function showToast({
  title = "Saved",
  message = "",
  type = "success",
  timeout = 1500,
} = {}) {
  const host = $("#toasts");
  if (!host) return;
  const el = document.createElement("div");
  el.className = "lp-toast";
  el.dataset.type = type;
  const icons = { success: "✓", error: "✕", warning: "!", info: "ℹ" };
  el.innerHTML = `
    <div class="icon">${icons[type] || icons.info}</div>
    <div class="content"><p class="title">${title}</p><p class="msg">${message}</p></div>
    <button class="close" aria-label="Close">×</button>
    <div class="bar"><span style="animation-duration:${timeout}ms"></span></div>`;
  const remove = () => {
    el.style.transition = "opacity .15s, transform .15s";
    el.style.opacity = "0";
    el.style.transform = "translateY(6px) scale(.98)";
    setTimeout(() => el.remove(), 160);
  };
  el.querySelector(".close").addEventListener("click", remove);
  host.appendChild(el);
  const t = setTimeout(remove, timeout);
  el.addEventListener("mouseenter", () => clearTimeout(t), { once: true });
}

/* ===== Storage ===== */
const CART_KEY = "cartDraft";
const GROUPS_KEY = "cartGroups";

const loadCart = () => {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY) || "[]");
  } catch {
    return [];
  }
};
const saveCart = (v) => localStorage.setItem(CART_KEY, JSON.stringify(v));
const loadGroups = () => {
  try {
    return JSON.parse(localStorage.getItem(GROUPS_KEY) || "[]");
  } catch {
    return [];
  }
};
const saveGroups = (v) => localStorage.setItem(GROUPS_KEY, JSON.stringify(v));
const killEmptyGroups = () => {
  const cart = loadCart();
  const groups = loadGroups().filter((g) =>
    cart.some((it) => it.groupId === g.id)
  );
  localStorage.setItem(GROUPS_KEY, JSON.stringify(groups));
};

/* ===== Edit mode & filter ===== */
let EDIT_MODE = false;
let TRIP_FILTER = "ongoing"; // 'past' | 'ongoing' | 'future'
const editToggle = $("#editToggle");
const editOnlyBar = $("#editOnlyBar");
const filterButtons = [
  $("#filterPast"),
  $("#filterOngoing"),
  $("#filterFuture"),
];
filterButtons.forEach((btn) =>
  btn.addEventListener("click", () => {
    TRIP_FILTER = btn.dataset.mode;
    filterButtons.forEach((b) => b.classList.toggle("active", b === btn));
    render();
  })
);

function setEditMode(on) {
  EDIT_MODE = !!on;
  editToggle.textContent = `Edit mode: ${EDIT_MODE ? "ON" : "OFF"}`;
  $$(".edit-only").forEach((el) => el.classList.toggle("hidden", !EDIT_MODE));
  $$(".view-only").forEach((el) => el.classList.toggle("hidden", EDIT_MODE));
  $$(".edit-only-input").forEach((el) => (el.disabled = !EDIT_MODE));
  if (!EDIT_MODE) {
    selected.clear();
    updateSelectionBadge();
  }
  render();
}
editToggle.addEventListener("click", () => setEditMode(!EDIT_MODE));

/* ===== Controls ===== */
const tripStart = $("#tripStart");
const summaryDate = $("#summaryDate");
const serviceRateVal = $("#serviceRateVal");
const taxRateVal = $("#taxRateVal");
const sumHint = $("#sumHint");
const sumSubtotal = $("#sumSubtotal");
const sumService = $("#sumService");
const sumTax = $("#sumTax");
const sumTotal = $("#sumTotal");
const sumServiceRate = $("#sumServiceRate");
const sumTaxRate = $("#sumTaxRate");
const sumDays = $("#sumDays");
const sumStart = $("#sumStart");
const sumEnd = $("#sumEnd");
const sumStates = $("#sumStates");
const itemsHost = $("#items");
const groupsHost = $("#groupsHost");
const selectionCount = $("#selectionCount");

serviceRateVal.textContent = `${SERVICE_RATE_PCT}%`;
taxRateVal.textContent = `${TAX_RATE_PCT}%`;
sumServiceRate.textContent = `${SERVICE_RATE_PCT}%`;
sumTaxRate.textContent = `${TAX_RATE_PCT}%`;

/* defaults */
(function initStart() {
  const gs = localStorage.getItem("tripStart") || todayISO();
  tripStart.value = gs;
  summaryDate.value = gs;
  tripStart.addEventListener("change", () => {
    localStorage.setItem("tripStart", tripStart.value);
    if (!EDIT_MODE) {
      summaryDate.value = tripStart.value;
    }
    render();
  });
  summaryDate.addEventListener("change", render);
})();

/* ===== State cache + images ===== */
const stateCache = new Map();
async function getStateData(stateName) {
  const key = String(stateName || "").trim();
  if (stateCache.has(key)) return stateCache.get(key);
  const res = await fetch(
    `${API_BASE}/states/${encodeURIComponent(key)}/places`
  );
  const json = await res.json();
  if (!res.ok || json.ok === false)
    throw new Error(json.error || "Failed to load state data");
  stateCache.set(key, json);
  return json;
}
async function ensureItemImage(item) {
  if (item.img) return item.img;
  try {
    const data = await getStateData(item.state);
    const row = (data.items || []).find((x) => x.place === item.place);
    if (row?.img) {
      item.img = row.img;
      const list = loadCart();
      const idx = list.findIndex(
        (p) =>
          p.state === item.state &&
          p.place === item.place &&
          p.package === item.package &&
          Number(p.price) === Number(item.price)
      );
      if (idx >= 0) {
        list[idx].img = row.img;
        saveCart(list);
      }
      return row.img;
    }
  } catch {}
  return null;
}

/* ===== Selection ===== */
const selected = new Set();
function toggleSelect(idx) {
  if (selected.has(idx)) selected.delete(idx);
  else selected.add(idx);
  updateSelectionBadge();
  renderSummary();
}
function clearSelection() {
  selected.clear();
  updateSelectionBadge();
  renderSummary();
}
function updateSelectionBadge() {
  if (selected.size > 0) {
    selectionCount.hidden = false;
    selectionCount.textContent = `Selected: ${selected.size}`;
  } else {
    selectionCount.hidden = true;
  }
}

/* ===== Grouping ===== */
function generateGroupName() {
  return `Group ${loadGroups().length + 1}`;
}

function groupSelected() {
  const cart = loadCart();
  if (selected.size < 2)
    return alertDialog("Select 2 or more places to group.", "Grouping error");
  const id = crypto.randomUUID();
  const groups = loadGroups();
  groups.push({ id, name: generateGroupName(), start: tripStart.value });
  saveGroups(groups);
  const arr = loadCart();
  [...selected].forEach((idx) => {
    const it = arr[idx];
    if (it) it.groupId = id;
  });
  saveCart(arr);
  clearSelection();
  autoAssignSequentialDates(id); // new: initialize dates
  showToast({
    title: "Grouped",
    message: "Places have been grouped.",
    type: "success",
  });
  render();
}

function smartGroupFlow() {
  const cart = loadCart();
  if (!cart.length) return alertDialog("No places to group.");
  const states = [...new Set(cart.map((i) => i.state).filter(Boolean))];
  if (states.length === 1) return applySmartGroup(states[0]);
  const host = $("#stateChoices");
  host.innerHTML = "";
  states.forEach((st) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pkg-btn";
    const count = cart.filter((i) => i.state === st).length;
    btn.textContent = `${st} (${count})`;
    btn.addEventListener("click", () => {
      $("#stateDialog").close();
      applySmartGroup(st);
    });
    host.appendChild(btn);
  });
  $("#stateDialog").showModal();
}
function applySmartGroup(stateName) {
  const cart = loadCart();
  const targets = cart
    .map((it, i) => ({ it, i }))
    .filter((x) => x.it.state === stateName)
    .map((x) => x.i);
  if (targets.length < 2)
    return alertDialog(`Need at least 2 places in ${stateName} to group.`);
  const id = crypto.randomUUID();
  const groups = loadGroups();
  groups.push({ id, name: `${stateName} Trip`, start: tripStart.value });
  saveGroups(groups);
  targets.forEach((idx) => {
    cart[idx].groupId = id;
  });
  saveCart(cart);
  clearSelection();
  autoAssignSequentialDates(id);
  showToast({
    title: "Smart grouped",
    message: `Grouped ${targets.length} place(s) in ${stateName}.`,
    type: "success",
  });
  render();
}

function ungroup(id) {
  const groups = loadGroups().filter((g) => g.id !== id);
  saveGroups(groups);
  const cart = loadCart().map((it) =>
    it.groupId === id ? { ...it, groupId: null } : it
  );
  saveCart(cart);
  showToast({ title: "Ungrouped", message: "Group removed.", type: "warning" });
  render();
}
function removeFromGroup(idx) {
  const cart = loadCart();
  if (!cart[idx]) return;
  const old = cart[idx].groupId;
  cart[idx].groupId = null;
  saveCart(cart);
  if (old) killEmptyGroups();
  showToast({
    title: "Removed",
    message: "Destination removed from group.",
    type: "info",
  });
  render();
}
function renameGroup(id, newName) {
  const groups = loadGroups();
  const g = groups.find((x) => x.id === id);
  if (!g) return;
  g.name = String(newName || g.name).trim() || g.name;
  saveGroups(groups);
  render();
}

/* ===== Dialogs ===== */
function alertDialog(msg, title = "Action required") {
  $("#alertTitle").textContent = title;
  $("#alertMsg").textContent = msg;
  $("#alertDialog").showModal();
}

/* ===== Helpers for dates ===== */
function addDays(iso, n) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function durationDays(it) {
  return Math.max(0, Number(it.days || 0) * Math.max(1, Number(it.qty || 1)));
}
function effectiveStart(it, groups) {
  if (it.start) return it.start;
  const g = it.groupId ? groups.find((x) => x.id === it.groupId) : null;
  if (g?.start) return g.start;
  return tripStart.value;
}

/* ===== Auto sequential dates inside a group ===== */
function autoAssignSequentialDates(groupId) {
  const groups = loadGroups();
  const g = groups.find((x) => x.id === groupId);
  if (!g || !g.start) return;

  const cart = loadCart();
  const members = cart
    .map((it, i) => ({ it, i }))
    .filter((x) => x.it.groupId === groupId);

  // only assign to those without a start date
  let cursor = g.start;
  for (const { it, i } of members) {
    if (!it.start) {
      cart[i].start = cursor;
      const span = durationDays(it);
      cursor = addDays(cursor, Math.max(1, span)); // next start = prev start + prev duration
    } else if (it.start < g.start) {
      // enforce min
      cart[i].start = g.start;
      showToast({
        title: "Adjusted",
        message: `${it.place} date moved to group start`,
        type: "warning",
      });
      const span = durationDays(it);
      cursor = addDays(cart[i].start, Math.max(1, span));
    } else {
      const span = durationDays(it);
      // keep cursor in case later members need it
      cursor = addDays(it.start, Math.max(1, span));
    }
  }
  saveCart(cart);
}

/* ===== Package dialog ===== */
const pkgDialog = $("#pkgDialog");
const pkgPlace = $("#pkgPlace");
const pkgOptions = $("#pkgOptions");
async function openPackageDialog(cartIdx) {
  const cart = loadCart();
  const it = cart[cartIdx];
  pkgPlace.textContent = `${it.place} — ${it.state}`;
  pkgOptions.innerHTML = "Loading options…";
  try {
    const data = await getStateData(it.state);
    const row = (data.items || []).find((x) => x.place === it.place);
    if (!row || !row.prices?.length) {
      pkgOptions.textContent = "No alternative packages available.";
    } else {
      pkgOptions.innerHTML = "";
      row.prices.forEach((p, i) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "pkg-btn";
        const label = PKG_LABELS[i] || `Package ${i + 1}`;
        btn.textContent = `${label} · ${fmtINR(p)}`;
        btn.addEventListener("click", () => {
          const arr = loadCart();
          arr[cartIdx].package = label;
          arr[cartIdx].price = Number(p);
          saveCart(arr);
          showToast({
            title: "Package updated",
            message: `${label} for ${it.place}`,
            type: "success",
          });
          pkgDialog.close();
          render();
        });
        pkgOptions.appendChild(btn);
      });
    }
  } catch {
    pkgOptions.textContent = "Failed to load package options.";
  }
  pkgDialog.showModal();
}

/* ===== Rendering ===== */
function showSkeleton(n = 4) {
  itemsHost.innerHTML = "";
  for (let i = 0; i < n; i++) {
    const el = document.createElement("div");
    el.className = "ct-skel";
    el.innerHTML = `
      <div class="s1 shine"></div>
      <div>
        <div class="s2 shine"></div>
        <div class="s3 shine"></div>
        <div class="s4 shine"></div>
      </div>
      <div></div>`;
    itemsHost.appendChild(el);
  }
}

function classifyWindow(startISO, days) {
  if (!startISO || !days) return "future";
  const endISO = addDays(startISO, days - 1);
  const t = todayISO();
  if (endISO < t) return "past";
  if (startISO <= t && t <= endISO) return "ongoing";
  return "future";
}

function render() {
  killEmptyGroups();

  const cart = loadCart();
  const groups = loadGroups();

  if (!cart.length) {
    $("#groupsHost").innerHTML = "";
    itemsHost.innerHTML = `<div class="ct-empty">No items in your trip yet. <a href="places/INDmap.html">Explore places</a>.</div>`;
    renderSummary([]);
    return;
  }

  /* render groups */
  groupsHost.innerHTML = "";
  const byGroup = new Map();
  cart.forEach((it, idx) => {
    if (it.groupId) {
      if (!byGroup.has(it.groupId)) byGroup.set(it.groupId, []);
      byGroup.get(it.groupId).push({ it, idx });
    }
  });

  groups.forEach((g) => {
    const rows = (byGroup.get(g.id) || []).slice();

    // auto-assign dates when needed
    autoAssignSequentialDates(g.id);

    // compute group window for filtering bucket
    const members = loadCart().filter((x) => x.groupId === g.id);
    const gDays = members.reduce((s, it) => s + durationDays(it), 0);
    const gStart = g.start || tripStart.value;
    const bucket = classifyWindow(gStart, gDays);
    if (bucket !== TRIP_FILTER) return; // filter out whole group

    const groupWrap = document.createElement("div");
    groupWrap.className = "group-card";
    groupWrap.innerHTML = `
      <div class="group-head">
        <div class="group-meta">
          <div class="group-select">
            <input type="checkbox" class="group-check" ${
              EDIT_MODE ? "" : "disabled"
            } />
            <h4 class="group-title" contenteditable="${EDIT_MODE}" spellcheck="false">${
      g.name
    }</h4>
          </div>
          <label class="field" style="min-width: 180px;">
            <span class="label">Start date</span>
            <input type="date" value="${
              g.start || tripStart.value
            }" class="group-start edit-only-input" ${
      EDIT_MODE ? "" : "disabled"
    } />
          </label>
          <span class="chip">Items: ${rows.length}</span>
        </div>
        <div class="group-actions-row edit-only ${EDIT_MODE ? "" : "hidden"}">
          <button class="btn-sm" data-act="ungroup">Ungroup</button>
        </div>
      </div>
      <div class="group-items"></div>`;
    const list = groupWrap.querySelector(".group-items");

    rows.forEach(({ it, idx }) =>
      list.appendChild(renderItemRow(it, idx, { inGroup: true, group: g }))
    );

    // group start change
    groupWrap.querySelector(".group-start").addEventListener("change", (e) => {
      const groupsNow = loadGroups();
      const gg = groupsNow.find((x) => x.id === g.id);
      if (gg) {
        gg.start = e.target.value;
        saveGroups(groupsNow);
        autoAssignSequentialDates(g.id);
        showToast({
          title: "Saved",
          message: "Group date updated.",
          type: "success",
        });
        render();
      }
    });

    // rename
    const titleEl = groupWrap.querySelector(".group-title");
    titleEl.addEventListener(
      "blur",
      () => EDIT_MODE && renameGroup(g.id, titleEl.textContent)
    );

    // ungroup
    groupWrap
      .querySelector("[data-act='ungroup']")
      .addEventListener("click", () => ungroup(g.id));

    // group selection checkbox
    const gchk = groupWrap.querySelector(".group-check");
    const syncGroupCheckbox = () => {
      const indices = rows.map((r) => r.idx);
      const all = indices.every((i) => selected.has(i));
      const any = indices.some((i) => selected.has(i));
      gchk.checked = all;
      gchk.indeterminate = any && !all;
    };
    syncGroupCheckbox();
    gchk.addEventListener("change", () => {
      if (!EDIT_MODE) return;
      const indices = rows.map((r) => r.idx);
      if (gchk.checked) indices.forEach((i) => selected.add(i));
      else indices.forEach((i) => selected.delete(i));
      updateSelectionBadge();
      renderSummary();
      render(); // resync
    });

    groupsHost.appendChild(groupWrap);
  });

  /* ungrouped list (filtered) */
  itemsHost.innerHTML = "";
  loadCart().forEach((it, idx) => {
    if (it.groupId) return;
    const bucket = classifyWindow(effectiveStart(it, groups), durationDays(it));
    if (bucket !== TRIP_FILTER) return;
    itemsHost.appendChild(renderItemRow(it, idx));
  });

  renderSummary();
}

function renderItemRow(it, idx, { inGroup = false, group = null } = {}) {
  const qty = Number(it.qty || 1);
  const price = Number(it.price || 0);
  const hasImg = !!it.img;
  const initials = (it.place || "?")
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const card = document.createElement("article");
  card.className = "ct-item";
  card.dataset.idx = idx;
  if (selected.has(idx)) card.classList.add("selected");
  card.innerHTML = `
    <div class="sel-box"><input type="checkbox" ${
      selected.has(idx) ? "checked" : ""
    } ${EDIT_MODE ? "" : "disabled"} aria-label="Select"/></div>
    <div class="ct-thumb">
      <img alt="${
        it.place
      }" loading="lazy" decoding="async" referrerpolicy="no-referrer" style="display:${
    hasImg ? "block" : "none"
  };" />
      <span class="ct-initials" style="display:${
        hasImg ? "none" : "grid"
      };">${initials}</span>
    </div>
    <div class="ct-body">
      <h3>${it.place || "(Unknown place)"}</h3>
      <div class="ct-meta-row">
        <span class="badge">State: ${it.state || "—"}</span>
        <span class="badge">Package: ${it.package || "—"}</span>
        <span class="badge days">${
          it.days ? `${it.days} day${it.days > 1 ? "s" : ""}` : "—"
        }</span>
        <label class="inline"><span class="label">Start</span>
          <input type="date" class="item-start edit-only-input" value="${
            it.start || ""
          }" ${EDIT_MODE ? "" : "disabled"} ${
    inGroup && group?.start ? `min="${group.start}"` : ""
  }/>
        </label>
      </div>
    </div>
    <div class="ct-actions-col">
      <div class="price">${fmtINR(price)}</div>
      <div class="qty" role="group" aria-label="Quantity">
        <button class="q-dec" ${
          EDIT_MODE ? "" : "disabled"
        } aria-label="Decrease">−</button>
        <input class="q-val" type="number" min="1" value="${qty}" inputmode="numeric" ${
    EDIT_MODE ? "" : "disabled"
  } />
        <button class="q-inc" ${
          EDIT_MODE ? "" : "disabled"
        } aria-label="Increase">+</button>
      </div>
      <div class="ct-row-btns">
        <button class="btn-sm" data-act="pkg" ${
          EDIT_MODE ? "" : "disabled"
        }>Edit package</button>
        ${
          inGroup
            ? `<button class="btn-sm" data-act="remove-from-group" ${
                EDIT_MODE ? "" : "disabled"
              }>Remove</button>`
            : `<button class="btn-sm" data-act="remove" ${
                EDIT_MODE ? "" : "disabled"
              }>Remove</button>`
        }
      </div>
    </div>`;

  // image
  const imgEl = card.querySelector(".ct-thumb img");
  if (imgEl) {
    if (it.img) imgEl.src = it.img;
    else
      ensureItemImage(it).then((url) => {
        if (url && imgEl.isConnected) imgEl.src = url;
      });
  }

  // selection
  const cbox = card.querySelector("input[type='checkbox']");
  cbox.addEventListener("change", (e) => {
    if (!EDIT_MODE) return;
    if (e.target.checked) selected.add(idx);
    else selected.delete(idx);
    card.classList.toggle("selected", e.target.checked);
    updateSelectionBadge();
    renderSummary();
    render(); // sync group checkbox indeterminate
  });

  // qty
  const inc = card.querySelector(".q-inc");
  const dec = card.querySelector(".q-dec");
  const val = card.querySelector(".q-val");
  const commitQty = (newQty) => {
    const q = Math.max(1, Number(newQty || 1));
    const arr = loadCart();
    arr[idx].qty = q;
    saveCart(arr);
    showToast({
      title: "Updated",
      message: `${it.place} × ${q}`,
      type: "info",
    });
    renderSummary();
    render();
  };
  inc?.addEventListener("click", () => commitQty((Number(val.value) || 1) + 1));
  dec?.addEventListener("click", () => commitQty((Number(val.value) || 1) - 1));
  val?.addEventListener("change", () => commitQty(val.value));

  // item start
  const startEl = card.querySelector(".item-start");
  startEl?.addEventListener("change", () => {
    const arr = loadCart();
    const gStart = inGroup && group?.start ? group.start : null;
    if (gStart && startEl.value && startEl.value < gStart) {
      startEl.value = gStart;
      showToast({
        title: "Adjusted",
        message: "Cannot start before group start date.",
        type: "warning",
      });
    }
    arr[idx].start = startEl.value || null;
    saveCart(arr);
    renderSummary();
    render();
  });

  // row actions
  card
    .querySelector("[data-act='pkg']")
    ?.addEventListener("click", () => openPackageDialog(idx));
  const removeBtn = card.querySelector("[data-act='remove']");
  if (removeBtn)
    removeBtn.addEventListener("click", () => {
      const arr = loadCart();
      arr.splice(idx, 1);
      saveCart(arr);
      showToast({ title: "Removed", message: it.place, type: "warning" });
      render();
    });
  const rfg = card.querySelector("[data-act='remove-from-group']");
  if (rfg) rfg.addEventListener("click", () => removeFromGroup(idx));

  return card;
}

/* ===== Summary ===== */
function computeSummaryRows(sourceItems) {
  const subtotal = sourceItems.reduce(
    (s, it) => s + Number(it.price || 0) * Number(it.qty || 1),
    0
  );
  const service = Math.round(subtotal * (SERVICE_RATE_PCT / 100));
  const tax = Math.round((subtotal + service) * (TAX_RATE_PCT / 100));
  const total = subtotal + service + tax;

  const days = sourceItems.reduce((s, it) => s + durationDays(it), 0);

  const starts = sourceItems.map((it) => it._effStart).filter(Boolean);
  const startDate = starts.length ? starts.sort()[0] : null;
  let endText = "—";
  if (startDate && days > 0) {
    const e = addDays(startDate, days - 1);
    endText = new Date(e + "T00:00:00").toLocaleDateString();
  }
  const states = [
    ...new Set(sourceItems.map((it) => it.state).filter(Boolean)),
  ];

  return { subtotal, service, tax, total, days, startDate, endText, states };
}
function renderSummary(forceItems) {
  const cart = loadCart();
  const groups = loadGroups();

  let set = [];
  if (Array.isArray(forceItems)) set = forceItems;
  else if (EDIT_MODE) {
    const arr = [...selected].map((idx) => cart[idx]).filter(Boolean);
    set = arr;
    $("#sumHint").textContent = arr.length
      ? "Summary of selected items"
      : "Nothing selected — summary is empty.";
  } else {
    const d = summaryDate.value;
    set = cart.filter((it) => effectiveStart(it, groups) === d);
    $("#sumHint").textContent = set.length
      ? `Summary for ${d}`
      : `No items starting on ${d}.`;
  }

  set = set.map((it) => ({ ...it, _effStart: effectiveStart(it, groups) }));

  if (!set.length) {
    sumSubtotal.textContent = "—";
    sumService.textContent = "—";
    sumTax.textContent = "—";
    sumTotal.textContent = "—";
    sumDays.textContent = "—";
    sumStart.textContent = "—";
    sumEnd.textContent = "—";
    sumStates.textContent = "—";
    return;
  }

  const R = computeSummaryRows(set);
  sumSubtotal.textContent = fmtINR(R.subtotal);
  sumService.textContent = fmtINR(R.service);
  sumTax.textContent = fmtINR(R.tax);
  sumTotal.textContent = fmtINR(R.total);
  sumDays.textContent = `${R.days} day${R.days === 1 ? "" : "s"}`;
  sumStart.textContent = R.startDate || "—";
  sumEnd.textContent = R.endText;
  sumStates.textContent = R.states.length ? R.states.join(", ") : "—";
}

/* ===== Save & Clear ===== */
$("#saveBtn").addEventListener("click", () => {
  showToast({
    title: "Saved",
    message: "Your trip plan has been updated.",
    type: "success",
  });
});
$("#clearBtn").addEventListener("click", () => {
  if (!confirm("Clear entire trip?")) return;
  saveCart([]);
  saveGroups([]);
  clearSelection();
  render();
});

/* ===== Group buttons ===== */
$("#manualGroupBtn").addEventListener("click", () => {
  if (selected.size < 2)
    return alertDialog("Select 2 or more places to group.", "Grouping error");
  groupSelected();
});
$("#smartGroupBtn").addEventListener("click", smartGroupFlow);

/* ===== Navigation ===== */
function preferredExploreTarget() {
  const cart = loadCart();
  const states = [...new Set(cart.map((i) => i.state).filter(Boolean))];
  if (states.length === 1)
    return `listofplace.html?state=${encodeURIComponent(states[0])}`;
  return "places/INDmap.html";
}
$("#backBtn")?.addEventListener("click", () => {
  try {
    if (document.referrer) {
      const r = new URL(document.referrer);
      if (r.origin === location.origin) return history.back();
    }
  } catch {}
  location.href = preferredExploreTarget();
});
$("#exploreBtn")?.addEventListener(
  "click",
  () => (location.href = preferredExploreTarget())
);

/* ===== Boot ===== */
(function boot() {
  setEditMode(false);
  showSkeleton(4);
  setTimeout(render, 300);
})();
