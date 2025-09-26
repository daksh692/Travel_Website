// JS/account.js
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const API_HOST = `http://${location.hostname}:3001`;
const API_BASE = `${API_HOST}/api`;

const fmtINR = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");

function maskPhone(p) {
  const d = String(p || "").replace(/\D/g, "");
  if (!d) return "—";
  if (d.length <= 4) return d;
  return `•••• •••• ${d.slice(-4)}`;
}

/* ------------ Toast ------------ */
function showToast({
  title = "OK",
  message = "",
  type = "info",
  timeout = 2000,
} = {}) {
  const host = $("#toasts");
  if (!host) return;
  const el = document.createElement("div");
  el.className = "lp-toast";
  el.setAttribute("data-type", type);
  el.innerHTML = `
    <div class="lp-toast__icon">${
      type === "success"
        ? "✓"
        : type === "error"
        ? "⨯"
        : type === "warning"
        ? "!"
        : "ℹ"
    }</div>
    <div class="lp-toast__body">
      <div class="lp-toast__title">${title}</div>
      ${message ? `<div class="lp-toast__msg">${message}</div>` : ""}
    </div>`;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 180);
  }, timeout);
}

/* ------------ Session & local cart ------------ */
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
function initials(name) {
  return String(name || "U")
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0] || "")
    .join("")
    .toUpperCase();
}

/* ------------ API helpers ------------ */
async function api(path, opts) {
  const r = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  let body = {};
  try {
    body = await r.json();
  } catch {}
  if (!r.ok) throw new Error(body.error || "Request failed");
  return body;
}

const apiSummary = (id) => api(`/users/${id}/summary`);
const apiTrips = (id) => api(`/users/${id}/trips`);
const apiPoints = (id) => api(`/users/${id}/points`);
const apiPurchases = (id) => api(`/users/${id}/purchases`);
const apiUpdate = (id, body) =>
  api(`/users/${id}`, { method: "PUT", body: JSON.stringify(body) });
const apiPassword = (id, body) =>
  api(`/users/${id}/password`, { method: "POST", body: JSON.stringify(body) });

/* ------------ Render helpers ------------ */
function renderList(host, items, empty = "Nothing here yet.") {
  host.innerHTML = "";
  if (!items?.length) {
    host.innerHTML = `<div class="muted">${empty}</div>`;
    return;
  }
  for (const it of items) {
    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML = `
      <div>
        <strong>${it.placeName || it.item || "—"}</strong>
        ${it.stateName ? `<span class="badge">${it.stateName}</span>` : ""}
        ${
          it.startdate
            ? `<div class="muted small">Start: ${it.startdate}${
                it.enddate ? ` • End: ${it.enddate}` : ""
              }</div>`
            : ""
        }
      </div>
      <div>${fmtINR(it.price ?? it.amount ?? 0)}</div>`;
    host.appendChild(row);
  }
}

/* ------------ Field error helpers ------------ */
function setFieldError(inputEl, msg) {
  const field = inputEl.closest(".field");
  if (!field) return;
  let msgEl = field.querySelector(".field-msg");
  if (!msgEl) {
    msgEl = document.createElement("div");
    msgEl.className = "field-msg";
    msgEl.dataset.type = "error";
    field.appendChild(msgEl);
  }
  inputEl.setAttribute("aria-invalid", msg ? "true" : "false");
  msgEl.textContent = msg || "";
  if (msg) inputEl.setAttribute("data-invalid", "true");
}

function clearFieldError(inputEl) {
  const field = inputEl.closest(".field");
  if (!field) return;
  const msgEl = field.querySelector(".field-msg");
  if (msgEl) msgEl.textContent = "";
  inputEl.removeAttribute("data-invalid");
  inputEl.setAttribute("aria-invalid", "false");
}

function clearGroupErrors(inputs = []) {
  inputs.forEach(clearFieldError);
}

