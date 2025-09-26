import "dotenv/config";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";

const app = express();
app.use(express.json());

app.use(
  cors({
    origin: process.env.CORS_ORIGIN?.split(",").map((s) => s.trim()) || true,
    credentials: false,
  })
);

/* =========================
   PRIMARY DB (auth/client)
   ========================= */
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  connectionLimit: 10,
  charset: "utf8mb4",
});

/* =========================
   STATES DB (places data)
   ========================= */
const statesPool = mysql.createPool({
  host: process.env.STATES_DB_HOST || process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.STATES_DB_PORT || process.env.DB_PORT || 3306),
  user: process.env.STATES_DB_USER || process.env.DB_USER || "root",
  password: process.env.STATES_DB_PASS || process.env.DB_PASS || "",
  database: process.env.STATES_DB_NAME || "states",
  connectionLimit: 5,
  charset: "utf8mb4",
});

/* =========================
   Helpers
   ========================= */
const normalizeBcryptHash = (hash) => hash?.replace(/^\$2y\$/, "$2b$"); // PHP -> Node compat

const pickUser = (row) => ({
  ClientID: row.ClientID,
  FirstName: row.FirstName,
  LastName: row.LastName,
  Email: row.Email,
  PhoneNumber: row.PhoneNumber ?? null,
  Address: row.Address ?? null,
});

function tableFromState(stateName) {
  return String(stateName || "")
    .trim()
    .toLowerCase()
    .replaceAll(" ", "_");
}

function addDaysISO(isoLike, days = 0) {
  const d = new Date(isoLike);
  if (Number.isNaN(d.getTime())) return null;
  const nd = new Date(d);
  nd.setDate(nd.getDate() + Number(days || 0));
  return nd.toISOString().slice(0, 10);
}

/* =========================
   Health
   ========================= */
app.get("/api/health", (_req, res) => res.json({ ok: true }));

/* =========================
   Auth: Register
   ========================= */
app.post("/api/register", async (req, res) => {
  try {
    const { first_name, last_name, email, phone, address, password } =
      req.body || {};
    if (
      !first_name ||
      !last_name ||
      !email ||
      !password ||
      password.length < 6
    ) {
      return res.status(400).json({ ok: false, error: "Invalid fields" });
    }
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query(
        "SELECT ClientID FROM clients WHERE Email=?",
        [email]
      );
      if (rows.length)
        return res
          .status(409)
          .json({ ok: false, error: "Email already registered" });

      const hash = await bcrypt.hash(password, 10);
      await conn.query(
        `INSERT INTO clients (FirstName, LastName, Email, PhoneNumber, Address, Password)
         VALUES (?,?,?,?,?,?)`,
        [first_name, last_name, email, phone || "", address || "", hash]
      );

      const [userRows] = await conn.query(
        "SELECT ClientID, FirstName, LastName, Email, PhoneNumber, Address FROM clients WHERE Email=?",
        [email]
      );
      res.json({ ok: true, user: pickUser(userRows[0]) });
    } finally {
      conn.release();
    }
  } catch (e) {
    console.error("REGISTER error:", e);
    res.status(500).json({ ok: false, error: "Registration failed" });
  }
});

/* =========================
   Auth: Login
   ========================= */
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password)
      return res.status(400).json({ ok: false, error: "Invalid credentials" });

    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query(
        `SELECT ClientID, FirstName, LastName, Email, PhoneNumber, Address, Password AS pw
         FROM clients WHERE Email=?`,
        [email]
      );
      const user = rows[0];
      if (!user)
        return res
          .status(401)
          .json({ ok: false, error: "Email or password incorrect" });

      const dbHash = normalizeBcryptHash(user.pw);
      const ok = await bcrypt.compare(password, dbHash);
      if (!ok)
        return res
          .status(401)
          .json({ ok: false, error: "Email or password incorrect" });

      res.json({ ok: true, user: pickUser(user) });
    } finally {
      conn.release();
    }
  } catch (e) {
    console.error("LOGIN error:", e);
    res.status(500).json({ ok: false, error: "Login failed" });
  }
});

/* =========================
   Optional user summary
   ========================= */
app.get("/api/users/:id/summary", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ ok: false, error: "Bad id" });

    const conn = await pool.getConnection();
    try {
      const [items] = await conn.query(
        `SELECT placeName, stateName, price, daysNeeded, startdate
         FROM cart_items WHERE ClientID=? ORDER BY startdate DESC LIMIT 10`,
        [id]
      );
      const total = items.reduce((s, r) => s + Number(r.price || 0), 0);
      res.json({ ok: true, totalCost: Number(total.toFixed(2)), items });
    } finally {
      conn.release();
    }
  } catch (e) {
    console.error("SUMMARY error:", e);
    res.status(500).json({ ok: false, error: "Failed to load summary" });
  }
});

/* =========================
   Profile: Update details
   ========================= */
