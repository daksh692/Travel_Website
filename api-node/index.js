import "dotenv/config";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";
import { z } from "zod";
import rateLimit from "express-rate-limit";

const app = express();
app.use(express.json());

// Rate Limiters
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_AUTH_MAX || "5", 10),
  message: { ok: false, error: "Too many authentication attempts, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_PUBLIC_MAX || "100", 10),
  message: { ok: false, error: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

const userActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_USER_MAX || "200", 10),
  message: { ok: false, error: "Too many actions, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(
  cors({
    origin: process.env.CORS_ORIGIN?.split(",").map((s) => s.trim()) || true,
    credentials: false,
  }),
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
  ssl: { rejectUnauthorized: true },
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
  ssl: { rejectUnauthorized: true },
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
   Validation Schemas
   ========================= */
const validate = (schema) => (req, res, next) => {
  try {
    req.body = schema.parse(req.body);
    next();
  } catch (err) {
    return res.status(400).json({ ok: false, error: "Validation failed", details: err.errors });
  }
};

const registerSchema = z.object({
  first_name: z.string().min(1, "First name is required").max(100),
  last_name: z.string().min(1, "Last name is required").max(100),
  email: z.string().email("Invalid email format").max(255),
  phone: z.string().max(20).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  password: z.string().min(6, "Password must be at least 6 characters").max(255),
});

const loginSchema = z.object({
  email: z.string().email("Invalid email").max(255),
  password: z.string().min(1, "Password is required").max(255),
});

const updateUserSchema = z.object({
  first_name: z.string().max(100).optional().nullable(),
  last_name: z.string().max(100).optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
});

const passwordSchema = z.object({
  current_password: z.string().min(1, "Current password is required"),
  new_password: z.string().min(8, "New password must be at least 8 characters"),
  confirm_password: z.string().min(1, "Confirm password is required"),
}).refine((data) => data.new_password === data.confirm_password, {
  message: "New password and confirm password must match",
  path: ["confirm_password"],
}).refine((data) => data.new_password !== data.current_password, {
  message: "New password must be different from current password",
  path: ["new_password"],
});

const redeemSchema = z.object({
  points: z.number().int().positive("Points must be a positive integer"),
  reason: z.string().max(255).optional(),
});

/* =========================
   Health
   ========================= */
app.get("/api/health", (_req, res) => res.json({ ok: true }));

/* =========================
   Auth: Register
   ========================= */
app.post("/api/register", authLimiter, validate(registerSchema), async (req, res, next) => {
  try {
    const { first_name, last_name, email, phone, address, password } = req.body;
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query(
        "SELECT ClientID FROM clients WHERE Email=?",
        [email],
      );
      if (rows.length)
        return res
          .status(409)
          .json({ ok: false, error: "Email already registered" });

      const hash = await bcrypt.hash(password, 10);
      await conn.query(
        `INSERT INTO clients (FirstName, LastName, Email, PhoneNumber, Address, Password)
         VALUES (?,?,?,?,?,?)`,
        [first_name, last_name, email, phone || "", address || "", hash],
      );

      const [userRows] = await conn.query(
        "SELECT ClientID, FirstName, LastName, Email, PhoneNumber, Address FROM clients WHERE Email=?",
        [email],
      );
      res.json({ ok: true, user: pickUser(userRows[0]) });
    } finally {
      conn.release();
    }
  } catch (e) {
    next(e);
  }
});

/* =========================
   Auth: Login
   ========================= */
app.post("/api/login", authLimiter, validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query(
        `SELECT ClientID, FirstName, LastName, Email, PhoneNumber, Address, Password AS pw
         FROM clients WHERE Email=?`,
        [email],
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
    next(e);
  }
});

/* =========================
   Optional user summary
   ========================= */
app.get("/api/users/:id/summary", userActionLimiter, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ ok: false, error: "Bad id" });

    const conn = await pool.getConnection();
    try {
      const [items] = await conn.query(
        `SELECT placeName, stateName, price, daysNeeded, startdate
         FROM cart_items WHERE ClientID=? ORDER BY startdate DESC LIMIT 10`,
        [id],
      );
      const total = items.reduce((s, r) => s + Number(r.price || 0), 0);
      res.json({ ok: true, totalCost: Number(total.toFixed(2)), items });
    } finally {
      conn.release();
    }
  } catch (e) {
    next(e);
  }
});

/* =========================
   Profile: Update details
   ========================= */
app.put("/api/users/:id", userActionLimiter, validate(updateUserSchema), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ ok: false, error: "Bad id" });

    const { first_name, last_name, phone, address } = req.body;
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
        ],
      );

      const [rows] = await conn.query(
        `SELECT ClientID, FirstName, LastName, Email, PhoneNumber, Address
         FROM clients WHERE ClientID=?`,
        [id],
      );
      if (!rows.length)
        return res.status(404).json({ ok: false, error: "Not found" });
      res.json({ ok: true, user: pickUser(rows[0]) });
    } finally {
      conn.release();
    }
  } catch (e) {
    next(e);
  }
});

