// Build API base (kept for future server POSTs)
const isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1";
const API_BASE = isLocal ? `http://${location.hostname}:3001/api` : "/api";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

/* ------------- login helpers ------------- */
function currentUser() {
  try {
    return JSON.parse(localStorage.getItem("sessionClient") || "null");
  } catch {
    return null;
  }
}
function isLoggedIn() {
  const u = currentUser();
  return !!(u && u.ClientID);
}

/* ------------- toast helper ------------- */
function showToast({
  title = "Saved",
  message = "",
  type = "success",
  timeout = 1600,
} = {}) {
  const host = $("#toasts");
  if (!host) return;
  const el = document.createElement("div");
  el.className = "lp-toast";
  el.setAttribute("data-type", type);
  const icons = { success: "✓", error: "✕", warning: "!", info: "ℹ" };
  el.innerHTML = `
    <div class="icon">${icons[type] || icons.info}</div>
    <div class="content"><p class="lp-toast-title">${title}</p><p class="lp-toast-msg">${message}</p></div>
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

/* ------------- currency ------------- */
const fmtINR = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");

/* ------------- storage ------------- */
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

/* ------------- preferred explore target ------------- */
function preferredExploreTarget() {
  const cart = loadCart();
  const states = [...new Set(cart.map((i) => i.state).filter(Boolean))];
  if (states.length === 1) {
    return `listofplace.html?state=${encodeURIComponent(states[0])}`;
  }
  return "places/INDmap.html";
}
function goBackSmart() {
  try {
    if (document.referrer) {
      const r = new URL(document.referrer);
      if (r.origin === location.origin) {
        history.back();
        return;
      }
    }
  } catch {}
  // fallback
  location.href = preferredExploreTarget();
}

/* ------------- render ------------- */
const itemsHost = $("#cartItems");
const loginNotice = $("#loginNotice");
const loginNow = $("#loginNow");
const sumSubtotal = $("#sumSubtotal");
const sumService = $("#sumService");
const sumTotal = $("#sumTotal");
const clearBtn = $("#clearBtn");
const checkoutBtn = $("#checkoutBtn");
const backBtnTop = $("#backBtnTop");
const exploreBtnTop = $("#exploreBtnTop");

// wire actions row
backBtnTop?.addEventListener("click", goBackSmart);
exploreBtnTop?.addEventListener(
  "click",
  () => (location.href = preferredExploreTarget()),
);

// Show skeletons first
function showSkeleton(n = 3) {
  itemsHost.innerHTML = "";
  for (let i = 0; i < n; i++) {
    const sk = document.createElement("div");
    sk.className = "c-skel";
    sk.innerHTML = `
      <div class="s1 shine"></div>
      <div style="flex:1;">
        <div class="s2 shine"></div>
        <div class="s3 shine"></div>
        <div class="s4 shine"></div>
      </div>
      <div></div>
    `;
    itemsHost.appendChild(sk);
  }
}

function render() {
  const cart = loadCart();

  // Login banner
  loginNotice.classList.toggle("hidden", isLoggedIn());
  if (loginNow) {
    loginNow.onclick = (e) => {
      e.preventDefault();
      const next = encodeURIComponent(location.href);
      location.href = `auth.html?tab=login&next=${next}`;
    };
  }

  // Empty cart UI
  if (!cart.length) {
    let target = preferredExploreTarget();
    if (target === "places/INDmap.html") target = "../places/INDmap.html"; // relative fix if needed
    itemsHost.innerHTML = `<div class="c-empty">
      <div style="display:inline-flex; width:64px; height:64px; background:rgba(255,255,255,0.05); border-radius:50%; align-items:center; justify-content:center; margin-bottom:16px;">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" class="stroke-current" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
      </div>
      <h3 style="margin:0 0 8px; color:#fff;">Your cart is empty</h3>
      <p style="margin:0 0 16px;">Looks like you haven't added any trips yet.</p>
      <a href="${preferredExploreTarget()}" class="btn-outline" style="display:inline-flex; width:auto; text-decoration:none;">Explore Places</a>
    </div>`;
    sumSubtotal.textContent = fmtINR(0);
    sumService.textContent = fmtINR(0);
    sumTotal.textContent = fmtINR(0);
    return;
  }

  // Build cards
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
    card.className = "c-item";
    card.innerHTML = `
      <div class="c-thumb">
        ${
          hasImg
            ? `<img src="${it.img}" alt="${it.place}" loading="lazy" decoding="async" referrerpolicy="no-referrer" />`
            : `<span class="c-initials">${initials}</span>`
        }
      </div>
      <div class="c-body">
        <h3>${it.place || "(Unknown place)"}</h3>
        <div class="c-meta">
          <span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg> ${it.state || "—"}</span>
          <span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg> ${
            it.days ? `${it.days} day${it.days > 1 ? "s" : ""}` : "—"
          }</span>
          <span class="badge">Pkg: ${it.package || "—"}</span>
        </div>
      </div>
      <div class="c-actions">
        <div class="price">${fmtINR(price)}</div>
        <div class="qty" role="group" aria-label="Quantity">
          <button class="q-dec" aria-label="Decrease">−</button>
          <input class="q-val" type="number" min="1" value="${qty}" inputmode="numeric" />
          <button class="q-inc" aria-label="Increase">+</button>
        </div>
        <div class="remove">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
          Remove
        </div>
      </div>
    `;

    // backfill image if missing
    const imgEl = card.querySelector(".c-thumb img");
    if (!imgEl && !it.img) {
      ensureItemImage(it).then((url) => {
        if (url && card.isConnected) {
          const thumb = card.querySelector(".c-thumb");
          thumb.innerHTML = `<img src="${url}" alt="${it.place}" loading="lazy" decoding="async" referrerpolicy="no-referrer" />`;
        }
      });
    }

    // Controls
    const inc = card.querySelector(".q-inc");
    const dec = card.querySelector(".q-dec");
    const val = card.querySelector(".q-val");
    const rem = card.querySelector(".remove");

    const commitQty = (newQty) => {
      const q = Math.max(1, Number(newQty || 1));
      cart[idx].qty = q;
      saveCart(cart);
      showToast({
        title: "Updated",
        message: `${it.place} × ${q}`,
        type: "info",
      });
      render();
    };

    inc.addEventListener("click", () =>
      commitQty((Number(val.value) || 1) + 1),
    );
    dec.addEventListener("click", () =>
      commitQty((Number(val.value) || 1) - 1),
    );
    val.addEventListener("change", () => commitQty(val.value));

    rem.addEventListener("click", () => {
      cart.splice(idx, 1);
      saveCart(cart);
      showToast({ title: "Removed", message: it.place, type: "warning" });
      render();
    });

    itemsHost.appendChild(card);
  });

  // Totals
  const SERVICE_RATE_PCT = 0.5;
  const TAX_RATE_PCT = 12;

  const service = +(subtotal * (SERVICE_RATE_PCT / 100)).toFixed(0); // whole-₹ like UI
  const taxBase = subtotal + service;
  const tax = +(taxBase * (TAX_RATE_PCT / 100)).toFixed(0);
  const total = subtotal + service + tax;

  sumSubtotal.textContent = fmtINR(subtotal);
  sumService.textContent = fmtINR(service);
  if (document.getElementById("sumTax"))
    document.getElementById("sumTax").textContent = fmtINR(tax);
  sumTotal.textContent = fmtINR(total);

  // Clear & checkout
  if (clearBtn) {
    clearBtn.onclick = () => {
      // Custom confirmation using window.confirm
      if (confirm("Clear all items from your cart?")) {
        saveCart([]);
        render();
      }
    };
  }

  if (checkoutBtn) {
    checkoutBtn.onclick = () => {
      if (!isLoggedIn()) {
        showToast({
          title: "Login required",
          message: "Log in to proceed to checkout.",
          type: "warning",
        });
        const next = encodeURIComponent(location.href);
        setTimeout(
          () => (location.href = `auth.html?tab=login&next=${next}`),
          900,
        );
        return;
      }
      showToast({
        title: "Checkout Secure",
        message: "Proceeding to secure payment portal...",
        type: "success",
      });
      // TODO: real checkout route
      // location.href = "checkout.html";
    };
  }
}

// Cache of state data so we can find images for legacy items without img
const stateCache = new Map();
async function getStateData(stateName) {
  const key = String(stateName || "").trim();
  if (stateCache.has(key)) return stateCache.get(key);
  const res = await fetch(
    `${API_HOST}/api/states/${encodeURIComponent(key)}/places`,
  );
  const json = await res.json();
  if (!res.ok || json.ok === false)
    throw new Error(json.error || "Failed to load state data");
  stateCache.set(key, json);
  return json;
}

// Ensures item has an image; if not, fetch from API and persist to localStorage
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
          p.price === item.price,
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

// boot
showSkeleton(3);
setTimeout(render, 350);

