/* ========= tiny utils ========= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const API_HOST = `http://${location.hostname}:3001`;
const API_BASE = `${API_HOST}/api`;
const fmtINR = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");
const PKG = ["Basic", "Plus", "Premium"];

/* ========= session ========= */
function isLoggedIn() {
  try {
    return !!JSON.parse(localStorage.getItem("sessionClient") || "null");
  } catch {
    return false;
  }
}
function sessionUser() {
  try {
    return JSON.parse(localStorage.getItem("sessionClient") || "null");
  } catch {
    return null;
  }
}
function loadCart() {
  try {
    return JSON.parse(localStorage.getItem("cartDraft") || "[]");
  } catch {
    return [];
  }
}
function saveCart(c) {
  localStorage.setItem("cartDraft", JSON.stringify(c));
}

/* ========= API ========= */
async function getStatePlaces(state) {
  const r = await fetch(
    `${API_BASE}/states/${encodeURIComponent(state)}/places`
  );
  const j = await r.json();
  if (!r.ok || j.ok === false) throw new Error("Failed to load " + state);
  return j.items || [];
}

/* ========= learning window (no lock) ========= */
/* Day 0–1: random bundles; Day >=2 (i.e. on the 3rd day) use learned bias. */
function getLearningPhaseDays() {
  const k = "dealsFirstSeen";
  const now = Date.now();
  let t = Number(localStorage.getItem(k) || 0);
  if (!t) {
    t = now;
    localStorage.setItem(k, String(t));
  }
  return Math.floor((now - t) / (24 * 3600 * 1000)); // 0,1,2,…
}

/* ========= visited history for bias ========= */
async function getVisitedCounts() {
  const counts = {};
  for (const it of loadCart()) {
    if (it.state) counts[it.state] = (counts[it.state] || 0) + 1;
  }
  const u = sessionUser();
  if (u) {
    try {
      const r = await fetch(`${API_BASE}/users/${u.ClientID}/summary`);
      const j = await r.json();
      for (const row of j?.items || []) {
        if (row.stateName)
          counts[row.stateName] = (counts[row.stateName] || 0) + 1;
      }
    } catch {
      /* ignore */
    }
  }
  return counts;
}

/* ========= state pools ========= */
const POPULAR_STATES = [
  "Goa",
  "Kerala",
  "Rajasthan",
  "Gujarat",
  "Maharashtra",
  "Himachal Pradesh",
  "Delhi",
  "Karnataka",
  "Tamil Nadu",
  "Ladakh",
];

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function pickN(arr, n) {
  return shuffle(arr.slice()).slice(0, n);
}

/* ========= data builders ========= */
async function buildBundles({ learned = false } = {}) {
  const bundles = [];
  let baseStates = POPULAR_STATES.slice();

  if (learned || getLearningPhaseDays() >= 2) {
    const visited = await getVisitedCounts();
    const favs = Object.entries(visited)
      .sort((a, b) => b[1] - a[1])
      .map(([s]) => s)
      .slice(0, 2);
    baseStates = [...new Set([...favs, ...POPULAR_STATES])];
  }

  const states = pickN(baseStates, 5); // always 5 bundles
  for (const state of states) {
    try {
      const items = await getStatePlaces(state);
      const normalized = items
        .map((it) => {
          const plus = Array.isArray(it.prices)
            ? it.prices[1] ?? it.prices[0]
            : null;
          const price = Number(plus);
          if (!Number.isFinite(price) || price <= 0) return null;
          return {
            state,
            place: it.place,
            img: it.img,
            days: it.daysNeeded || 0,
            pricePlus: price,
          };
        })
        .filter(Boolean);

      if (normalized.length < 3) continue;

      const mCount = Math.min(4, Math.max(3, Math.floor(Math.random() * 4))); // 3–4
      const members = pickN(normalized, mCount);
      const sum = members.reduce((t, m) => t + m.pricePlus, 0);
      const pct = 5 + Math.floor(Math.random() * 11); // 5..15
      const priceFinal = Math.round(sum * (1 - pct / 100));

      bundles.push({
        type: "bundle",
        state,
        members,
        discountPct: pct,
        package: "Plus",
        priceOriginal: sum,
        priceFinal,
      });
    } catch {
      /* skip */
    }
  }
  return bundles.slice(0, 5);
}

