import "./src/loadEnv.js";
import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { apiRouter } from "./src/apiRouter.js";

const PORT = 3000;

async function startServer() {
  const app = express();

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  // Mount modular API routes for all /api endpoints
  app.use("/api", apiRouter);

  // Serve uploads and public assets statically
  const uploadsDir = path.join(process.cwd(), "public", "uploads");
  if (!fs.existsSync(uploadsDir)) {
    try { fs.mkdirSync(uploadsDir, { recursive: true }); } catch(e){}
  }

  // Explicit route for uploaded files (guarantees image delivery with exact MIME type, prevents SPA fallback)
  app.get("/uploads/:filename", (req, res) => {
    const filename = path.basename(req.params.filename);
    const filePath = path.join(uploadsDir, filename);
    if (fs.existsSync(filePath)) {
      return res.sendFile(filePath);
    }
    const distUploadPath = path.join(process.cwd(), "dist", "uploads", filename);
    if (fs.existsSync(distUploadPath)) {
      return res.sendFile(distUploadPath);
    }
    res.status(404).json({ error: "Image introuvable" });
  });

  app.use("/uploads", express.static(uploadsDir));
  app.use(express.static(path.join(process.cwd(), "public")));

  app.get(["/manifest.json", "/public/manifest.json"], (_req, res) => {
    const manifestPath = path.join(process.cwd(), "public", "manifest.json");
    if (fs.existsSync(manifestPath)) {
      res.setHeader("Content-Type", "application/manifest+json");
      return res.sendFile(manifestPath);
    }
    res.status(404).end();
  });

  // Direct routes for multi-page platform and admin back-office
  app.get("/espace", (_req, res) => {
    const distEspace = path.join(process.cwd(), "dist", "espace.html");
    const rootEspace = path.join(process.cwd(), "espace.html");
    if (fs.existsSync(distEspace)) return res.sendFile(distEspace);
    if (fs.existsSync(rootEspace)) return res.sendFile(rootEspace);
    res.redirect("/");
  });

  app.get(["/connexion", "/login"], (_req, res) => {
    const dist = path.join(process.cwd(), "dist", "connexion.html");
    const root = path.join(process.cwd(), "connexion.html");
    if (fs.existsSync(dist)) return res.sendFile(dist);
    if (fs.existsSync(root)) return res.sendFile(root);
    res.redirect("/");
  });

  app.get(["/inscription", "/register"], (_req, res) => {
    const dist = path.join(process.cwd(), "dist", "inscription.html");
    const root = path.join(process.cwd(), "inscription.html");
    if (fs.existsSync(dist)) return res.sendFile(dist);
    if (fs.existsSync(root)) return res.sendFile(root);
    res.redirect("/");
  });

  const adminRoutes = [
    "/admin",
    "/dashboard",
    "/chercheurs",
    "/chercheurs/:id",
    "/prestations",
    "/prestations/:id",
    "/creneaux",
    "/rendez-vous",
    "/ateliers",
    "/evenements",
    "/bannieres",
    "/publications",
    "/inscriptions",
  ];

  app.get(adminRoutes, (_req, res) => {
    const distAdmin = path.join(process.cwd(), "dist", "admin.html");
    const rootAdmin = path.join(process.cwd(), "admin.html");
    if (fs.existsSync(distAdmin)) return res.sendFile(distAdmin);
    if (fs.existsSync(rootAdmin)) return res.sendFile(rootAdmin);
    res.redirect("/");
  });

  // Vite middleware in development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("/{*splat}", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server PAL-UCA running on http://0.0.0.0:${PORT}`);
  });
}

startServer();

