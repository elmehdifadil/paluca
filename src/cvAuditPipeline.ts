import { GoogleGenAI } from "@google/genai";
// @ts-ignore
import * as pdfParseModule from "pdf-parse/lib/pdf-parse.js";
const pdfParse: any = (pdfParseModule as any).default || pdfParseModule;
// @ts-ignore
import * as mammothModule from "mammoth";
const mammoth: any = (mammothModule as any).default || mammothModule;
import {
  isMistralConfigured,
  performMistralOCR,
  getMistralApiKey,
  getMimeType,
  extractHeuristicFields,
} from "./mistralService.ts";
import {
  normalizePhone,
  normalizeEmail,
  normalizeCIN,
  normalizeDate,
  matchVille,
  matchEtablissement,
  matchNiveau,
  matchFiliere,
  matchLangueNiveau,
  calculatePALDiagnostics,
} from "./normalizationService.ts";
import { type StructuredCvOutput } from "./referentielUCA.ts";

export interface LogAuditStep {
  step: string;
  status: "success" | "warning" | "error" | "skipped";
  details: string;
  timestamp: string;
}

export interface PipelineAuditResult {
  filename: string;
  mimeType: string;
  fileSizeBytes: number;
  isScannedOrImage: boolean;
  textExtractionMethod: "pdf-parse" | "mistral-ocr" | "docx-mammoth" | "doc-binary" | "gemini-vision" | "raw-text" | "heuristic";
  extractedTextLength: number;
  extractedTextSample: string; // Truncated, no personal sensitive details exposed in prod logs
  aiConfigurationUsed: "gemini" | "mistral" | "dual-verify" | "heuristic";
  rawAiResponseSnippet: string;
  structuredJson: any;
  confidenceScores: Record<string, number>;
  normalizedFields: Record<string, any>;
  palFormValues: Record<string, any>;
  unmatchedFields: string[];
  auditLogs: LogAuditStep[];
  diagnostics: any;
  cannotRead?: boolean;
  error?: string;
}

function readFieldValue(field: any): any {
  return field && typeof field === "object" && "value" in field ? field.value : field;
}

function firstFieldValue(...fields: any[]): any {
  return fields.map(readFieldValue).find((value) => value !== null && value !== undefined && value !== "");
}

/**
 * Extraction de texte pour documents Word binaires (.doc legacy)
 */
function extractTextFromBinaryDoc(buffer: Buffer): string {
  const textChunks: string[] = [];
  let currentAscii = "";
  for (let i = 0; i < buffer.length; i++) {
    const code = buffer[i];
    if ((code >= 32 && code <= 126) || code === 10 || code === 13 || (code >= 160 && code <= 255)) {
      currentAscii += String.fromCharCode(code);
    } else {
      if (currentAscii.trim().length >= 4) {
        textChunks.push(currentAscii.trim());
      }
      currentAscii = "";
    }
  }
  if (currentAscii.trim().length >= 4) {
    textChunks.push(currentAscii.trim());
  }

  // Scan UTF-16LE pour texte Unicode arabe ou français
  try {
    const utf16Str = buffer.toString("utf16le");
    const matches = utf16Str.match(/[\p{L}\p{N}\s,.;:!?@()/-]{5,}/gu);
    if (matches) {
      for (const m of matches) {
        const trimmed = m.trim();
        if (trimmed.length > 5 && !textChunks.includes(trimmed)) {
          textChunks.push(trimmed);
        }
      }
    }
  } catch (e) {}

  return textChunks.join(" ");
}

/**
 * Audit and extraction engine for PAL-UCA
 */
