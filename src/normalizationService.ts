import { PAL_UCA_REFERENTIEL, type StructuredCvOutput } from "./referentielUCA.ts";

/**
 * Normalise un numéro de téléphone au format marocain conventionnel PAL-UCA (ex: 0612345678)
 */
export function normalizePhone(raw: any): { value: string | null; confidence: number } {
  if (raw === null || raw === undefined) return { value: null, confidence: 0 };
  const str = typeof raw === "string" ? raw : String(raw);
  const cleaned = str.replace(/[^\d+]/g, "");
  // Format international +212 ou 00212
  const intlMatch = cleaned.match(/^(?:\+212|00212)([567]\d{8})$/);
  if (intlMatch) {
    return { value: `0${intlMatch[1]}`, confidence: 0.98 };
  }
  // Format local 06 / 07 / 05
  const localMatch = cleaned.match(/^(0[567]\d{8})$/);
  if (localMatch) {
    return { value: localMatch[1], confidence: 0.98 };
  }
  // Extraction de 9 ou 10 chiffres
  const digits = cleaned.replace(/\D/g, "");
  if (digits.length === 9 && ["5", "6", "7"].includes(digits[0])) {
    return { value: `0${digits}`, confidence: 0.85 };
  }
  if (digits.length === 10 && digits.startsWith("0")) {
    return { value: digits, confidence: 0.9 };
  }
  return { value: null, confidence: 0 };
}

/**
 * Valide et normalise une adresse email
 */
export function normalizeEmail(raw: any): { value: string | null; confidence: number } {
  if (raw === null || raw === undefined) return { value: null, confidence: 0 };
  const str = typeof raw === "string" ? raw : String(raw);
  const cleaned = str.trim().toLowerCase();
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (emailRegex.test(cleaned)) {
    return { value: cleaned, confidence: 0.99 };
  }
  // Recherche d'un email contenu dans une chaîne plus large
  const match = cleaned.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (match) {
    return { value: match[0], confidence: 0.92 };
  }
  return { value: null, confidence: 0 };
}

/**
 * Valide et normalise un numéro de CIN marocain (ex: EE123456, AB654321, J12345)
 */
export function normalizeCIN(raw: any): { value: string | null; confidence: number } {
  if (raw === null || raw === undefined) return { value: null, confidence: 0 };
  const str = typeof raw === "string" ? raw : String(raw);
  const cleaned = str.trim().toUpperCase().replace(/\s+/g, "");
  const cinRegex = /^[A-Z]{1,2}\d{4,7}$/;
  if (cinRegex.test(cleaned)) {
    return { value: cleaned, confidence: 0.97 };
  }
  const match = cleaned.match(/\b([A-Z]{1,2}\d{4,7})\b/);
  if (match) {
    return { value: match[1], confidence: 0.88 };
  }
  return { value: null, confidence: 0 };
}

/**
 * Normalise les dates (ex: "Septembre 2023", "2023-09-15", "15/09/2023") en ISO YYYY-MM-DD ou YYYY-MM
 */
export function normalizeDate(raw: any): { value: string | null; confidence: number } {
  if (raw === null || raw === undefined) return { value: null, confidence: 0 };
  const str = typeof raw === "string" ? raw : String(raw);
  const trimmed = str.trim();

  // Format ISO direct AAAA-MM-JJ
  if (/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(trimmed)) {
    return { value: trimmed, confidence: 0.99 };
  }

  // Format JJ/MM/AAAA ou JJ-MM-AAAA
  const slashMatch = trimmed.match(/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})$/);
  if (slashMatch) {
    const day = slashMatch[1].padStart(2, "0");
    const month = slashMatch[2].padStart(2, "0");
    const year = slashMatch[3];
    return { value: `${year}-${month}-${day}`, confidence: 0.95 };
  }

  // Format mois textuel français (ex: "15 Septembre 2023" ou "Septembre 2023")
  const monthsFr: Record<string, string> = {
    janvier: "01", fevrier: "02", "février": "02", mars: "03", avril: "04",
    mai: "05", juin: "06", juillet: "07", aout: "08", "août": "08",
    septembre: "09", octobre: "10", novembre: "11", decembre: "12", "décembre": "12",
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12"
  };

  const textMatch = trimmed.toLowerCase().match(/(?:(\d{1,2})\s+)?([a-z\u00e0-\u00ff]+)\s+(\d{4})/);
  if (textMatch) {
    const day = textMatch[1] ? textMatch[1].padStart(2, "0") : "01";
    const monthName = textMatch[2].normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const month = monthsFr[monthName] || monthsFr[textMatch[2]];
    const year = textMatch[3];
    if (month) {
      return { value: `${year}-${month}-${day}`, confidence: 0.9 };
    }
  }

  // Juste une année (ex: 2024)
  const yearMatch = trimmed.match(/\b(19\d{2}|20\d{2})\b/);
  if (yearMatch) {
    return { value: `${yearMatch[1]}-01-01`, confidence: 0.6 };
  }

  return { value: null, confidence: 0 };
}

