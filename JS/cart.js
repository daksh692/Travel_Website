// Build API base (kept for future server POSTs)
const API_HOST = `http://${location.hostname}:3001`;
const API_BASE = `${API_HOST}/api`;

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
  () => (location.href = preferredExploreTarget())
);

// Show skeletons first
function showSkeleton(n = 3) {
  itemsHost.innerHTML = "";
  for (let i = 0; i < n; i++) {
    const sk = document.createElement("div");
    sk.className = "c-skel";
    sk.innerHTML = `
      <div class="s1 shine"></div>
      <div>
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
  loginNow.onclick = (e) => {
    e.preventDefault();
    const next = encodeURIComponent(location.href);
    location.href = `auth.html?tab=login&next=${next}`;
  };

  // Empty cart UI
  if (!cart.length) {
    itemsHost.innerHTML = `<div class="c-empty">Your cart is empty. Go to <a href="${preferredExploreTarget()}">Explore</a> to add places.</div>`;
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
        ? `<img alt="${it.place}" loading="lazy" decoding="async" />`
        : `<span>${initials}</span>`
    }
  </div>
  <div class="c-body">
    <h3>${it.place || "(Unknown place)"}</h3>
    <div class="c-meta">
      <span class="badge">State: ${it.state || "—"}</span>
      <span class="badge">Package: ${it.package || "—"}</span>
      <span class="badge days">${
        it.days ? `${it.days} day${it.days > 1 ? "s" : ""}` : "—"
      }</span>
    </div>
  </div>
  <div class="c-actions">
    <div class="price">${fmtINR(price)}</div>
    <div class="qty" role="group" aria-label="Quantity">
      <button class="q-dec" aria-label="Decrease">−</button>
      <input class="q-val" type="number" min="1" value="${qty}" inputmode="numeric" />
      <button class="q-inc" aria-label="Increase">+</button>
    </div>
    <span class="remove">Remove</span>
  </div>
`;

    // If there is an <img>, set the src; if missing, fetch and backfill
    const imgEl = card.querySelector(".c-thumb img");
    if (imgEl) {
      if (it.img) {
        imgEl.src = it.img;
      } else {
        // backfill (legacy items)
        ensureItemImage(it).then((url) => {
          if (url && imgEl.isConnected) imgEl.src = url;
        });
      }
    }
    // Totals (match currenttrip)

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
      commitQty((Number(val.value) || 1) + 1)
    );
    dec.addEventListener("click", () =>
      commitQty((Number(val.value) || 1) - 1)
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
  (document.getElementById("sumTax") || { textContent: null }).textContent =
    fmtINR(tax);
  sumTotal.textContent = fmtINR(total);

  // Clear & checkout
  clearBtn.onclick = () => {
    if (confirm("Clear all items?")) {
      saveCart([]);
      render();
    }
  };

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
        900
      );
      return;
    }
    showToast({
      title: "Checkout",
      message: "Proceeding to payment…",
      type: "success",
    });
    // TODO: location.href = "checkout.html";
  };
}

// Cache of state data so we can find images for legacy items without img
const stateCache = new Map();
async function getStateData(stateName) {
  const key = String(stateName || "").trim();
  if (stateCache.has(key)) return stateCache.get(key);
  const res = await fetch(
    `${API_HOST}/api/states/${encodeURIComponent(key)}/places`
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
          p.price === item.price
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
