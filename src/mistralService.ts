/**
 * Service d'intégration Mistral AI pour PAL-UCA
 * Supporte Mistral OCR (mistral-ocr-latest) pour l'analyse et l'extraction
 * de CVs, diplômes et documents administratifs.
 */

export interface ParsedCvFields {
  nomfamille?: string;
  prenom?: string;
  nom?: string;
  cin?: string;
  naissance?: string;
  email?: string;
  tel?: string;
  ville?: string;
  adresse?: string;
  niveau?: string;
  filiere?: string;
  etablissement?: string;
  anneeDiplome?: string | number;
  experience?: string;
  experienceDetail?: string;
  expPoste?: string;
  expEntreprise?: string;
  expDebut?: string;
  expFin?: string;
  competences?: string;
  langues?: string;
  langFr?: string;
  langEn?: string;
  langAr?: string;
  autresDiplomes?: string;
  objectif?: string;
}

let mistralRateLimitCooldownUntil = 0;

export function getMistralApiKey(): string {
  return (process.env.MISTRAL_API_KEY || "").trim();
}

export function isMistralConfigured(): boolean {
  return getMistralApiKey().length > 0 && Date.now() > mistralRateLimitCooldownUntil;
}

export function isMistralAvailable(): boolean {
  return isMistralConfigured();
}

/**
 * Détermine le type MIME approprié en fonction du nom de fichier ou des données
 */
