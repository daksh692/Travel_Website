/* ========= tiny utils ========= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const API_HOST = `http://${location.hostname || "localhost"}:3001`;
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
    `${API_BASE}/states/${encodeURIComponent(state)}/places`,
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
            ? (it.prices[1] ?? it.prices[0])
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
  return shuffle(all).slice(0, 12);
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
    b.addEventListener("click", ripple, { passive: true }),
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
function skelRows(host, rows = 3) {
  host.innerHTML = "";
  for (let i = 0; i < rows; i++) {
    const el = document.createElement("div");
    el.className = "card skel";
    el.innerHTML = `<div class="sk-line"></div><div class="sk-line short"></div>`;
    host.appendChild(el);
  }
}

/* ========= Deals Hub: rail views ========= */
function switchView(name) {
  $$(".rail-btn[data-view]").forEach((b) =>
    b.classList.toggle("active", b.dataset.view === name),
  );
  $$(".deal-view").forEach((v) =>
    v.classList.toggle("active", v.dataset.view === name),
  );
}
$$(".rail-btn[data-view]").forEach((b) => {
  b.addEventListener("click", () => switchView(b.dataset.view));
});

/* ========= Bundle Deals hub (image-match landing view) ========= */
function buildHubBundleCard(b, featured = false) {
  const places = b.members.map((m) => `<li>${m.place}</li>`).join("");
  const thumbs = b.members
    .slice(0, 3)
    .map(
      (m) =>
        `<div class="stacked-thumb"><img src="${m.img || ""}" alt="${m.place}" loading="lazy"/></div>`,
    )
    .join("");
  const el = document.createElement("div");
  el.className = "hub-bundle-card" + (featured ? " featured" : "");
  el.innerHTML = `
    ${featured ? `<span class="featured-ribbon">⏱️</span>` : ""}
    <div class="hub-bundle-thumbs">${thumbs}</div>
    <h3>${featured ? "Featured Bundle of the Day – " : ""}${b.state} ${
      featured ? "Experience" : "Adventure Bundle"
    }</h3>
    <ul class="mini-list">${places}</ul>
    ${
      featured
        ? `<div class="countdown" id="hubCountdown">
             <div class="cd-box"><span class="hcd-h">00</span><label>h</label></div>
             <div class="cd-box"><span class="hcd-m">00</span><label>m</label></div>
             <div class="cd-box"><span class="hcd-s">00</span><label>s</label></div>
           </div>`
        : ""
    }
    <div class="hub-price">
      <span class="strike">${fmtINR(b.priceOriginal)}</span>
      <span class="final">${fmtINR(b.priceFinal)}</span>
    </div>
    <div class="btn-row" style="justify-content:stretch">
      <button class="btn btn-primary" data-add style="flex:1">Add Bundle</button>
    </div>`;
  el.querySelector("[data-add]").onclick = () => addBundleToCart(b);
  bindRipples(el);
  return el;
}

function buildHubItemCard(d) {
  const tags = { Basic: "Ticket only", Plus: "Experience only", Premium: "Pass only" };
  const el = document.createElement("div");
  el.className = "hub-item-card";
  el.innerHTML = `
    <h4>${d.place}</h4>
    <div class="hub-item-body">
      <div class="hub-item-thumb"><img src="${d.img || ""}" alt="${d.place}" loading="lazy"/></div>
      <div class="hub-item-price">${fmtINR(d.priceFinal)}</div>
    </div>
    <div class="hub-item-foot">
      <span class="hub-item-tag">${tags[d.package] || "Deal item"}</span>
      <button class="btn btn-primary" data-add>Add to Cart</button>
    </div>`;
  el.querySelector("[data-add]").onclick = () => addSingleToCart(d);
  bindRipples(el);
  return el;
}

/* ========= sort helpers (shared by Bundle Deals + Flash individual items) ========= */
function sortByMode(list, mode) {
  const arr = [...list];
  if (mode === "price-asc") arr.sort((a, b) => a.priceFinal - b.priceFinal);
  else if (mode === "price-desc") arr.sort((a, b) => b.priceFinal - a.priceFinal);
  else arr.sort((a, b) => b.discountPct - a.discountPct);
  return arr;
}

/* Generic full grid of bundle cards — used by Bundle Deals + Exclusive */
function renderBundleGrid(hostId, bundles) {
  const grid = $(`#${hostId}`);
  if (!grid) return;
  grid.innerHTML = "";
  if (!bundles.length) {
    grid.innerHTML = `<div class="muted">No bundles right now.</div>`;
    return;
  }
  bundles.forEach((b) => grid.appendChild(buildHubBundleCard(b)));
}

/* Bundle Deals view: all bundles, sortable */
let cacheBundles = [];
function renderBundleDealsView() {
  const mode = $("#bundleSort")?.value || "discount";
  renderBundleGrid("hubBundleGrid", sortByMode(cacheBundles, mode));
  const count = $("#bundleCount");
  if (count) count.textContent = `${cacheBundles.length} bundle${cacheBundles.length === 1 ? "" : "s"}`;
}

