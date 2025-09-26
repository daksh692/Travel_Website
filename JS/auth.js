// Build API base from current host (avoids localhost/127 mismatch)
const API_HOST = `http://${location.hostname}:3001`;
const API_BASE = `${API_HOST}/api`;

const $ = (sel) => document.querySelector(sel);
const msg = (t, kind = "") => {
  const el = $("#formMsg");
  if (!el) return;
  el.textContent = t || "";
  el.className = `msg ${kind}`;
};

/* ---------------- Target after auth ---------------- */
const urlParams = new URLSearchParams(location.search);

// prefer ?next=..., else fall back to same-origin referrer (not auth page)
function computeNext() {
  const raw = urlParams.get("next");
  if (raw) {
    try {
      const u = new URL(raw, location.href);
      if (u.origin === location.origin) return u.href;
    } catch {
      /* ignore bad next */
    }
  }
  // use same-origin referrer if it exists and isn't auth.html
  try {
    if (document.referrer) {
      const r = new URL(document.referrer);
      if (
        r.origin === location.origin &&
        !/\/auth\.html($|\?)/.test(r.pathname)
      ) {
        return r.href;
      }
    }
  } catch {
    /* ignore */
  }
  // default (home)
  return "main.html";
}
const NEXT_URL = computeNext();

/* ---------------- Tabs ---------------- */
function switchTo(which) {
  const loginTab = $("#tab-login"),
    regTab = $("#tab-register");
  const loginPane = $("#panel-login"),
    regPane = $("#panel-register");
  const isLogin = which === "login";
  loginTab.classList.toggle("is-active", isLogin);
  regTab.classList.toggle("is-active", !isLogin);
  loginPane.classList.toggle("is-active", isLogin);
  regPane.classList.toggle("is-active", !isLogin);
  msg("");
}
document.addEventListener("click", (e) => {
  const t = e.target;
  if (t.matches("[data-switch='register']")) {
    e.preventDefault();
    switchTo("register");
  }
  if (t.matches("[data-switch='login']")) {
    e.preventDefault();
    switchTo("login");
  }
});
$("#tab-login")?.addEventListener("click", () => switchTo("login"));
$("#tab-register")?.addEventListener("click", () => switchTo("register"));

/* ---------------- Back ---------------- */
$("#backBtn")?.addEventListener("click", (e) => {
  e.preventDefault();
  if (document.referrer) history.back();
  else window.location.href = NEXT_URL; // default back target
});

/* ---------------- HTTP helpers ---------------- */
async function postJSON(url, data) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.ok === false)
    throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

/* ---------------- Pretty field errors ---------------- */
function ensureErrorBox(input) {
  let box = input.parentElement.querySelector(".field-error");
  if (!box) {
    box = document.createElement("div");
    box.className = "field-error";
    input.parentElement.appendChild(box);
  }
  return box;
}
function showError(input, message) {
  const box = ensureErrorBox(input);
  box.textContent = message;
  input.classList.add("has-error");
}
function clearError(input) {
  const box = input?.parentElement?.querySelector?.(".field-error");
  if (box) box.textContent = "";
  input?.classList.remove("has-error");
  input?.setCustomValidity?.("");
}
function clearAllErrors(form) {
  form.querySelectorAll(".field-error").forEach((el) => (el.textContent = ""));
  form
    .querySelectorAll(".has-error")
    .forEach((el) => el.classList.remove("has-error"));
  form.querySelectorAll("input").forEach((i) => i.setCustomValidity?.(""));
}

/* When user edits a field, clear that field's message immediately */
[
  "#loginEmail",
  "#loginPassword",
  "#regFirstName",
  "#regLastName",
  "#regEmail",
  "#regPhone",
  "#regAddress",
  "#regPassword",
].forEach((sel) => {
  const el = $(sel);
  if (el) el.addEventListener("input", () => clearError(el));
});

/* ---------------- Validators (submit-only) ---------------- */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9 +()\-]{7,}$/;

function passwordIssues(pw) {
  const issues = [];
  if (pw.length < 10) issues.push("• At least 10 characters");
  if (!/[A-Z]/.test(pw)) issues.push("• One uppercase letter (A-Z)");
  if (!/[a-z]/.test(pw)) issues.push("• One lowercase letter (a-z)");
  if (!/[^A-Za-z0-9]/.test(pw)) issues.push("• One special character (!@#$…)");
  return issues;
}

