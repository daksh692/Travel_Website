# Travel — Explore • Deals • Trips • Rewards

A fast, modular travel web app: interactive India map for discovery, a dynamic deals feed, a simple trip/cart flow, transportation planner, and a Node/Express + MySQL API for users, trips, and loyalty points.

## ✨ Highlights

- Interactive India SVG map → state pages with real data
- Deals engine (bundles + singles) with light personalization
- Cart & “Current Trip” planners with clear cost math
- Transportation planner with multi-leg trips and per-mode totals
- Account, login/register, profile update, password change
- Loyalty points (earn rules + redeem UI)
- Clean tokens/components, responsive, keyboardable, and snappy

---

## 🗂 Repo Layout

```
root/
├─ index.js                 # Express server (API)
├─ .env                     # Local env (sample vars below)
├─ package.json / package-lock.json
│
├─ main.html                # Landing page (loader + hero)
├─ about.html               # About/Story/Values/Roadmap
├─ auth.html                # Login/Register
├─ account.html             # Profile/Security/Trips/Points
├─ deals.html               # Bundles + Individual deals
├─ listofplace.html         # State catalog (cards + prices)
├─ cart.html                # Cart review & checkout CTA
├─ currenttrip.html         # Trip editor/summary
├─ points.html              # Promo & points apply/review
├─ transportation.html      # Booking & Already-booked tabs
├─ INDmap.html              # India map (⚠ see path note below)
│
├─ CSS/
│  ├─ main.css              # Global header, hero, tokens, loader, toasts
│  ├─ styles.css            # India map (hover label, search)
│  ├─ about.css
│  ├─ account.css
│  ├─ auth.css
│  ├─ cart.css
│  ├─ currenttrip.css
│  ├─ deals.css
│  ├─ listofplace.css
│  ├─ redeem.css            # used by points.html
│  └─ transportation.css
│
├─ JS/
│  ├─ main.js               # Loader, header menus, auth state
│  ├─ about.js
│  ├─ auth.js
│  ├─ account.js
│  ├─ cart.js
│  ├─ currenttrip.js
│  ├─ deals.js
│  ├─ listofplace.js
│  ├─ redeem.js             # used by points.html
│  └─ transportation.js
└─ assets/…                 # logo etc. (referenced by pages)
```

> **Path note:** Several pages link to `places/INDmap.html` but the file in this repo is `INDmap.html` at root. Either move it into `places/INDmap.html` **or** update all links to `INDmap.html`.

---

## 🚀 Quick Start

### Prereqs
- Node.js 18+ (recommended)
- MySQL 8.x running locally (two schemas: `clientvisitdb` and `states`)

### 1) Install server deps
```bash
npm install
```

### 2) Configure environment
Create `.env` in the repo root (or copy your own), with:

```ini
# Primary DB (auth, trips, carts, points)
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASS=
DB_NAME=clientvisitdb

# States DB (read-only tables per state)
STATES_DB_HOST=127.0.0.1
STATES_DB_PORT=3306
STATES_DB_USER=root
STATES_DB_PASS=
STATES_DB_NAME=states

# Server
PORT=3001
CORS_ORIGIN=http://127.0.0.1:5500,http://localhost:5500   # add your static host(s)
```

### 3) Start the API
```bash
npm run dev
# or
node index.js
```

Server will listen on `http://localhost:3001` by default.

### 4) Run the frontend
These are static files. Open `main.html` (or any page) with a static server (e.g., VS Code Live Server), and ensure the origin is added to `CORS_ORIGIN` above.

---

## 🔌 REST API (Express)

**Base:** `http://localhost:<PORT>` (default `3001`)  
**Health:** `GET /api/health` → `{ ok: true }`

### Auth & Users
- `POST /api/register` → Create account  
  Body: `{ first_name, last_name, email, password, phone?, address? }`
- `POST /api/login` → Login (bcrypt)  
  Body: `{ email, password }`
- `PUT /api/users/:id` → Update profile  
  Body: `{ first_name?, last_name?, phone?, address? }`
- `POST /api/users/:id/password` → Change password  
  Body: `{ current_password, new_password, confirm_password }`
- `GET /api/users/:id/summary` → Recent cart/total snapshot

### Trips/Purchases/Points
- `GET /api/users/:id/trips` → `{ upcoming:[], done:[] }`
- `GET /api/users/:id/purchases` → Purchase history (falls back to cart_items if table missing)
- `GET /api/users/:id/points` → `{ points, rule, earned, used }`
- `POST /api/users/:id/points/redeem` → `{ redeemed, remaining }`

### States / Places
- `GET /api/states/:state/places`  
  `:state` is normalized (lowercase, spaces→underscores). Returns array of places with `{ place, description, things, prices:[p1,p2,p3], daysNeeded, img (data URL) }`.

> The server opens two MySQL pools: `pool` (primary) and `statesPool` (places). Make sure both schemas exist and tables are populated.

---

## 🖥 Frontend: Pages & Behavior

### Landing (`main.html` + `main.js`)
- Loader with progress bar → sets body to “loaded”
- Fixed header with guest/user menus (gear vs avatar)
- Quick links: Explore (India map), Transportation, Deals, About

### Explore: India Map (`INDmap.html` + `styles.css` + `script.js`)
- Inline SVG of India (each state is a `<path class="state" id="...">`)
- Hover label follows cursor with prettified names
- Search box ranks and highlights matches, Enter selects top hit
- Click navigates to **state catalog** (`listofplace.html?state=<Name>`)

