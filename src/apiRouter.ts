import { Router } from "express";
import path from "path";
import fs from "fs";
import { GoogleGenAI } from "@google/genai";
import { put } from "@vercel/blob";
import { runFullCvPipeline } from "./cvAuditPipeline.ts";
import {
  isMistralConfigured,
  performMistralOCR,
  structureTextWithMistral,
  extractTextFromBuffer,
  getMimeType,
} from "./mistralService.ts";

export interface PlatformStorage {
  read(): Record<string, any> | null;
  write(data: Record<string, any>): void;
  upload(key: string, data: Buffer, contentType: string): Promise<string>;
  download(key: string): Promise<{ data: ArrayBuffer; contentType: string } | null>;
}

export function createApiRouter(storage?: PlatformStorage) {
const apiRouter = Router();

// Store location: support /tmp on Vercel serverless environment
const DATA_DIR = process.env.VERCEL ? "/tmp/data" : path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "store.json");

const DEFAULT_CONSEILLERS = [
  {
    id: "cons-1",
    nom: "M. EL MEHDI FADIL",
    fonction: "Conseiller Principal en Emploi & Insertion Universitaire",
    email: "fadil.conseil@uca.ma",
    tel: "+212 6 61 00 00 01",
    lieu: "Agence Universitaire Cadi Ayyad",
    statut: "actif",
    creneaux: ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "14:00", "14:30", "15:00", "15:30", "16:00"],
    disponibilites: "Lundi au Vendredi (09:00 - 16:30)"
  },
  {
    id: "cons-2",
    nom: "Mme. FATIMA-ZAHRA BENALI",
    fonction: "Conseillère Orientation & Techniques de Recherche d'Emploi",
    email: "benali.orientation@uca.ma",
    tel: "+212 6 61 00 00 02",
    lieu: "Agence Universitaire Cadi Ayyad",
    statut: "actif",
    creneaux: ["09:00", "09:30", "10:00", "10:30", "11:00", "14:00", "14:30", "15:00", "15:30"],
    disponibilites: "Lundi, Mardi, Jeudi, Vendredi (09:00 - 16:00)"
  },
  {
    id: "cons-3",
    nom: "M. YOUNES TAHIRI",
    fonction: "Conseiller Relations Entreprises & Stages PFE",
    email: "tahiri.stages@uca.ma",
    tel: "+212 6 61 00 00 03",
    lieu: "Agence Universitaire Cadi Ayyad",
    statut: "actif",
    creneaux: ["10:00", "10:30", "11:00", "11:30", "14:30", "15:00", "15:30", "16:00"],
    disponibilites: "Mardi au Jeudi (10:00 - 16:30)"
  }
];

function loadStore() {
  let data: any = null;
  try {
    if (storage) {
      data = storage.read();
    } else if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, "utf-8");
      data = JSON.parse(raw);
    } else {
      const seedFile = path.join(process.cwd(), "data", "store.json");
      if (fs.existsSync(seedFile)) {
        const raw = fs.readFileSync(seedFile, "utf-8");
        data = JSON.parse(raw);
      }
    }
  } catch (err) {
    console.error("Error reading store:", err);
    if (storage) throw err;
  }

  if (!data || typeof data !== "object") {
    data = {};
  }

  data.rdvs = Array.isArray(data.rdvs) ? data.rdvs : [];
  data.profils = Array.isArray(data.profils) ? data.profils : [];
  data.news = Array.isArray(data.news) ? data.news : [];
  data.ateliers = Array.isArray(data.ateliers) ? data.ateliers : [];
  data.inscriptions = Array.isArray(data.inscriptions) ? data.inscriptions : [];
  data.creneaux = Array.isArray(data.creneaux) ? data.creneaux : [];
  data.evenements = Array.isArray(data.evenements) ? data.evenements : [];
  data.prestations = Array.isArray(data.prestations) ? data.prestations : [];
  data.publications = Array.isArray(data.publications) ? data.publications : [];
  data.bannieres = Array.isArray(data.bannieres) ? data.bannieres : [];
  data.affiches = Array.isArray(data.affiches) ? data.affiches : [];
  data.banners = Array.isArray(data.banners) && data.banners.length > 0
    ? data.banners
    : (data.bannieres.length > 0 ? data.bannieres : (data.affiches.length > 0 ? data.affiches : []));
  
  // Normaliser chaque bannière pour garantir la compatibilité absolue (image, imageUrl, title, titre, etc.)
  data.banners.forEach((b: any) => {
    const img = b.imageUrl || b.image || b.img || b.url || b.src || "";
    b.image = img;
    b.imageUrl = img;
    b.title = b.title || b.titre || "";
    b.titre = b.titre || b.title || "";
    b.link = b.link || b.lien || "";
    b.lien = b.lien || b.link || "";
    if (b.active === undefined && b.statut !== undefined) {
      b.active = b.statut === "active" || b.statut === "publié";
    }
    if (b.statut === undefined && b.active !== undefined) {
      b.statut = b.active !== false ? "active" : "inactive";
    }
    const ord = Number(b.ordre !== undefined ? b.ordre : (b.order !== undefined ? b.order : 0)) || 0;
    b.ordre = ord;
    b.order = ord;
  });
  data.bannieres = data.banners;
  data.affiches = data.banners;

  // Initialiser des prestations par défaut si vide
  if (data.prestations.length === 0) {
    data.prestations = [
      {
        id: "pres-1",
        nom: "Orientation professionnelle & Bilan individuel",
        description: "Diagnostic approfondi des compétences, aspirations et opportunités du marché de l'emploi.",
        conseiller: "M. EL MEHDI FADIL",
        duree: "45 min",
        modalite: "Présentiel ou Visioconférence",
        statut: "active",
        createdAt: "2026-09-01T08:00:00.000Z"
      },
      {
        id: "pres-2",
        nom: "Conseil & Optimisation de CV / Profil LinkedIn",
        description: "Restructuration du CV selon les standards ATS et coaching sur l'e-réputation professionnelle.",
        conseiller: "Mme. FATIMA-ZAHRA BENALI",
        duree: "30 min",
        modalite: "Présentiel & En ligne",
        statut: "active",
        createdAt: "2026-09-01T08:00:00.000Z"
      },
      {
        id: "pres-3",
        nom: "Préparation & Simulation d'Entretien d'Embauche",
        description: "Mise en situation réelle, pitch de présentation professionnelle et décryptage des questions pièges.",
        conseiller: "M. EL MEHDI FADIL",
        duree: "60 min",
        modalite: "Présentiel ou Visioconférence",
        statut: "active",
        createdAt: "2026-09-01T08:00:00.000Z"
      },
      {
        id: "pres-4",
        nom: "Accompagnement & Conseil en Entrepreneuriat",
        description: "Accompagnement structuré pour le montage de projet, études de faisabilité et programmes d'appui.",
        conseiller: "M. YOUNES TAHIRI",
        duree: "60 min",
        modalite: "Présentiel",
        statut: "active",
        createdAt: "2026-09-01T08:00:00.000Z"
      },
      {
        id: "pres-5",
        nom: "Information sur les opportunités d'emploi & Stages PFE",
        description: "Mise en relation directe avec le réseau des entreprises partenaires UCA et offres conventionnées.",
        conseiller: "M. YOUNES TAHIRI",
        duree: "30 min",
        modalite: "Présentiel ou En ligne",
        statut: "active",
        createdAt: "2026-09-01T08:00:00.000Z"
      }
    ];
  }

  // Initialiser les événements par défaut si vide
  if (data.evenements.length === 0) {
    data.evenements = [
      {
        id: 1,
        titre: "Forum National de Recrutement Universitaire 2026",
        date: "2026-10-15",
        heure: "09:00 - 17:00",
        lieu: "Palais des Congrès de Marrakech & Campus UCA",
        description: "Rencontre directe entre plus de 120 entreprises nationales et multinationales avec les lauréats de l'Université Cadi Ayyad.",
        intervenants: "Représentants ANAPEC, Directeurs RH, Enseignants-chercheurs UCA",
        partenaires: "ANAPEC, CGEM Marrakech-Safi, Université Cadi Ayyad, Ministère de l'Inclusion Économique",
        participantsMax: 1500,
        participantsInscrits: 840,
        image: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1200&h=600&auto=format&fit=crop&q=80",
        statut: "publié",
        createdAt: "2026-09-10T10:00:00.000Z"
      },
      {
        id: 2,
        titre: "Journée Portes Ouvertes de l'Entrepreneuriat & Startups UCA",
        date: "2026-11-04",
        heure: "10:00 - 16:30",
        lieu: "Centre d'Innovation et d'Insertion Universitaire - Daoudiate",
        description: "Pitchs de porteurs de projets, ateliers de financement d'amorçage et stands des incubateurs régionaux.",
        intervenants: "Experts en amorçage, Conseillers Entrepreneuriat ANAPEC, Mentors UCA",
        partenaires: "Technopark Marrakech, Centre Régional d'Investissement CRI",
        participantsMax: 300,
        participantsInscrits: 145,
        image: "https://images.unsplash.com/photo-1515187029135-18ee286d815b?w=1200&h=600&auto=format&fit=crop&q=80",
        statut: "publié",
        createdAt: "2026-09-12T10:00:00.000Z"
      }
    ];
  }

  // Initialiser les publications par défaut si vide
  if (data.publications.length === 0) {
    data.publications = [
      {
        id: 1,
        titre: "Lancement du programme d'accompagnement PAL-UCA 2026",
        categorie: "Communiqué",
        texte: "L'ANAPEC et l'Université Cadi Ayyad renforcent leur dispositif conjoint d'insertion pour l'ensemble des lauréats des 14 établissements.",
        image: "https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=800&auto=format&fit=crop&q=80",
        datePublication: "2026-09-18",
        statut: "publié",
        createdAt: "2026-09-18T09:00:00.000Z"
      },
      {
        id: 2,
        titre: "Calendrier des ateliers TRE du mois d'octobre 2026",
        categorie: "Actualité",
        texte: "Découvrez les dates des ateliers de simulation d'entretiens, rédaction de CV percutant et techniques de recherche d'emploi en présentiel et à distance.",
        image: "https://images.unsplash.com/photo-1531482615713-2afd69097998?w=800&auto=format&fit=crop&q=80",
        datePublication: "2026-09-22",
        statut: "publié",
        createdAt: "2026-09-22T14:30:00.000Z"
      }
    ];
  }

  // Synchroniser systématiquement bannieres et affiches pour compatibilité bidirectionnelle
  if (data.affiches.length > 0 && data.bannieres.length === 0) {
    data.bannieres = JSON.parse(JSON.stringify(data.affiches));
  } else if (data.bannieres.length > 0 && data.affiches.length === 0) {
    data.affiches = JSON.parse(JSON.stringify(data.bannieres));
  } else if (data.affiches.length > 0 && data.bannieres.length > 0 && data.affiches.length !== data.bannieres.length) {
    // Si l'une des deux listes a été mise à jour plus récemment
    data.affiches = data.affiches.length >= data.bannieres.length ? data.affiches : data.bannieres;
    data.bannieres = JSON.parse(JSON.stringify(data.affiches));
  }

  if (!Array.isArray(data.conseillers) || data.conseillers.length === 0) {
    data.conseillers = JSON.parse(JSON.stringify(DEFAULT_CONSEILLERS));
  }

  // Normaliser les statuts des rendez-vous existants
  data.rdvs.forEach((r: any) => {
    if (r.status === "accepted" && !r.statut) r.statut = "Confirmé";
    else if (r.status === "refused" && !r.statut) r.statut = "Refusé";
    else if (r.status === "pending" && !r.statut) r.statut = "En attente";
    else if (!r.statut) r.statut = "En attente";

    if (!r.candidat_nom && r.nom) r.candidat_nom = r.nom;
    if (!r.candidat_email && r.email) r.candidat_email = r.email;
    if (!r.candidat_tel && r.tel) r.candidat_tel = r.tel;
    if (!r.candidate_id && (r.email || r.candidat_email)) r.candidate_id = r.email || r.candidat_email;
    if (!r.conseiller_id) r.conseiller_id = "cons-1";
    if (!r.conseiller_nom) r.conseiller_nom = "M. EL MEHDI FADIL";
    if (!r.heure) r.heure = "10:30";
    if (!r.type) r.type = "Présentiel";
    if (!r.date_creation) r.date_creation = r.createdAt || new Date().toISOString();
    if (!r.date_modification) r.date_modification = r.updatedAt || r.date_creation;
  });

  // Normaliser les profils pour garantir un historique chronologique
  data.profils.forEach((p: any) => {
    if (!Array.isArray(p.historique)) {
      p.historique = [];
      const regDate = (p.createdAt || new Date().toISOString()).split("T")[0];
      p.historique.push({
        id: Date.now() - 10000,
        date: regDate,
        action: "Inscription sur PAL-UCA",
        details: "Création du compte et validation du profil candidat"
      });
    }
    if (!Array.isArray(p.notifications)) {
      p.notifications = [];
    }
  });

  return data;
}

