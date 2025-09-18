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

/* ========== Click navigation (HTML only) ========== */
function goToState(stateId) {
  const stateName = prettyName(stateId);
  // Navigate; tweak to your page name if needed
  const url = " ../listofplace.html?state=" + encodeURIComponent(stateName);
  window.location.href = url;
}
states.forEach((el) => el.addEventListener("click", () => goToState(el.id)));

/* ========== Live search (type-ahead + glow + auto-scroll) ========== */
const input = document.getElementById("state-search");
const suggestions = document.getElementById("search-suggestions");

const catalogue = states
  .map((el) => ({ id: el.id, label: prettyName(el.id) }))
  .filter((v, i, a) => a.findIndex((x) => x.id === v.id) === i);

function scoreMatch(q, label) {
  const l = label.toLowerCase(),
    s = q.toLowerCase();
  if (l.startsWith(s)) return 2;
  const idx = l.indexOf(s);
  if (idx >= 0) return 1 - idx / 100;
  return -1;
}

let lastMatches = [];
function renderSuggestions(items) {
  suggestions.innerHTML = "";
  if (!items.length) {
    suggestions.classList.remove("show");
    return;
  }
  items.slice(0, 10).forEach(({ id, label }) => {
    const li = document.createElement("li");
    li.setAttribute("role", "option");
    li.innerHTML = `<span>${label}</span><span class="enter-hint">Enter ↵</span>`;
    li.addEventListener("click", () => goToState(id));
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
