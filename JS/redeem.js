// ===== Tiny utils (kept local for portability) =====
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const fmtINR = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");

// Reuse same constants as rest of app
const API_HOST = `http://${location.hostname}:3001`;
const API_BASE = `${API_HOST}/api`;

const SERVICE_RATE_PCT = 0.5;
const TAX_RATE_PCT = 12;

// Simple in-app promo codes
const CODES = { WELCOME10: 10, FESTIVE15: 15, VIP20: 20 };

// ===== Local storage helpers =====
function loadCart() {
  try {
    return JSON.parse(localStorage.getItem("cartDraft") || "[]");
  } catch {
    return [];
  }
}
function loadPromo() {
  return Number(localStorage.getItem("promoDiscountPct") || 0);
}
function savePromo(pct) {
  if (pct > 0) localStorage.setItem("promoDiscountPct", String(pct));
  else localStorage.removeItem("promoDiscountPct");
}
function loadAppliedPoints() {
  return Number(localStorage.getItem("appliedPoints") || 0);
}
function saveAppliedPoints(p) {
  if (p > 0) localStorage.setItem("appliedPoints", String(p));
  else localStorage.removeItem("appliedPoints");
}

// ===== Auth/user helper (from main.js normally) =====
function getLoggedUser() {
  try {
    const u = JSON.parse(localStorage.getItem("authUser") || "null");
    return u && u.ClientID ? u : null;
  } catch {
    return null;
  }
}

// ===== Points state =====
let pointsRule = { ratio: 1, label: "1 point = ₹1" }; // UI label
let pointsBalance = 0; // from server (earned - redeemed)
let pointsMaxUsable = 0; // dynamic ceiling based on current total
let pointsApplied = loadAppliedPoints(); // persisted locally until checkout

// ===== Totals calc =====
function totals() {
  const cart = loadCart();
  const sub = cart.reduce(
    (s, it) => s + Number(it.price || 0) * Number(it.qty || 1),
    0
  );
  const serv = Math.round(sub * (SERVICE_RATE_PCT / 100));
  const tax = Math.round((sub + serv) * (TAX_RATE_PCT / 100));
  const gross = sub + serv + tax;

  const promoPct = loadPromo();
  const disc = Math.round(gross * (promoPct / 100));

  // points are ₹1 per point (by default)
  const provisionalTotal = Math.max(0, gross - disc);
  pointsMaxUsable = Math.min(pointsBalance, provisionalTotal); // can't use more points than remaining charge

  // Clamp applied points to allowed range
  pointsApplied = Math.max(0, Math.min(pointsApplied, pointsMaxUsable));

  const final = provisionalTotal - pointsApplied;
  return {
    sub,
    serv,
    tax,
    gross,
    promoPct,
    disc,
    points: pointsApplied,
    final,
  };
}

// ===== Render =====
function render() {
  const t = totals();
  $("#sub").textContent = fmtINR(t.sub);
  $("#serv").textContent = fmtINR(t.serv);
  $("#tax").textContent = fmtINR(t.tax);
  $("#disc").textContent = "−" + fmtINR(t.disc);
  $("#promoPct").textContent = (t.promoPct || 0) + "%";

  $("#pointsUsed").textContent = t.points;
  $("#pointsDisc").textContent = "−" + fmtINR(t.points);

  $("#tot").textContent = fmtINR(t.final);

  // Range / input sync
  const range = $("#pointsRange");
  const input = $("#pointsInput");
  range.max = String(pointsMaxUsable);
  if (document.activeElement !== range) range.value = String(pointsApplied);
  if (document.activeElement !== input) input.value = String(pointsApplied);

  // Balance / rule
  $("#pointsBalance").textContent = pointsBalance.toString();
  $("#pointsRule").textContent = pointsRule.label;
  $("#persistNote").hidden = pointsApplied === 0;
}

// ===== Toast (from main.js if present), fallback to alert =====
function toast(opts) {
  const host = $("#toasts");
  if (!host) {
    alert(opts?.message || opts?.title || "OK");
    return;
  }
  const el = document.createElement("div");
  el.className = "lp-toast";
  el.setAttribute("data-type", opts.type || "info");
  el.innerHTML = `
    <div class="lp-toast-title">${opts.title || "OK"}</div>
    ${opts.message ? `<div class="lp-toast-msg">${opts.message}</div>` : ""}
  `;
  host.appendChild(el);
  setTimeout(() => el.remove(), opts.timeout || 1600);
}

// ===== Promo events =====
$("#apply").onclick = () => {
  const code = $("#code").value.trim().toUpperCase();
  const pct = CODES[code] || 0;
  if (!pct) {
    toast({
      title: "Invalid code",
      message: "Please check and try again.",
      type: "error",
    });
    return;
  }
  savePromo(pct);
  render();
  toast({ title: "Promo applied", message: `Saved ${pct}%`, type: "success" });
};

$("#remove").onclick = () => {
  savePromo(0);
  render();
  toast({ title: "Promo removed", type: "info" });
};

// quick chips
$$(".chip").forEach((c) =>
  c.addEventListener("click", () => {
    $("#code").value = c.dataset.code || "";
    $("#apply").click();
  })
);

// ===== Points events =====
$("#pointsRange").addEventListener("input", (e) => {
  pointsApplied = Number(e.currentTarget.value || 0);
  saveAppliedPoints(pointsApplied);
  render();
});

$("#pointsInput").addEventListener("input", (e) => {
  const v = Math.max(
    0,
    Math.min(pointsMaxUsable, Number(e.currentTarget.value || 0))
  );
  pointsApplied = v;
  saveAppliedPoints(pointsApplied);
  render();
});

$("#usePointsBtn").addEventListener("click", () => {
  if (pointsApplied <= 0) {
    toast({
      title: "Nothing to apply",
      message: "Increase points first.",
      type: "info",
    });
  } else {
    toast({
      title: "Points applied",
      message: `Using ${pointsApplied} points`,
      type: "success",
    });
  }
});

$("#clearPointsBtn").addEventListener("click", () => {
  pointsApplied = 0;
  saveAppliedPoints(0);
  render();
  toast({ title: "Cleared", message: "Removed applied points.", type: "info" });
});

// ===== Load points from API =====
async function fetchPointsBalance() {
  const user = getLoggedUser();
  if (!user) {
    pointsBalance = 0;
    pointsRule = { ratio: 1, label: "Login to use points" };
    render();
    return;
  }
  try {
    const res = await fetch(`${API_BASE}/users/${user.ClientID}/points`);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "Failed");
    // Server returns: { ok, points, rule }
    pointsBalance = Number(data.points || 0);
    // If server gives a textual rule, reflect it
    if (data.rule)
      pointsRule = {
        ratio: 1,
        label: data.rule.replace("₹100", "₹1 per point") || "Loyalty points",
      };
  } catch (e) {
    console.error("points error", e);
    pointsBalance = 0;
    toast({ title: "Couldn’t load points", type: "error" });
  } finally {
    render();
  }
}

// ===== Init =====
fetchPointsBalance();
render();