/* ------------ Popover helpers ------------ */
let _pwPopTimer;
function pwShow(message, type = "error", duration = 4000) {
  const pop = $("#pwPopover");
  if (!pop) return;
  pop.dataset.type = type;
  pop.querySelector(".popover-body").innerHTML = message;
  pop.hidden = false;
  clearTimeout(_pwPopTimer);
  if (duration > 0) _pwPopTimer = setTimeout(() => pwHide(), duration);
}
function pwHide() {
  const pop = $("#pwPopover");
  if (!pop) return;
  pop.hidden = true;
  clearTimeout(_pwPopTimer);
}

/* ------------ Password UX helpers ------------ */
function estimatePasswordStrength(pw = "") {
  // Simple heuristic: length + char-set variety + penalties for repeats/sequences
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  // Penalize super common patterns
  if (/^(password|qwerty|123456|letmein|admin|welcome)$/i.test(pw)) score = 0;
  if (/([a-zA-Z0-9])\1\1/.test(pw)) score = Math.max(0, score - 1);
  // Clamp 0..4
  score = Math.max(0, Math.min(score, 4));
  const labels = ["Very weak", "Weak", "Okay", "Good", "Strong"];
  const percents = [10, 30, 55, 80, 100];
  return { score, label: labels[score], pct: percents[score] };
}

function bindPasswordToggles() {
  $$(".pw-toggle").forEach((btn) => {
    const id = btn.getAttribute("data-for");
    const input = document.getElementById(id);
    btn.addEventListener("click", () => {
      const isPw = input.type === "password";
      input.type = isPw ? "text" : "password";
      btn.setAttribute("aria-label", isPw ? "Hide password" : "Show password");
    });
  });
}

function bindCapsLockDetect() {
  const cur = $("#currentPassword");
  const note = $("#capsNote");
  const handler = (e) => {
    if (e.getModifierState && e.getModifierState("CapsLock"))
      note.hidden = false;
    else note.hidden = true;
  };
  cur.addEventListener("keyup", handler);
  cur.addEventListener("keydown", handler);
}