app.put("/api/users/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ ok: false, error: "Bad id" });

    const { first_name, last_name, phone, address } = req.body || {};
    const conn = await pool.getConnection();
    try {
      await conn.query(
        `UPDATE clients SET
           FirstName   = COALESCE(?, FirstName),
           LastName    = COALESCE(?, LastName),
           PhoneNumber = COALESCE(?, PhoneNumber),
           Address     = COALESCE(?, Address)
         WHERE ClientID = ?`,
        [
          first_name ?? null,
          last_name ?? null,
          phone ?? null,
          address ?? null,
          id,
        ]
      );

      const [rows] = await conn.query(
        `SELECT ClientID, FirstName, LastName, Email, PhoneNumber, Address
         FROM clients WHERE ClientID=?`,
        [id]
      );
      if (!rows.length)
        return res.status(404).json({ ok: false, error: "Not found" });
      res.json({ ok: true, user: pickUser(rows[0]) });
    } finally {
      conn.release();
    }
  } catch (e) {
    console.error("UPDATE USER error:", e);
    res.status(500).json({ ok: false, error: "Failed to update profile" });
  }
});

/* =========================
   Profile: Change password
   ========================= */
app.post("/api/users/:id/password", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { current_password, new_password, confirm_password } = req.body || {};

    if (!id) return res.status(400).json({ ok: false, error: "Bad id" });
    if (!current_password || !new_password || !confirm_password) {
      return res
        .status(400)
        .json({ ok: false, error: "All fields are required" });
    }
    if (new_password.length < 8) {
      return res.status(400).json({
        ok: false,
        error: "New password must be at least 8 characters",
      });
    }
    if (new_password !== confirm_password) {
      return res.status(400).json({
        ok: false,
        error: "New password and confirm password must match",
      });
    }
    if (new_password === current_password) {
      return res.status(400).json({
        ok: false,
        error: "New password must be different from current password",
      });
    }

    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query(
        "SELECT Password FROM clients WHERE ClientID=?",
        [id]
      );
      if (!rows.length)
        return res.status(404).json({ ok: false, error: "User not found" });

      const stored = normalizeBcryptHash(rows[0].Password);
      const ok = await bcrypt.compare(current_password, stored);
      if (!ok) {
        return res
          .status(401)
          .json({ ok: false, error: "Current password is incorrect" });
      }

      const hash = await bcrypt.hash(new_password, 10);
      await conn.query("UPDATE clients SET Password=? WHERE ClientID=?", [
        hash,
        id,
      ]);
      res.json({ ok: true, message: "Password updated" });
    } finally {
      conn.release();
    }
  } catch (e) {
    console.error("CHANGE PASSWORD error:", e);
    res.status(500).json({ ok: false, error: "Failed to change password" });
  }
});

/* =========================
   Trips (done / upcoming)
   ========================= */
app.get("/api/users/:id/trips", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: "Bad id" });

  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(
      `SELECT placeName, stateName, price, daysNeeded, startdate
       FROM cart_items
       WHERE ClientID=?
       ORDER BY startdate DESC`,
      [id]
    );

    const today = new Date().toISOString().slice(0, 10);
    const done = [];
    const upcoming = [];
    for (const r of rows) {
      const enddate = addDaysISO(r.startdate, r.daysNeeded);
      const item = { ...r, enddate };
      (enddate && enddate < today ? done : upcoming).push(item);
    }
    res.json({ ok: true, done, upcoming });
  } catch (e) {
    console.error("TRIPS error:", e);
    res.status(500).json({ ok: false, error: "Failed to load trips" });
  } finally {
    conn?.release?.();
  }
});

/* =========================
   Points (earned - redeemed)
   ========================= */
app.get("/api/users/:id/points", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: "Bad id" });

  const conn = await pool.getConnection();
  try {
    // Earned: 1 point per ₹100 spent on completed trips (as you had)
    const [rows] = await conn.query(
      `SELECT price, daysNeeded, startdate FROM cart_items WHERE ClientID=?`,
      [id]
    );
    const today = new Date().toISOString().slice(0, 10);
    const spent = rows
      .filter((r) => (addDaysISO(r.startdate, r.daysNeeded) || "") < today)
      .reduce((s, r) => s + Number(r.price || 0), 0);

    const earned = Math.floor(spent / 100);

    // Redeemed total from point_redemptions
    const [redeemRows] = await conn.query(
      `SELECT COALESCE(SUM(points),0) AS used FROM point_redemptions WHERE ClientID=?`,
      [id]
    );
    const used = Number(redeemRows?.[0]?.used || 0);

    const balance = Math.max(0, earned - used);
    res.json({
      ok: true,
      points: balance,
      rule: "1 point for every ₹100 spent on completed trips (₹1 per point redemption)",
      earned,
      used,
    });
  } catch (e) {
    console.error("POINTS error:", e);
    res.status(500).json({ ok: false, error: "Failed to load points" });
  } finally {
    conn?.release?.();
  }
});