/* Flash Deals view: top-3 discount bundles (curated, not sortable) + featured card */
function renderFlashHub(bundles) {
  const grid = $("#flashHubGrid");
  if (!grid || !bundles.length) return;
  grid.innerHTML = "";
  const top3 = [...bundles].sort((a, b) => b.discountPct - a.discountPct).slice(0, 3);
  const [featured, ...rest] = top3;
  if (rest[0]) grid.appendChild(buildHubBundleCard(rest[0]));
  grid.appendChild(buildHubBundleCard(featured, true));
  if (rest[1]) grid.appendChild(buildHubBundleCard(rest[1]));
}

/* Flash Deals view: individual items, sortable */
let cacheSingles = [];
function renderFlashIndividuals() {
  const iGrid = $("#flashIndividualGrid");
  if (!iGrid) return;
  const mode = $("#itemSort")?.value || "discount";
  iGrid.innerHTML = "";
  if (!cacheSingles.length) {
    iGrid.innerHTML = `<div class="muted">No deals found.</div>`;
    return;
  }
  sortByMode(cacheSingles, mode)
    .slice(0, 8)
    .forEach((d) => iGrid.appendChild(buildHubItemCard(d)));
}

/* countdown reused for the featured hub card */
function startHubCountdown() {
  const tick = () => {
    const now = new Date();
    const next = new Date(now);
    next.setHours(24, 0, 0, 0);
    const diff = Math.max(0, next - now);
    const hh = String(Math.floor(diff / 3600000)).padStart(2, "0");
    const mm = String(Math.floor((diff % 3600000) / 60000)).padStart(2, "0");
    const ss = String(Math.floor((diff % 60000) / 1000)).padStart(2, "0");
    $$(".hcd-h").forEach((e) => (e.textContent = hh));
    $$(".hcd-m").forEach((e) => (e.textContent = mm));
    $$(".hcd-s").forEach((e) => (e.textContent = ss));
  };
  tick();
  setInterval(tick, 1000);
}

/* ========= Personalized picks ========= */
function renderPersonalized() {
  const u = sessionUser();
  const av = $("#phAvatar"),
    msg = $("#phMsg");
  if (!av || !msg) return;
  if (u) {
    av.textContent = (u.FirstName || "U").charAt(0).toUpperCase();
    msg.textContent = `Welcome back, ${u.FirstName || "traveller"} — picks tuned to you.`;
  } else {
    av.textContent = "?";
    msg.innerHTML = `Sign in for tailored deals. <a href="auth.html?tab=login">Log in</a>`;
  }
}

/* ========= Trending destinations (decorative — not a literal map) ========= */
function renderTrending(states) {
  const host = $("#trendMap");
  if (!host) return;
  const picks = (states.length ? states : POPULAR_STATES).slice(0, 3);
  const spots = [
    { top: "28%", left: "22%" },
    { top: "55%", left: "62%" },
    { top: "72%", left: "34%" },
  ];
  host.innerHTML = picks
    .map(
      (s, i) => `
      <span class="trend-pin" style="top:${spots[i].top}; left:${spots[i].left}">
        <span class="pin-dot"></span><span class="pin-label">${s}</span>
      </span>`,
    )
    .join("");
}

/* ========= Live feed (synthetic timestamps over real deal data) ========= */
function renderLiveFeed(bundles, singles) {
  const host = $("#liveFeed");
  if (!host) return;
  const ago = () => {
    const m = 2 + Math.floor(Math.random() * 58);
    return m < 60 ? `${m}m ago` : `${Math.floor(m / 60)}h ago`;
  };
  const items = [
    { dot: "coral", text: "New limited-time deals just dropped" },
    ...bundles.slice(0, 2).map((b) => ({
      dot: "azure",
      text: `${b.state} Explorer · updated`,
    })),
    ...singles.slice(0, 1).map((d) => ({
      dot: "ivory",
      text: `New ${d.place} deal added`,
    })),
  ];
  host.innerHTML = items
    .map(
      (it) => `
      <li><span class="live-dot ${it.dot}"></span>
        <div><div class="live-text">${it.text}</div>
        <div class="live-time">${ago()}</div></div>
      </li>`,
    )
    .join("");
}

/* ========= boot ========= */
(async function boot() {
  startHubCountdown();
  renderPersonalized();

  $("#bundleSort")?.addEventListener("change", renderBundleDealsView);
  $("#itemSort")?.addEventListener("change", renderFlashIndividuals);

  // Skeletons
  skelRows($("#hubBundleGrid"), 3);
  skelRows($("#flashHubGrid"), 3);
  skelRows($("#flashIndividualGrid"), 4);

  try {
    const [bundles, singles] = await Promise.all([
      buildBundles({ learned: false }),
      buildIndividuals(),
    ]);
    cacheBundles = bundles;
    cacheSingles = singles;

    renderFlashHub(bundles);
    renderFlashIndividuals();
    renderBundleDealsView();
    renderTrending(bundles.map((b) => b.state));
    renderLiveFeed(bundles, singles);

    // Exclusive (hand-picked) — unlocks once we've learned from day 3
    if (getLearningPhaseDays() >= 2) {
      const learnedBundles = await buildBundles({ learned: true });
      skelRows($("#handpickList"), 2);
      renderBundleGrid("handpickList", learnedBundles);
      $("#exclusiveNote").textContent = learnedBundles.length
        ? "Curated from what you view and add most."
        : "No hand-picked bundles yet — browse a bit more.";
    }
  } catch (e) {
    console.error(e);
  }
})();