/* ------------ Boot ------------ */
async function boot() {
  // Header menu (settings) + logout
  (function () {
    const s = $("#settingsBtn"),
      m = $("#settingsMenu");
    function close() {
      m?.classList.remove("open");
      s?.setAttribute("aria-expanded", "false");
    }
    function tog(btn, menu) {
      const open = menu?.classList.contains("open");
      close();
      if (!open) {
        menu?.classList.add("open");
        btn?.setAttribute("aria-expanded", "true");
      }
    }
    s?.addEventListener("click", (e) => {
      e.stopPropagation();
      tog(s, m);
    });
    document.addEventListener("click", (e) => {
      if (![m, s].some((x) => x?.contains(e.target))) close();
    });
    $("#logoutBtn")?.addEventListener("click", () => {
      localStorage.removeItem("sessionClient");
      location.reload();
    });
  })();

  const s = getSession();
  const avatar = $("#accAvatar"),
    name = $("#accName"),
    email = $("#accEmail"),
    phone = $("#accPhone"),
    addr = $("#accAddr");

  if (!s) {
    avatar && (avatar.textContent = "G");
    name && (name.textContent = "Guest");
    email && (email.textContent = "Not signed in");
    $("#signedOut")?.classList.remove("hide");
    $("#signedIn")?.classList.add("hide");
    return;
  }

  // identity (view)
  name.textContent = `${s.FirstName || ""} ${s.LastName || ""}`.trim();
  email.textContent = s.Email || "—";
  phone.textContent = maskPhone(s.PhoneNumber);
  addr.textContent = s.Address || "—";
  avatar.textContent = initials(name.textContent);

  // prefill edit form (full values)
  $("#firstName").value = s.FirstName || "";
  $("#lastName").value = s.LastName || "";
  $("#phone").value = s.PhoneNumber || "";
  $("#address").value = s.Address || "";

  // SUMMARY
  try {
    const { items = [] } = await apiSummary(s.ClientID);
    renderList($("#accSummary"), items, "No history yet.");
  } catch (e) {
    console.error("summary error", e);
    $(
      "#accSummary"
    ).innerHTML = `<div class="muted">Couldn’t load history.</div>`;
  }

  // TRIPS
  try {
    const { done = [], upcoming = [] } = await apiTrips(s.ClientID);
    renderList($("#accTripsUpcoming"), upcoming, "No upcoming trips.");
    renderList($("#accTripsDone"), done, "No completed trips yet.");
  } catch (e) {
    console.error("trips error", e);
    $(
      "#accTripsUpcoming"
    ).innerHTML = `<div class="muted">Failed to load trips.</div>`;
    $(
      "#accTripsDone"
    ).innerHTML = `<div class="muted">Failed to load trips.</div>`;
  }

  // POINTS
  try {
    const { points = 0, rule = "" } = await apiPoints(s.ClientID);
    $("#accPoints").textContent = points;
    $("#accPointsRule").textContent = rule;
  } catch (e) {
    console.error("points error", e);
    $("#accPoints").textContent = "—";
  }

  // PURCHASES
  try {
    const { items = [] } = await apiPurchases(s.ClientID);
    renderList($("#accPurchases"), items, "No purchases yet.");
  } catch (e) {
    console.error("purchases error", e);
    $(
      "#accPurchases"
    ).innerHTML = `<div class="muted">Failed to load purchases.</div>`;
  }

  // LOCAL CART
  const local = loadCart();
  const host = $("#accCartLocal");
  if (!local.length)
    host.innerHTML = `<div class="muted">No items in local cart.</div>`;
  else {
    host.innerHTML = "";
    local.forEach((it) => {
      const row = document.createElement("div");
      row.className = "item";
      row.innerHTML = `
        <div><strong>${it.place}</strong> <span class="badge">${
        it.state
      }</span></div>
        <div>${fmtINR((it.price || 0) * (it.qty || 1))}</div>`;
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

  /* ----- Edit profile flow ----- */
  const view = $("#profileView");
  const form = $("#profileForm");
  const editBtn = $("#editToggle");
  const saveBtn = $("#saveProfile");

  function showForm(on) {
    view.classList.toggle("hide", !!on);
    form.classList.toggle("hide", !on);
  }
  editBtn?.addEventListener("click", () => showForm(true));
  $("#editToggleCancel")?.addEventListener("click", () => showForm(false));

  // Basic client validation on profile save
  saveBtn?.addEventListener("click", async () => {
    const first = $("#firstName");
    const last = $("#lastName");
    const phoneIn = $("#phone");
    const addrIn = $("#address");

    clearGroupErrors([first, last, phoneIn, addrIn]);

    const body = {
      first_name: first.value.trim(),
      last_name: last.value.trim(),
      phone: phoneIn.value.trim(),
      address: addrIn.value.trim(),
    };

    // Optional phone format hint (non-blocking)
    if (body.phone && !/^\+?\d[\d\s\-()]{6,}$/.test(body.phone)) {
      setFieldError(phoneIn, "Use a valid phone format, e.g. +1 555 123 4567");
    }

    saveBtn.disabled = true;
    saveBtn.textContent = "Saving…";
    try {
      const { user } = await apiUpdate(s.ClientID, body);
      localStorage.setItem("sessionClient", JSON.stringify(user));
      showToast({ title: "Profile updated", type: "success" });

      // Reflect on page immediately
      name.textContent = `${user.FirstName || ""} ${
        user.LastName || ""
      }`.trim();
      phone.textContent = maskPhone(user.PhoneNumber);
      addr.textContent = user.Address || "—";
      $("#accAvatar").textContent = initials(name.textContent);
      showForm(false);
    } catch (e) {
      showToast({ title: "Update failed", message: e.message, type: "error" });
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = "Save";
    }
  });

  /* ----- Password field UX ----- */
  bindPasswordToggles();
  bindCapsLockDetect();

  const newEl = $("#newPassword");
  const conEl = $("#confirmPassword");
  const curEl = $("#currentPassword");
  const bar = $("#pwBar");
  const strengthMsg = $("#pwStrengthMsg");

  function refreshStrength() {
    const { score, label, pct } = estimatePasswordStrength(newEl.value);
    bar.style.width = `${pct}%`;
    bar.dataset.score = String(score);
    strengthMsg.textContent = newEl.value ? `Strength: ${label}` : "";
  }

  newEl.addEventListener("input", () => {
    refreshStrength();
    // live check for confirm match
    if (conEl.value && newEl.value !== conEl.value) {
      setFieldError(conEl, "Confirm password must match the new password");
    } else {
      clearFieldError(conEl);
    }
    // clear its own error while typing
    if (newEl.value.length >= 8) clearFieldError(newEl);
  });

  conEl.addEventListener("input", () => {
    if (newEl.value !== conEl.value)
      setFieldError(conEl, "Confirm password must match the new password");
    else clearFieldError(conEl);
  });

  [curEl, newEl, conEl].forEach((el) => {
    el.addEventListener("input", () => pwHide());
    el.addEventListener("input", () => {
      if (el.value) clearFieldError(el);
    });
  });

  /* ----- Change password submit (strict + popover) ----- */
  $("#pwForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = $("#pwSubmit");

    const current_password = curEl.value;
    const new_password = newEl.value;
    const confirm_password = conEl.value;

    clearGroupErrors([curEl, newEl, conEl]);
    pwHide();

    // client-side checks (collect messages for the popover)
    const msgs = [];
    if (!current_password) {
      setFieldError(curEl, "Current password is required");
      msgs.push("Current password is required");
    }
    if (!new_password || new_password.length < 8) {
      setFieldError(newEl, "New password must be at least 8 characters");
      msgs.push("New password must be at least 8 characters");
    }
    if (new_password === current_password && new_password) {
      setFieldError(newEl, "New password must be different from current");
      msgs.push("New password must be different from current");
    }
    if (new_password !== confirm_password) {
      setFieldError(conEl, "Confirm password must match the new password");
      msgs.push("Confirm password must match the new password");
    }

    if (msgs.length) {
      pwShow(msgs.map((m) => `• ${m}`).join("<br>"), "error");
      showToast({ title: "Fix the highlighted errors", type: "warning" });
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Updating…";

    try {
      await apiPassword(getSession().ClientID, {
        current_password,
        new_password,
        confirm_password,
      });
      showToast({ title: "Password changed", type: "success" });
      pwShow("Password updated successfully.", "success", 3000);
      e.target.reset();
      bar.style.width = "0%";
      strengthMsg.textContent = "";
      clearGroupErrors([curEl, newEl, conEl]);
    } catch (err) {
      const msg = String(err.message || "Password change failed");
      // map server message to specific fields + show popover
      const serverMsgs = [];
      if (/Current password is incorrect/i.test(msg)) {
        setFieldError(curEl, "Current password is incorrect");
        serverMsgs.push("Current password is incorrect");
      }
      if (/at least 8/i.test(msg)) {
        setFieldError(newEl, "New password must be at least 8 characters");
        serverMsgs.push("New password must be at least 8 characters");
      }
      if (/must match/i.test(msg)) {
        setFieldError(conEl, "Confirm password must match the new password");
        serverMsgs.push("Confirm password must match the new password");
      }
      if (/different from current/i.test(msg)) {
        setFieldError(newEl, "New password must be different from current");
        serverMsgs.push("New password must be different from current");
      }
      pwShow(serverMsgs[0] || msg, "error");
      showToast({
        title: "Password change failed",
        message: msg,
        type: "error",
      });
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Update password";
    }
  });
}

document.addEventListener("DOMContentLoaded", boot);
