const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const API_HOST = `http://${location.hostname}:3001`;
const API_BASE = `${API_HOST}/api`;
const fmtINR = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");

function showToast({
  title = "OK",
  message = "",
  type = "info",
  timeout = 1600,
} = {}) {
  const host = $("#toasts");
  if (!host) return;
  const el = document.createElement("div");
  el.className = "lp-toast";
  el.setAttribute("data-type", type);
  el.innerHTML = `<div class="lp-toast__icon">ℹ</div><div class="lp-toast__body"><div class="lp-toast__title">${title}</div><div class="lp-toast__msg">${message}</div></div>`;
  host.appendChild(el);
  setTimeout(() => el.remove(), timeout);
}

function getSession() {
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

async function loadSummary(clientId) {
  const r = await fetch(`${API_BASE}/users/${clientId}/summary`);
  if (!r.ok) throw new Error("Failed to load");
  return r.json();
}

function initials(name) {
  return String(name || "U")
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0] || "")
    .join("")
    .toUpperCase();
}

async function boot() {
  const s = getSession();
  const avatar = $("#accAvatar"),
    name = $("#accName"),
    email = $("#accEmail");
  const phone = $("#accPhone"),
    addr = $("#accAddr");
  if (!s) {
    name.textContent = "Guest";
    email.textContent = "Not signed in";
    $("#accAvatar").textContent = "G";
  } else {
    name.textContent = `${s.FirstName || ""} ${s.LastName || ""}`.trim();
    email.textContent = s.Email || "—";
    phone.textContent = s.PhoneNumber || "—";
    addr.textContent = s.Address || "—";
    avatar.textContent = initials(name.textContent);
  }

  // Trip summary from backend (if logged in)
  const sumEl = $("#accSummary");
  if (!s) {
    sumEl.innerHTML = `<div class="muted">Sign in to see your trip history.</div>`;
  } else {
    try {
      const data = await loadSummary(s.ClientID);
      if (!data || !Array.isArray(data.cart)) {
        sumEl.innerHTML = `<div class="muted">No history yet.</div>`;
      } else {
        sumEl.innerHTML = "";
        data.cart.forEach((row) => {
          const div = document.createElement("div");
          div.className = "item";
          div.innerHTML = `
            <div><strong>${row.placeName}</strong> <span class="badge">${
            row.stateName
          }</span></div>
            <div>${fmtINR(row.price)} × ${row.qty || 1}</div>`;
          sumEl.appendChild(div);
        });
      }
    } catch (e) {
      sumEl.innerHTML = `<div class="muted">Couldn’t load history.</div>`;
    }
  }

  // Local cart (device)
  const local = loadCart();
  const host = $("#accCartLocal");
  if (!local.length) {
    host.innerHTML = `<div class="muted">No items in local cart.</div>`;
  } else {
    host.innerHTML = "";
    local.forEach((it) => {
      const row = document.createElement("div");
      row.className = "item";
      row.innerHTML = `<div><strong>${it.place}</strong> <span class="badge">${
        it.state
      }</span></div><div>${fmtINR((it.price || 0) * (it.qty || 1))}</div>`;
      host.appendChild(row);
    });
  }

  $("#clearLocal")?.addEventListener("click", () => {
    if (confirm("Clear this device’s saved cart?")) {
      localStorage.removeItem("cartDraft");
      showToast({ title: "Cleared", type: "warning" });
      location.reload();
    }
  });
}
boot();