/**
 * Calcul de distance Levenshtein pour correspondance floue
 */
function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const d: number[][] = [];

  for (let i = 0; i <= m; i++) d[i] = [i];
  for (let j = 0; j <= n; j++) d[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + cost
      );
    }
  }
  return d[m][n];
}

function stringSimilarity(s1: string, s2: string): number {
  const longer = s1.length >= s2.length ? s1 : s2;
  const shorter = s1.length < s2.length ? s1 : s2;
  if (longer.length === 0) return 1.0;
  return (longer.length - levenshteinDistance(longer, shorter)) / longer.length;
}

function cleanStr(s: any): string {
  if (s === null || s === undefined) return "";
  const str = typeof s === "string" ? s : (s && s.value ? String(s.value) : String(s));
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, " ")
    .trim();
}

/**
 * Appariement strict ou flou avec le référentiel des Villes
 */
export function matchVille(raw: string | null | undefined): {
  value: string | null;
  confidence: number;
  source: "exact_match" | "fuzzy_match" | "unmatched";
} {
  if (!raw) return { value: null, confidence: 0, source: "unmatched" };
  const cleaned = cleanStr(raw);

  // 1. Correspondance exacte
  for (const v of PAL_UCA_REFERENTIEL.villes) {
    const cleanV = cleanStr(v);
    if (cleaned === cleanV) {
      return { value: v, confidence: 0.99, source: "exact_match" };
    }
  }

  // 2. Inclusion
  for (const v of PAL_UCA_REFERENTIEL.villes) {
    const cleanV = cleanStr(v);
    if (cleaned.includes(cleanV) || cleanV.includes(cleaned)) {
      return { value: v, confidence: 0.88, source: "fuzzy_match" };
    }
  }

  // 3. Similarité Levenshtein (> 0.75)
  let bestMatch: string | null = null;
  let bestSim = 0;
  for (const v of PAL_UCA_REFERENTIEL.villes) {
    const sim = stringSimilarity(cleaned, cleanStr(v));
    if (sim > bestSim && sim >= 0.75) {
      bestSim = sim;
      bestMatch = v;
    }
  }

  if (bestMatch) {
    return { value: bestMatch, confidence: Number(bestSim.toFixed(2)), source: "fuzzy_match" };
  }

  return { value: null, confidence: 0, source: "unmatched" };
}

/**
 * Appariement strict ou flou avec le référentiel des Établissements UCA
 */
