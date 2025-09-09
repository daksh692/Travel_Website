/* =========== Session helpers =========== */
function getSession() {
  try {
    return JSON.parse(localStorage.getItem("sessionClient"));
  } catch {
    return null;
  }
}
function setSession(obj) {
  if (obj) localStorage.setItem("sessionClient", JSON.stringify(obj));
  else localStorage.removeItem("sessionClient");
  renderAuthState();
}
function firstInitial(name) {
  return (name || "").trim().charAt(0).toUpperCase() || "U";
}

/* =========== Header state =========== */
function renderAuthState() {
  const s = getSession();
  document.body.dataset.auth = s ? "true" : "false";
  const avatarInitial = document.getElementById("avatarInitial");
  if (avatarInitial) avatarInitial.textContent = firstInitial(s?.FirstName);
  closeMenus();
}

function closeMenus() {
  ["settingsMenu", "userMenu"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.classList.remove("open");
      el.setAttribute("aria-hidden", "true");
    }
  });
  [
    document.getElementById("settingsBtn"),
    document.getElementById("avatarBtn"),
  ].forEach((b) => b?.setAttribute("aria-expanded", "false"));
}

function openMenu(btn, menuId) {
  const menu = document.getElementById(menuId);
  if (!menu) return;
  closeMenus();
  // Stagger: assign delays
  menu.querySelectorAll(".menu-item").forEach((item, i) => {
    item.style.setProperty("--d", `${i * 35}ms`);
  });
  menu.classList.add("open");
  menu.setAttribute("aria-hidden", "false");
  btn.setAttribute("aria-expanded", "true");
}

/* click-outside to close */
document.addEventListener("click", (e) => {
  const menus = [
    document.getElementById("settingsMenu"),
    document.getElementById("userMenu"),
  ];
  const buttons = [
    document.getElementById("settingsBtn"),
    document.getElementById("avatarBtn"),
  ];
  const clickInMenu = menus.some((m) => m && m.contains(e.target));
  const clickOnBtn = buttons.some((b) => b && b.contains(e.target));
  if (!clickInMenu && !clickOnBtn) closeMenus();
});

/* =========== Wire header buttons =========== */
document.addEventListener("DOMContentLoaded", () => {
  renderAuthState();

  const settingsBtn = document.getElementById("settingsBtn");
  const avatarBtn = document.getElementById("avatarBtn");

  settingsBtn?.addEventListener("click", () =>
    openMenu(settingsBtn, "settingsMenu")
  );
  avatarBtn?.addEventListener("click", () => openMenu(avatarBtn, "userMenu"));

  // logout
  document.getElementById("logoutBtn")?.addEventListener("click", () => {
    setSession(null);
  });

  // reflect auth changes across tabs
  window.addEventListener("storage", (e) => {
    if (e.key === "sessionClient") renderAuthState();
  });

  // “magnet” effect for gear/avatar
  [settingsBtn, avatarBtn].forEach((btn) => {
    if (!btn) return;
    btn.classList.add("magnet");
    btn.addEventListener("mousemove", (ev) => {
      const r = btn.getBoundingClientRect();
      const dx = (ev.clientX - (r.left + r.width / 2)) / (r.width / 2);
      const dy = (ev.clientY - (r.top + r.height / 2)) / (r.height / 2);
      btn.style.transform = `translate(${dx * 2.4}px, ${dy * 2.4}px)`;
    });
    btn.addEventListener("mouseleave", () => (btn.style.transform = ""));
  });
});

/* =========== Search =========== */
document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("SearchCountry");
  const btn = document.getElementById("searchButton");
  function go() {
    const q = (input?.value || "").trim().toLowerCase();
    if (!q) return;
    if (q === "india") {
      window.location.href = "places/INDmap.html";
    } else {
      alert(`${q} not added yet.`);
      input.value = "";
    }
  }
  btn?.addEventListener("click", go);
  input?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") go();
  });
});

/* =========== Slideshow + gentle zoom (5s) =========== */
document.addEventListener("DOMContentLoaded", () => {
  const wrap = document.querySelector(".hero-slides");
  const slides = wrap ? wrap.querySelectorAll(".hero-slide") : null;
  if (!slides || slides.length < 2) return;

  const IMAGES = [
    "../assets/1.jpeg",
    "../assets/2.jpeg",
    "../assets/3.jpeg",
    "../assets/4.jpeg",
    "../assets/5.jpeg",
    "../assets/6.jpeg",
    "../assets/7.jpeg",
    "../assets/8.jpeg",
  ];

  let current = 0,
    active = 0;
  const DURATION = 5000;
  const setSlide = (el, url) => (el.style.backgroundImage = `url("${url}")`);

  setSlide(slides[0], IMAGES[0]);
  slides[0].classList.add("is-active");
  setSlide(slides[1], IMAGES[(current + 1) % IMAGES.length]);

  function next() {
    const incoming = slides[(active + 1) % 2];
    const outgoing = slides[active];
    current = (current + 1) % IMAGES.length;
    setSlide(incoming, IMAGES[(current + 1) % IMAGES.length]);
    incoming.classList.add("is-active");
    requestAnimationFrame(() => outgoing.classList.remove("is-active"));
    active = (active + 1) % 2;
  }
  setInterval(next, DURATION);
});
