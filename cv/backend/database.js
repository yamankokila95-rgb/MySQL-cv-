import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
dotenv.config();

// Create connection pool — handles reconnections automatically
const pool = mysql.createPool(process.env.DB_URL);

// Helper: run a query and return all rows
export const query = async (sql, params = []) => {
  const [rows] = await pool.execute(sql, params);
  return rows;
};

// Helper: run a query and return first row only
export const queryOne = async (sql, params = []) => {
  const [rows] = await pool.execute(sql, params);
  return rows[0] || null;
};

// Helper: run INSERT/UPDATE/DELETE and return result info
export const execute = async (sql, params = []) => {
  const [result] = await pool.execute(sql, params);
  return result;
};

// Create all tables on startup
export const initDatabase = async () => {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS complaints (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT NOT NULL,
      category VARCHAR(100) NOT NULL,
      location VARCHAR(255) NOT NULL,
      status VARCHAR(50) DEFAULT 'Submitted',
      priority VARCHAR(50) DEFAULT 'Medium',
      passphrase VARCHAR(100) NOT NULL,
      attachment VARCHAR(255),
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS comments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      complaintId INT NOT NULL,
      message TEXT NOT NULL,
      adminName VARCHAR(255) NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (complaintId) REFERENCES complaints(id) ON DELETE CASCADE
    )
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS admins (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      department VARCHAR(255) DEFAULT 'General',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Seed default admin if none exist
  const [admins] = await pool.execute("SELECT COUNT(*) as count FROM admins");
  if (admins[0].count === 0) {
    const hashed = bcrypt.hashSync("Admin@123", 10);
    await pool.execute(
      "INSERT INTO admins (name, email, password, department) VALUES (?, ?, ?, ?)",
      ["Campus Admin", "admin@campus.com", hashed, "Administration"]
    );
    console.log("✅ Default admin seeded: admin@campus.com / Admin@123");
  }

  console.log("✅ MySQL database ready");
};

export default pool;
