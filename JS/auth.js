// --- shared session helpers (same as main) ---
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
}

// --- slideshow for auth page ---
document.addEventListener("DOMContentLoaded", () => {
  const slides = document.querySelectorAll(".auth-slide");
  if (slides.length < 2) return;
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
    active = 0,
    D = 5000;
  const set = (el, url) => (el.style.backgroundImage = `url("${url}")`);
  set(slides[0], IMAGES[0]);
  slides[0].classList.add("is-active");
  set(slides[1], IMAGES[1]);
  setInterval(() => {
    const incoming = slides[(active + 1) % 2],
      outgoing = slides[active];
    current = (current + 1) % IMAGES.length;
    set(incoming, IMAGES[(current + 1) % IMAGES.length]);
    incoming.classList.add("is-active");
    requestAnimationFrame(() => outgoing.classList.remove("is-active"));
    active = (active + 1) % 2;
  }, D);
});

// --- tabs: read ?tab=login|register ---
function selectTab(name) {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === name);
  });
  document.querySelectorAll(".tab-panel").forEach((p) => {
    p.classList.toggle("active", p.dataset.tab === name);
  });
  // underline
  const activeBtn = document.querySelector(`.tab-btn[data-tab="${name}"]`);
  const ul = document.querySelector(".tab-underline");
  if (activeBtn && ul) {
    const r = activeBtn.getBoundingClientRect();
    const containerLeft = activeBtn.parentElement.getBoundingClientRect().left;
    ul.style.width = r.width + "px";
    ul.style.transform = `translateX(${r.left - containerLeft}px)`;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(location.search);
  const initial = (params.get("tab") || "login").toLowerCase();
  selectTab(initial);

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => selectTab(btn.dataset.tab));
  });

  // Forms (mock only; DB wiring later)
  document.getElementById("loginForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const email = document.getElementById("loginEmail").value.trim();
    const name = email.split("@")[0] || "User";
    setSession({ FirstName: name, Email: email });
    // go back home after login
    window.location.href = "main.html";
  });

  document.getElementById("registerForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const FirstName = document.getElementById("regFirstName").value.trim();
    const LastName = document.getElementById("regLastName").value.trim();
    const Email = document.getElementById("regEmail").value.trim();
    setSession({ FirstName, LastName, Email });
    window.location.href = "main.html";
  });
});