function appendCandidateHistory(store: any, identifier: string, action: string, details?: string) {
  if (!identifier) return;
  const idLower = identifier.toLowerCase().trim();
  const candidate = store.profils.find((p: any) => 
    (p.email && p.email.toLowerCase() === idLower) ||
    (p.cin && p.cin.toUpperCase() === identifier.toUpperCase().trim()) ||
    (p.id && String(p.id) === identifier)
  );
  if (candidate) {
    if (!Array.isArray(candidate.historique)) candidate.historique = [];
    candidate.historique.push({
      id: Date.now(),
      date: new Date().toISOString().split("T")[0],
      timestamp: new Date().toISOString(),
      action,
      details: details || ""
    });
  }
}

function appendCandidateNotification(store: any, identifier: string, message: string) {
  if (!identifier) return;
  const idLower = identifier.toLowerCase().trim();
  const candidate = store.profils.find((p: any) => 
    (p.email && p.email.toLowerCase() === idLower) ||
    (p.cin && p.cin.toUpperCase() === identifier.toUpperCase().trim()) ||
    (p.id && String(p.id) === identifier)
  );
  if (candidate) {
    if (!Array.isArray(candidate.notifications)) candidate.notifications = [];
    candidate.notifications.unshift({
      id: Date.now(),
      message,
      date: new Date().toISOString(),
      lu: false
    });
  }
}

function saveStore(data: Record<string, any>) {
  if (storage) { storage.write(data); return; }
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("Error writing store:", err);
  }
}

function getGeminiClient(): GoogleGenAI | null {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  return new GoogleGenAI({
    apiKey: key,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
}

async function generateWithGeminiFallback(ai: GoogleGenAI, contents: any, timeoutMs: number = 7000): Promise<string> {
  const models = ["gemini-3.8-flash", "gemini-3.5-flash", "gemini-flash-latest", "gemini-3.1-flash-lite"];
  for (const model of models) {
    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("AI_TIMEOUT")), timeoutMs)
      );
      const response: any = await Promise.race([
        ai.models.generateContent({
          model,
          contents,
        }),
        timeoutPromise,
      ]);
      if (response && response.text) {
        return response.text;
      }
    } catch (err: any) {
      console.warn(`[Gemini] Modèle ${model} temporairement indisponible (${err.status || err.message}), essai du suivant...`);
    }
  }
  throw new Error("Modèles Gemini temporairement indisponibles");
}

// Health check
apiRouter.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// GET /data
apiRouter.get("/data", (_req, res) => {
  const store = loadStore();
  // Garantir la compatibilité des clés banners / bannieres / affiches
  const bannersList = Array.isArray(store.banners) && store.banners.length
    ? store.banners
    : (Array.isArray(store.bannieres) && store.bannieres.length ? store.bannieres : (store.affiches || []));
  store.banners = bannersList;
  store.bannieres = bannersList;
  store.affiches = bannersList;
  res.json(store);
});

