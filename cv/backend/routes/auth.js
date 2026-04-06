import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../middleware/auth.js";
import { queryOne } from "../database.js";

const router = express.Router();

router.post("/admin/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });

    const admin = await queryOne("SELECT * FROM admins WHERE email = ?", [email]);
    if (!admin) return res.status(401).json({ error: "Invalid email or password" });

    const valid = bcrypt.compareSync(password, admin.password);
    if (!valid) return res.status(401).json({ error: "Invalid email or password" });

    const token = jwt.sign(
      { id: admin.id, name: admin.name, email: admin.email, department: admin.department },
      JWT_SECRET,
      { expiresIn: "8h" }
    );

    res.json({ token, name: admin.name, department: admin.department });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
