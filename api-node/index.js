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

// ---- MySQL pool
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  connectionLimit: 10,
  charset: "utf8mb4",
});

// ---- helpers
const normalizeBcryptHash = (hash) => hash?.replace(/^\$2y\$/, "$2b$"); // PHP -> Node compat
const pickUser = (row) => ({
  ClientID: row.ClientID,
  FirstName: row.FirstName,
  LastName: row.LastName,
  Email: row.Email,
});

// ---- health
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// ---- REGISTER
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
      // unique email
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
        "SELECT ClientID, FirstName, LastName, Email FROM clients WHERE Email=?",
        [email]
      );
      return res.json({ ok: true, user: pickUser(userRows[0]) });
    } finally {
      conn.release();
    }
  } catch (e) {
    console.error("REGISTER error:", e);
    res.status(500).json({ ok: false, error: "Registration failed" });
  }
});

// ---- LOGIN
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password)
      return res.status(400).json({ ok: false, error: "Invalid credentials" });

    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query(
        "SELECT ClientID, FirstName, LastName, Email, Password AS pw FROM clients WHERE Email=?",
        [email]
      );
      const user = rows[0];
      if (!user)
        return res
          .status(401)
          .json({ ok: false, error: "Email or password incorrect" });

      // handle PHP's $2y$ hashes
      const dbHash = normalizeBcryptHash(user.pw);
      const ok = await bcrypt.compare(password, dbHash);
      if (!ok)
        return res
          .status(401)
          .json({ ok: false, error: "Email or password incorrect" });

      return res.json({ ok: true, user: pickUser(user) });
    } finally {
      conn.release();
    }
  } catch (e) {
    console.error("LOGIN error:", e);
    res.status(500).json({ ok: false, error: "Login failed" });
  }
});

// ---- OPTIONAL: current cost & trip summary for header menus
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

const PORT = Number(process.env.PORT || 3001);
app.listen(PORT, () => {
  console.log(`API ready on http://localhost:${PORT}`);
});
