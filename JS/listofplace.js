// ===========================
// listofplace.js (full file)
// ===========================

// Build API base from current host (like your other pages)
const API_HOST = `http://${location.hostname}:3001`;
const API_BASE = `${API_HOST}/api`;

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const params = new URLSearchParams(location.search);
const stateName = params.get("state") || "Andaman and Nicobar"; // default
$("#lpTitle").textContent = `Places in ${stateName}`;

const grid   = $("#lpGrid");
const search = $("#lpSearch");
const sortSel= $("#lpSort");
let items    = [];

// For readable labels if DB gives only 3 price columns
const PKG_LABELS = ["Basic", "Plus", "Premium"];

function priceMin(arr) {
  return arr.map(Number).filter((n) => !Number.isNaN(n)).sort((a,b)=>a-b)[0] ?? Infinity;
}

function addToCart(it, price, pkg) {
  const cart = JSON.parse(localStorage.getItem("cartDraft") || "[]");
  cart.push({
    state: stateName,
    place: it.place,
    price: Number(price),
    package: pkg,
    days: it.daysNeeded ?? null,
  });
  localStorage.setItem("cartDraft", JSON.stringify(cart));
  alert(`Added: ${it.place} — ${pkg} · ₹${price}`);
}

let priceDialog = null;
function ensureDialog() {
  if (!priceDialog) priceDialog = document.getElementById("priceDialog");
  return priceDialog;
}
function openPriceDialog(it) {
  const dlg   = ensureDialog();
  const title = document.getElementById("priceDialogPlace");
  const box   = document.getElementById("priceDialogOptions");
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
        addToCart(it, p, label);
      });
      box.appendChild(b);
    });
  }
  dlg.showModal();
}

function render() {
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
  if (mode === "days")  view.sort((a, b) => (a.daysNeeded ?? 0) - (b.daysNeeded ?? 0));
  if (mode === "price") view.sort((a, b) => priceMin(a.prices) - priceMin(b.prices));

  grid.innerHTML = "";
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
    img.onerror = () => { img.remove(); };

    // Text
    $(".lp-place", node).textContent = it.place;
    $(".lp-desc", node).textContent  = it.description;
    $(".lp-things", node).textContent= it.things || "—";

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
        btn.dataset.pkg   = PKG_LABELS[i] || `Package ${i + 1}`;
        btn.textContent   = `${btn.dataset.pkg} · ₹${p}`;
        btn.addEventListener("click", () => {
          // one selected at a time (within this card)
          $$(".price-btn", pricesWrap).forEach(b => b.classList.remove("selected"));
          btn.classList.add("selected");
        });
        pricesWrap.appendChild(btn);
      });
    } else {
      pricesWrap.textContent = "Price unavailable";
    }

    // Add to cart button
    $(".btn-add", node).addEventListener("click", () => {
      const selected = $(".price-btn.selected", pricesWrap);
      if (selected) {
        addToCart(it, selected.dataset.price, selected.dataset.pkg);
      } else {
        openPriceDialog(it); // ask user to choose a package
      }
    });

    grid.appendChild(node);
  });
}

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
    const res = await fetch(`${API_BASE}/states/${encodeURIComponent(stateName)}/places`);
    const json = await res.json();
    if (!res.ok || json.ok === false) throw new Error(json.error || "Failed");
    items = json.items || [];
    render();
  } catch (e) {
    grid.innerHTML = `<p style="color:#ffb4b4">Failed to load places: ${e.message}</p>`;
  }
}

search.addEventListener("input", render);
sortSel.addEventListener("change", render);

// Kick off
load();