async function buildIndividuals() {
  const visited = await getVisitedCounts();
  const favs = Object.entries(visited)
    .sort((a, b) => b[1] - a[1])
    .map(([s]) => s)
    .slice(0, 2);
  const pool = new Set([...favs, ...POPULAR_STATES]);

  const all = [];
  for (const state of pool) {
    try {
      const items = await getStatePlaces(state);
      for (const it of items) {
        const prices = Array.isArray(it.prices) ? it.prices : [];
        const idx = Math.floor(Math.random() * 3); // 0..2
        const base = Number(prices[idx] ?? prices.find(Number));
        if (!Number.isFinite(base) || base <= 0) continue;

        const pct = 5 + Math.floor(Math.random() * 11);
        all.push({
          type: "single",
          state,
          place: it.place,
          img: it.img,
          days: it.daysNeeded || 0,
          package: PKG[idx],
          priceOriginal: base,
          discountPct: pct,
          priceFinal: Math.round(base * (1 - pct / 100)),
        });
      }
    } catch {}
  }
  return shuffle(all).slice(0, 5);
}

/* ========= cart ========= */
function addBundleToCart(bundle) {
  const cart = loadCart();
  const bundleId = "BNDL-" + Math.random().toString(36).slice(2, 8);
  const sum = bundle.members.reduce((t, m) => t + m.pricePlus, 0) || 1;
  bundle.members.forEach((m) => {
    const share = Math.round((m.pricePlus * bundle.priceFinal) / sum);
    cart.push({
      bundleId,
      state: m.state,
      place: m.place,
      img: m.img,
      days: m.days,
      package: "Plus",
      price: share,
      qty: 1,
    });
  });
  saveCart(cart);
  confetti(document.body, 14);
}

function addSingleToCart(deal) {
  if (!isLoggedIn()) {
    alert("Please log in to add items to your cart.");
    return;
  }
  const cart = loadCart();
  cart.push({
    state: deal.state,
    place: deal.place,
    img: deal.img,
    days: deal.days,
    package: deal.package,
    price: deal.priceFinal,
    qty: 1,
  });
  saveCart(cart);
  confetti(document.body, 8);
}

/* ========= effects ========= */
function attachTilt(el) {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  el.addEventListener("mousemove", (e) => {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2,
      cy = r.top + r.height / 2;
    const dx = (e.clientX - cx) / (r.width / 2);
    const dy = (e.clientY - cy) / (r.height / 2);
    el.style.transform = `rotateX(${clamp(-dy * 6, -6, 6)}deg) rotateY(${clamp(
      dx * 8,
      -8,
      8
    )}deg) translateY(-2px)`;
  });
  el.addEventListener("mouseleave", () => {
    el.style.transform = "";
  });
}
function ripple(e) {
  const btn = e.currentTarget;
  const circle = document.createElement("span");
  circle.className = "ripple";
  const rect = btn.getBoundingClientRect();
  const d = Math.max(rect.width, rect.height);
  circle.style.width = circle.style.height = d + "px";
  circle.style.left = e.clientX - rect.left - d / 2 + "px";
  circle.style.top = e.clientY - rect.top - d / 2 + "px";
  btn.appendChild(circle);
  setTimeout(() => circle.remove(), 550);
}
function bindRipples(scope = document) {
  $$(".btn", scope).forEach((b) =>
    b.addEventListener("click", ripple, { passive: true })
  );
}

/* cute confetti without deps */
function confetti(root, n = 8) {
  for (let i = 0; i < n; i++) {
    const s = document.createElement("i");
    s.className = "confetti";
    s.style.setProperty("--x", Math.random() * 100 + "%");
    s.style.setProperty("--tx", Math.random() * 60 - 30 + "px");
    s.style.setProperty("--d", 400 + Math.random() * 600 + "ms");
    root.appendChild(s);
    setTimeout(() => s.remove(), 900);
  }
}

/* ========= rendering ========= */
function setActiveTab(which) {
  // which is: "auto-bundles" or "auto-individual"
  $$(".tab-btn").forEach((b) =>
    b.classList.toggle("active", b.dataset.tab === which)
  );
  $$(".tab-panel").forEach((p) => (p.hidden = p.id !== which));
}

function skelRows(host, rows = 3) {
  host.innerHTML = "";
  for (let i = 0; i < rows; i++) {
    const el = document.createElement("div");
    el.className = "card skel";
    el.innerHTML = `<div class="sk-line"></div><div class="sk-line short"></div>`;
    host.appendChild(el);
  }
}

