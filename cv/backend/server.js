import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { initDatabase } from "./database.js";
import complaintsRouter from "./routes/complaints.js";
import authRouter from "./routes/auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors({ origin: "*" }));
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use("/api", complaintsRouter);
app.use("/api", authRouter);

const PORT = process.env.PORT || 3001;

// Init DB tables first, then start server
initDatabase()
  .then(() => {
    app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error("❌ Failed to connect to MySQL:", err.message);
    console.error("Check your .env DB credentials");
    process.exit(1);
  });