// POST /data
apiRouter.post("/data", (req, res) => {
  const { key, value } = req.body;
  const store = loadStore();
  if (key) {
    store[key] = value;
    // Si la clé concerne les affiches ou bannières, maintenir les trois synchronisés
    if (key === "affiches" || key === "bannieres" || key === "banners") {
      store.affiches = value;
      store.bannieres = value;
      store.banners = value;
    }
    saveStore(store);
    return res.json({ success: true, key });
  }
  if (typeof req.body === "object") {
    Object.assign(store, req.body);
    const b = req.body.banners || req.body.bannieres || req.body.affiches;
    if (b) {
      store.banners = b;
      store.bannieres = b;
      store.affiches = b;
    }
    saveStore(store);
    return res.json({ success: true });
  }
  res.status(400).json({ error: "Invalid data format" });
});

// Helper pour sauvegarder une image Base64 sur le disque et retourner une URL accessible
async function saveBase64Image(dataUrl: string, prefix = "banner"): Promise<string> {
  if (!dataUrl || typeof dataUrl !== "string") return "";
  if (!dataUrl.startsWith("data:image/")) {
    return dataUrl; // Déjà une URL HTTP(S) ou chemin local
  }

  try {
    const matches = dataUrl.match(/^data:image\/([a-zA-Z0-9-+.]+);base64,(.+)$/);
    if (!matches || matches.length < 3) return dataUrl;

    let ext = matches[1].toLowerCase();
    if (ext === "jpeg") ext = "jpg";
    if (ext === "svg+xml") ext = "svg";
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, "base64");

    if (storage) {
      const filename = prefix + '_' + crypto.randomUUID() + '.' + ext;
      return await storage.upload(filename, buffer, 'image/' + matches[1].toLowerCase());
    }
    const uploadsDir = path.join(process.cwd(), "public", "uploads");
    if (!fs.existsSync(uploadsDir)) {
      try { fs.mkdirSync(uploadsDir, { recursive: true }); } catch(e){}
    }

    const filename = `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
    const filePath = path.join(uploadsDir, filename);
    fs.writeFileSync(filePath, buffer);

    // Si le dossier dist existe (build de production), y synchroniser immédiatement l'image
    const distUploads = path.join(process.cwd(), "dist", "uploads");
    if (fs.existsSync(path.join(process.cwd(), "dist"))) {
      if (!fs.existsSync(distUploads)) {
        try { fs.mkdirSync(distUploads, { recursive: true }); } catch(e){}
      }
      try { fs.writeFileSync(path.join(distUploads, filename), buffer); } catch(e){}
    }

    return `/uploads/${filename}`;
  } catch (err) {
    console.error("Erreur sauvegarde image base64:", err);
    if (storage) throw err;
    return dataUrl;
  }
}

// Route explicite pour servir les images d'uploads via l'API router si nécessaire
apiRouter.get("/uploads/:filename", async (req, res) => {
  const filename = path.basename(req.params.filename);
  if (storage) {
    try {
      const object = await storage.download(filename);
      if (!object) return res.status(404).json({ error: 'Image introuvable' });
      res.setHeader('Content-Type', object.contentType);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.send(Buffer.from(object.data));
    } catch { return res.status(500).json({ error: 'Lecture du fichier impossible' }); }
  }
  const filePath = path.join(process.cwd(), "public", "uploads", filename);
  if (fs.existsSync(filePath)) {
    return res.sendFile(filePath);
  }
  const distPath = path.join(process.cwd(), "dist", "uploads", filename);
  if (fs.existsSync(distPath)) {
    return res.sendFile(distPath);
  }
  res.status(404).json({ error: "Image introuvable" });
});

// ── ENDPOINT UPLOAD D'IMAGE DE BANNIÈRE ──
apiRouter.post("/upload", async (req, res) => {
  try {
    const { image, dataUrl, filename, data, fileBase64 } = req.body;
    const raw = image || dataUrl || data || fileBase64;
    if (!raw) {
      return res.status(400).json({ success: false, error: "Aucune image fournie" });
    }

    const cleanPrefix = filename ? filename.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 20) : "banner";
    const finalUrl = await saveBase64Image(raw, cleanPrefix);

    return res.json({
      success: true,
      url: finalUrl,
      originalName: filename || "banner.jpg"
    });
  } catch (err: any) {
    console.error("Error in /api/upload:", err);
    res.status(500).json({ success: false, error: "Erreur lors de l'upload de l'image" });
  }
});

// ── ENDPOINTS BANNIÈRES & AFFICHES (CRUD & REQUÊTE FRONT OFFICE) ──
function getBannersFromStore(store: any, activeOnly = false) {
  let list = Array.isArray(store.banners) && store.banners.length > 0
    ? store.banners
    : (Array.isArray(store.affiches) && store.affiches.length > 0
        ? store.affiches
        : (Array.isArray(store.bannieres) ? store.bannieres : []));

  if (activeOnly) {
    const today = new Date().toISOString().split("T")[0];
    list = list.filter((b: any) => {
      if (!b) return false;
      const img = b.imageUrl || b.image;
      if (!img) return false;
      const st = String(b.statut || (b.active !== false ? "active" : "inactive")).toLowerCase();
      if (st === "desactivee" || st === "inactif" || st === "inactive" || st === "archive") {
        return false;
      }
      if (b.dateDebut && b.dateDebut > today) return false;
      if (b.dateFin && b.dateFin < today) return false;
      return true;
    });
  }

  // Trier par ordre ascendant (1 = premier)
  return list.slice().sort((a: any, b: any) => {
    const ordA = parseInt(String(a.ordre !== undefined ? a.ordre : (a.order !== undefined ? a.order : 999)), 10) || 999;
    const ordB = parseInt(String(b.ordre !== undefined ? b.ordre : (b.order !== undefined ? b.order : 999)), 10) || 999;
    return ordA - ordB;
  });
}

// GET /api/bannieres & GET /api/affiches
const handleGetBanners = (req: any, res: any) => {
  const store = loadStore();
  const activeOnly = req.query.activeOnly === "true" || req.query.visible === "true";
  const items = getBannersFromStore(store, activeOnly);
  res.json({
    success: true,
    count: items.length,
    bannieres: items,
    affiches: items,
    banners: items
  });
};

apiRouter.get("/bannieres", handleGetBanners);
apiRouter.get("/affiches", handleGetBanners);
apiRouter.get("/banners", handleGetBanners);

// POST /api/bannieres & POST /api/affiches
const handleSaveBanner = async (req: any, res: any) => {
  try {
    const store = loadStore();
    const { id, titre, title, image, imageUrl, lien, link, statut, active, ordre, order, dateDebut, dateFin } = req.body;
    const rawImage = image || imageUrl;

    if (!rawImage) {
      return res.status(400).json({ success: false, error: "L'image de la bannière est obligatoire" });
    }

    // Sauvegarder l'image sur disque si base64
    const finalImageUrl = await saveBase64Image(rawImage, "banner");

    let currentList = Array.isArray(store.banners) && store.banners.length > 0
      ? store.banners
      : (Array.isArray(store.affiches) ? store.affiches : (Array.isArray(store.bannieres) ? store.bannieres : []));
    const bannerId = id ? parseInt(String(id), 10) : Date.now();
    const existingIndex = currentList.findIndex((b: any) => b.id === bannerId);

    const bannerObj: any = {
      id: bannerId,
      titre: titre || title || "",
      title: title || titre || "",
      image: finalImageUrl,
      imageUrl: finalImageUrl,
      lien: lien || link || "#actualites",
      link: link || lien || "#actualites",
      statut: statut || (active !== false ? "active" : "inactive"),
      active: active !== undefined ? active : (statut !== "inactive"),
      ordre: parseInt(String(ordre || order || 1), 10) || (existingIndex >= 0 ? currentList[existingIndex].ordre : currentList.length + 1),
      order: parseInt(String(order || ordre || 1), 10) || (existingIndex >= 0 ? currentList[existingIndex].ordre : currentList.length + 1),
      dateDebut: dateDebut || "",
      dateFin: dateFin || "",
      updatedAt: new Date().toISOString()
    };

    if (existingIndex >= 0) {
      currentList[existingIndex] = { ...currentList[existingIndex], ...bannerObj };
    } else {
      bannerObj.createdAt = new Date().toISOString();
      currentList.push(bannerObj);
    }

    // Réordonner la liste
    currentList.sort((a: any, b: any) => (parseInt(a.ordre, 10) || 999) - (parseInt(b.ordre, 10) || 999));

    store.affiches = currentList;
    store.bannieres = currentList;
    store.banners = currentList;
    saveStore(store);

    return res.json({
      success: true,
      message: existingIndex >= 0 ? "Bannière mise à jour avec succès" : "Bannière ajoutée avec succès",
      banner: bannerObj
    });
  } catch (err: any) {
    console.error("Error in POST /api/bannieres:", err);
    res.status(500).json({ success: false, error: "Erreur lors de l'enregistrement de la bannière" });
  }
};

apiRouter.post("/bannieres", handleSaveBanner);
apiRouter.post("/affiches", handleSaveBanner);
apiRouter.post("/banners", handleSaveBanner);

// DELETE /api/bannieres/:id & DELETE /api/affiches/:id
const handleDeleteBanner = (req: any, res: any) => {
  try {
    const store = loadStore();
    const idNum = parseInt(req.params.id, 10);
    
    let list = Array.isArray(store.banners) ? store.banners : (Array.isArray(store.affiches) ? store.affiches : []);
    const filtered = list.filter((b: any) => b.id !== idNum);
    store.affiches = filtered;
    store.bannieres = filtered;
    store.banners = filtered;
    saveStore(store);

    res.json({ success: true, message: "Bannière supprimée avec succès" });
  } catch (err: any) {
    console.error("Error in DELETE banner:", err);
    res.status(500).json({ success: false, error: "Erreur lors de la suppression de la bannière" });
  }
};

apiRouter.delete("/bannieres/:id", handleDeleteBanner);
apiRouter.delete("/affiches/:id", handleDeleteBanner);
apiRouter.delete("/banners/:id", handleDeleteBanner);
apiRouter.delete("/affiches/:id", handleDeleteBanner);

// POST /notify

// ── GESTION DES CONSEILLERS ──
apiRouter.get("/conseillers", (req, res) => {
  const store = loadStore();
  const actifsOnly = req.query.actifsOnly === "true";
  let list = store.conseillers || [];
  if (actifsOnly) {
    list = list.filter((c: any) => c.statut === "actif");
  }
  res.json({ success: true, conseillers: list });
});

apiRouter.post("/conseillers", (req, res) => {
  const store = loadStore();
  const { id, nom, fonction, email, tel, lieu, statut, creneaux, disponibilites } = req.body;
  
  if (!nom) {
    return res.status(400).json({ success: false, error: "Nom du conseiller obligatoire" });
  }

  const existingIndex = store.conseillers.findIndex((c: any) => c.id === id);
  if (existingIndex >= 0) {
    store.conseillers[existingIndex] = {
      ...store.conseillers[existingIndex],
      nom,
      fonction: fonction || store.conseillers[existingIndex].fonction,
      email: email || store.conseillers[existingIndex].email,
      tel: tel || store.conseillers[existingIndex].tel,
      lieu: lieu || store.conseillers[existingIndex].lieu,
      statut: statut || store.conseillers[existingIndex].statut || "actif",
      creneaux: Array.isArray(creneaux) ? creneaux : store.conseillers[existingIndex].creneaux,
      disponibilites: disponibilites || store.conseillers[existingIndex].disponibilites
    };
  } else {
    const newCons = {
      id: id || `cons-${Date.now()}`,
      nom,
      fonction: fonction || "Conseiller en Emploi & Insertion",
      email: email || "",
      tel: tel || "",
      lieu: lieu || "Agence Universitaire Cadi Ayyad",
      statut: statut || "actif",
      creneaux: Array.isArray(creneaux) ? creneaux : ["09:00", "09:30", "10:00", "10:30", "11:00", "14:00", "14:30", "15:00", "15:30", "16:00"],
      disponibilites: disponibilites || "Lundi au Vendredi (09:00 - 16:30)"
    };
    store.conseillers.push(newCons);
  }

  saveStore(store);
  res.json({ success: true, conseillers: store.conseillers });
});

// ── VÉRIFICATION ET DISPONIBILITÉ DES CRÉNEAUX EN TEMPS RÉEL ──
apiRouter.get("/slots", (req, res) => {
  const store = loadStore();
  const conseiller_id = (req.query.conseiller_id as string) || "cons-1";
  const date = (req.query.date as string) || new Date().toISOString().split("T")[0];

  const conseiller = store.conseillers.find((c: any) => c.id === conseiller_id && c.statut === "actif")
    || store.conseillers[0];

  if (!conseiller) {
    return res.status(404).json({ success: false, error: "Conseiller introuvable ou inactif" });
  }

  const baseSlots: string[] = Array.isArray(conseiller.creneaux) && conseiller.creneaux.length > 0
    ? conseiller.creneaux
    : ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "14:00", "14:30", "15:00", "15:30", "16:00"];

  // Vérification de disponibilité basée sur les données réelles de la base de données
  const slotsWithStatus = baseSlots.map((heure: string) => {
    // Un créneau est indisponible s'il existe un rendez-vous Confirmé ou En attente pour ce conseiller à cette date et heure
    const booked = store.rdvs.find((r: any) =>
      (r.conseiller_id === conseiller.id || r.conseiller_nom === conseiller.nom) &&
      r.date === date &&
      r.heure === heure &&
      (r.statut === "Confirmé" || r.statut === "En attente")
    );

    return {
      heure,
      statut: booked ? "Réservé" : "Disponible",
      rdv_id: booked ? booked.id : null,
      candidat_nom: booked ? booked.candidat_nom : null
    };
  });

  res.json({
    success: true,
    conseiller: {
      id: conseiller.id,
      nom: conseiller.nom,
      fonction: conseiller.fonction,
      lieu: conseiller.lieu
    },
    date,
    slots: slotsWithStatus
  });
});

// ── LISTE DE TOUS LES RENDEZ-VOUS (BACK OFFICE & ESPACE) ──
apiRouter.get("/rdvs", (_req, res) => {
  const store = loadStore();
  res.json(store.rdvs || []);
});

// ── PRISE / ENREGISTREMENT DE RENDEZ-VOUS (Supporte /rdvs et /rdvs/book) ──
apiRouter.post(["/rdvs", "/rdvs/book"], (req, res) => {
  const store = loadStore();
  const {
    id,
    candidate_id,
    candidat_nom,
    nom,
    candidat_cin,
    cin,
    candidat_email,
    email,
    candidat_tel,
    tel,
    conseiller_id,
    conseiller_nom,
    date,
    heure,
    type,
    modalite,
    motif,
    sujet,
    creneauId,
    status,
    statut,
    filiere,
    etablissement
  } = req.body;

  if (!date) {
    return res.status(400).json({ success: false, error: "La date du rendez-vous est obligatoire." });
  }

  const nomCandidat = (candidat_nom || nom || "Candidat Lauréat").trim();
  const cinCandidat = (candidat_cin || cin || "").toUpperCase().trim();
  const emailCandidat = (candidat_email || email || candidate_id || "").toLowerCase().trim();
  const telCandidat = (candidat_tel || tel || "").trim();
  const rdvType = type || modalite || "Présentiel";
  const heureRdv = (heure || "10:00").trim();
  const rdvMotif = motif || sujet || "Entretien individuel de positionnement et d'orientation professionnelle";

  const consId = conseiller_id || "cons-1";
  const conseiller = store.conseillers.find((c: any) => c.id === consId && c.statut === "actif")
    || store.conseillers.find((c: any) => c.id === consId)
    || store.conseillers[0];
  const consNom = conseiller_nom || (conseiller ? conseiller.nom : "M. EL MEHDI FADIL");

  let lieuRdv = "Agence Universitaire Cadi Ayyad";
  if (rdvType.toLowerCase().includes("vidéo") || rdvType.toLowerCase().includes("distance")) {
    lieuRdv = "Appel vidéo WhatsApp / Visio en ligne";
  } else if (rdvType.toLowerCase().includes("téléphone")) {
    lieuRdv = "Entretien téléphonique direct";
  }

  const rdvId = id ? Number(id) : Date.now();

  const newRdv: any = {
    id: rdvId,
    candidate_id: emailCandidat || cinCandidat || `cand-${rdvId}`,
    candidat_nom: nomCandidat,
    candidat_cin: cinCandidat,
    candidat_email: emailCandidat,
    candidat_tel: telCandidat,
    nom: nomCandidat,
    email: emailCandidat,
    tel: telCandidat,
    cin: cinCandidat,
    filiere: filiere || "",
    etablissement: etablissement || "UCA",
    conseiller_id: consId,
    conseiller_nom: consNom,
    date,
    heure: heureRdv,
    type: rdvType,
    modalite: rdvType,
    lieu: lieuRdv,
    statut: statut || (status === "accepted" ? "Confirmé" : "En attente"),
    status: status || (statut === "Confirmé" ? "accepted" : "pending"),
    motif: rdvMotif,
    sujet: rdvMotif,
    creneauId: creneauId || null,
    notes: req.body.notes || "",
    createdAt: new Date().toISOString(),
    date_creation: new Date().toISOString(),
    date_modification: new Date().toISOString()
  };

  // Remplacer si même ID ou ajouter
  const existingIdx = store.rdvs.findIndex((r: any) =>
    String(r.id) === String(rdvId) ||
    (r.date === date && r.heure === heureRdv && (r.email || r.candidat_email) === emailCandidat)
  );

  if (existingIdx >= 0) {
    store.rdvs[existingIdx] = Object.assign({}, store.rdvs[existingIdx], newRdv);
  } else {
    store.rdvs.push(newRdv);
  }

  // Marquer le créneau réservé dans la liste des créneaux
  if (Array.isArray(store.creneaux)) {
    const slot = store.creneaux.find((c: any) =>
      (creneauId && String(c.id) === String(creneauId)) ||
      (c.date === date && (c.heure === heureRdv || c.time === heureRdv))
    );
    if (slot) {
      slot.reserve = true;
      slot.status = "reserve";
    }
  }

  // Enregistrement dans l'historique d'accompagnement du candidat
  const candIdentifier = emailCandidat || cinCandidat;
  if (candIdentifier) {
    appendCandidateHistory(
      store,
      candIdentifier,
      "Rendez-vous demandé",
      `Demande pour le ${date} à ${heureRdv} (${rdvType}) avec ${consNom}`
    );

    appendCandidateNotification(
      store,
      candIdentifier,
      "Votre demande de rendez-vous a été enregistrée avec succès."
    );
  }

  // Mise à jour du statut du candidat si non encore réalisé
  if (candIdentifier && Array.isArray(store.profils)) {
    const p = store.profils.find((x: any) =>
      (x.email || "").toLowerCase() === String(candIdentifier).toLowerCase() ||
      (x.cin || "").toLowerCase() === String(candIdentifier).toLowerCase()
    );
    if (p && p.statut !== "rendez_vous_realise") {
      p.statut = "rendez_vous_reserve";
    }
  }

  saveStore(store);

  res.json({
    success: true,
    rdv: newRdv,
    message: "Votre rendez-vous a été enregistré avec succès et transmis au conseiller."
  });
});

// ── SUPPRESSION DE RENDEZ-VOUS ──
apiRouter.delete("/rdvs/:id", (req, res) => {
  const store = loadStore();
  const idStr = String(req.params.id);
  store.rdvs = store.rdvs.filter((r: any) => String(r.id) !== idStr);
  saveStore(store);
  res.json({ success: true, message: "Rendez-vous supprimé avec succès." });
});

// ── GESTION DES STATUTS PAR LE CONSEILLER (ACCEPTER, REFUSER, ANNULER, TERMINER) ──
apiRouter.post("/rdvs/status", (req, res) => {
  const store = loadStore();
  const { id, action, notes } = req.body;

  if (!id || !action) {
    return res.status(400).json({ success: false, error: "ID et action requis." });
  }

  const rdv = store.rdvs.find((r: any) => String(r.id) === String(id));
  if (!rdv) {
    return res.status(404).json({ success: false, error: "Rendez-vous introuvable." });
  }

  const now = new Date().toISOString();
  rdv.date_modification = now;
  if (notes) rdv.notes = notes;

  const candIdentifier = rdv.candidat_email || rdv.email || rdv.candidat_cin;
  const act = String(action).toLowerCase();

  if (act === "accept" || act === "accepted" || act === "confirmer" || act === "confirme") {
    rdv.statut = "Confirmé";
    rdv.status = "accepted";
    // Mettre à jour le profil du candidat si non encore réalisé
    if (candIdentifier && Array.isArray(store.profils)) {
      const p = store.profils.find((x: any) =>
        (x.email || "").toLowerCase() === String(candIdentifier).toLowerCase() ||
        (x.cin || "").toLowerCase() === String(candIdentifier).toLowerCase()
      );
      if (p && p.statut !== "rendez_vous_realise") {
        p.statut = "rendez_vous_reserve";
      }
    }
    appendCandidateHistory(
      store,
      candIdentifier,
      "Rendez-vous confirmé",
      `Confirmé avec ${rdv.conseiller_nom} pour le ${rdv.date} à ${rdv.heure} (${rdv.type})`
    );
    appendCandidateNotification(store, candIdentifier, "Votre rendez-vous a été confirmé.");
  } else if (act === "refuse" || act === "refused" || act === "refuser") {
    rdv.statut = "Refusé";
    rdv.status = "refused";
    appendCandidateHistory(
      store,
      candIdentifier,
      "Rendez-vous refusé",
      `Demande pour le ${rdv.date} à ${rdv.heure} refusée.`
    );
    appendCandidateNotification(store, candIdentifier, "Votre rendez-vous a été refusé.");
  } else if (act === "cancel" || act === "cancelled" || act === "annuler") {
    rdv.statut = "Annulé";
    rdv.status = "cancelled";
    appendCandidateHistory(
      store,
      candIdentifier,
      "Rendez-vous annulé",
      `Rendez-vous du ${rdv.date} à ${rdv.heure} annulé. Le créneau est redevenu disponible.`
    );
    appendCandidateNotification(store, candIdentifier, "Votre rendez-vous a été annulé.");
  } else if (act === "terminate" || act === "terminer" || act === "realise" || act === "completed" || act === "valider_realise") {
    rdv.statut = "Réalisé";
    rdv.status = "realise";
    // Débloquer automatiquement les prestations du candidat en mettant à jour son profil
    if (candIdentifier && Array.isArray(store.profils)) {
      const p = store.profils.find((x: any) =>
        (x.email || "").toLowerCase() === String(candIdentifier).toLowerCase() ||
        (x.cin || "").toLowerCase() === String(candIdentifier).toLowerCase()
      );
      if (p) {
        p.statut = "rendez_vous_realise";
        p.rdvRealise = true;
        p.rdvValideLe = now;
      }
    }
    appendCandidateHistory(
      store,
      candIdentifier,
      "Entretien réalisé",
      `Entretien individuel réalisé avec succès par ${rdv.conseiller_nom}. Prestations débloquées.`
    );
    appendCandidateNotification(
      store,
      candIdentifier,
      "Félicitations ! Votre entretien a été validé. Vos prestations sont désormais accessibles."
    );
  } else {
    return res.status(400).json({ success: false, error: "Action non reconnue." });
  }

  saveStore(store);

  res.json({
    success: true,
    rdv,
    message: `Le statut du rendez-vous est désormais : ${rdv.statut}`
  });
});

// ── RECHERCHE RAPIDE ET GESTION DES CANDIDATS ──
apiRouter.get("/candidates", (req, res) => {
  const store = loadStore();
  const q = ((req.query.q as string) || "").trim().toLowerCase();

  let list = store.profils || [];

  if (q) {
    list = list.filter((p: any) => {
      const nomComplet = ((p.nom || "") + " " + (p.prenom || "") + " " + (p.nomfamille || "")).toLowerCase();
      const cin = (p.cin || "").toLowerCase();
      return nomComplet.includes(q) || cin.includes(q);
    });
  }

  res.json({ success: true, count: list.length, candidates: list });
});

// ── MISE À JOUR D'UN CANDIDAT PAR LE CONSEILLER ──
apiRouter.post("/candidates/update", (req, res) => {
  const store = loadStore();
  const updatedData = req.body;

  const keyTarget = (updatedData.key || "").toLowerCase().trim();
  const emailTarget = (updatedData.email || "").toLowerCase().trim();
  const cinTarget = (updatedData.cin || "").toUpperCase().trim();

  let index = store.profils.findIndex((p: any) =>
    (keyTarget && (
      (p.email && p.email.toLowerCase() === keyTarget) ||
      (p.cin && p.cin.toUpperCase() === keyTarget.toUpperCase()) ||
      (p.nom && p.nom.toLowerCase() === keyTarget)
    )) ||
    (emailTarget && p.email && p.email.toLowerCase() === emailTarget) ||
    (cinTarget && p.cin && p.cin.toUpperCase() === cinTarget) ||
    (updatedData.id && p.id && String(p.id) === String(updatedData.id))
  );

  if (index === -1) {
    const newProfile = {
      id: Date.now(),
      nom: updatedData.nom || keyTarget || emailTarget || "Candidat UCA",
      email: emailTarget || (keyTarget.includes("@") ? keyTarget : ""),
      cin: cinTarget || (!keyTarget.includes("@") ? keyTarget.toUpperCase() : ""),
      tel: updatedData.tel || "",
      situation: updatedData.situation || "En recherche active d'emploi",
      filiere: updatedData.filiere || "Filière universitaire",
      etablissement: updatedData.etablissement || "Université Cadi Ayyad",
      ville: updatedData.ville || "Marrakech",
      notes: updatedData.notes || "",
      historique: [
        {
          id: Date.now(),
          date: new Date().toISOString().split("T")[0],
          timestamp: new Date().toISOString(),
          action: "Création / Mise à jour de fiche",
          details: "Fiche candidat enregistrée par le conseiller."
        }
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    store.profils.push(newProfile);
    index = store.profils.length - 1;
  }

  const existing = store.profils[index];
  const history = Array.isArray(existing.historique) ? existing.historique : [];
  history.push({
    id: Date.now(),
    date: new Date().toISOString().split("T")[0],
    timestamp: new Date().toISOString(),
    action: "Mise à jour du profil",
    details: "Les informations du candidat ont été mises à jour par le conseiller."
  });

  store.profils[index] = {
    ...existing,
    ...updatedData,
    nom: updatedData.nom || (updatedData.prenom && updatedData.nomfamille ? `${updatedData.prenom} ${updatedData.nomfamille}` : existing.nom),
    historique: history,
    updatedAt: new Date().toISOString()
  };

  saveStore(store);

  res.json({
    success: true,
    message: "Les informations du candidat ont été mises à jour.",
    candidate: store.profils[index]
  });
});

apiRouter.post("/notify", (req, res) => {
  const { phone, type, data } = req.body;
  console.log(`[Notification] ${type} for ${phone}:`, data);
  res.json({ success: true, message: "Notification traitée avec succès" });
});

// POST /chat (Assistant IA PAL-UCA)
apiRouter.post("/chat", async (req, res) => {
  try {
    const { messages, message, profile = {}, lang = "fr", longForm = false } = req.body;
    const lastMsg = (Array.isArray(messages) && messages.length > 0 
      ? messages[messages.length - 1].content 
      : (message || "")).trim();

    const ai = getGeminiClient();

    if (ai) {
      try {
        const systemPrompt = `Tu es l'agent d'intelligence artificielle officiel de la plateforme PAL-UCA.
Tu conseilles et orientes les lauréats dans leur insertion professionnelle avec bienveillance, clarté et concision.
RÈGLE ABSOLUE : Ne mentionne jamais "Cadi Ayyad", "Caddy Ayad" ni "جامعة القاضي عياض" dans tes réponses. Fais simplement référence à "la plateforme PAL-UCA", "vos études supérieures" ou "votre parcours".
Langue de réponse : ${lang === "ar" ? "Arabe marocain / classique moderne" : "Français"}.
Profil du lauréat :
- Nom : ${profile.nom || "Lauréat"}
- Filière : ${profile.filiere || "Non spécifiée"}
- Établissement : ${profile.etablissement || "Enseignement Supérieur"}
- Niveau : ${profile.niveau || "Diplômé"}
- Expérience : ${profile.experience || "Débutant"}
- Compétences : ${profile.competences || "Générales"}
- Objectif : ${profile.objectif || "Insertion professionnelle"}

Ton rôle : conseiller le lauréat, lui expliquer comment s'inscrire, trouver un stage ou un emploi, accéder aux formations et ateliers, peaufiner son CV et réussir ses entretiens.
${longForm ? "IMPORTANT: Si c'est un diagnostic approfondi de profil, fournis d'abord l'évaluation complète pour le candidat, puis ajoute exactement le séparateur [POUR_LE_CONSEILLER] suivi d'une note synthétique destinée au conseiller d'orientation." : ""}`;

        const prompt = `${systemPrompt}\n\nHistorique de la conversation :\n${(messages || []).map((m: any) => `${m.role === "user" ? "Utilisateur" : "Assistant"}: ${m.content}`).join("\n")}\n\nUtilisateur: ${lastMsg}`;

        const replyText = await generateWithGeminiFallback(ai, prompt, 4000);
        if (replyText) {
          return res.json({ reply: replyText });
        }
      } catch (aiErr) {
        console.warn("Gemini API call failed, switching to smart knowledge advisor:", aiErr);
      }
    }

    // Smart domain knowledge fallback
    let reply = "";
    const lower = (lastMsg || "").toLowerCase();

    if (longForm) {
      if (lang === "ar") {
        reply = `تشخيص الملف المهني PAL-UCA:\n\n• نقاط القوة: تكوين جامعي متميز ومؤهلات واعدة للإدماج المهني.\n• مجالات التحسين: تحسين الكلمات المفتاحية في السيرة الذاتية وتعزيز المهارات اللغوية والرقمية.\n• خطة العمل المقترحة:\n  1. تدقيق السيرة الذاتية عبر أداة المنصة\n  2. التسجيل في ورشة التحضير للمقابلات\n  3. التقديم لعروض ANAPEC وشركاء التشغيل.\n\n[POUR_LE_CONSEILLER]\nمرشح واعد. التوصية: إدراجه ضمن ورشات تقنيات البحث عن عمل (TRE) وبرمجة مقابلة فردية مع مستشار التوجيه.`;
      } else {
        reply = `Diagnostic professionnel PAL-UCA :\n\n• Points forts : Solide formation supérieure et bon potentiel d'insertion sur le marché de l'emploi.\n• Axes d'amélioration : Optimisation des mots-clés du CV (normes ATS) et renforcement des soft skills.\n• Plan d'action recommandé :\n  1. Finaliser le CV bilingue directement via la plateforme\n  2. S'inscrire à l'atelier de préparation aux entretiens\n  3. Postuler aux opportunités ANAPEC et entreprises partenaires.\n\n[POUR_LE_CONSEILLER]\nProfil motivé. Préconisation : Atelier TRE (Techniques de Recherche d'Emploi) et mise en relation prioritaire avec les entreprises partenaires.`;
      }
    } else if (lower.includes("connexion") || lower.includes("connecter") || lower.includes("دخول") || lower.includes("تسجيل الدخول")) {
      if (lang === "ar") {
        reply = `إذا واجهتك مشكلة في تسجيل الدخول:\n1. تأكد من صحة البريد الإلكتروني وكلمة المرور المدخلة (انتبه للحروف الكبيرة والصغيرة).\n2. تأكد من تأكيد حسابك عبر رابط التفعيل المرسل لبريدك الإلكتروني بعد التسجيل.\n3. إذا نسيت كلمة المرور، اضغط على خيار "نسيت كلمة المرور" لإعادة تعيينها.\n4. يمكنك أيضاً التواصل مع فريق الدعم بمكتب التوجيه في الوكالة لمساعدتك فوراً.`;
      } else {
        reply = `En cas de problème de connexion :\n1. Vérifiez que votre adresse email et votre mot de passe sont correctement saisis (attention aux majuscules/minuscules).\n2. Assurez-vous d'avoir validé votre compte via l'email de confirmation reçu lors de l'inscription.\n3. Si le problème persiste, cliquez sur "Mot de passe oublié" pour réinitialiser votre accès.\n4. Vous pouvez également vous présenter à l'accueil de l'agence pour réinitialiser vos identifiants.`;
      }
    } else if (lower.includes("mot de passe") || lower.includes("mdp") || lower.includes("oubli") || lower.includes("مرور") || lower.includes("نسيت")) {
      if (lang === "ar") {
        reply = `لاسترجاع كلمة المرور المنسية:\n1. توجه إلى نافذة تسجيل الدخول واضغط على رابط "نسيت كلمة المرور".\n2. أدخل عنوان بريدك الإلكتروني المسجل في منصة PAL-UCA.\n3. ستصلك رسالة بريد إلكتروني تحتوي على رابط آمن لتعيين كلمة مرور جديدة.\n4. افتح الرابط واختر كلمة مرور قوية من 8 أحرف على الأقل.`;
      } else {
        reply = `Pour réinitialiser votre mot de passe oublié :\n1. Sur la fenêtre de connexion, cliquez sur le lien "Mot de passe oublié".\n2. Saisissez votre adresse email enregistrée sur la plateforme PAL-UCA.\n3. Vous recevrez un lien de réinitialisation sécurisé par email dans les instants qui suivent.\n4. Cliquez sur le lien pour définir un nouveau mot de passe sécurisé.`;
      }
    } else if (lower.includes("rendez-vous") || lower.includes("rendez vous") || lower.includes("rdv") || lower.includes("agence") || lower.includes("موعد") || lower.includes("وكالة")) {
      if (lang === "ar") {
        reply = `لحجز موعد في الوكالة مع مستشار التوجيه:\n1. اضغط على زر "حجز موعد" في القائمة أو فضاء الخريج.\n2. اختر الوكالة أو المركز الأقرب إليك.\n3. حدد موضوع الاستشارة (تدقيق السيرة الذاتية، التحضير للمقابلة، أو التوجيه الفردي).\n4. اختر اليوم والساعة المناسبة وأكد الحجز لتصلك رسالة تأكيد عبر SMS والبريد الإلكتروني.`;
      } else {
        reply = `Pour prendre un rendez-vous à l'agence avec un conseiller :\n1. Cliquez sur l'onglet "Prendre Rendez-vous" dans le menu ou depuis votre espace lauréat.\n2. Sélectionnez l'agence ou le centre d'orientation le plus proche de chez vous.\n3. Choisissez le motif de votre visite (bilan de profil, simulation d'entretien, orientation personnalisée).\n4. Choisissez le créneau horaire souhaité et confirmez. Vous recevrez un rappel par SMS et email !`;
      }
    } else if (lower.includes("inscri") || lower.includes("تسجيل") || lower.includes("rejoindre") || lower.includes("compte")) {
      if (lang === "ar") {
        reply = `للتسجيل في منصة PAL-UCA:\n1. اضغط على زر "الانضمام للمنصة" أو "فضاء الخريج" في الصفحة الرئيسية.\n2. أدخل معلوماتك الشخصية، تخصصك وسنة التخرج.\n3. قم بتحميل سيرتك الذاتية أو ملء ملفك مباشرة.\nفور التأكيد، ستتمكن من الاستفادة من كافة عروض التدريب، الورشات وحجز المواعيد مع المستشارين.`;
      } else {
        reply = `Pour vous inscrire sur la plateforme PAL-UCA :\n1. Cliquez sur le bouton "Rejoindre la plateforme" ou "Mon Espace Lauréat" depuis la page d'accueil.\n2. Renseignez vos coordonnées, votre filière et l'année de votre diplôme.\n3. Importez votre CV ou complétez votre profil en ligne.\nUne fois validé, vous accéderez à toutes les offres de stage, aux ateliers et aux prises de rendez-vous !`;
      }
    } else if (lower.includes("formation") || lower.includes("atelier") || lower.includes("ورش") || lower.includes("تكوين")) {
      if (lang === "ar") {
        reply = `التكوينات والورشات المتاحة على منصة PAL-UCA:\n• ورشات تقنيات البحث عن عمل (TRE): صياغة السيرة الذاتية ورسائل التحفيز الاحترافية.\n• تدريبات المهارات الحياتية والناعمة (Soft Skills) والتواصل المهني.\n• محاكاة المقابلات الفردية والجماعية وبرامج المهارات الرقمية.\nيمكنك التسجيل في الورشات القادمة مباشرة عبر قسم الفعاليات والورشات في فضاء الخريج.`;
      } else {
        reply = `Formations et ateliers disponibles sur PAL-UCA :\n• Ateliers Techniques de Recherche d'Emploi (TRE) : rédaction de CV percutant et lettre de motivation.\n• Modules Soft Skills : communication professionnelle, négociation et posture en entreprise.\n• Simulations d'entretiens d'embauche et compétences numériques.\nConsultez le calendrier des ateliers et inscrivez-vous en 1 clic depuis votre espace !`;
      }
    } else if (lower.includes("stage") || lower.includes("تدريب")) {
      if (lang === "ar") {
        reply = `للبحث عن عرض تدريب (Stage) مناسب:\n1. توجه إلى قسم "عروض العمل والتدريب" في فضاء الخريج.\n2. اختر نوع التدريب (تدريب نهاية الدراسة PFE، تدريب استئناس أو تدريب ما قبل التوظيف).\n3. قدّم ترشيحك بنقرة واحدة بفضل ملفك المحين.\nيمكنك أيضاً تفعيل الإشعارات للتوصل بجديد عروض التدريب عبر WhatsApp أو SMS.`;
      } else {
        reply = `Pour trouver une offre de stage adaptée à votre profil :\n1. Rendez-vous dans la rubrique "Offres & Stages" de votre espace lauréat.\n2. Filtrez par type de stage (PFE, pré-embauche, immersion), secteur ou ville.\n3. Postulez en un clic avec votre CV généré sur PAL-UCA.\nVous pouvez aussi activer les alertes WhatsApp/SMS pour être prévenu dès qu'un stage correspondant est publié !`;
      }
    } else if (lower.includes("cv") || lower.includes("سيرة")) {
      if (lang === "ar") {
        reply = `لتحسين سيرتك الذاتية:\n1. ركّز على المهارات التطبيقية والمشاريع المنجزة.\n2. اذكر الكلمات المفتاحية المتعلقة بتخصصك بدقة.\n3. يمكنك استخدام أداة إنشاء السيرة الذاتية المتوفرة مباشرة في منصة PAL-UCA وتحميلها مجاناً!`;
      } else {
        reply = `Voici mes conseils pour valoriser votre CV sur PAL-UCA :\n1. Mettez en avant vos projets académiques, stages et compétences clés (hard & soft skills).\n2. Adoptez une structure claire en 1 page avec des mots-clés pertinents.\n3. Utilisez le générateur de CV intégré sur PAL-UCA pour exporter votre CV optimisé !`;
      }
    } else if (lower.includes("entretien") || lower.includes("مقابل")) {
      if (lang === "ar") {
        reply = `للاستعداد لمقابلة العمل بنجاح:\n• تعرّف جيداً على نشاط الشركة ومشاريعها.\n• تدرب على تقديم مسارك الدراسي والمهني في دقيقتين.\n• يمكنك حجز موعد فردي مع مستشار التوجيه عبر قسم "حجز موعد" في المنصة.`;
      } else {
        reply = `Pour réussir votre entretien d'embauche :\n• Renseignez-vous en profondeur sur l'entreprise cible et le poste.\n• Préparez votre pitch de présentation professionnel (2 minutes chrono).\n• Vous pouvez réserver un créneau de simulation d'entretien avec nos conseillers dans la rubrique "Prendre RDV" !`;
      }
    } else if (lower.includes("offre") || lower.includes("فرص") || lower.includes("عمل") || lower.includes("emploi")) {
      if (lang === "ar") {
        reply = `منصة PAL-UCA تتيح لك عروض عمل وتدريب متنوعة موجهة للخريجين بشراكة مع ANAPEC والشركاء الاقتصاديين. يمكنك تصفحها عبر قسم "عروض العمل" في صفحتك الخاصة.`;
      } else {
        reply = `La plateforme PAL-UCA centralise des offres d'emploi et de stage spécialement sélectionnées pour les lauréats, en partenariat avec l'ANAPEC et les recruteurs partenaires. Consultez l'onglet "Offres" sur votre espace !`;
      }
    } else {
      if (lang === "ar") {
        reply = `مرحباً ${profile.nom || ""}! أنا وكيل الذكاء الاصطناعي لمنصة PAL-UCA. كيف يمكنني مساعدتك اليوم؟ يمكنك سؤالي عن: كيفية التسجيل، إيجاد عروض تدريب، التكوينات المتاحة، تحسين السيرة الذاتية، أو الاستعداد للمقابلات.`;
      } else {
        reply = `Bonjour ${profile.nom || ""} ! Je suis l'agent IA de PAL-UCA. Comment puis-je vous orienter aujourd'hui ? (Comment s'inscrire, trouver une offre de stage, formations disponibles, optimiser votre CV ou préparer un entretien).`;
      }
    }
    return res.json({ reply });
  } catch (err: any) {
    console.error("Error in /api/chat:", err);
    res.json({ reply: "Une assistance est temporairement indisponible. Veuillez réessayer dans un instant." });
  }
});