export async function runFullCvPipeline(options: {
  filename: string;
  base64Data?: string;
  rawText?: string;
  mimeType?: string;
  modelConfig?: "gemini" | "mistral" | "dual-verify" | "auto";
  safeLogging?: boolean;
}): Promise<PipelineAuditResult> {
  const auditLogs: LogAuditStep[] = [];
  const log = (step: string, status: "success" | "warning" | "error" | "skipped", details: string) => {
    auditLogs.push({ step, status, details, timestamp: new Date().toISOString() });
    if (options.safeLogging) {
      console.log(`[CV Pipeline][${step}] ${status.toUpperCase()}: ${details}`);
    }
  };

  const filename = options.filename || "cv.pdf";
  const rawBase64 = (options.base64Data || "").replace(/^data:[^;]+;base64,/, "");
  const mime = options.mimeType || getMimeType(filename);
  let fileBuffer: Buffer | null = null;
  let fileSizeBytes = 0;

  if (rawBase64) {
    try {
      fileBuffer = Buffer.from(rawBase64, "base64");
      fileSizeBytes = fileBuffer.length;
      log("lecture_fichier", "success", `Fichier chargé en mémoire (${fileSizeBytes} octets, mime: ${mime})`);
    } catch (e: any) {
      log("lecture_fichier", "error", `Échec décodage buffer: ${e.message}`);
    }
  } else {
    log("lecture_fichier", "warning", "Aucun buffer base64 fourni, utilisation du texte brut");
  }

  // 1. EXTRACTION DU TEXTE SELON LE FORMAT (PDF, DOCX, DOC, Image, Texte)
  let extractedText = (options.rawText || "").trim();
  let textExtractionMethod: "pdf-parse" | "mistral-ocr" | "docx-mammoth" | "doc-binary" | "gemini-vision" | "raw-text" | "heuristic" = "heuristic";
  let isScannedOrImage = false;

  const lowerName = filename.toLowerCase();
  const isPdf = mime.includes("pdf") || lowerName.endsWith(".pdf");
  const isDocx = mime.includes("wordprocessingml") || lowerName.endsWith(".docx");
  const isDoc = mime.includes("msword") || (lowerName.endsWith(".doc") && !isDocx);
  const isImage = mime.includes("image") || /\.(png|jpe?g|webp)$/i.test(filename);
  const isTxt = mime.includes("text/plain") || lowerName.endsWith(".txt");

  if (isImage) {
    isScannedOrImage = true;
  }

  // A. Format PDF
  if (isPdf && fileBuffer) {
    try {
      log("extraction_texte", "success", "Tentative d'extraction de texte vectoriel via pdf-parse...");
      const pdfData = await pdfParse(fileBuffer);
      const textFromPdf = (pdfData.text || "").trim();
      const visibleTokens = textFromPdf.replace(/[\s\r\n\t]+/g, " ").trim();
      if (visibleTokens.length > 50) {
        extractedText = textFromPdf;
        textExtractionMethod = "pdf-parse";
        isScannedOrImage = false;
        log("extraction_texte", "success", `Extraction vectorielle réussie (${textFromPdf.length} caractères, ${pdfData.numpages || 1} pages)`);
      } else {
        isScannedOrImage = true;
        log("extraction_texte", "warning", `Texte PDF très faible (${visibleTokens.length} car.), PDF détecté comme scan ou image! Bascule sur OCR`);
      }
    } catch (err: any) {
      isScannedOrImage = true;
      log("extraction_texte", "warning", `pdf-parse n'a pas pu extraire de texte direct: ${err.message}. Passage à l'OCR`);
    }
  }

  // B. Format DOCX
  if (isDocx && fileBuffer) {
    try {
      log("extraction_texte", "success", "Extraction DOCX via mammoth...");
      const mammothResult = await mammoth.extractRawText({ buffer: fileBuffer });
      const textFromDocx = (mammothResult.value || "").trim();
      if (textFromDocx.length > 25) {
        extractedText = textFromDocx;
        textExtractionMethod = "docx-mammoth";
        isScannedOrImage = false;
        log("extraction_texte", "success", `Extraction DOCX réussie (${textFromDocx.length} caractères)`);
      } else {
        log("extraction_texte", "warning", "Contenu textuel extrait de DOCX très court");
      }
    } catch (err: any) {
      log("extraction_texte", "warning", `Échec extraction DOCX: ${err.message}`);
    }
  }

  // C. Format DOC (legacy Word binaire)
  if (isDoc && fileBuffer && !extractedText) {
    try {
      log("extraction_texte", "success", "Extraction binaire DOC legacy...");
      const textFromDoc = extractTextFromBinaryDoc(fileBuffer);
      if (textFromDoc.length > 30) {
        extractedText = textFromDoc;
        textExtractionMethod = "doc-binary";
        isScannedOrImage = false;
        log("extraction_texte", "success", `Extraction DOC binaire réussie (${textFromDoc.length} caractères)`);
      }
    } catch (err: any) {
      log("extraction_texte", "warning", `Échec extraction DOC: ${err.message}`);
    }
  }

  // D. Format Texte brut
  if (isTxt && fileBuffer && !extractedText) {
    try {
      extractedText = fileBuffer.toString("utf-8");
      textExtractionMethod = "raw-text";
      log("extraction_texte", "success", `Fichier texte brut lu (${extractedText.length} caractères)`);
    } catch (e: any) {
      log("extraction_texte", "warning", `Échec lecture texte: ${e.message}`);
    }
  }

  // 2. OCR SI NÉCESSAIRE (Scan, image ou PDF sans couche texte)
  let ocrMarkdown = "";
  if (isScannedOrImage && isMistralConfigured() && rawBase64) {
    log("ocr_mistral", "success", "Déclenchement Mistral OCR (mistral-ocr-latest)...");
    try {
      const ocrRes = await performMistralOCR({
        base64Data: rawBase64,
        mimeType: mime,
        filename: filename,
      });
      if (ocrRes.success && ocrRes.markdown && ocrRes.markdown.trim().length > 20) {
        ocrMarkdown = ocrRes.markdown;
        extractedText = ocrRes.markdown;
        textExtractionMethod = "mistral-ocr";
        log("ocr_mistral", "success", `Mistral OCR réussi (${ocrRes.pagesCount} pages, ${ocrMarkdown.length} car.)`);
      } else {
        log("ocr_mistral", "warning", `Mistral OCR indisponible ou non probant (${ocrRes.error || "vide"}).`);
      }
    } catch (ocrErr: any) {
      log("ocr_mistral", "warning", `Erreur appel Mistral OCR: ${ocrErr.message}`);
    }
  }

  // VÉRIFICATION OBLIGATOIRE DU CONTENU EXTRAIT AVANT L'APPEL À L'IA
  // « Avant l'appel à Gemini/Mistral, vérifier que le contenu réel du CV a bien été extrait.
  // Si aucun texte ou contenu exploitable n'est trouvé, ne pas lancer l'analyse IA.
  // Afficher : "Impossible de lire le contenu du CV. Veuillez vérifier le fichier ou importer un autre CV." »
  const hasTextContent = !!extractedText && extractedText.trim().length >= 20;
  const geminiKey = process.env.GEMINI_API_KEY;
  const mistralKey = getMistralApiKey();
  // Seul Gemini peut analyser ici le fichier brut ; Mistral exige le texte OCR ci-dessus.
  const canPerformVisualAnalysis = (isScannedOrImage || isPdf) && !!rawBase64 && !!geminiKey;

  if (!hasTextContent && !canPerformVisualAnalysis) {
    log("verification_contenu", "error", "Impossible de lire le contenu du CV : aucun texte ou contenu exploitable trouvé.");
    return {
      filename,
      mimeType: mime,
      fileSizeBytes,
      isScannedOrImage,
      textExtractionMethod,
      extractedTextLength: 0,
      extractedTextSample: "",
      aiConfigurationUsed: "heuristic",
      rawAiResponseSnippet: "",
      structuredJson: null,
      confidenceScores: {},
      normalizedFields: {},
      palFormValues: {},
      unmatchedFields: [],
      auditLogs,
      diagnostics: { scores: { global: 0 }, diagnostic: "Document illisible ou non exploitable" },
      cannotRead: true,
      error: "Impossible de lire le contenu du CV. Veuillez vérifier le fichier ou importer un autre CV.",
    };
  }
  log("verification_contenu", "success", `Contenu exploitable vérifié (${extractedText.length} caractères extraits). Analyse IA autorisée.`);

  // 3. CHOIX ET EXÉCUTION DU MODÈLE IA
  const config = options.modelConfig || "auto";

  const PROMPT_EXTRACTION_STRICT = `Tu es un auditeur et extracteur technique expert pour la plateforme d'insertion PAL-UCA (Université Cadi Ayyad Marrakech & ANAPEC).

RÈGLE ABSOLUE DE VÉRACITÉ :
« Si une information n'est pas explicitement présente ou suffisamment identifiable dans le CV, retourner null. Ne jamais inventer, déduire ou compléter une information absente du document. »
Exemple : Si le CV indique uniquement « Master en économie », ne PAS inventer un master spécialisé imaginaire qui n'est pas écrit. Ne jamais inventer de numéro de CIN, de date de naissance ou de téléphone s'ils ne figurent pas dans le document.

Pour chaque champ extrait, fournis la valeur trouvée (ou null) ET un score de confiance ("confidence" entre 0.0 et 1.0).

Retourne STRICTEMENT l'objet JSON ci-dessous (aucun texte, pas de bloc de code) :
{
  "personal_information": {
    "first_name": { "value": null, "confidence": 0 },
    "last_name": { "value": null, "confidence": 0 },
    "cin": { "value": null, "confidence": 0 },
    "date_of_birth": { "value": null, "confidence": 0 },
    "phone": { "value": null, "confidence": 0 },
    "email": { "value": null, "confidence": 0 },
    "address": { "value": null, "confidence": 0 },
    "city": { "value": null, "confidence": 0 }
  },
  "education": [
    {
      "degree_level": { "value": null, "confidence": 0 },
      "degree": { "value": null, "confidence": 0 },
      "field_of_study": { "value": null, "confidence": 0 },
      "institution": { "value": null, "confidence": 0 },
      "graduation_year": { "value": null, "confidence": 0 }
    }
  ],
  "experiences": [
    {
      "company": { "value": null, "confidence": 0 },
      "job_title": { "value": null, "confidence": 0 },
      "start_date": { "value": null, "confidence": 0 },
      "end_date": { "value": null, "confidence": 0 },
      "description": { "value": null, "confidence": 0 }
    }
  ],
  "skills": [],
  "languages": [],
  "certifications": [],
  "internships": []
}`;

  let structuredRawJson: any = null;
  let aiUsed: "gemini" | "mistral" | "dual-verify" | "heuristic" = "heuristic";
  let rawAiText = "";

  // A. Tentative Gemini (multimodal si scan/image, textuel si extrait)
  async function callGemini(): Promise<{ success: boolean; data?: any; raw?: string; err?: string }> {
    if (!geminiKey) return { success: false, err: "GEMINI_API_KEY absente" };
    try {
      const ai = new GoogleGenAI({
        apiKey: geminiKey,
        httpOptions: { headers: { "User-Agent": "aistudio-build" } },
      });
      const contents: any[] = [{ text: PROMPT_EXTRACTION_STRICT }];

      if (rawBase64 && (isScannedOrImage || !extractedText)) {
        const actualMime = isPdf ? "application/pdf" : (mime.includes("png") ? "image/png" : "image/jpeg");
        contents.push({
          inlineData: {
            mimeType: actualMime,
            data: rawBase64,
          },
        });
      }
      if (extractedText) {
        contents.push({ text: `DOCUMENT DU CV (Texte intégral extrait) :\n${extractedText.substring(0, 15000)}` });
      } else if (!(rawBase64 && (isScannedOrImage || !extractedText))) {
        return { success: false, err: "Aucun contenu à transmettre" };
      }

      const modelsToTry = ["gemini-3.8-flash", "gemini-3.1-flash-lite", "gemini-flash-latest"];
      const modelErrors: string[] = [];
      for (const model of modelsToTry) {
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        try {
          const timeoutPromise = new Promise<never>((_, reject) =>
            { timeoutId = setTimeout(() => reject(new Error("AI_TIMEOUT")), 9000); }
          );
          const response: any = await Promise.race([
            ai.models.generateContent({ model, contents }),
            timeoutPromise,
          ]);
          if (response && response.text) {
            const txt = response.text.replace(/```json/g, "").replace(/```/g, "").trim();
            const parsed = JSON.parse(txt);
            return { success: true, data: parsed, raw: response.text };
          }
        } catch (e: any) {
          const reason = e?.message || String(e);
          modelErrors.push(`${model}: ${reason}`);
          log("gemini_modele", "warning", `${model} a échoué: ${reason}`);
        } finally {
          if (timeoutId) clearTimeout(timeoutId);
        }
      }
      return { success: false, err: modelErrors.join("; ") || "Aucun modèle Gemini n'a renvoyé de réponse exploitable" };
    } catch (e: any) {
      return { success: false, err: e.message };
    }
  }

  // B. Tentative Mistral Chat
  async function callMistral(): Promise<{ success: boolean; data?: any; raw?: string; err?: string }> {
    if (!mistralKey || !extractedText) return { success: false, err: "Mistral clé ou texte manquant" };
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 7000);
      const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Authorization": `Bearer ${mistralKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "mistral-small-latest",
          temperature: 0.1,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: "Tu es un extracteur d'informations de CV strict. Ne rien inventer. Retourne le JSON demandé." },
            { role: "user", content: `${PROMPT_EXTRACTION_STRICT}\n\nTEXTE DU CV :\n${extractedText.substring(0, 10000)}` },
          ],
        }),
      });
      clearTimeout(timeoutId);
      if (!res.ok) {
        return { success: false, err: `Mistral HTTP ${res.status}` };
      }
      const data: any = await res.json();
      const content = data.choices?.[0]?.message?.content || "";
      const cleaned = content.replace(/```json/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      return { success: true, data: parsed, raw: content };
    } catch (e: any) {
      return { success: false, err: e.message };
    }
  }

  // Exécution selon la configuration (Gemini / Mistral / Dual Verify)
  if (config === "mistral") {
    log("transmission_ia", "success", "Configuration B demandée: Envoi à Mistral Chat");
    const mRes = await callMistral();
    if (mRes.success && mRes.data) {
      structuredRawJson = mRes.data;
      rawAiText = mRes.raw || "";
      aiUsed = "mistral";
      log("reponse_ia", "success", "Mistral a retourné un JSON structuré valide");
    } else {
      log("transmission_ia", "warning", `Mistral a échoué (${mRes.err}), bascule sur Gemini`);
      const gRes = await callGemini();
      if (gRes.success && gRes.data) {
        structuredRawJson = gRes.data;
        rawAiText = gRes.raw || "";
        aiUsed = "gemini";
        log("reponse_ia", "success", "Gemini de secours a retourné un JSON valide");
      }
    }
  } else if (config === "dual-verify") {
    log("transmission_ia", "success", "Configuration C demandée: Double vérification Gemini + Mistral");
    const gRes = await callGemini();
    if (gRes.success && gRes.data) {
      structuredRawJson = gRes.data;
      rawAiText = gRes.raw || "";
      aiUsed = "dual-verify";
      log("reponse_ia", "success", "Étape 1 (Gemini) terminée avec succès. Vérification Mistral en cours...");

      // Double vérification / consolidation avec Mistral
      const mRes = await callMistral();
      if (mRes.success && mRes.data) {
        log("reponse_ia", "success", "Étape 2 (Mistral) terminée: Consolidation des scores de confiance");
        // Consolidation: si les deux modèles concordent sur l'email, la ville, le nom, on monte la confiance à 0.99
        try {
          const gInfo = structuredRawJson.personal_information || {};
          const mInfo = mRes.data.personal_information || {};
          ["email", "phone", "cin", "first_name", "last_name", "city"].forEach((k) => {
            const gVal = gInfo[k]?.value;
            const mVal = mInfo[k]?.value;
            if (gVal && mVal && String(gVal).toLowerCase() === String(mVal).toLowerCase()) {
              gInfo[k].confidence = Math.min(1.0, (gInfo[k].confidence || 0.8) + 0.15);
              gInfo[k].source = "exact_match";
            }
          });
        } catch (e) {}
      }
    } else {
      log("transmission_ia", "warning", `Gemini indisponible, essai Mistral direct: ${gRes.err}`);
      const mRes = await callMistral();
      if (mRes.success && mRes.data) {
        structuredRawJson = mRes.data;
        rawAiText = mRes.raw || "";
        aiUsed = "mistral";
      }
    }
  } else {
    // Mode Auto / Gemini prioritaire
    log("transmission_ia", "success", "Envoi à Gemini (Support Multimodal PDF/Scan natif)...");
    const gRes = await callGemini();
    if (gRes.success && gRes.data) {
      structuredRawJson = gRes.data;
      rawAiText = gRes.raw || "";
      aiUsed = "gemini";
      log("reponse_ia", "success", "Gemini a retourné le JSON structuré avec succès");
    } else {
      log("transmission_ia", "warning", `Gemini non disponible (${gRes.err}), tentative avec Mistral...`);
      const mRes = await callMistral();
      if (mRes.success && mRes.data) {
        structuredRawJson = mRes.data;
        rawAiText = mRes.raw || "";
        aiUsed = "mistral";
        log("reponse_ia", "success", "Mistral a retourné le JSON structuré avec succès");
      } else {
        log("reponse_ia", "warning", "Aucun modèle IA n'a répondu. Passage à l'analyse heuristique garantie.");
      }
    }
  }

  // Si l'IA n'a pas pu structurer (ex: quota ou pas de clé), utilisation de l'extracteur heuristique strict
  // RÈGLE ABSOLUE : Si une information n'est pas présente, retourner null !
  if (!structuredRawJson) {
    const h = extractHeuristicFields(extractedText, filename);
    structuredRawJson = {
      personal_information: {
        first_name: { value: h.prenom || null, confidence: h.prenom ? 0.9 : 0 },
        last_name: { value: h.nomfamille || null, confidence: h.nomfamille ? 0.9 : 0 },
        cin: { value: h.cin || null, confidence: h.cin ? 0.95 : 0 },
        date_of_birth: { value: h.naissance || null, confidence: h.naissance ? 0.85 : 0 },
        phone: { value: h.tel || null, confidence: h.tel ? 0.95 : 0 },
        email: { value: h.email || null, confidence: h.email ? 0.98 : 0 },
        address: { value: h.adresse || null, confidence: h.adresse ? 0.8 : 0 },
        city: { value: h.ville || null, confidence: h.ville ? 0.9 : 0 },
      },
      education: [
        {
          degree_level: { value: h.niveau || null, confidence: h.niveau ? 0.85 : 0 },
          degree: { value: h.filiere || null, confidence: h.filiere ? 0.85 : 0 },
          field_of_study: { value: h.filiere || null, confidence: h.filiere ? 0.85 : 0 },
          institution: { value: h.etablissement || null, confidence: h.etablissement ? 0.9 : 0 },
          graduation_year: { value: h.anneeDiplome || null, confidence: h.anneeDiplome ? 0.9 : 0 },
        }
      ],
      experiences: [
        {
          company: { value: h.expEntreprise || null, confidence: h.expEntreprise ? 0.7 : 0 },
          job_title: { value: h.expPoste || null, confidence: h.expPoste ? 0.7 : 0 },
          start_date: { value: h.expDebut || null, confidence: h.expDebut ? 0.6 : 0 },
          end_date: { value: h.expFin || null, confidence: h.expFin ? 0.6 : 0 },
          description: { value: h.experienceDetail || null, confidence: h.experienceDetail ? 0.7 : 0 },
        }
      ],
      skills: (h.competences || "").split(",").map(s => s.trim()).filter(Boolean).map(s => ({ value: s, confidence: 0.85 })),
      languages: h.langues ? h.langues.split(",").map((language: string) => ({
        language: { value: language.trim(), confidence: 0.7 },
        level: { value: null, confidence: 0 },
      })) : [],
      certifications: (h.autresDiplomes || "").split(",").map(c => c.trim()).filter(Boolean).map(c => ({ value: c, confidence: 0.8 })),
      internships: [],
    };
  }

  // 4. NORMALISATION ET MAPPAGE AVEC LES RÉFÉRENTIELS PAL-UCA
  log("normalisation_donnees", "success", "Normalisation des valeurs extraites et appariement avec les référentiels...");

  const rawInfo = structuredRawJson?.personal_information || {};
  const rawEdu = (Array.isArray(structuredRawJson?.education) && structuredRawJson.education.length > 0)
    ? structuredRawJson.education[0]
    : {};
  const rawExp = (Array.isArray(structuredRawJson?.experiences) && structuredRawJson.experiences.length > 0)
    ? structuredRawJson.experiences[0]
    : {};

  // Normalisation coordonnées
  const normPhone = normalizePhone(firstFieldValue(rawInfo.phone));
  const normEmail = normalizeEmail(firstFieldValue(rawInfo.email));
  const normCin = normalizeCIN(firstFieldValue(rawInfo.cin));
  const normBirth = normalizeDate(firstFieldValue(rawInfo.date_of_birth));

  // Appariement listes déroulantes
  const matchV = matchVille(firstFieldValue(rawInfo.city));
  const matchEtab = matchEtablissement(firstFieldValue(rawEdu.institution));
  const matchNiv = matchNiveau(firstFieldValue(rawEdu.degree_level, rawEdu.degree));
  const matchFil = matchFiliere(firstFieldValue(rawEdu.field_of_study, rawEdu.degree));

  // Année d'obtention
  let gradYear: string | null = null;
  const rawYear = firstFieldValue(rawEdu.graduation_year);
  if (rawYear) {
    const yMatch = String(rawYear).match(/\b(20[12]\d)\b/);
    if (yMatch) gradYear = yMatch[1];
  }

  // Langues
  const languages = Array.isArray(structuredRawJson?.languages) ? structuredRawJson.languages : [];
  const getExplicitLanguageLevel = (languageName: string) => {
    const entry = languages.find((item: any) => {
      const name = item?.language?.value ?? item?.language;
      return typeof name === "string" && name.toLocaleLowerCase().includes(languageName);
    });
    const level = entry?.level?.value ?? entry?.level;
    if (typeof level !== "string" || !level.trim()) return { value: "", confidence: 0 };
    const referenceLanguage = languageName === "fr" ? "francais" : languageName === "anglais" ? "anglais" : "arabe";
    return matchLangueNiveau(referenceLanguage, level);
  };
  const langFrVal = getExplicitLanguageLevel("fr");
  const langEnVal = getExplicitLanguageLevel("anglais");
  const langArVal = getExplicitLanguageLevel("arab");
  const languageSummary = languages.map((item: any) => {
    const language = item?.language?.value ?? item?.language;
    const level = item?.level?.value ?? item?.level;
    return typeof language === "string" ? `${language}${typeof level === "string" && level.trim() ? ` : ${level}` : ""}` : "";
  }).filter(Boolean).join(" · ");

  // Compétences
  let skillsList: string[] = [];
  if (Array.isArray(structuredRawJson?.skills)) {
    skillsList = structuredRawJson.skills
      .map((s: any) => (typeof s === "string" ? s : s?.value || ""))
      .filter((s: string) => s && s.trim().length > 1);
  }

  // Certifications
  let certList: string[] = [];
  if (Array.isArray(structuredRawJson?.certifications)) {
    certList = structuredRawJson.certifications
      .map((c: any) => (typeof c === "string" ? c : c?.value || ""))
      .filter((c: string) => c && c.trim().length > 1);
  }

  // Prénom et Nom
  const rawFirstName = rawInfo.first_name?.value !== undefined ? rawInfo.first_name.value : (typeof rawInfo.first_name === "string" ? rawInfo.first_name : null);
  const rawLastName = rawInfo.last_name?.value !== undefined ? rawInfo.last_name.value : (typeof rawInfo.last_name === "string" ? rawInfo.last_name : null);
  const firstName = rawFirstName && typeof rawFirstName === "string" ? rawFirstName : null;
  const lastName = rawLastName && typeof rawLastName === "string" ? rawLastName : null;
  const fullName = firstName && lastName ? `${firstName} ${lastName}` : (firstName || lastName || "");

  // RÈGLE ABSOLUE : Si une valeur n'est pas identifiée ou confiance < 0.60, ne pas inventer dans la liste !
  const unmatchedFields: string[] = [];
  if (!matchV.value) unmatchedFields.push("ville");
  if (!matchEtab.value) unmatchedFields.push("etablissement");
  if (!matchNiv.value) unmatchedFields.push("niveau");

  const palFormValues = {
    nomfamille: lastName || "",
    prenom: firstName || "",
    nom: fullName,
    cin: normCin.value || "",
    naissance: normBirth.value || "",
    email: normEmail.value || "",
    tel: normPhone.value || "",
    ville: matchV.value || "", // Si null, laissé vide pour sélection manuelle par le candidat !
    adresse: firstFieldValue(rawInfo.address) || "",
    etablissement: matchEtab.value || "", // Ne pas inventer !
    niveau: matchNiv.value || "", // Ne pas inventer !
    filiere: matchFil.value || firstFieldValue(rawEdu.field_of_study) || "",
    anneeDiplome: gradYear || "",
    autresDiplomes: certList.join(", ") || "",
    experience: "",
    expPoste: rawExp.job_title?.value || "",
    expEntreprise: rawExp.company?.value || "",
    expDebut: rawExp.start_date?.value || "",
    expFin: rawExp.end_date?.value || "",
    competences: skillsList.join(", ") || "",
    langues: languageSummary,
    langFr: langFrVal.value,
    langEn: langEnVal.value,
    langAr: langArVal.value,
    objectif: "",
  };

  const confidenceScores: Record<string, number> = {
    first_name: rawInfo.first_name?.confidence || (firstName ? 0.9 : 0),
    last_name: rawInfo.last_name?.confidence || (lastName ? 0.9 : 0),
    cin: normCin.confidence,
    email: normEmail.confidence,
    phone: normPhone.confidence,
    date_of_birth: normBirth.confidence,
    city: matchV.confidence,
    institution: matchEtab.confidence,
    degree_level: matchNiv.confidence,
    field_of_study: matchFil.confidence,
  };

  const diagnostics = calculatePALDiagnostics(palFormValues);

  log("correspondance_champs", "success", `Formulaire prêt: ${Object.keys(palFormValues).filter(k => (palFormValues as any)[k]).length} champs valorisés avec certitude.`);

  return {
    filename,
    mimeType: mime,
    fileSizeBytes,
    isScannedOrImage,
    textExtractionMethod,
    extractedTextLength: extractedText.length,
    extractedTextSample: extractedText.substring(0, 300).replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[EMAIL_CACHÉ]"),
    aiConfigurationUsed: aiUsed,
    rawAiResponseSnippet: rawAiText.substring(0, 400),
    structuredJson: structuredRawJson,
    confidenceScores,
    normalizedFields: {
      phone: normPhone,
      email: normEmail,
      cin: normCin,
      date_of_birth: normBirth,
      city: matchV,
      institution: matchEtab,
      degree_level: matchNiv,
      field_of_study: matchFil,
    },
    palFormValues,
    unmatchedFields,
    auditLogs,
    diagnostics,
  };
}
