const API_HOST = `http://${location.hostname}:3001`;
const API_BASE = `${API_HOST}/api`;

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const params = new URLSearchParams(location.search);
const stateName = params.get("state") || "Andaman and Nicobar";
$("#lpTitle").textContent = `Places in ${stateName}`;

const grid = $("#lpGrid");
const search = $("#lpSearch");
const sortSel = $("#lpSort");
let items = [];

const PKG_LABELS = ["Basic", "Plus", "Premium"];

/* ---------------- Login helpers ---------------- */
function isLoggedIn() {
  try {
    const u = JSON.parse(localStorage.getItem("sessionClient") || "null");
    return !!(u && u.ClientID);
  } catch {
    return false;
  }
}
function promptLogin() {
  showToast({
    title: "Login required",
    message: "Please log in to add items to your cart.",
    type: "warning",
    timeout: 1200,
  });
  setTimeout(() => {
    const next = encodeURIComponent(location.href);
    location.href = `auth.html?tab=login&next=${next}`;
  }, 900);
}

/* ---------------- Utils ---------------- */
function priceMin(arr) {
  return (
    arr
      .map(Number)
      .filter((n) => !Number.isNaN(n))
      .sort((a, b) => a - b)[0] ?? Infinity
  );
}

/* ---------- Bottom-right toast (fallback) ---------- */
function showToast({
  title = "Added to cart",
  message = "",
  type = "success",
  timeout = 1400, // quicker auto-dismiss
  onClose = null, // callback when toast fully removed
} = {}) {
  const host = document.getElementById("toasts");
  if (!host) return;

  const el = document.createElement("div");
  el.className = "lp-toast";
  el.setAttribute("data-type", type);

  const icons = { success: "✓", error: "✕", warning: "!", info: "ℹ" };

  el.innerHTML = `
    <div class="icon">${icons[type] || icons.info}</div>
    <div class="content">
      <p class="title">${title}</p>
      <p class="msg">${message}</p>
    </div>
    <button class="close" aria-label="Close">×</button>
    <div class="bar"><span style="animation-duration:${timeout}ms"></span></div>
  `;

  const remove = () => {
    if (!el.isConnected) return;
    el.style.transition = "opacity .15s ease, transform .15s ease";
    el.style.opacity = "0";
    el.style.transform = "translateY(6px) scale(.98)";
    setTimeout(() => {
      el.remove();
      onClose && onClose();
    }, 160);
    window.removeEventListener("scroll", remove, { passive: true });
    document.removeEventListener("click", docClick, true);
  };
  const docClick = (ev) => {
    // ignore clicks inside the toast
    if (el.contains(ev.target)) return;
    remove();
  };

  el.querySelector(".close").addEventListener("click", remove);
  host.appendChild(el);

  const t = setTimeout(remove, timeout);
  el.addEventListener("mouseenter", () => clearTimeout(t), { once: true });
  window.addEventListener("scroll", remove, { passive: true, once: true });
  document.addEventListener("click", docClick, true);
}

/* ---------- Floating toast near an anchor element ---------- */
function showToastAt(
  anchorEl,
  {
    title = "Added to cart",
    message = "",
    type = "success",
    timeout = 1400,
    onClose = null,
  } = {}
) {
  if (!anchorEl) return showToast({ title, message, type, timeout, onClose });

  const el = document.createElement("div");
  el.className = "lp-toast lp-toast--floating";
  el.setAttribute("data-type", type);
  el.innerHTML = `
    <div class="icon">${
      { success: "✓", error: "✕", warning: "!", info: "ℹ" }[type] || "ℹ"
    }</div>
    <div class="content">
      <p class="title">${title}</p>
      <p class="msg">${message}</p>
    </div>
    <button class="close" aria-label="Close">×</button>
    <div class="bar"><span style="animation-duration:${timeout}ms"></span></div>
    <div class="caret" aria-hidden="true"></div>
  `;
  document.body.appendChild(el);

  // Position above the button; if not enough space, place below
  const gap = 10;
  const r = anchorEl.getBoundingClientRect();
  const vw = window.innerWidth;
  const { width: tw, height: th } = el.getBoundingClientRect();

  let top = r.top - th - gap;
  let left = r.left + r.width / 2 - tw / 2;
  let placement = "above";

  if (top < 8) {
    top = r.bottom + gap;
    placement = "below";
  }
  left = Math.max(8, Math.min(left, vw - tw - 8));

  el.style.top = `${Math.round(top)}px`;
  el.style.left = `${Math.round(left)}px`;
  el.setAttribute("data-placement", placement);

  const remove = () => {
    if (!el.isConnected) return;
    el.style.transition = "opacity .15s ease, transform .15s ease";
    el.style.opacity = "0";
    el.style.transform = "translateY(6px) scale(.98)";
    setTimeout(() => {
      el.remove();
      onClose && onClose();
    }, 160);
    window.removeEventListener("scroll", remove, { passive: true });
    document.removeEventListener("click", docClick, true);
  };
  const docClick = (ev) => {
    if (el.contains(ev.target)) return;
    remove();
  };

  el.querySelector(".close").addEventListener("click", remove);
  const t = setTimeout(remove, timeout);
  el.addEventListener("mouseenter", () => clearTimeout(t), { once: true });
  window.addEventListener("scroll", remove, { passive: true, once: true });
  document.addEventListener("click", docClick, true);
}

/* remember the last clicked Add button so dialog selections anchor correctly */
let lastAddAnchor = null;