export function matchEtablissement(raw: string | null | undefined): {
  value: string | null;
  confidence: number;
  source: "exact_match" | "fuzzy_match" | "unmatched";
} {
  if (!raw) return { value: null, confidence: 0, source: "unmatched" };
  const cleaned = cleanStr(raw);

  for (const etab of PAL_UCA_REFERENTIEL.etablissements) {
    if (cleanStr(etab.nom) === cleaned) {
      return { value: etab.nom, confidence: 0.99, source: "exact_match" };
    }
    for (const alias of etab.aliases) {
      const cleanAlias = cleanStr(alias);
      if (cleaned === cleanAlias) {
        return { value: etab.nom, confidence: 0.95, source: "exact_match" };
      }
    }
  }

  // Prioriser les alias avec une ville/campus explicite avant les alias génériques.
  const campusAliases = PAL_UCA_REFERENTIEL.etablissements.flatMap((etab) =>
    etab.aliases
      .filter((alias) => /\b(marrakech|safi|essaouira|kelaa|gueliz)\b/i.test(alias))
      .map((alias) => ({ etab, alias: cleanStr(alias) }))
  ).sort((a, b) => b.alias.length - a.alias.length);
  for (const item of campusAliases) {
    if (cleaned.includes(item.alias)) {
      return { value: item.etab.nom, confidence: 0.94, source: "fuzzy_match" };
    }
  }

  const specificAliases = PAL_UCA_REFERENTIEL.etablissements.flatMap((etab) =>
    etab.aliases.map((alias) => ({ etab, alias: cleanStr(alias) }))
  ).sort((a, b) => b.alias.length - a.alias.length);
  for (const item of specificAliases) {
    if (item.alias.length > 2 && cleaned.includes(item.alias)) {
      return { value: item.etab.nom, confidence: 0.88, source: "fuzzy_match" };
    }
  }

  // Similarité Levenshtein
  let bestMatch: string | null = null;
  let bestSim = 0;
  for (const etab of PAL_UCA_REFERENTIEL.etablissements) {
    const simNom = stringSimilarity(cleaned, cleanStr(etab.nom));
    if (simNom > bestSim && simNom >= 0.7) {
      bestSim = simNom;
      bestMatch = etab.nom;
    }
    for (const alias of etab.aliases) {
      const simAlias = stringSimilarity(cleaned, cleanStr(alias));
      if (simAlias > bestSim && simAlias >= 0.75) {
        bestSim = simAlias;
        bestMatch = etab.nom;
      }
    }
  }

  if (bestMatch) {
    return { value: bestMatch, confidence: Number(bestSim.toFixed(2)), source: "fuzzy_match" };
  }

  return { value: null, confidence: 0, source: "unmatched" };
}

/**
 * Appariement strict ou flou avec le référentiel des Niveaux d'études
 */
export function matchNiveau(raw: string | null | undefined): {
  value: string | null;
  confidence: number;
  source: "exact_match" | "fuzzy_match" | "unmatched";
} {
  if (!raw) return { value: null, confidence: 0, source: "unmatched" };
  const cleaned = cleanStr(raw);

  // Les correspondances exactes priment sur les alias génériques comme « bac+5 ».
  for (const niv of PAL_UCA_REFERENTIEL.niveaux) {
    if (cleanStr(niv.nom) === cleaned) {
      return { value: niv.nom, confidence: 0.99, source: "exact_match" };
    }
    for (const alias of niv.aliases) {
      const cleanAlias = cleanStr(alias);
      if (cleaned === cleanAlias) {
        return { value: niv.nom, confidence: 0.95, source: "exact_match" };
      }
    }
  }

  const aliases = PAL_UCA_REFERENTIEL.niveaux.flatMap((niv) =>
    niv.aliases.map((alias) => ({ niveau: niv.nom, alias: cleanStr(alias) }))
  ).sort((a, b) => b.alias.length - a.alias.length);
  for (const item of aliases) {
    if (item.alias.length > 2 && cleaned.includes(item.alias)) {
      return { value: item.niveau, confidence: 0.86, source: "fuzzy_match" };
    }
  }

  return { value: null, confidence: 0, source: "unmatched" };
}

/**
 * Appariement avec les filières
 */
export function matchFiliere(raw: string | null | undefined): {
  value: string | null;
  confidence: number;
  source: "exact_match" | "fuzzy_match" | "unmatched";
} {
  if (!raw) return { value: null, confidence: 0, source: "unmatched" };
  const cleaned = cleanStr(raw);

  for (const f of PAL_UCA_REFERENTIEL.filieres) {
    const cleanF = cleanStr(f);
    if (cleaned === cleanF) {
      return { value: f, confidence: 0.99, source: "exact_match" };
    }
    if (cleaned.includes(cleanF) || cleanF.includes(cleaned)) {
      return { value: f, confidence: 0.85, source: "fuzzy_match" };
    }
  }

  let bestMatch: string | null = null;
  let bestSim = 0;
  for (const f of PAL_UCA_REFERENTIEL.filieres) {
    const sim = stringSimilarity(cleaned, cleanStr(f));
    if (sim > bestSim && sim >= 0.65) {
      bestSim = sim;
      bestMatch = f;
    }
  }

  if (bestMatch) {
    return { value: bestMatch, confidence: Number(bestSim.toFixed(2)), source: "fuzzy_match" };
  }

  // Si pas de correspondance dans les catégories générales, on retourne l'intitulé extrait tel quel
  return { value: raw.trim(), confidence: 0.8, source: "fuzzy_match" };
}

