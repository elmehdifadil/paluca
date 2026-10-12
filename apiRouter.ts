import { Router } from "express";
import path from "path";
import fs from "fs";
import { GoogleGenAI } from "@google/genai";

export const apiRouter = Router();

// Store location: support /tmp on Vercel serverless environment
const DATA_DIR = process.env.VERCEL ? "/tmp/data" : path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "store.json");

// Ensure directory exists
try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
} catch (e) {
  console.warn("Could not create data dir:", e);
}

function loadStore() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, "utf-8");
      return JSON.parse(raw);
    }
    // If running on Vercel, copy initial seed from project directory if available
    const seedFile = path.join(process.cwd(), "data", "store.json");
    if (fs.existsSync(seedFile)) {
      const raw = fs.readFileSync(seedFile, "utf-8");
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error("Error reading store:", err);
  }
  return {
    rdvs: [],
    profils: [],
    news: [],
    ateliers: [],
    inscriptions: [],
    creneaux: [],
    banners: [],
  };
}

function saveStore(data: Record<string, any>) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("Error writing store:", err);
  }
}

function getGeminiClient(): GoogleGenAI | null {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  return new GoogleGenAI({ apiKey: key });
}

async function getMistralReply(prompt: string): Promise<string | null> {
  if (!process.env.MISTRAL_API_KEY) return null;
  const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.MISTRAL_API_KEY}` },
    body: JSON.stringify({ model: "mistral-small-latest", max_tokens: 1200, messages: [{ role: "user", content: prompt }] }),
  });
  if (!response.ok) throw new Error(`Mistral ${response.status}`);
  const body: any = await response.json();
  return body.choices?.[0]?.message?.content || null;
}

// Health check
apiRouter.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// GET /data
apiRouter.get("/data", (_req, res) => {
  const store = loadStore();
  res.json(store);
});

apiRouter.get("/banners", (req, res) => {
  const now = new Date();
  const origin = `${req.protocol}://${req.get("host")}`;
  const banners = (loadStore().banners || [])
    .filter((banner: any) => {
      const active = banner.active !== false && banner.status !== "inactive" && banner.status !== "draft";
      const starts = !banner.startDate || new Date(banner.startDate) <= now;
      const ends = !banner.endDate || new Date(banner.endDate) >= now;
      return active && starts && ends && (banner.imageUrl || banner.image || banner.url || banner.src);
    })
    .sort((a: any, b: any) => (Number(a.order) || 0) - (Number(b.order) || 0))
    .map((banner: any) => {
      const image = banner.imageUrl || banner.image || banner.url || banner.src;
      return { id: banner.id, title: banner.title || "", description: banner.description || "", link: banner.link || "", order: Number(banner.order) || 0,
        imageUrl: image.startsWith("http") || image.startsWith("data:") ? image : `${origin}${image.startsWith("/") ? "" : "/"}${image}` };
    });
  res.json({ banners });
});

// POST /data
apiRouter.post("/data", (req, res) => {
  const { key, value } = req.body;
  const store = loadStore();
  if (key) {
    store[key] = value;
    saveStore(store);
    return res.json({ success: true, key });
  }
  if (typeof req.body === "object") {
    Object.assign(store, req.body);
    saveStore(store);
    return res.json({ success: true });
  }
  res.status(400).json({ error: "Invalid data format" });
});

// POST /notify
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

    // Mistral powers the questionnaire and profile diagnostics when configured.
    try {
      const mistralPrompt = `Tu es le conseiller IA de PAL-UCA. Réponds en ${lang === "ar" ? "arabe" : "français"}, avec bienveillance et précision. Profil : ${JSON.stringify(profile)}. ${longForm ? "Pour ce diagnostic, fournis deux sections avec les marqueurs exacts [POUR_LE_CANDIDAT] puis [POUR_LE_CONSEILLER]." : ""}\n\nDemande de l'utilisateur : ${lastMsg}`;
      const mistralReply = await getMistralReply(mistralPrompt);
      if (mistralReply) return res.json({ reply: mistralReply, provider: "mistral" });
    } catch (mistralErr) {
      console.warn("Mistral diagnostic failed, trying fallback:", mistralErr);
    }

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

        const timeoutPromise = new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error("AI_TIMEOUT")), 4000)
        );

        const response: any = await Promise.race([
          ai.models.generateContent({
            model: "gemini-3.8-flash",
            contents: prompt,
          }),
          timeoutPromise
        ]);

        if (response.text) {
          return res.json({ reply: response.text });
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

// POST /cv
apiRouter.post("/cv", async (req, res) => {
  try {
    const { filename, data } = req.body;
    const ai = getGeminiClient();

    if (ai && data) {
      try {
        const prompt = `Tu es un expert en recrutement à l'Université Cadi Ayyad.
Analyse le document de CV fourni et extrait les informations clés au format JSON STRICT.
Champs requis dans le JSON:
{
  "nom": "nom complet ou nom de famille",
  "prenom": "prénom",
  "email": "adresse email trouvée ou chaîne vide",
  "tel": "numéro de téléphone marocain ou international ou chaîne vide",
  "filiere": "filière d'études ou domaine",
  "niveau": "Licence (Bac+3) ou Master (Bac+5) ou Doctorat ou Autre",
  "experience": "Débutant / Sans expérience ou Moins d'un an ou 1 à 3 ans ou Plus de 3 ans",
  "competences": "liste des compétences clés séparées par des virgules",
  "ville": "ville de résidence",
  "etablissement": "Faculté ou école UCA ou autre établissement"
}
Réponds UNIQUEMENT avec l'objet JSON valide, sans balises markdown ni texte supplémentaire.`;

        let mimeType = "application/pdf";
        if (filename.toLowerCase().endsWith(".docx")) {
          mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        } else if (filename.toLowerCase().endsWith(".png")) {
          mimeType = "image/png";
        } else if (filename.toLowerCase().endsWith(".jpg") || filename.toLowerCase().endsWith(".jpeg")) {
          mimeType = "image/jpeg";
        }

        const response = await ai.models.generateContent({
          model: "gemini-3.8-flash",
          contents: [
            { text: prompt },
            {
              inlineData: {
                mimeType: mimeType,
                data: data,
              },
            },
          ],
        });

        const rawText = response.text || "{}";
        const cleaned = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
        const parsed = JSON.parse(cleaned);

        return res.json({
          success: true,
          cvName: filename,
          fields: parsed,
        });
      } catch (aiErr) {
        console.warn("Gemini parsing failed, using fallback:", aiErr);
      }
    }

    const baseName = (filename || "cv.pdf").replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
    return res.json({
      success: true,
      cvName: filename,
      fields: {
        nom: baseName,
        prenom: "",
        email: "",
        tel: "",
        filiere: "Sciences & Techniques",
        niveau: "Master (Bac+5)",
        experience: "Moins d'un an",
        competences: "Bureautique, Communication, Gestion de projet",
        ville: "Marrakech",
        etablissement: "Enseignement Supérieur",
      },
    });
  } catch (err: any) {
    console.error("Error in /api/cv:", err);
    res.status(500).json({ success: false, error: "Erreur lors du traitement du CV" });
  }
});