/* =========================
   Points: Redeem
   ========================= */
app.post("/api/users/:id/points/redeem", async (req, res) => {
  const id = Number(req.params.id);
  const { points, reason } = req.body || {};
  if (!id) return res.status(400).json({ ok: false, error: "Bad id" });

  const n = Number(points || 0);
  if (!Number.isFinite(n) || n <= 0) {
    return res.status(400).json({ ok: false, error: "Invalid points" });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // compute latest balance (same as GET)
    const [rows] = await conn.query(
      `SELECT price, daysNeeded, startdate FROM cart_items WHERE ClientID=?`,
      [id]
    );
    const today = new Date().toISOString().slice(0, 10);
    const spent = rows
      .filter((r) => (addDaysISO(r.startdate, r.daysNeeded) || "") < today)
      .reduce((s, r) => s + Number(r.price || 0), 0);
    const earned = Math.floor(spent / 100);

    const [redeemRows] = await conn.query(
      `SELECT COALESCE(SUM(points),0) AS used FROM point_redemptions WHERE ClientID=? FOR UPDATE`,
      [id]
    );
    const used = Number(redeemRows?.[0]?.used || 0);
    const balance = Math.max(0, earned - used);

    if (n > balance) {
      await conn.rollback();
      return res.status(400).json({ ok: false, error: "Not enough points" });
    }

    await conn.query(
      `INSERT INTO point_redemptions (ClientID, points, reason) VALUES (?,?,?)`,
      [id, n, reason || "checkout"]
    );

    await conn.commit();
    res.json({ ok: true, redeemed: n, remaining: balance - n });
  } catch (e) {
    await conn.rollback();
    console.error("REDEEM error:", e);
    res.status(500).json({ ok: false, error: "Failed to redeem points" });
  } finally {
    conn?.release?.();
  }
});

/* =========================
   Purchases
   ========================= */
app.get("/api/users/:id/purchases", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: "Bad id" });

  const conn = await pool.getConnection();
  try {
    // Prefer a dedicated purchases table if present
    let rows;
    try {
      const q = await conn.query(
        `SELECT item, amount, purchased_at
         FROM purchases
         WHERE ClientID=?
         ORDER BY purchased_at DESC`,
        [id]
      );
      rows = q[0];
      const items = rows.map((r) => ({
        item: r.item,
        amount: Number(r.amount || 0),
        startdate: r.purchased_at,
      }));
      return res.json({ ok: true, items });
    } catch (err) {
      if (err?.code !== "ER_NO_SUCH_TABLE") throw err;
      // fall through to cart_items fallback
    }

    // Fallback: derive from cart_items
    const [fallback] = await conn.query(
      `SELECT placeName AS item, price AS amount, startdate
       FROM cart_items
       WHERE ClientID=?
       ORDER BY startdate DESC`,
      [id]
    );
    res.json({
      ok: true,
      items: fallback.map((r) => ({ ...r, amount: Number(r.amount || 0) })),
    });
  } catch (e) {
    console.error("PURCHASES error:", e);
    res.status(500).json({ ok: false, error: "Failed to load purchases" });
  } finally {
    conn?.release?.();
  }
});

/* =========================
   States data endpoint
   ========================= */
app.get("/api/states/:state/places", async (req, res) => {
  const raw = req.params.state;
  if (!raw) return res.status(400).json({ ok: false, error: "Missing state" });

  const table = tableFromState(raw);
  if (!/^[a-z0-9_]+$/.test(table)) {
    return res.status(400).json({ ok: false, error: "Bad state name" });
  }

  const sql = `
    SELECT
      Places_to_Visit   AS place,
      Description       AS description,
      Things_to_Do      AS things,
      price1, price2, price3,
      days_needed       AS daysNeeded,
      TO_BASE64(img)    AS img_b64
    FROM \`${table}\`
    LIMIT 200
  `;

  let conn;
  try {
    conn = await statesPool.getConnection();
    const [rows] = await conn.query(sql);
    const items = rows.map((r) => ({
      place: r.place,
      description: r.description,
      things: r.things,
      prices: [r.price1, r.price2, r.price3].filter((v) => v != null),
      daysNeeded: r.daysNeeded,
      img: r.img_b64 ? `data:image/jpeg;base64,${r.img_b64}` : null,
    }));
    res.json({ ok: true, state: raw, table, items });
  } catch (e) {
    console.error("STATE PLACES error:", e);
    res.status(500).json({ ok: false, error: "Failed to load places" });
  } finally {
    conn?.release?.();
  }
});

/* =========================
   Start server
   ========================= */
const PORT = Number(process.env.PORT || 3001);
app.listen(PORT, () => {
  console.log(`API ready on http://localhost:${PORT}`);
});
