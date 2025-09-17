/* ================= Session helpers ================= */
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

/* Declare hero images once so loader + slideshow share them */
const HERO_IMAGES = [
  "../assets/1.jpeg",
  "../assets/2.jpeg",
  "../assets/3.jpeg",
  "../assets/4.jpeg",
  "../assets/5.jpeg",
  "../assets/6.jpeg",
  "../assets/7.jpeg",
  "../assets/8.jpeg",
];

/* ================= Loader ================= */
(function setupLoader() {
  // Show loader immediately so there's no flash
  document.addEventListener("DOMContentLoaded", () => {
    document.body.classList.add("loading");
  });

  // Preload images + fonts; when done, hide loader
  window.addEventListener("DOMContentLoaded", async () => {
    const bar = document.getElementById("loaderBar");
    const pct = document.getElementById("loaderPct");
    const overlay = document.getElementById("appLoader");

    const toLoad = [
      // preload hero images
      ...HERO_IMAGES.map((src) => ({ type: "img", src })),
    ];

    // Image preloader -> Promise
    const loadImage = (src) =>
      new Promise((resolve) => {
        const img = new Image();
        img.onload = img.onerror = () => resolve(src);
        img.src = src;
      });

    let done = 0;
    const report = () => {
      done++;
      const p = Math.min(100, Math.round((done / (toLoad.length + 1)) * 100)); // +1 for fonts
      if (bar) bar.style.width = p + "%";
      if (pct) pct.textContent = p + "%";
    };

    // Kick off all image loads
    const imagePromises = toLoad.map((item) =>
      loadImage(item.src).then(report)
    );

    // Wait for fonts (where supported)
    const fontPromise =
      document.fonts && document.fonts.ready
        ? document.fonts.ready.then(report)
        : Promise.resolve(report());

    // Safety timeout so we never hang (e.g., network issues)
    const timeout = new Promise((resolve) => setTimeout(resolve, 2500));

    await Promise.race([Promise.all([...imagePromises, fontPromise]), timeout]);

    // Reveal the app
    document.body.classList.remove("loading");
    document.body.classList.add("loaded");
    if (overlay) {
      overlay.classList.add("is-hidden");
      setTimeout(() => overlay.remove(), 300);
    }
  });
})();

/* ================= Header state ================= */
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

/** Toggle a specific menu (and close the other) */
function toggleMenu(btn, menuId, ev) {
  ev?.stopPropagation(); // don't trigger outside-click closer
  const menu = document.getElementById(menuId);
  if (!menu) return;

  const wasOpen = menu.classList.contains("open");
  // close everything first
  closeMenus();

  if (!wasOpen) {
    // fresh stagger each open
    menu.querySelectorAll(".menu-item").forEach((item, i) => {
      item.style.setProperty("--d", `${i * 35}ms`);
    });
    menu.classList.add("open");
    menu.setAttribute("aria-hidden", "false");
    btn.setAttribute("aria-expanded", "true");
  }
}

/* ================= Global closers ================= */
document.addEventListener("click", (e) => {
  const menus = [
    document.getElementById("settingsMenu"),
    document.getElementById("userMenu"),
  ];
  const buttons = [
    document.getElementById("settingsBtn"),
    document.getElementById("avatarBtn"),
  ];
  const inMenu = menus.some((m) => m && m.contains(e.target));
  const onBtn = buttons.some((b) => b && b.contains(e.target));
  if (!inMenu && !onBtn) closeMenus();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeMenus();
});

/* ================= Wire everything once ================= */
document.addEventListener("DOMContentLoaded", () => {
  renderAuthState();

  // Header buttons
  const settingsBtn = document.getElementById("settingsBtn");
  const avatarBtn = document.getElementById("avatarBtn");

  settingsBtn?.addEventListener("click", (ev) =>
    toggleMenu(settingsBtn, "settingsMenu", ev)
  );
  avatarBtn?.addEventListener("click", (ev) =>
    toggleMenu(avatarBtn, "userMenu", ev)
  );

  document.getElementById("logoutBtn")?.addEventListener("click", () => {
    setSession(null);
  });

  // Reflect auth changes across tabs/windows
  window.addEventListener("storage", (e) => {
    if (e.key === "sessionClient") renderAuthState();
  });

  // Optional: tiny magnet hover on buttons
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

  /* -------- Search -------- */
  const input = document.getElementById("SearchCountry");
  const btn = document.getElementById("searchButton");
  function go() {
    const q = (input?.value || "").trim().toLowerCase();
    if (!q) return;
    if (q === "india") window.location.href = "places/INDmap.html";
    else {
      alert(`${q} not added yet.`);
      input.value = "";
    }
  }
  btn?.addEventListener("click", go);
  input?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") go();
  });

  /* -------- Hero slideshow + gentle zoom (5s) -------- */
  const wrap = document.querySelector(".hero-slides");
  const slides = wrap ? wrap.querySelectorAll(".hero-slide") : null;
  if (slides && slides.length >= 2) {
    let current = 0,
      active = 0;
    const DURATION = 6000;
    const setSlide = (el, url) => (el.style.backgroundImage = `url("${url}")`);

    setSlide(slides[0], HERO_IMAGES[0]);
    slides[0].classList.add("is-active");
    setSlide(slides[1], HERO_IMAGES[(current + 1) % HERO_IMAGES.length]);

    function next() {
      const incoming = slides[(active + 1) % 2];
      const outgoing = slides[active];
      current = (current + 1) % HERO_IMAGES.length;
      setSlide(incoming, HERO_IMAGES[(current + 1) % HERO_IMAGES.length]);
      incoming.classList.add("is-active");
      requestAnimationFrame(() => outgoing.classList.remove("is-active"));
      active = (active + 1) % 2;
    }
    setInterval(next, DURATION);
  }
});