/**
 * Normalise les niveaux de langue
 */
export function matchLangueNiveau(langue: "francais" | "anglais" | "arabe", raw: string | null | undefined): {
  value: string;
  confidence: number;
} {
  if (!raw) {
    return {
      value: langue === "arabe" ? "Maternelle" : (langue === "francais" ? "Courant" : "Intermédiaire"),
      confidence: 0.5
    };
  }
  const cleaned = cleanStr(raw);
  const options = PAL_UCA_REFERENTIEL.niveauxLangue[langue];

  for (const opt of options) {
    if (cleanStr(opt) === cleaned || cleaned.includes(cleanStr(opt))) {
      return { value: opt, confidence: 0.95 };
    }
  }

  if (cleaned.includes("bilingue") || cleaned.includes("native") || cleaned.includes("maternelle")) {
    return { value: options[0] || "Courant", confidence: 0.9 };
  }
  if (cleaned.includes("courant") || cleaned.includes("fluent") || cleaned.includes("c1") || cleaned.includes("c2")) {
    return { value: "Courant", confidence: 0.9 };
  }
  if (cleaned.includes("intermediaire") || cleaned.includes("moyen") || cleaned.includes("b1") || cleaned.includes("b2")) {
    return { value: "Intermédiaire", confidence: 0.9 };
  }
  if (cleaned.includes("debutant") || cleaned.includes("notions") || cleaned.includes("a1") || cleaned.includes("a2")) {
    return { value: options.includes("Débutant") ? "Débutant" : "Notions", confidence: 0.9 };
  }

  return { value: options[0], confidence: 0.5 };
}

/**
 * Calcul du score global d'employabilité et diagnostic ANAPEC
 */
export function calculatePALDiagnostics(fields: any): {
  scores: { soi: number; projet: number; territoire: number; methode: number; global: number };
  diagnostic: string;
} {
  const diagSoi = Math.min(100, Math.max(50,
    (fields.nom ? 20 : 0) +
    (fields.email ? 20 : 0) +
    (fields.tel ? 20 : 0) +
    (fields.cin ? 20 : 0) + 20
  ));
  const diagProjet = Math.min(100, Math.max(50,
    (fields.filiere ? 35 : 0) +
    (fields.niveau ? 35 : 0) + 20
  ));
  const diagTerritoire = Math.min(100, Math.max(50,
    (fields.ville ? 40 : 20) +
    (fields.etablissement ? 40 : 20) + 15
  ));
  const diagMethode = Math.min(100, Math.max(50,
    (fields.experience ? 40 : 20) +
    (fields.competences ? 40 : 20) + 15
  ));
  const diagGlobal = Math.round((diagSoi + diagProjet + diagTerritoire + diagMethode) / 4);

  const diagnosticText = `Diagnostic d'employabilité PAL-UCA :\n• Points forts : Profil académique complet (${fields.niveau || "Non spécifié"} en ${fields.filiere || "Non spécifié"}), compétences identifiées (${fields.competences || "Générales"}).\n• Axes d'amélioration : Optimisation du CV aux formats ATS et renforcement des techniques d'entretien.\n• Plan d'action recommandé :\n  1. Finaliser et fiabiliser le profil sur la plateforme\n  2. S'inscrire à l'atelier Techniques de Recherche d'Emploi (TRE)\n  3. Réserver un entretien individuel avec un conseiller ANAPEC.`;

  return {
    scores: {
      soi: diagSoi,
      projet: diagProjet,
      territoire: diagTerritoire,
      methode: diagMethode,
      global: diagGlobal,
    },
    diagnostic: diagnosticText,
  };
}
