import express from "express";
import multer from "multer";
import path from "path";
import { requireAdmin } from "../middleware/auth.js";
import { query, queryOne, execute } from "../database.js";

const router = express.Router();

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "backend/uploads/"),
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp|pdf/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext && mime) cb(null, true);
    else cb(new Error("Only images and PDFs are allowed"));
  },
});

// Passphrase generator
const adjectives = ["blue","red","green","swift","quiet","brave","calm","dark","tiny","wild"];
const nouns = ["river","stone","cloud","flame","tiger","hawk","cedar","ocean","frost","maple"];
const generatePassphrase = () => {
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(100 + Math.random() * 900);
  return `${adj}-${noun}-${num}`;
};

// POST /api/complaints
router.post("/complaints", upload.single("attachment"), async (req, res) => {
  try {
    const { title, description, category, location, priority } = req.body;
    if (!title || !description || !category || !location)
      return res.status(400).json({ error: "Missing required fields" });

    const passphrase = generatePassphrase();
    const attachment = req.file ? req.file.filename : null;

    const result = await execute(
      `INSERT INTO complaints (title, description, category, location, status, priority, passphrase, attachment)
       VALUES (?, ?, ?, ?, 'Submitted', ?, ?, ?)`,
      [title, description, category, location, priority || "Medium", passphrase, attachment]
    );

    res.json({ id: result.insertId, passphrase });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

// GET /api/complaints — admin with filters
router.get("/complaints", requireAdmin, async (req, res) => {
  try {
    const { status, category, location, priority, search, from, to } = req.query;
    let sql = "SELECT * FROM complaints WHERE 1=1";
    const params = [];

    if (status)   { sql += " AND status = ?";   params.push(status); }
    if (category) { sql += " AND category = ?"; params.push(category); }
    if (location) { sql += " AND location = ?"; params.push(location); }
    if (priority) { sql += " AND priority = ?"; params.push(priority); }
    if (search)   { sql += " AND (title LIKE ? OR description LIKE ?)"; params.push(`%${search}%`, `%${search}%`); }
    if (from)     { sql += " AND DATE(createdAt) >= ?"; params.push(from); }
    if (to)       { sql += " AND DATE(createdAt) <= ?"; params.push(to); }

    sql += " ORDER BY createdAt DESC";
    const rows = await query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/complaints/passphrase/:phrase — MUST be before /:id
router.get("/complaints/passphrase/:phrase", async (req, res) => {
  try {
    const row = await queryOne(
      "SELECT id,title,description,category,location,status,priority,attachment,createdAt FROM complaints WHERE passphrase = ?",
      [req.params.phrase]
    );
    if (!row) return res.status(404).json({ error: "No complaint found for this passphrase" });
    const comments = await query("SELECT * FROM comments WHERE complaintId = ? ORDER BY createdAt ASC", [row.id]);
    res.json({ ...row, comments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/complaints/:id
router.get("/complaints/:id", async (req, res) => {
  try {
    const row = await queryOne(
      "SELECT id,title,description,category,location,status,priority,attachment,createdAt FROM complaints WHERE id = ?",
      [req.params.id]
    );
    if (!row) return res.status(404).json({ error: "Complaint not found" });
    const comments = await query("SELECT * FROM comments WHERE complaintId = ? ORDER BY createdAt ASC", [row.id]);
    res.json({ ...row, comments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin/complaints/:id
router.patch("/admin/complaints/:id", requireAdmin, async (req, res) => {
  try {
    const { status, priority } = req.body;
    const VALID_STATUSES = ["Submitted", "in-progress", "resolved"];
    const VALID_PRIORITIES = ["Low", "Medium", "High"];

    if (status && !VALID_STATUSES.includes(status))     return res.status(400).json({ error: "Invalid status" });
    if (priority && !VALID_PRIORITIES.includes(priority)) return res.status(400).json({ error: "Invalid priority" });

    const fields = [];
    const params = [];
    if (status)   { fields.push("status = ?");   params.push(status); }
    if (priority) { fields.push("priority = ?"); params.push(priority); }
    if (!fields.length) return res.status(400).json({ error: "Nothing to update" });

    params.push(req.params.id);
    const result = await execute(`UPDATE complaints SET ${fields.join(", ")} WHERE id = ?`, params);
    if (result.affectedRows === 0) return res.status(404).json({ error: "Complaint not found" });
    res.json({ message: "Updated" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/complaints/:id/comments
router.post("/admin/complaints/:id/comments", requireAdmin, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: "Comment cannot be empty" });

    const complaint = await queryOne("SELECT id FROM complaints WHERE id = ?", [req.params.id]);
    if (!complaint) return res.status(404).json({ error: "Complaint not found" });

    await execute(
      "INSERT INTO comments (complaintId, message, adminName) VALUES (?, ?, ?)",
      [req.params.id, message.trim(), req.admin.name]
    );
    res.json({ message: "Comment added" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics
router.get("/analytics", requireAdmin, async (req, res) => {
  try {
    const [totalRow] = await query("SELECT COUNT(*) as count FROM complaints");
    const total = totalRow.count;
    const byStatus   = await query("SELECT status, COUNT(*) as count FROM complaints GROUP BY status");
    const byCategory = await query("SELECT category, COUNT(*) as count FROM complaints GROUP BY category ORDER BY count DESC");
    const byLocation = await query("SELECT location, COUNT(*) as count FROM complaints GROUP BY location ORDER BY count DESC");
    const byPriority = await query("SELECT priority, COUNT(*) as count FROM complaints GROUP BY priority");
    const byMonth    = await query(`
      SELECT DATE_FORMAT(createdAt, '%Y-%m') as month, COUNT(*) as count
      FROM complaints GROUP BY month ORDER BY month DESC LIMIT 6
    `);
    res.json({ total, byStatus, byCategory, byLocation, byPriority, byMonth });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
