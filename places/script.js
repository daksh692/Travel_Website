/* ========== Use your existing site auth/menu wiring ========== */
/* main.js will attach to #settingsBtn, #avatarBtn, #settingsMenu, #userMenu
   and keep body[data-auth] in sync with localStorage.  */

/* ========== Center & Fit SVG to actual content ========== */
function fitSvgToContent() {
  const svg = document.getElementById("svg-map");
  const states = svg.querySelectorAll(".state");
  if (!states.length) return;

  // find combined bbox of all states
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  states.forEach((p) => {
    const b = p.getBBox();
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  });
  const pad = Math.max(maxX - minX, maxY - minY) * 0.04; // 4% padding
  const x = minX - pad,
    y = minY - pad,
    w = maxX - minX + pad * 2,
    h = maxY - minY + pad * 2;
  svg.setAttribute("viewBox", `${x} ${y} ${w} ${h}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
}
document.addEventListener("DOMContentLoaded", fitSvgToContent);
window.addEventListener("resize", () => {
  clearTimeout(window._fitT);
  window._fitT = setTimeout(fitSvgToContent, 120);
});

/* ========== Hover label ========== */
const hoverLabel = document.getElementById("hover-label");
document.addEventListener("mousemove", (e) => {
  hoverLabel.style.left = e.clientX + 12 + "px";
  hoverLabel.style.top = e.clientY + 12 + "px";
});
const states = Array.from(document.querySelectorAll("#svg-map .state"));
const prettyName = (id) =>
  id.replaceAll("_", " ").replace(/(^|\s)\w/g, (m) => m.toUpperCase());
states.forEach((el) => {
  el.addEventListener("mouseover", (ev) => {
    hoverLabel.textContent = prettyName(ev.target.id);
    hoverLabel.style.display = "block";
  });
  el.addEventListener("mouseout", () => {
    hoverLabel.style.display = "none";
  });
});

/* ========== Scroll helpers ========== */
function ensureVisible(el) {
  const r = el.getBoundingClientRect();
  const margin = 100; // keep some room
  const outTop = r.top < margin;
  const outBottom = r.bottom > window.innerHeight - margin;
  if (outTop || outBottom) {
    const target =
      window.scrollY + r.top - (window.innerHeight / 2 - r.height / 2);
    window.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
  }
}

/* ========== Click navigation ========== */
function goToState(stateId) {
  const stateName = prettyName(stateId);
  window.location.href = "../listofplace.html?state=" + encodeURIComponent(stateName);
}

/* ========== State preview (click a state → preview instead of an
   immediate full-page jump; search still jumps straight there) ========== */
const API_HOST = `http://${location.hostname || "localhost"}:3001`;
const API_BASE = `${API_HOST}/api`;
const preview = document.getElementById("statePreview");
const previewTitle = document.getElementById("statePreviewTitle");
const previewBody = document.getElementById("statePreviewBody");
const previewLink = document.getElementById("statePreviewLink");
const previewClose = document.getElementById("statePreviewClose");

async function showPreview(stateId) {
  const stateName = prettyName(stateId);
  previewTitle.textContent = stateName;
  previewBody.innerHTML = '<p class="state-preview-loading">Loading places…</p>';
  previewLink.href = "../listofplace.html?state=" + encodeURIComponent(stateName);
  preview.hidden = false;

  try {
    const res = await fetch(`${API_BASE}/states/${encodeURIComponent(stateName)}/places`);
    const json = await res.json();
    const items = (json.items || []).slice(0, 3);
    if (!items.length) {
      previewBody.innerHTML = '<p class="state-preview-empty">No places listed yet for this state.</p>';
      return;
    }
    previewBody.innerHTML = items
      .map((it) => {
        const prices = (it.prices || []).map(Number).filter((n) => !Number.isNaN(n));
        const from = prices.length ? `from ₹${Math.min(...prices)}` : "";
        return `<div class="state-preview-item"><span>${it.place}</span><span class="state-preview-price">${from}</span></div>`;
      })
      .join("");
  } catch {
    previewBody.innerHTML = '<p class="state-preview-empty">Couldn’t load places right now.</p>';
  }
}
previewClose?.addEventListener("click", () => {
  preview.hidden = true;
});
states.forEach((el) => el.addEventListener("click", () => showPreview(el.id)));

/* ========== Trip-aware badges (states already in the visitor's cart) ========== */
function getCartStates() {
  try {
    const cart = JSON.parse(localStorage.getItem("cartDraft") || "[]");
    return new Set(cart.map((it) => it.state));
  } catch {
    return new Set();
  }
}
function markTripStates() {
  const cartStates = getCartStates();
  const svg = document.getElementById("svg-map");
  svg.querySelectorAll(".trip-badge").forEach((n) => n.remove());

  states.forEach((el) => {
    const inCart = cartStates.has(prettyName(el.id));
    el.classList.toggle("has-trip", inCart);
    if (!inCart) return;
    const b = el.getBBox();
    const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dot.setAttribute("cx", b.x + b.width / 2);
    dot.setAttribute("cy", b.y + b.height / 2);
    dot.setAttribute("r", 6);
    dot.setAttribute("class", "trip-badge");
    dot.setAttribute("pointer-events", "none");
    svg.appendChild(dot);
  });

  const callout = document.getElementById("cartCallout");
  const text = document.getElementById("cartCalloutText");
  if (callout && text) {
    if (cartStates.size) {
      const n = cartStates.size;
      text.textContent = `You have places saved in ${n} state${n > 1 ? "s" : ""} — continue where you left off.`;
      callout.hidden = false;
    } else {
      callout.hidden = true;
    }
  }
}
document.addEventListener("DOMContentLoaded", markTripStates);

/* ========== Live search (type-ahead + glow + auto-scroll) ========== */
const input = document.getElementById("state-search");
const suggestions = document.getElementById("search-suggestions");

const catalogue = states
  .map((el) => ({ id: el.id, label: prettyName(el.id) }))
  .filter((v, i, a) => a.findIndex((x) => x.id === v.id) === i);

function scoreMatch(q, label) {
  const l = label.toLowerCase(),
    s = q.toLowerCase();
  // Starts-with only — typing "H" should surface Haryana, not Chhattisgarh.
  return l.startsWith(s) ? 1 : -1;
}

let lastMatches = [];
function renderSuggestions(items) {
  suggestions.innerHTML = "";
  // Safety: a re-render mid-hover removes the <li> without a mouseleave event.
  states.forEach((el) => el.classList.remove("list-hover"));
  if (!items.length) {
    suggestions.classList.remove("show");
    return;
  }
  items.slice(0, 10).forEach(({ id, label }) => {
    const li = document.createElement("li");
    li.setAttribute("role", "option");
    li.innerHTML = `<span>${label}</span><span class="enter-hint">Enter ↵</span>`;
    li.addEventListener("click", () => goToState(id));
    // Hovering a suggestion highlights that exact state on the map.
    li.addEventListener("mouseenter", () => {
      document.getElementById(id)?.classList.add("list-hover");
    });
    li.addEventListener("mouseleave", () => {
      document.getElementById(id)?.classList.remove("list-hover");
    });
    suggestions.appendChild(li);
  });
  suggestions.classList.add("show");
}
function updateGlow(matches) {
  lastMatches.forEach((m) =>
    document.getElementById(m.id)?.classList.remove("match")
  );
  matches.forEach((m) => document.getElementById(m.id)?.classList.add("match"));
  lastMatches = matches;
  // auto-scroll first match into view
  if (matches[0]) ensureVisible(document.getElementById(matches[0].id));
}
function handleSearch() {
  const q = input.value.trim();
  if (!q) {
    suggestions.classList.remove("show");
    updateGlow([]);
    return;
  }
  const scored = catalogue
    .map((item) => ({ ...item, _s: scoreMatch(q, item.label) }))
    .filter((x) => x._s >= 0)
    .sort((a, b) => b._s - a._s || a.label.localeCompare(b.label));
  renderSuggestions(scored);
  updateGlow(scored);
}
let t;
input?.addEventListener("input", () => {
  clearTimeout(t);
  t = setTimeout(handleSearch, 60);
});
input?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const q = input.value.trim();
    const top = catalogue
      .map((item) => ({ ...item, _s: scoreMatch(q, item.label) }))
      .filter((x) => x._s >= 0)
      .sort((a, b) => b._s - a._s || a.label.localeCompare(b.label))[0];
    if (top) goToState(top.id);
  }
});
document.addEventListener("click", (e) => {
  if (!document.querySelector(".search-wrap")?.contains(e.target)) {
    suggestions.classList.remove("show");
  }
});

/* ========== Legend toggle (floating bulb) ========== */
const legendToggle = document.getElementById("legendToggle");
const legendPanel = document.getElementById("legendPanel");
if (legendToggle && legendPanel) {
  legendToggle.addEventListener("click", (e) => {
    e.stopPropagation();
    const opening = legendPanel.hidden;
    legendPanel.hidden = !opening;
    legendToggle.setAttribute("aria-expanded", String(opening));
  });
  document.addEventListener("click", (e) => {
    if (!legendPanel.hidden && !legendPanel.contains(e.target) && e.target !== legendToggle) {
      legendPanel.hidden = true;
      legendToggle.setAttribute("aria-expanded", "false");
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !legendPanel.hidden) {
      legendPanel.hidden = true;
      legendToggle.setAttribute("aria-expanded", "false");
    }
  });
}
