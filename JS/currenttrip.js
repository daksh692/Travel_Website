const API_HOST = `http://${location.hostname}:3001`;
const API_BASE = `${API_HOST}/api`;

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const fmtINR = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");
const PKG_LABELS = ["Basic", "Plus", "Premium"];

/* === FIXED SETTINGS (change here if needed) === */
const SERVICE_RATE_PCT = 0.5; // fixed service charge %
const TAX_RATE_PCT = 12; // fixed tax %

/* ------------ Toast ------------ */
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
  el.setAttribute("data-type", type);
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

/* ------------ Storage ------------ */
function loadCart() {
  try {
    return JSON.parse(localStorage.getItem("cartDraft") || "[]");
  } catch {
    return [];
  }
}
function saveCart(items) {
  localStorage.setItem("cartDraft", JSON.stringify(items));
}

/* ------------ Explore/back helpers ------------ */
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

/* ------------ State data cache for package editing & image backfill ------------ */
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

// Ensure item has an image: if missing, fetch from API once and persist
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

/* ------------ Controls ------------ */
const tripStart = $("#tripStart");
const serviceRateVal = $("#serviceRateVal");
const taxRateVal = $("#taxRateVal");
const tripDays = $("#tripDays");
const tripEnd = $("#tripEnd");
const sumSubtotal = $("#sumSubtotal");
const sumService = $("#sumService");
const sumTax = $("#sumTax");
const sumTotal = $("#sumTotal");
const sumServiceRate = $("#sumServiceRate");
const sumTaxRate = $("#sumTaxRate");
const saveBtn = $("#saveBtn");
const clearBtn = $("#clearBtn");
const itemsHost = $("#items");

/* Init fixed labels */
serviceRateVal.textContent = `${SERVICE_RATE_PCT}%`;
taxRateVal.textContent = `${TAX_RATE_PCT}%`;
sumServiceRate.textContent = `${SERVICE_RATE_PCT}%`;
sumTaxRate.textContent = `${TAX_RATE_PCT}%`;

/* default start date = today (unless user set before) */
(function initStart() {
  const today = new Date();
  const val = today.toISOString().slice(0, 10);
  tripStart.value = localStorage.getItem("tripStart") || val;
  tripStart.addEventListener("change", () => {
    localStorage.setItem("tripStart", tripStart.value);
    render();
  });
})();

/* ------------ Reorder (drag & drop) ------------ */
let dragIndex = null;
function handleDrop(e, idx) {
  e.preventDefault();
  const arr = loadCart();
  if (dragIndex === null || dragIndex === idx) return;
  const [item] = arr.splice(dragIndex, 1);
  arr.splice(idx, 0, item);
  saveCart(arr);
  dragIndex = null;
  render();
}

/* ------------ Package dialog ------------ */
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
  } catch (e) {
    pkgOptions.textContent = "Failed to load package options.";
  }

  pkgDialog.showModal();
}

/* ------------ Rendering ------------ */
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
      <div></div>
    `;
    itemsHost.appendChild(el);
  }
}

function render() {
  const cart = loadCart();

  if (!cart.length) {
    itemsHost.innerHTML = `<div class="ct-empty">No items in your trip yet. <a href="${preferredExploreTarget()}">Explore places</a>.</div>`;
    sumSubtotal.textContent = fmtINR(0);
    sumService.textContent = fmtINR(0);
    sumTax.textContent = fmtINR(0);
    sumTotal.textContent = fmtINR(0);
    $("#tripDays").textContent = "0 days";
    $("#tripEnd").textContent = "Ends —";
    return;
  }

  itemsHost.innerHTML = "";
  let subtotal = 0;

  cart.forEach((it, idx) => {
    const qty = Number(it.qty || 1);
    const price = Number(it.price || 0);
    const line = qty * price;
    subtotal += line;

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
    card.draggable = true;
    card.innerHTML = `
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
        </div>
      </div>
      <div class="ct-actions-col">
        <div class="price">${fmtINR(price)}</div>
        <div class="qty" role="group" aria-label="Quantity">
          <button class="q-dec" aria-label="Decrease">−</button>
          <input class="q-val" type="number" min="1" value="${qty}" inputmode="numeric" />
          <button class="q-inc" aria-label="Increase">+</button>
        </div>
        <div class="ct-row-btns">
          <button class="btn-sm" data-act="pkg">Edit package</button>
          <button class="btn-sm" data-act="remove">Remove</button>
        </div>
      </div>
    `;

    // If there is an <img>, set or backfill its src
    const imgEl = card.querySelector(".ct-thumb img");
    if (imgEl) {
      if (it.img) {
        imgEl.src = it.img;
      } else {
        ensureItemImage(it).then((url) => {
          if (url && imgEl.isConnected) imgEl.src = url;
        });
      }
    }

    // drag events
    card.addEventListener("dragstart", (e) => {
      dragIndex = idx;
      e.dataTransfer.effectAllowed = "move";
      card.classList.add("dragging");
    });
    card.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    });
    card.addEventListener("drop", (e) => handleDrop(e, idx));
    card.addEventListener("dragend", () => card.classList.remove("dragging"));

    // qty handlers
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
      render();
    };
    inc.addEventListener("click", () =>
      commitQty((Number(val.value) || 1) + 1)
    );
    dec.addEventListener("click", () =>
      commitQty((Number(val.value) || 1) - 1)
    );
    val.addEventListener("change", () => commitQty(val.value));

    // row actions
    card
      .querySelector("[data-act='pkg']")
      .addEventListener("click", () => openPackageDialog(idx));
    card.querySelector("[data-act='remove']").addEventListener("click", () => {
      const arr = loadCart();
      arr.splice(idx, 1);
      saveCart(arr);
      showToast({ title: "Removed", message: it.place, type: "warning" });
      render();
    });

    itemsHost.appendChild(card);
  });

  // totals with FIXED rates
  const service = Math.round(subtotal * (SERVICE_RATE_PCT / 100));
  const tax = Math.round((subtotal + service) * (TAX_RATE_PCT / 100));
  const total = subtotal + service + tax;

  sumSubtotal.textContent = fmtINR(subtotal);
  sumService.textContent = fmtINR(service);
  sumTax.textContent = fmtINR(tax);
  sumTotal.textContent = fmtINR(total);

  // trip duration & end date
  const days = loadCart().reduce(
    (s, it) => s + Number(it.days || 0) * Number(it.qty || 1),
    0
  );
  let endText = "Ends —";
  if (tripStart.value && days > 0) {
    const d = new Date(tripStart.value + "T00:00:00");
    const e = new Date(d.getTime() + (days - 1) * 24 * 3600 * 1000);
    endText = `Ends ${e.toLocaleDateString()}`;
  }
  $("#tripDays").textContent = `${days} day${days === 1 ? "" : "s"}`;
  $("#tripEnd").textContent = endText;
}

/* ------------ Save & Clear ------------ */
$("#saveBtn").addEventListener("click", () => {
  // Data already persisted on each change; this just confirms to the user.
  showToast({
    title: "Saved",
    message: "Your trip plan has been updated.",
    type: "success",
  });
});
$("#clearBtn").addEventListener("click", () => {
  if (confirm("Clear entire trip?")) {
    saveCart([]);
    render();
  }
});

/* ------------ Boot ------------ */
(function boot() {
  showSkeleton(4);
  setTimeout(render, 350);
})();
