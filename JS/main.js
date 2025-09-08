/* ========= Hero Background Rotation ========= */
document.addEventListener("DOMContentLoaded", () => {
  const hero = document.querySelector(".hero");
  if (!hero) return;

  const images = [
    "../assets/1.jpeg",
    "../assets/2.jpeg",
    "../assets/3.jpeg",
    "../assets/4.jpeg",
    "../assets/5.jpeg",
    "../assets/6.jpeg",
    "../assets/7.jpeg",
    "../assets/8.jpeg",
  ];

  let currentIndex = parseInt(localStorage.getItem("currentImageIndex")) || 0;
  hero.style.backgroundImage = `url(${images[currentIndex]})`;

  // update for next reload
  currentIndex = (currentIndex + 1) % images.length;
  localStorage.setItem("currentImageIndex", currentIndex);

  // fade-in effect (CSS has .fade-in)
  hero.classList.add("fade-in");
});

/* ========= Search ========= */
document.addEventListener("DOMContentLoaded", () => {
  const searchInput = document.getElementById("SearchCountry");
  const searchButton = document.getElementById("searchButton");

  if (!searchInput || !searchButton) return;

  function handleSearch() {
    const countryName = searchInput.value.trim().toLowerCase();
    if (!countryName) return;

    if (countryName === "india") {
      window.location.href = "places/INDmap.html";
    } else {
      alert(`${countryName} not added yet.`);
      searchInput.value = "";
    }
  }

  searchButton.addEventListener("click", handleSearch);
  searchInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") handleSearch();
  });
});

/* ========= Auth / Session (localStorage) ========= */
// simplified version: same fields as your DB (FirstName, Email, Password hash)
async function sha256(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,"0")).join("");
}
function getUsers() { return JSON.parse(localStorage.getItem("clients")||"[]"); }
function saveUsers(u) { localStorage.setItem("clients", JSON.stringify(u)); }
function setSession(user) {
  if (user) localStorage.setItem("sessionClient", JSON.stringify(user));
  else localStorage.removeItem("sessionClient");
  renderAuthState();
}
function getSession() {
  try { return JSON.parse(localStorage.getItem("sessionClient")); } catch { return null; }
}

const api = {
  async register(payload) {
    const users = getUsers();
    if (users.some(u => u.Email === payload.Email)) throw new Error("Email already registered.");
    payload.Password = await sha256(payload.Password);
    payload.ClientID = users.length ? Math.max(...users.map(u=>u.ClientID||0))+1 : 1;
    users.push(payload);
    saveUsers(users);
    return payload;
  },
  async login(email, password) {
    const users = getUsers();
    const hashed = await sha256(password);
    const user = users.find(u=>u.Email===email && u.Password===hashed);
    if (!user) throw new Error("Invalid email or password.");
    return user;
  }
};

/* ========= UI binding ========= */
document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");
  const logoutBtn = document.getElementById("logoutBtn");
  const welcomeName = document.getElementById("welcomeName");

  function renderAuthState() {
    const u = getSession();
    document.body.dataset.auth = u ? "true" : "false";
    if (welcomeName) welcomeName.textContent = u ? `Hi, ${u.FirstName}` : "";
  }
  window.renderAuthState = renderAuthState;
  renderAuthState();

  loginForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("loginEmail").value.trim();
    const pass = document.getElementById("loginPassword").value;
    try {
      const u = await api.login(email, pass);
      setSession(u);
      loginForm.closest("dialog")?.close();
    } catch(err) { alert(err.message); }
  });

  registerForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const u = {
      FirstName: document.getElementById("regFirstName").value.trim(),
      LastName: document.getElementById("regLastName").value.trim(),
      Email: document.getElementById("regEmail").value.trim(),
      PhoneNumber: document.getElementById("regPhone").value.trim(),
      Address: document.getElementById("regAddress").value.trim(),
      Password: document.getElementById("regPassword").value
    };
    try {
      await api.register(u);
      setSession(u);
      registerForm.closest("dialog")?.close();
    } catch(err) { alert(err.message); }
  });

  logoutBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    setSession(null);
  });
});