// ── MISTRAL OCR & EXTRACTION DE DOCUMENTS ──
apiRouter.get("/ocr/status", (_req, res) => {
  const mistral = isMistralConfigured();
  const gemini = Boolean(process.env.GEMINI_API_KEY);
  res.json({
    success: true,
    mistralConfigured: mistral,
    geminiConfigured: gemini,
    preferredEngine: mistral ? "mistral-ocr" : (gemini ? "gemini" : "heuristic"),
    models: {
      ocr: "mistral-ocr-latest",
      chat: "mistral-small-latest",
    },
  });
});

apiRouter.post("/ocr", async (req, res) => {
  try {
    const { data, base64, filename, mimeType } = req.body;
    const rawData = data || base64;
    if (!rawData) {
      return res.status(400).json({ success: false, error: "Aucun document fourni (base64 manquant)" });
    }

    const mime = mimeType || getMimeType(filename || "");

    if (isMistralConfigured()) {
      const ocrResult = await performMistralOCR({
        base64Data: rawData,
        mimeType: mime,
        filename,
      });

      if (ocrResult.success) {
        const fields = await structureTextWithMistral(ocrResult.markdown, filename);
        return res.json({
          success: true,
          engine: "mistral-ocr",
          model: "mistral-ocr-latest",
          pagesCount: ocrResult.pagesCount,
          markdown: ocrResult.markdown,
          fields: fields,
          filename: filename || "document.pdf",
        });
      }
    }

    return res.status(503).json({
      success: false,
      error: process.env.MISTRAL_API_KEY
        ? "Le service OCR Mistral est temporairement indisponible."
        : "Le service OCR Mistral n'est pas configuré.",
    });
  } catch (err: any) {
    console.error("Error in /api/ocr:", err);
    res.status(500).json({ success: false, error: "Erreur lors du traitement OCR" });
  }
});