### State Catalog (`listofplace.html` + `listofplace.js`)
- Fetches `/api/states/:state/places`
- Card grid with image, description, “things to do”
- Three price chips (Basic/Plus/Premium); “Add to cart” with dialog if no package selected
- Uses local cart storage; login required for some flows

### Deals (`deals.html` + `deals.js`)
- Tabs for **Bundles** and **Individual** (5 of each)
- Learns preferences after day 2 and shows **Hand-picked** section
- Adds bundles by splitting price across members (+ confetti/tilt effects)

### Cart (`cart.html` + `cart.js`)
- Local cart (`cartDraft`) with qty, remove, clear
- Totals: Subtotal + Service(0.5%) + Tax(12%)
- “Proceed to checkout” → redirects to auth if guest

### Current Trip (`currenttrip.html` + `currenttrip.js`)
- Edit items, switch packages per place, drag-to-reorder
- Trip duration computed from `daysNeeded × qty`; end date from chosen start
- Same totals model (Subtotal + Service 0.5% + Tax 12%)

### Transportation (`transportation.html` + `transportation.js`)
- **Booking**: multi-trip, multi-leg editor (flight/train/bus/car), bulk select/move/duplicate
- **Already booked**: record external bookings
- Per-mode spend chips; configurable **Service%/Tax%** persisted to local storage

### Account (`account.html` + `account.js`)
- Profile view/edit (name/phone/address)
- Security: password change with strength meter + popover feedback
- Trips (Upcoming/Completed), Points (rule + balance), Purchases
- Saved device cart viewer

### Auth (`auth.html` + `auth.js`)
- Tabs for Login/Register, inline validation, accessible errors
- On success, saves session to local storage and redirects to `next`

### Rewards (`points.html` + `redeem.js` + `redeem.css`)
- Promo codes (WELCOME10/FESTIVE15/VIP20) persisted device-side
- Points balance load, range & numeric input, “apply” & “clear”
- Sticky order summary with live math (promo, points)

### About (`about.html` + `about.js`)
- Story/values/timeline, feature grid, testimonials carousel
- Roadmap accordion, “Under the hood” tech badges

---

## 🎨 Design System (from CSS)

- **Palette:** `--ink`, `--txt`, `--muted`, `--brand`, `--brand-2`, `--accent`, `--accent-2`, surfaces `--card`, `--card-2`, glass `--glass`, `--glass-2`, lines `--line`, rings `--ring`
- **Components:** `.btn` variants (primary/outline/ghost), `.badge`/`.chip`, rounded cards, tabs, skeleton loaders, native `<dialog>`, toast containers (`.lp-toasts`)
- **Layouts:** page shells `.lp-shell`, `.cart-shell`, `.ct-shell`, `.shell`, `.page`; fixed header with consistent top paddings
- **Motion:** subtle glows, aurora gradients, reveal/slide for lists and carousels

---

## 🧠 Local Storage Keys (shared)

- `sessionClient` — logged-in user JSON (use this everywhere)
- `cartDraft` — cart items `{ state, place, img?, days?, package, price, qty, bundleId? }`
- `dealsFirstSeen` — timestamp to drive personalization/deal stability
- `promoDiscountPct` — applied percent (points page)
- `appliedPoints` — points applied (points page)
- `tripStart` — ISO start date (currenttrip)
- `transportDraftV5` — transportation model `{ trips:[...], manual:[...] }`
- `transportCfgV1` — `{ servicePct, taxPct }` (transportation)

---

## 🧪 Testing Ideas

- API route smoke tests (supertest)
- Client integration: add items → cart math → current trip math → points apply
- Accessibility: tab order, focus outlines, ARIA for menus/dialogs/toasts
- Perf: ensure no layout thrash on scroll; images lazy-loaded where feasible

---

## 📦 Scripts

Check `package.json` for exact scripts. Typical:
```json
{
  "scripts": {
    "dev": "node index.js"
  },
  "dependencies": {
    "express": "...",
    "mysql2": "...",
    "dotenv": "...",
    "cors": "...",
    "bcryptjs": "..."
  }
}
```

---

## ⚠️ Known Issues / Cleanups

1) **Map path mismatch**  
   Links point to `places/INDmap.html` but file is `INDmap.html` in root. Fix by moving the file or updating the links in all headers and buttons.

2) **Auth key mismatch (points page)**  
   `redeem.js` sometimes reads a different key. Standardize on `localStorage.sessionClient` across all pages.

3) **Totals consistency**  
   Cart/CurrentTrip hardcode Service 0.5% and Tax 12%, while Transportation makes them configurable. Decide one policy:
   - Preferred: make rates configurable everywhere and read from `transportCfgV1`.
   - Or document why cart/trip are fixed.

4) **Stray character**  
   `main.html` has a lone `c` at the end of the file. Delete it.

---



---

## 🙌 Credits

Design & engineering: **Daksh Shah (Daksh.dev)**  
Tech: HTML/CSS/JS, SVG maps, Node/Express, MySQL

---

### Contributor Notes

- Keep new CSS scoped under page shells to avoid bleed.
- Reuse tokens/components; don’t duplicate button/tab styles.
- If you add endpoints, mirror them here with method, body, and sample response.
- For any new state tables, keep the naming normalization (lowercase, underscores).