export function getMimeType(filename: string = "", defaultMime: string = "application/pdf"): string {
  const fn = filename.toLowerCase();
  if (fn.endsWith(".pdf")) return "application/pdf";
  if (fn.endsWith(".png")) return "image/png";
  if (fn.endsWith(".jpg") || fn.endsWith(".jpeg")) return "image/jpeg";
  if (fn.endsWith(".webp")) return "image/webp";
  if (fn.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return defaultMime;
}

/**
 * Appelle l'API Mistral OCR (mistral-ocr-latest)
 */
export async function performMistralOCR(options: {
  base64Data: string;
  mimeType?: string;
  filename?: string;
}): Promise<{
  success: boolean;
  markdown: string;
  pagesCount: number;
  pages?: any[];
  error?: string;
}> {
  if (Date.now() <= mistralRateLimitCooldownUntil) {
    return {
      success: false,
      markdown: "",
      pagesCount: 0,
      error: "Mistral temporairement indisponible (rate limit en cours de refroidissement)",
    };
  }

  const apiKey = getMistralApiKey();
  if (!apiKey) {
    return {
      success: false,
      markdown: "",
      pagesCount: 0,
      error: "MISTRAL_API_KEY non configurée",
    };
  }

  const mime = options.mimeType || getMimeType(options.filename || "");
  const cleanBase64 = options.base64Data.replace(/^data:[^;]+;base64,/, "");
  const dataUri = `data:${mime};base64,${cleanBase64}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetch("https://api.mistral.ai/v1/ocr", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "mistral-ocr-latest",
        document: {
          type: "document_url",
          document_url: dataUri,
        },
      }),
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 429) {
        // Enregistrer une pause de 60s pour basculer directement sur Gemini sans re-spammer l'API
        mistralRateLimitCooldownUntil = Date.now() + 60000;
        console.log("[Mistral OCR] Rate limit 429 atteint, bascule automatique et fluide sur Gemini...");
        return {
          success: false,
          markdown: "",
          pagesCount: 0,
          error: "Rate limit Mistral 429 (bascule Gemini)",
        };
      }
      return {
        success: false,
        markdown: "",
        pagesCount: 0,
        error: `Erreur Mistral OCR HTTP ${response.status}`,
      };
    }

    const data: any = await response.json();
    const pages = Array.isArray(data.pages) ? data.pages : [];
    const combinedMarkdown = pages.map((p: any) => p.markdown || "").filter(Boolean).join("\n\n---\n\n");

    return {
      success: true,
      markdown: combinedMarkdown,
      pagesCount: pages.length,
      pages: pages,
    };
  } catch (err: any) {
    console.warn("[Mistral OCR] Erreur réseau ou traitement:", err.message || err);
    return {
      success: false,
      markdown: "",
      pagesCount: 0,
      error: err.message || "Erreur lors de l'appel Mistral OCR",
    };
  }
}

/**
 * Heuristique locale stricte : n'extrait QUE ce qui est explicitement présent dans le texte
 * RÈGLE ABSOLUE : Si une information n'est pas présente, retourner null / vide. Ne jamais inventer !
 */
export function extractHeuristicFields(text: string, filename: string = ""): ParsedCvFields {
  const clean = text || "";
  const fields: ParsedCvFields = {};

  // Email
  const emailMatch = clean.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (emailMatch) {
    fields.email = emailMatch[1].trim().toLowerCase();
  }

  // Téléphone (formats marocains et internationaux)
  const telMatch = clean.match(/(?:\+|00)212[\s().-]*[567](?:[\s().-]*\d){8}|0[567](?:[\s().-]*\d){8}/);
  if (telMatch) {
    fields.tel = telMatch[0].replace(/[\s.-]/g, "");
  }

  // CIN Marocaine (ex: EE123456, AB654321, JA12345)
  const cinMatch = clean.match(/\b([A-Z]{1,2}\s*\d{4,7})\b/i);
  if (cinMatch) {
    fields.cin = cinMatch[1].replace(/\s+/g, "").toUpperCase();
  }

  // Année de diplôme uniquement si le texte la relie explicitement au diplôme.
  const anneeMatch = clean.match(/(?:ann[ée]e(?: d'obtention)?|obtention|dipl[oô]m[ée]e?|promotion|graduation|laur[ée]at(?:e)?|سنة التخرج)[^\n\r\d]{0,40}(20\d{2})/i);
  if (anneeMatch) {
    fields.anneeDiplome = anneeMatch[1];
  } else {
    const studyPeriod = clean.split(/[\r\n]+/)
      .filter(line => /formation|dipl[oô]me|master|licence|doctorat|ing[ée]nieur|bac\s*\+\s*\d|parcours acad[ée]mique|التكوين|إجازة|ماستر|دكتوراه/i.test(line))
      .join("\n")
      .match(/\b20\d{2}\s*[-–]\s*(20\d{2})\b/);
    if (studyPeriod) fields.anneeDiplome = studyPeriod[1];
  }

  // Date de naissance (format AAAA-MM-JJ ou JJ/MM/AAAA) - Strict, jamais d'estimation !
  const birthMatch = clean.match(/(?:n[ée]\(?e?\)?\s*(?:le)?|naissance|birth|تاريخ الازدياد)\s*[:\-]?\s*(\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{4}|\d{4}[\/\.-]\d{1,2}[\/\.-]\d{1,2})/i);
  if (birthMatch) {
    const rawB = birthMatch[1] || birthMatch[0];
    const parts = rawB.split(/[-\/\.]/);
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        fields.naissance = `${parts[0]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
      } else if (parts[2].length === 4) {
        fields.naissance = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
      }
    }
  }

  // Ville dans le bloc de coordonnées, avant les rubriques formation et expérience.
  const villes = [
    "Marrakech", "Al Haouz", "Chichaoua", "El Kelâa des Sraghna", "Essaouira", "Rehamna", "Safi", "Youssoufia",
    "Casablanca", "Rabat", "Agadir", "Fès", "Tanger", "Meknès", "Oujda", "Kénitra", "Tétouan", "Béni Mellal",
    "Salé", "Mohammédia", "Nador", "Errachidia", "Ouarzazate", "Dakhla", "Laâyoune"
  ];
  const contactText = clean.split(/(?:formation|education|parcours acad[ée]mique|dipl[oô]me|exp[ée]rience)\s*[:：]?/i)[0];
  for (const v of villes) {
    const reg = new RegExp(`\\b${v}\\b`, "i");
    if (reg.test(contactText)) {
      fields.ville = v;
      break;
    }
  }

  // Adresse de résidence (uniquement si mention explicite)
  const adrMatch = clean.match(/(?:adresse|résidence|demeurant|domicile)\s*[:\-]?\s*([^\n\r,]+(?:,\s*[^\n\r]+)?)/i);
  if (adrMatch && adrMatch[1] && adrMatch[1].trim().length > 3) {
    fields.adresse = adrMatch[1].trim();
  }

  // Établissement UCA (recherche stricte)
  const etabs = [
    { key: "Faculté des Sciences Semlalia (FSSM)", re: /\b(fssm|sciences\s+semlalia|semlalia)\b/i },
    { key: "Faculté des Sciences et Techniques (FST Guéliz)", re: /\b(fstg?|sciences\s+et\s+techniques|fst\s+gu[ée]liz)\b/i },
    { key: "Faculté des Sciences Juridiques, Économiques et Sociales (FSJES)", re: /\b(fsjes|juridiques.*economiques|droit.*economie)\b/i },
    { key: "ENSA Safi", re: /\bensa\s+safi\b/i },
    { key: "École Nationale des Sciences Appliquées (ENSA Marrakech)", re: /\bensa\s+marrakech\b/i },
    { key: "École Nationale de Commerce et de Gestion (ENCG Marrakech)", re: /\b(encg\s+marrakech|encg)\b/i },
    { key: "Faculté des Lettres et des Sciences Humaines (FLSH)", re: /\b(flsh|lettres.*sciences\s+humaines)\b/i },
    { key: "École Normale Supérieure (ENS Marrakech)", re: /\b(ens\s+marrakech|normale\s+superieure)\b/i },
    { key: "Faculté de Médecine et de Pharmacie (FMPM)", re: /\b(fmpm|m[ée]decine|pharmacie)\b/i },
    { key: "École Supérieure de Technologie (EST Essaouira)", re: /\b(est\s+essaouira)\b/i },
    { key: "École Supérieure de Technologie (EST Safi)", re: /\b(est\s+safi)\b/i },
    { key: "École Supérieure de Technologie (EST El Kelâa)", re: /\b(est\s+kel[âa]a|est\s+el\s+kel[âa]a)\b/i },
    { key: "Faculté Polydisciplinaire de Safi (FPS)", re: /\b(fp\s+safi|polydisciplinaire|fps)\b/i },
    { key: "ENSA Safi", re: /\b(ensa\s+safi)\b/i },
  ];
  for (const e of etabs) {
    if (e.re.test(clean)) {
      fields.etablissement = e.key;
      break;
    }
  }

  // Niveau et filière : limiter la recherche aux lignes du parcours académique.
  const educationText = clean.split(/[\r\n]+/)
    .filter(line => /formation|dipl[oô]me|master|licence|doctorat|ing[ée]nieur|bac\s*\+\s*\d|niveau|parcours acad[ée]mique|discipline|sp[ée]cialit[ée]|option|fili[èe]re|التكوين|إجازة|ماستر|دكتوراه|التدبير/i.test(line))
    .join("\n");

  // Niveau d'études (recherche stricte)
  if (/\b(doctorat|phd|chercheur|docteur)\b/i.test(educationText)) {
    fields.niveau = "Doctorat (Bac+8)";
  } else if (/\b(encg)\b/i.test(educationText)) {
    fields.niveau = "Diplôme ENCG (Bac+5)";
  } else if (/\b(ing[ée]nieur(?:e)?|cycle\s+d'ing[ée]nieur)\b/i.test(educationText)) {
    fields.niveau = "Diplôme d'Ingénieur d'État (Bac+5)";
  } else if (/\b(master\s+sp[ée]cialis[ée])\b/i.test(educationText)) {
    fields.niveau = "Master Spécialisé (Bac+5)";
  } else if (/\b(master\s+fondamental|master|m2|bac\s*\+\s*5)\b/i.test(educationText)) {
    fields.niveau = "Master Fondamental (Bac+5)";
  } else if (/\b(licence\s+professionnelle|licence\s+pro)\b/i.test(educationText)) {
    fields.niveau = "Licence Professionnelle (Bac+3)";
  } else if (/\b(licence|bac\s*\+\s*3|bachelor|إجازة)\b/i.test(educationText)) {
    fields.niveau = "Licence Fondamentale (Bac+3)";
  } else if (/\b(deug|dut|bts|bac\s*\+\s*2)\b/i.test(educationText)) {
    fields.niveau = "Bac+2 (DEUG, DUT, BTS)";
  }

  // Filière d'études (recherche stricte)
  const filieres = [
    { key: "Génie Informatique & Systèmes", re: /\b(informatique|g[ée]nie\s+logiciel|d[ée]veloppement|data|cyber|r[ée]seaux|syst[èe]mes|devops|fullstack|software|web)\b/i },
    { key: "Sciences Économiques & Gestion", re: /\b(gestion|management|[ée]conomie|finance|comptabilit[ée]|audit|commerce|marketing)\b/i },
    { key: "Sciences Juridiques & Droit", re: /\b(droit|juridique|affaires|contentieux|l[ée]gislation)\b/i },
    { key: "Sciences Mathématiques & Informatique", re: /\b(math[ée]matiques|smi|sma|statistiques)\b/i },
    { key: "Physique & Ingénierie Énergétique", re: /\b(physique|smp|m[ée]canique|[ée]lectronique|[ée]nergie|[ée]nerg[ée]tique)\b/i },
    { key: "Biologie, Santé & Environnement", re: /\b(biologie|svi|sve|environnement|agroalimentaire)\b/i },
    { key: "Génie Civil & BTP", re: /\b(g[ée]nie\s+civil|btp|construction|b[âa]timent)\b/i },
    { key: "Génie Industriel & Logistique", re: /\b(industriel|logistique|supply\s+chain|production|qualit[ée])\b/i },
    { key: "Lettres, Langues & Communication", re: /\b(lettres|litt[ée]rature|anglais|fran[çc]ais|communication|journalisme)\b/i },
    { key: "Tourisme, Hôtellerie & Patrimoine", re: /\b(tourisme|h[ôo]tellerie|patrimoine|loisirs)\b/i }
  ];
  for (const f of filieres) {
    if (f.re.test(educationText)) {
      fields.filiere = f.key;
      break;
    }
  }

  // Poste occupé / stage (détection explicite)
  const posteMatch = clean.match(/(?:stage|poste|intitulé|fonction|emploi|titre)\s*[:\-]?\s*([^\n\r,]{4,60})/i);
  if (posteMatch && posteMatch[1]) {
    fields.expPoste = posteMatch[1].trim();
  }

  const entMatch = clean.match(/(?:entreprise|société|organisme|chez)\s*[:\-]?\s*([^\n\r,]{3,50})/i);
  if (entMatch && entMatch[1]) {
    fields.expEntreprise = entMatch[1].trim();
  }

  // Compétences clés détectées dans le texte
  const compPatterns = [
    "JavaScript", "Python", "Java", "C++", "PHP", "SQL", "React", "Node.js", "Angular", "Vue.js",
    "HTML", "CSS", "Git", "Docker", "Linux", "Excel", "Power BI", "Comptabilité",
    "Gestion de projet", "Communication", "Marketing digital", "Finance"
  ];
  const detectedComps = compPatterns.filter(c => {
    try {
      const escaped = c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`(?:^|[^a-zA-Z0-9])${escaped}(?:$|[^a-zA-Z0-9])`, "i").test(clean);
    } catch(e) {
      return false;
    }
  });
  if (detectedComps.length > 0) {
    fields.competences = detectedComps.join(", ");
  }

  // Langues présentes dans le texte ; aucun niveau n'est déduit de leur simple mention.
  const languesTrouvees: string[] = [];
  if (/\b(arabe|arabic|العربية)\b/i.test(clean)) languesTrouvees.push("Arabe");
  if (/\b(fran[çc]ais|french|الفرنسية)\b/i.test(clean)) languesTrouvees.push("Français");
  if (/\b(anglais|english|الانجليزية|الإنكليزية)\b/i.test(clean)) languesTrouvees.push("Anglais");
  if (/\b(espagnol|spanish)\b/i.test(clean)) languesTrouvees.push("Espagnol");
  if (/\b(allemand|german)\b/i.test(clean)) languesTrouvees.push("Allemand");
  if (languesTrouvees.length > 0) {
    fields.langues = languesTrouvees.join(", ");
  }

  // Extraction du Nom et Prénom depuis le TEXTE RÉEL DU CV (en-têtes et lignes initiales)
  // RÈGLE ABSOLUE : Chercher dans le contenu réel, pas uniquement le filename !
  const lines = clean.split(/[\r\n]+/).map(l => l.trim()).filter(l => l.length > 1);
  let nomTrouve = "";
  let prenomTrouve = "";

  // 1. Chercher des lignes avec "Nom :", "Prénom :"
  const nomExplicit = clean.match(/(?:nom\s*(?:de\s*famille|complet)?)\s*[:\-]\s*([A-Za-z\u00C0-\u00FF\u0621-\u064A '-]{2,40})/i);
  const prenomExplicit = clean.match(/(?:pr[ée]nom(?:\s+complet)?)\s*[:\-]\s*([A-Za-z\u00C0-\u00FF\u0621-\u064A '-]{2,40})/i);

  if (prenomExplicit && prenomExplicit[1]) {
    prenomTrouve = prenomExplicit[1].trim();
  }
  if (nomExplicit && nomExplicit[1]) {
    nomTrouve = nomExplicit[1].trim();
  }

  const candidateMatch = clean.match(/\|\s*candidat(?:e)?\s*\|\s*([^\n|]+)/i)
    || clean.match(/\bcandidat(?:e)?\s*[:：]\s*([^\n\r|]+)/i);
  const arabicNameMatch = clean.match(/(?:الاسم الكامل|الاسم)\s*[:：]\s*([^\n\r]+)/);
  const labelledName = candidateMatch?.[1]?.trim()
    || arabicNameMatch?.[1]?.split("/").pop()?.trim();
  if (!prenomTrouve && !nomTrouve && labelledName) {
    const nameWords = labelledName.split(/\s+/).filter((word) => /^[\p{L}\p{M}'’-]+$/u.test(word));
    if (nameWords.length >= 2 && nameWords.length <= 4) {
      prenomTrouve = nameWords[0].charAt(0).toUpperCase() + nameWords[0].slice(1);
      nomTrouve = nameWords.slice(1).join(" ").toUpperCase();
    }
  }

  // 2. Si pas explicite, analyser les premières lignes du document (en-tête de CV)
  if (!prenomTrouve && !nomTrouve) {
    for (let i = 0; i < Math.min(5, lines.length); i++) {
      const l = lines[i].replace(/^(?:dr|mr|mme|mlle)\.?\s+/i, "");
      // Ignorer "Curriculum Vitae", dates, adresses, emails, liens
    if (/^(السيرة الذاتية|curriculum|vitae|cv|r[ée]sum[ée]|page|contact|profil|formation|exp[ée]rience)/i.test(l)) continue;
      if (!/^[\p{L}\p{M}'’ -]{2,60}$/u.test(l)) continue;
      if (l.includes("@") || l.includes("http") || /\d{5,}/.test(l)) continue;
      const words = l.split(/\s+/).filter(w => w.length > 1 && !/^(le|la|de|du|d'|dr|mr|mme|mlle)$/i.test(w));
      if (words.length >= 2 && words.length <= 4) {
        prenomTrouve = words[0].charAt(0).toUpperCase() + words[0].slice(1);
        nomTrouve = words.slice(1).join(" ").toUpperCase();
        break;
      }
    }
  }

  if (prenomTrouve) fields.prenom = prenomTrouve;
  if (nomTrouve) fields.nomfamille = nomTrouve;
  if (prenomTrouve && nomTrouve) fields.nom = `${prenomTrouve} ${nomTrouve}`;

  return fields;
}

/**
 * Transforme le markdown issu de Mistral OCR en champs structurés via l'API Mistral Chat
 * RÈGLE ABSOLUE : Si une information est absente, retourner null !
 */
export async function structureTextWithMistral(markdownText: string, filename: string = ""): Promise<ParsedCvFields> {
  const apiKey = getMistralApiKey();
  const heuristic = extractHeuristicFields(markdownText, filename);

  if (!apiKey || !markdownText.trim()) {
    return heuristic;
  }

  try {
    const prompt = `Tu es un auditeur et extracteur expert pour la plateforme d'insertion PAL-UCA (Université Cadi Ayyad & ANAPEC).
Analyse le document de CV extrait et retourne STRICTEMENT un objet JSON.

RÈGLE ABSOLUE DE VÉRACITÉ :
« Si une information n'est pas explicitement présente ou suffisamment identifiable dans le CV, retourner null. Ne jamais inventer, déduire ou compléter une information absente du document. »

JSON ATTENDU :
{
  "nomfamille": null,
  "prenom": null,
  "nom": null,
  "cin": null,
  "naissance": null,
  "email": null,
  "tel": null,
  "ville": null,
  "adresse": null,
  "niveau": null,
  "filiere": null,
  "etablissement": null,
  "anneeDiplome": null,
  "experience": null,
  "expPoste": null,
  "expEntreprise": null,
  "expDebut": null,
  "expFin": null,
  "experienceDetail": null,
  "competences": null,
  "langues": null,
  "langFr": null,
  "langEn": null,
  "langAr": null,
  "autresDiplomes": null,
  "objectif": null
}

DOCUMENT DU CV :
${markdownText.substring(0, 10000)}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "mistral-small-latest",
        response_format: { type: "json_object" },
        temperature: 0.1,
        messages: [
          { role: "user", content: prompt },
        ],
      }),
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 429) {
        mistralRateLimitCooldownUntil = Date.now() + 60000;
        console.log("[Mistral Chat] Rate limit 429 atteint, utilisation repli heuristique...");
      } else {
        console.log("[Mistral Chat] Statut HTTP non-200 lors de la structuration:", response.status);
      }
      return heuristic;
    }

    const resJson: any = await response.json();
    const content = resJson.choices?.[0]?.message?.content || "{}";
    const cleaned = content.replace(/```json/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    // Fusionner les champs en garantissant qu'AUCUN champ n'est vide
    const merged: ParsedCvFields = { ...heuristic };
    for (const key of Object.keys(parsed)) {
      if (parsed[key] && String(parsed[key]).trim().length > 0) {
        (merged as any)[key] = parsed[key];
      }
    }
    if (parsed.prenom && parsed.nomfamille) {
      merged.nom = `${parsed.prenom} ${parsed.nomfamille}`;
    }
    return merged;
  } catch (err) {
    console.warn("[Mistral Chat] Échec structuration IA, utilisation heuristique:", err);
    return heuristic;
  }
}

/**
 * Extrait le texte brut d'un buffer binaire (PDF ou document)
 * de manière résiliente sans dépendance externe
 */
export function extractTextFromBuffer(buf: Buffer): string {
  try {
    const raw = buf.toString("latin1");
    const tokens = raw.match(/[a-zA-ZÀ-ÿ0-9@+._\-\/]{3,}/g) || [];
    return tokens.join(" ");
  } catch (e) {
    return "";
  }
}
