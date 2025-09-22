const $ = (s, r = document) => r.querySelector(s);
const fmtINR = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");
const SERVICE_RATE_PCT = 0.5,
  TAX_RATE_PCT = 12;

// simple in-app codes
const CODES = {
  WELCOME10: 10,
  FESTIVE15: 15,
  VIP20: 20,
};

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
  const final = gross - disc;
  return { sub, serv, tax, gross, promoPct, disc, final };
}

function render() {
  const t = totals();
  $("#sub").textContent = fmtINR(t.sub);
  $("#serv").textContent = fmtINR(t.serv);
  $("#tax").textContent = fmtINR(t.tax);
  $("#disc").textContent = "−" + fmtINR(t.disc);
  $("#tot").textContent = fmtINR(t.final);
  $("#promoPct").textContent = (t.promoPct || 0) + "%";
}

$("#apply").onclick = () => {
  const code = $("#code").value.trim().toUpperCase();
  const pct = CODES[code] || 0;
  if (!pct) {
    alert("Invalid or expired code.");
    return;
  }
  savePromo(pct);
  render();
  alert(`Applied ${pct}% off`);
};
$("#remove").onclick = () => {
  savePromo(0);
  render();
};
render();