/* ---------------- Cart ---------------- */
function addToCart(it, price, pkg, anchorEl, selectionScope) {
  const cart = JSON.parse(localStorage.getItem("cartDraft") || "[]");
  cart.push({
    state: stateName,
    place: it.place,
    price: Number(price),
    package: pkg,
    days: it.daysNeeded ?? null,
    img: it.img || null, // <— save image for nicer cart/trip UI
  });
  localStorage.setItem("cartDraft", JSON.stringify(cart));

  showToastAt(anchorEl, {
    title: "Added to cart",
    message: `${it.place} — ${pkg} · ₹${price}`,
    type: "success",
    timeout: 1400,
    onClose: () => {
      if (selectionScope) {
        const sel = selectionScope.querySelector(".price-btn.selected");
        sel?.classList.remove("selected");
      }
    },
  });
}

/* ---------------- Dialog (choose price when none selected) ---------------- */
let priceDialog = null;
function ensureDialog() {
  if (!priceDialog) priceDialog = document.getElementById("priceDialog");
  return priceDialog;
}
function openPriceDialog(it, selectionScope) {
  const dlg = ensureDialog();
  const title = document.getElementById("priceDialogPlace");
  const box = document.getElementById("priceDialogOptions");
  title.textContent = it.place;
  box.innerHTML = "";

  if (!it.prices?.length) {
    box.textContent = "Price unavailable for this place.";
  } else {
    it.prices.forEach((p, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "price-btn";
      const label = PKG_LABELS[i] || `Package ${i + 1}`;
      b.textContent = `${label} · ₹${p}`;
      b.addEventListener("click", () => {
        dlg.close();
        // Use the last clicked Add button as anchor; no selection to clear in this path
        addToCart(it, p, label, lastAddAnchor, selectionScope);
      });
      box.appendChild(b);
    });
  }
  dlg.showModal();
}

/* ---------------- Render ---------------- */
function render() {
  if (!items.length) {
    grid.innerHTML = `<div class="lp-empty">No places have been added for <strong>${stateName}</strong> yet. Please check back soon.</div>`;
    return;
  }

  const q = (search.value || "").toLowerCase().trim();
  let view = items.filter(
    (it) =>
      !q ||
      it.place.toLowerCase().includes(q) ||
      it.description.toLowerCase().includes(q) ||
      it.things.toLowerCase().includes(q)
  );

  const mode = sortSel.value;
  if (mode === "alpha") view.sort((a, b) => a.place.localeCompare(b.place));
  if (mode === "days")
    view.sort((a, b) => (a.daysNeeded ?? 0) - (b.daysNeeded ?? 0));
  if (mode === "price")
    view.sort((a, b) => priceMin(a.prices) - priceMin(b.prices));

  grid.innerHTML = "";
  if (!view.length) {
    grid.innerHTML = `<div class="lp-empty">No matches for “<strong>${q}</strong>”. Try a different search.</div>`;
    return;
  }

  const tmpl = $("#cardTmpl");
  view.forEach((it) => {
    const node = tmpl.content.cloneNode(true);

    // Image
    const img = $(".lp-media img", node);
    img.loading = "lazy";
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    img.src = it.img || "./assets/placeholder.jpg";
    img.alt = it.place;
    img.onerror = () => {
      img.remove();
    };

    // Text
    $(".lp-place", node).textContent = it.place;
    $(".lp-desc", node).textContent = it.description;
    $(".lp-things", node).textContent = it.things || "—";

    // Days label
    const days = it.daysNeeded;
    $(".lp-daysbadge", node).textContent = days
      ? `Duration: ${days} day${days > 1 ? "s" : ""}`
      : "Duration: —";

    // Price buttons
    const pricesWrap = $(".lp-prices", node);
    if (it.prices?.length) {
      it.prices.forEach((p, i) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "price-btn";
        btn.dataset.price = p;
        btn.dataset.pkg = PKG_LABELS[i] || `Package ${i + 1}`;
        btn.textContent = `${btn.dataset.pkg} · ₹${p}`;
        btn.addEventListener("click", () => {
          $$(".price-btn", pricesWrap).forEach((b) =>
            b.classList.remove("selected")
          );
          btn.classList.add("selected");
        });
        pricesWrap.appendChild(btn);
      });
    } else {
      pricesWrap.textContent = "Price unavailable";
    }

    // Add to cart (requires login). Anchor toast to this button.
    const addBtn = $(".btn-add", node);
    addBtn.addEventListener("click", (ev) => {
      lastAddAnchor = ev.currentTarget;

      if (!isLoggedIn()) {
        promptLogin();
        return;
      }

      const selected = $(".price-btn.selected", pricesWrap);
      if (selected) {
        addToCart(
          it,
          selected.dataset.price,
          selected.dataset.pkg,
          lastAddAnchor,
          pricesWrap
        );
      } else {
        openPriceDialog(it, pricesWrap); // choose package; toast still anchored
      }
    });

    grid.appendChild(node);
  });
}

/* ---------------- Load ---------------- */
function showSkeleton(n = 6) {
  grid.innerHTML = "";
  for (let i = 0; i < n; i++) {
    const s = document.createElement("div");
    s.className = "skeleton";
    grid.appendChild(s);
  }
}

async function load() {
  showSkeleton();
  try {
    const res = await fetch(
      `${API_BASE}/states/${encodeURIComponent(stateName)}/places`
    );
    const json = await res.json();
    if (!res.ok || json.ok === false) throw new Error(json.error || "Failed");
    items = json.items || [];
    render();
  } catch (e) {
    grid.innerHTML = `<div class="lp-empty">Couldn’t load places for <strong>${stateName}</strong>. ${e.message}</div>`;
  }
}

search.addEventListener("input", render);
sortSel.addEventListener("change", render);
load();