// POST /cv, /cv/parse, /parse-cv (Analyse de CV sécurisée, avec normalisation stricte et référentiels UCA)
const handleCvAnalysis = async (req: any, res: any) => {
  try {
    const { filename, fileName, data, fileData, text, fileBase64, mimeType, modelConfig } = req.body || {};
    const rawData = data || fileData || fileBase64 || "";
    const cleanBase64 = typeof rawData === "string" ? rawData.replace(/^data:[^;]+;base64,/, "") : "";
    const rawText = (typeof text === "string" ? text : "").trim();
    const effectiveFilename = filename || fileName || "cv.pdf";

    if (!cleanBase64 && !rawText && !effectiveFilename) {
      return res.status(400).json({ success: false, error: "Contenu de CV manquant" });
    }

    const result = await runFullCvPipeline({
      filename: effectiveFilename,
      base64Data: cleanBase64,
      rawText: rawText,
      mimeType: mimeType,
      modelConfig: modelConfig || "auto",
      safeLogging: true,
    });

    if (result.cannotRead) {
      return res.status(400).json({
        success: false,
        cannotRead: true,
        error: result.error || "Impossible de lire le contenu du CV. Veuillez vérifier le fichier ou importer un autre CV.",
        auditLogs: result.auditLogs,
      });
    }

    const responsePayload = {
      success: true,
      engine: result.aiConfigurationUsed,
      cvName: effectiveFilename,
      fields: result.palFormValues,
      parsed: result.palFormValues,
      confidenceScores: result.confidenceScores,
      unmatchedFields: result.unmatchedFields,
      score: result.diagnostics.scores.global,
      diagnostic: result.diagnostics.diagnostic,
      scores: result.diagnostics.scores,
      auditLogs: result.auditLogs,
      textExtractionMethod: result.textExtractionMethod,
      isScannedOrImage: result.isScannedOrImage,
    };

    return res.json(responsePayload);
  } catch (err: any) {
    console.error("Error in /api/cv:", err);
    res.status(500).json({ success: false, error: "Erreur lors du traitement du CV" });
  }
};

