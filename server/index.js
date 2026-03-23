require("dotenv").config();

const express = require("express");
const cors = require("cors");
const migrate = require("./db/migrate");
const seed = require("./db/seed");
const diagramsRouter = require("./routes/diagrams");
const templatesRouter = require("./routes/templates");

const app = express();
const PORT = process.env.PORT || 3000;

// CORS — env-aware: set CORS_ORIGIN for production
app.use(cors({
  origin: process.env.CORS_ORIGIN || "http://localhost:5173",
}));

app.use(express.json());

app.use("/api/diagrams", diagramsRouter);
app.use("/api/templates", templatesRouter);

app.get("/health", (_req, res) => res.json({ status: "ok" }));

async function start() {
  try {
    await migrate();
    await seed();
    app.listen(PORT, () => {
      console.log(`✓ DrawDB server listening on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down...");
  process.exit(0);
});

start();
