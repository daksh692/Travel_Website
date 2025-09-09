/* =========== UI STATE (no database yet) =========== */
function getSession(){ try{return JSON.parse(localStorage.getItem("sessionClient"))}catch{return null} }
function setSession(obj){ if(obj) localStorage.setItem("sessionClient", JSON.stringify(obj)); else localStorage.removeItem("sessionClient"); renderAuthState(); }
function firstInitial(name){ return (name||"").trim().charAt(0).toUpperCase() || "U"; }

/* =========== Header: menus & auth toggles =========== */
function renderAuthState(){
  const s = getSession();
  document.body.dataset.auth = s ? "true" : "false";
  const avatarInitial = document.getElementById("avatarInitial");
  if (avatarInitial) avatarInitial.textContent = firstInitial(s?.FirstName);
  closeMenus();
}

function closeMenus(){
  ["settingsMenu","userMenu"].forEach(id=>{
    const el = document.getElementById(id);
    if(el){ el.classList.remove("open"); el.setAttribute("aria-hidden","true"); }
  });
  const btns = [document.getElementById("settingsBtn"), document.getElementById("avatarBtn")];
  btns.forEach(b=>b?.setAttribute("aria-expanded","false"));
}

function toggleMenu(btn, menuId){
  const menu = document.getElementById(menuId);
  if(!menu) return;
  const opened = !menu.classList.contains("open");
  closeMenus();
  if(opened){
    menu.classList.add("open");
    menu.setAttribute("aria-hidden","false");
    btn.setAttribute("aria-expanded","true");
  }
}

/* Click-outside to close */
document.addEventListener("click", (e)=>{
  const menus = [document.getElementById("settingsMenu"), document.getElementById("userMenu")];
  const buttons = [document.getElementById("settingsBtn"), document.getElementById("avatarBtn")];
  const clickInMenu = menus.some(m=> m && m.contains(e.target));
  const clickOnBtn  = buttons.some(b=> b && b.contains(e.target));
  if(!clickInMenu && !clickOnBtn) closeMenus();
});

/* =========== Settings / User menu buttons =========== */
document.addEventListener("DOMContentLoaded", ()=>{
  renderAuthState();

  const settingsBtn = document.getElementById("settingsBtn");
  const avatarBtn   = document.getElementById("avatarBtn");
  settingsBtn?.addEventListener("click", ()=> toggleMenu(settingsBtn, "settingsMenu"));
  avatarBtn?.addEventListener("click",   ()=> toggleMenu(avatarBtn,   "userMenu"));

  // (No popups now; <a> links in HTML go to auth.html)

  // logout
  document.getElementById("logoutBtn")?.addEventListener("click", ()=>{
    setSession(null);
  });

  // When auth happens in another tab/window, refresh UI here
  window.addEventListener("storage", (e)=>{
    if(e.key === "sessionClient") renderAuthState();
  });
});

/* =========== Search (same behavior) =========== */
document.addEventListener("DOMContentLoaded", ()=>{
  const input = document.getElementById("SearchCountry");
  const btn   = document.getElementById("searchButton");
  function go(){
    const q = (input?.value||"").trim().toLowerCase();
    if(!q) return;
    if(q==="india"){ window.location.href = "places/INDmap.html"; }
    else { alert(`${q} not added yet.`); input.value=""; }
  }
  btn?.addEventListener("click", go);
  input?.addEventListener("keypress", e=>{ if(e.key==="Enter") go(); });
});

/* =========== Slideshow + gentle zoom =========== */
document.addEventListener("DOMContentLoaded", ()=>{
  const wrap = document.querySelector(".hero-slides");
  const slides = wrap ? wrap.querySelectorAll(".hero-slide") : null;
  if(!slides || slides.length<2) return;

  const IMAGES = [
    "../assets/1.jpeg","../assets/2.jpeg","../assets/3.jpeg","../assets/4.jpeg",
    "../assets/5.jpeg","../assets/6.jpeg","../assets/7.jpeg","../assets/8.jpeg",
  ];

  let current = 0, active = 0;
  const DURATION = 5000;
  const setSlide = (el, url)=> el.style.backgroundImage = `url("${url}")`;

  setSlide(slides[0], IMAGES[0]); slides[0].classList.add("is-active");
  setSlide(slides[1], IMAGES[(current+1)%IMAGES.length]);

  function next(){
    const incoming = slides[(active+1)%2];
    const outgoing = slides[active];

    current = (current+1)%IMAGES.length;
    setSlide(incoming, IMAGES[(current+1)%IMAGES.length]);

    incoming.classList.add("is-active");
    requestAnimationFrame(()=> outgoing.classList.remove("is-active"));
    active = (active+1)%2;
  }
  setInterval(next, DURATION);
});