function renderBundles(list, hostId = "bundleList") {
  const host = $(`#${hostId}`);
  host.innerHTML = "";
  if (!list.length) {
    host.innerHTML = `<div class="muted">No bundles right now.</div>`;
    return;
  }

  list.forEach((b) => {
    const thumbs = b.members
      .slice(0, 3)
      .map(
        (m) => `
      <div class="stacked-thumb"><img src="${m.img || ""}" alt="${
          m.place
        }" loading="lazy"/></div>
    `
      )
      .join("");

    const places = b.members
      .map((m) => `<li><span>${m.place}</span></li>`)
      .join("");

    const el = document.createElement("div");
    el.className = "card bundle tilt";
    el.innerHTML = `
      <div class="card-head">
        <span class="badge state">${b.state}</span>
        <span class="badge pill">Bundle · ${b.package}</span>
        <span class="badge deal">-${b.discountPct}%</span>
      </div>
      <div class="bundle-body">
        <div class="stack">${thumbs}</div>
        <div class="bundle-main">
          <h3>${b.state} Explorer</h3>
          <ul class="mini-list">${places}</ul>
        </div>
        <div class="price-col">
          <div class="strike">${fmtINR(b.priceOriginal)}</div>
          <div class="final">${fmtINR(b.priceFinal)}</div>
          <div class="btn-row">
            <button class="btn btn-primary" data-add>Add bundle</button>
            <a class="btn btn-ghost" href="./listofplace.html?state=${encodeURIComponent(
              b.state
            )}">View state</a>
          </div>
        </div>
      </div>`;
    el.querySelector("[data-add]").onclick = () => addBundleToCart(b);
    attachTilt(el);
    bindRipples(el);
    host.appendChild(el);
  });
}

function renderSingles(list) {
  const host = $("#individualList");
  host.innerHTML = "";
  if (!list.length) {
    host.innerHTML = `<div class="muted">No deals found.</div>`;
    return;
  }

  list.forEach((d) => {
    const el = document.createElement("div");
    el.className = "card single tilt";
    el.innerHTML = `
      <div class="thumb"><img src="${d.img || ""}" alt="${
      d.place
    }" loading="lazy"/></div>
      <div class="meta">
        <h4>${d.place}</h4>
        <div class="badge-row">
          <span class="badge state">${d.state}</span>
          <span class="badge pill">${d.package}</span>
          <span class="badge deal">-${d.discountPct}%</span>
        </div>
      </div>
      <div class="price-col">
        <div class="strike">${fmtINR(d.priceOriginal)}</div>
        <div class="final">${fmtINR(d.priceFinal)}</div>
        <div class="btn-row">
          <button class="btn btn-primary" data-add>Add</button>
          <a class="btn btn-ghost" href="./listofplace.html?state=${encodeURIComponent(
            d.state
          )}">View</a>
        </div>
      </div>`;
    el.querySelector("[data-add]").onclick = () => addSingleToCart(d);
    attachTilt(el);
    bindRipples(el);
    host.appendChild(el);
  });
}

/* show/hide bottom section (hand-picked) */
function showHandpicked() {
  const sec = $("#dealsSection");
  if (!sec) return;
  sec.hidden = false;
  sec.classList.add("reveal");
}
function hideHandpicked() {
  const sec = $("#dealsSection");
  if (!sec) return;
  sec.hidden = true;
  sec.classList.remove("reveal");
}

/* ========= boot ========= */
(async function boot() {
  // Tabs for REGULAR deals (top)
  $("#tabBtnBundles")?.addEventListener("click", () =>
    setActiveTab("auto-bundles")
  );
  $("#tabBtnSingles")?.addEventListener("click", () =>
    setActiveTab("auto-individual")
  );
  setActiveTab("auto-bundles");

  // Start with bottom section hidden
  hideHandpicked();

  // Skeletons
  skelRows($("#bundleList"), 3);
  skelRows($("#individualList"), 3);

  try {
    // REGULAR (top)
    const [bundles, singles] = await Promise.all([
      buildBundles({ learned: false }),
      buildIndividuals(),
    ]);
    renderBundles(bundles, "bundleList");
    renderSingles(singles);

    // HAND-PICKED (bottom) — only if we’re in learned phase (day >=2)
    if (getLearningPhaseDays() >= 2) {
      const learnedBundles = await buildBundles({ learned: true });
      const host = $("#handpickList");
      skelRows(host, 2);
      renderBundles(learnedBundles, "handpickList");
      if (learnedBundles.length) showHandpicked();
      else hideHandpicked();
    } else {
      hideHandpicked();
    }
  } catch (e) {
    console.error(e);
    hideHandpicked();
  }
})();