/* ---------------- Login (validate on submit only) ---------------- */
$("#loginForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  msg("");
  clearAllErrors(e.currentTarget);

  const email = $("#loginEmail");
  const password = $("#loginPassword");

  let bad = false;
  if (!EMAIL_RE.test(email.value.trim())) {
    showError(email, "Enter a valid email address.");
    bad = true;
  }
  if (!password.value) {
    showError(password, "Password is required.");
    bad = true;
  }
  if (bad) return;

  msg("Signing you in…");
  try {
    const out = await postJSON(`${API_BASE}/login`, {
      email: email.value.trim(),
      password: password.value,
    });
    localStorage.setItem("sessionClient", JSON.stringify(out.user));
    msg("Welcome back!", "ok");
    // redirect to the intended page instead of home
    window.location.href = NEXT_URL;
  } catch (err) {
    showError(password, "Email or password is incorrect.");
    msg(err.message || "Login failed", "error");
  }
});

/* ---------------- Register (validate on submit only) ---------------- */
$("#registerForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  msg("");
  clearAllErrors(e.currentTarget);

  const FirstName = $("#regFirstName");
  const LastName = $("#regLastName");
  const Email = $("#regEmail");
  const Phone = $("#regPhone");
  const Address = $("#regAddress");
  const Password = $("#regPassword");

  let bad = false;

  if (!FirstName.value.trim()) {
    showError(FirstName, "First name is required.");
    bad = true;
  }
  if (!LastName.value.trim()) {
    showError(LastName, "Last name is required.");
    bad = true;
  }
  if (!EMAIL_RE.test(Email.value.trim())) {
    showError(Email, "Enter a valid email address.");
    bad = true;
  }
  if (Phone.value.trim() && !PHONE_RE.test(Phone.value.trim())) {
    showError(Phone, "Use digits/spaces only (7+ chars).");
    bad = true;
  }

  const pwIssues = passwordIssues(Password.value);
  if (pwIssues.length) {
    showError(Password, `Please fix your password:\n${pwIssues.join("\n")}`);
    bad = true;
  }
  if (bad) return;

  msg("Creating your account…");
  try {
    const out = await postJSON(`${API_BASE}/register`, {
      first_name: FirstName.value.trim(),
      last_name: LastName.value.trim(),
      email: Email.value.trim(),
      phone: Phone.value.trim(),
      address: Address.value.trim(),
      password: Password.value,
    });
    localStorage.setItem("sessionClient", JSON.stringify(out.user));
    msg("Account created!", "ok");
    // redirect to the intended page instead of home
    window.location.href = NEXT_URL;
  } catch (err) {
    const text = String(err.message || "");
    if (
      text.toLowerCase().includes("email") &&
      text.toLowerCase().includes("registered")
    ) {
      showError(Email, "This email is already registered. Try another one.");
      Email.focus();
    } else if (text.toLowerCase().includes("phone")) {
      showError(Phone, "This phone number is already in use.");
      Phone.focus();
    }
    msg(text || "Registration failed", "error");
  }
});

/* ---------------- Default tab ---------------- */
switchTo(urlParams.get("tab") === "register" ? "register" : "login");

/* ---------------- Background slideshow (unchanged) ---------------- */
document.addEventListener("DOMContentLoaded", () => {
  const slides = document.querySelectorAll(".hero-slide");
  if (!slides || slides.length < 2) return;

  const IMAGES = [
    "./assets/1.jpeg",
    "./assets/2.jpeg",
    "./assets/3.jpeg",
    "./assets/4.jpeg",
    "./assets/5.jpeg",
    "./assets/6.jpeg",
    "./assets/7.jpeg",
    "./assets/8.jpeg",
  ];

  let current = 0,
    active = 0;
  const DURATION = 5000;
  const setSlide = (el, url) => (el.style.backgroundImage = `url("${url}")`);

  setSlide(slides[0], IMAGES[0]);
  slides[0].classList.add("is-active");
  setSlide(slides[1], IMAGES[1]);

  function next() {
    const incoming = slides[(active + 1) % 2];
    const outgoing = slides[active];
    current = (current + 1) % IMAGES.length;

    setSlide(incoming, IMAGES[(current + 1) % IMAGES.length]); // preload next
    incoming.classList.add("is-active");
    requestAnimationFrame(() => outgoing.classList.remove("is-active"));
    active = (active + 1) % 2;
  }
  setInterval(next, DURATION);
});