/* =========================
   Profile: Change password
   ========================= */
app.post("/api/users/:id/password", authLimiter, validate(passwordSchema), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { current_password, new_password } = req.body;

    if (!id) return res.status(400).json({ ok: false, error: "Bad id" });

    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query(
        "SELECT Password FROM clients WHERE ClientID=?",
        [id],
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
    next(e);
  }
});

/* =========================
   Trips (done / upcoming)
   ========================= */
app.get("/api/users/:id/trips", userActionLimiter, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ ok: false, error: "Bad id" });

    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query(
        `SELECT placeName, stateName, price, daysNeeded, startdate
         FROM cart_items
         WHERE ClientID=?
         ORDER BY startdate DESC`,
        [id],
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
    } finally {
      conn.release();
    }
  } catch (e) {
    next(e);
  }
});

/* =========================
   Points (earned - redeemed)
   ========================= */
app.get("/api/users/:id/points", userActionLimiter, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ ok: false, error: "Bad id" });

    const conn = await pool.getConnection();
    try {
      // Earned: 1 point per ₹100 spent on completed trips (as you had)
      const [rows] = await conn.query(
        `SELECT price, daysNeeded, startdate FROM cart_items WHERE ClientID=?`,
        [id],
      );
      const today = new Date().toISOString().slice(0, 10);
      const spent = rows
        .filter((r) => (addDaysISO(r.startdate, r.daysNeeded) || "") < today)
        .reduce((s, r) => s + Number(r.price || 0), 0);

      const earned = Math.floor(spent / 100);

      // Redeemed total from point_redemptions
      const [redeemRows] = await conn.query(
        `SELECT COALESCE(SUM(points),0) AS used FROM point_redemptions WHERE ClientID=?`,
        [id],
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
    } finally {
      conn.release();
    }
  } catch (e) {
    next(e);
  }
});

/* =========================
   Points: Redeem
   ========================= */
app.post("/api/users/:id/points/redeem", userActionLimiter, validate(redeemSchema), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { points: n, reason } = req.body;
    if (!id) return res.status(400).json({ ok: false, error: "Bad id" });

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // compute latest balance (same as GET)
      const [rows] = await conn.query(
        `SELECT price, daysNeeded, startdate FROM cart_items WHERE ClientID=?`,
        [id],
      );
      const today = new Date().toISOString().slice(0, 10);
      const spent = rows
        .filter((r) => (addDaysISO(r.startdate, r.daysNeeded) || "") < today)
        .reduce((s, r) => s + Number(r.price || 0), 0);
      const earned = Math.floor(spent / 100);

      const [redeemRows] = await conn.query(
        `SELECT COALESCE(SUM(points),0) AS used FROM point_redemptions WHERE ClientID=? FOR UPDATE`,
        [id],
      );
      const used = Number(redeemRows?.[0]?.used || 0);
      const balance = Math.max(0, earned - used);

      if (n > balance) {
        await conn.rollback();
        return res.status(400).json({ ok: false, error: "Not enough points" });
      }

      await conn.query(
        `INSERT INTO point_redemptions (ClientID, points, reason) VALUES (?,?,?)`,
        [id, n, reason || "checkout"],
      );

      await conn.commit();
      res.json({ ok: true, redeemed: n, remaining: balance - n });
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  } catch (e) {
    next(e);
  }
});

/* =========================
   Purchases
   ========================= */
app.get("/api/users/:id/purchases", userActionLimiter, async (req, res, next) => {
  try {
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
          [id],
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
        [id],
      );
      res.json({
        ok: true,
        items: fallback.map((r) => ({ ...r, amount: Number(r.amount || 0) })),
      });
    } finally {
      conn.release();
    }
  } catch (e) {
    next(e);
  }
});

/* =========================
   States data endpoint
   ========================= */
app.get("/api/states/:state/places", publicLimiter, async (req, res, next) => {
  try {
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

    const conn = await statesPool.getConnection();
    try {
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
    } finally {
      conn.release();
    }
  } catch (e) {
    next(e);
  }
});

/* =========================
   Global Error Handler
   ========================= */
app.use((err, req, res, next) => {
  console.error("Unhandled Error:", err);
  res.status(500).json({ ok: false, error: "Internal Server Error" });
});

/* =========================
   Start server
   ========================= */
const PORT = Number(process.env.PORT || 3001);
app.listen(PORT, () => {
  console.log(`API ready on http://localhost:${PORT}`);
});
