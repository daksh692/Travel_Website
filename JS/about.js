// Travel — About page interactivity (no header logic here)
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

/* Year */
const y = $("#year");
if (y) y.textContent = new Date().getFullYear();

/* Smooth scroll (hero → story) */
$$("[data-scroll-to]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const id = btn.getAttribute("data-scroll-to");
    const el = id && document.querySelector(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

/* Intersection reveal */
const io = new IntersectionObserver(
  (entries) =>
    entries.forEach((en) => en.isIntersecting && en.target.classList.add("in")),
  { threshold: 0.12 }
);
$$(".reveal").forEach((el) => io.observe(el));

/* Animated counters */
function animateCount(el, to, duration = 1200) {
  const isFloat = String(to).includes(".");
  const start = 0;
  const startTime = performance.now();
  const step = (now) => {
    const p = Math.min(1, (now - startTime) / duration);
    const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
    const val = start + (to - start) * eased;
    el.textContent = isFloat ? val.toFixed(1) : Math.floor(val);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
$$(".hero .num").forEach((el) => {
  const to = Number(el.getAttribute("data-count-to") || 0);
  const obs = new IntersectionObserver(
    (entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) {
          animateCount(el, to);
          obs.unobserve(el);
        }
      });
    },
    { threshold: 0.6 }
  );
  obs.observe(el);
});

/* Testimonials carousel */
(function () {
  const root = document.querySelector("[data-carousel]");
  if (!root) return;
  const slides = $$(".slide", root);
  const prev = $("[data-prev]", root);
  const next = $("[data-next]", root);
  const dotsWrap = $("[data-dots]", root);

  let index = 0;
  const makeDots = () => {
    slides.forEach((_, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("aria-label", `Go to slide ${i + 1}`);
      b.addEventListener("click", () => go(i));
      dotsWrap.appendChild(b);
    });
  };
  const update = () => {
    slides.forEach((s, i) => s.classList.toggle("active", i === index));
    $$(".dots button", root).forEach((d, i) =>
      d.setAttribute("aria-current", i === index)
    );
  };
  const go = (i) => {
    index = (i + slides.length) % slides.length;
    update();
  };

  makeDots();
  update();
  prev.addEventListener("click", () => go(index - 1));
  next.addEventListener("click", () => go(index + 1));

  // Auto-rotate with hover pause
  let timer = setInterval(() => go(index + 1), 4500);
  root.addEventListener("pointerenter", () => clearInterval(timer));
  root.addEventListener(
    "pointerleave",
    () => (timer = setInterval(() => go(index + 1), 4500))
  );
})();

/* Copy email */
$$("[data-copy]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const text = btn.getAttribute("data-copy");
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      const status = $("#copyStatus");
      if (status) {
        status.textContent = "Email copied to clipboard 🎉";
        setTimeout(() => (status.textContent = ""), 2000);
      }
    } catch {
      alert("Copy failed. Please copy manually: " + text);
    }
  });
});

/* Nice shortcut: Cmd/Ctrl + K to scroll to top (optional) */
document.addEventListener("keydown", (e) => {
  if ((e.key === "k" || e.key === "K") && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    document.documentElement.scrollTo({ top: 0, behavior: "smooth" });
  }
});