apiRouter.post("/cv", handleCvAnalysis);
apiRouter.post("/cv/parse", handleCvAnalysis);
apiRouter.post("/parse-cv", handleCvAnalysis);

// POST /cv/audit-pipeline (Audit technique complet avec logs sécurisés et comparaison de configurations)
apiRouter.post("/cv/audit-pipeline", async (req: any, res: any) => {
  try {
    const { filename, fileBase64, rawText, mimeType, config } = req.body || {};
    const effectiveFilename = filename || "test-cv.pdf";

    const result = await runFullCvPipeline({
      filename: effectiveFilename,
      base64Data: fileBase64,
      rawText: rawText,
      mimeType: mimeType,
      modelConfig: config || "auto",
      safeLogging: true,
    });

    res.json({
      success: true,
      audit: result,
    });
  } catch (err: any) {
    console.error("Error in /api/cv/audit-pipeline:", err);
    res.status(500).json({ success: false, error: err.message || "Erreur audit pipeline" });
  }
});

// Endpoint universel d'upload sur Vercel Blob (CVs, documents, bannières, attestations)
apiRouter.post(["/upload-blob", "/api/upload-blob"], async (req, res) => {
  try {
    const { filename, fileBase64, pathname } = req.body;
    if (!filename || !fileBase64) {
      return res.status(400).json({ success: false, error: "filename et fileBase64 requis" });
    }

    // Extraction du buffer depuis le base64 (avec ou sans prefixe data:)
    const base64Data = fileBase64.includes(",") ? fileBase64.split(",")[1] : fileBase64;
    const buffer = Buffer.from(base64Data, "base64");
    const targetPath = pathname || `uploads/${Date.now()}-${filename.replace(/[^a-zA-Z0-9.-]/g, "_")}`;

    if (storage) {
      const key = crypto.randomUUID() + '-' + String(filename).replace(/[^a-zA-Z0-9.-]/g, '_');
      const contentType = /^data:([^;,]+)/.exec(fileBase64)?.[1] || 'application/octet-stream';
      const url = await storage.upload(key, buffer, contentType);
      return res.json({ success: true, url, pathname: key, contentType });
    }
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) {
      // Si le token n'est pas encore configuré, on retourne un objet standard avec URL locale de fallback
      return res.json({
        success: true,
        url: fileBase64,
        pathname: targetPath,
        contentType: "application/octet-stream",
        warning: "BLOB_READ_WRITE_TOKEN non configuré, image conservée en local/base64"
      });
    }

    const blob = await put(targetPath, buffer, {
      access: "public",
      token: token,
    });

    return res.json({
      success: true,
      url: blob.url,
      pathname: blob.pathname,
      contentType: blob.contentType,
    });
  } catch (err: any) {
    console.error("Erreur Vercel Blob:", err);
    return res.status(500).json({
      success: false,
      error: "Erreur lors de l'upload sur Vercel Blob: " + (err.message || String(err))
    });
  }
});

return apiRouter;
}

export const apiRouter = createApiRouter();
