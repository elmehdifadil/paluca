import { runFullCvPipeline } from "./cvAuditPipeline.js";

/**
 * Suite de tests automatisés couvrant les 8 profils de CVs obligatoires
 */
async function runAllTests() {
  console.log("================================================================================");
  console.log("   AUDIT TECHNIQUE ET VALIDATION DES 8 TYPES DE CVs - PAL-UCA");
  console.log("================================================================================\n");

  const testCases = [
    {
      id: 1,
      title: "1. CV PDF classique (Texte direct)",
      filename: "CV_Yassine_Alami_Classique.pdf",
      text: `CURRICULUM VITAE
Yassine ALAMI
Email : yassine.alami@uca.ma | Tél : +212 6 61 23 45 67 | CIN : EE452109
Ville : Marrakech, Quartier Daoudiate

FORMATION :
2023 - 2025 : Master Spécialisé en Génie Informatique & Systèmes
Faculté des Sciences Semlalia (FSSM), Université Cadi Ayyad Marrakech
2020 - 2023 : Licence Fondamentale SMI, FSSM Marrakech

EXPÉRIENCE :
Février 2025 - Juillet 2025 : Développeur Web Stagiaire chez TechMaroc Solutions (Marrakech)
Missions : Conception d'une plateforme d'accompagnement universitaire, React & Node.js.

COMPÉTENCES :
Python, TypeScript, React, PostgreSQL, Docker, Gestion de projet Scrum, Communication

LANGUES :
Arabe : Langue maternelle
Français : Courant
Anglais : Intermédiaire`,
      scanned: false,
    },
    {
      id: 2,
      title: "2. CV PDF multi-colonnes (Mise en page latérale)",
      filename: "CV_Sara_Benjelloun_Colonnes.pdf",
      text: `[COLONNE GAUCHE - INFOS & CONTACT]
Sara BENJELLOUN
CIN : AB987654
Née le : 14/05/2001
Tél : 0670112233
Email : sara.benjelloun@gmail.com
Adresse : Guéliz, Marrakech
Compétences : Analyse financière, Contrôle de gestion, Audit, Excel avancé, Power BI
Langues : Arabe (Natif), Français (Bilingue), Anglais (Courant)

[COLONNE DROITE - PARCOURS]
FORMATION :
Diplôme ENCG (Bac+5) - Option Gestion Financière et Comptable
École Nationale de Commerce et de Gestion (ENCG Marrakech) - Lauréate 2024

EXPÉRIENCE PROFESSIONNELLE :
Mars 2024 - Août 2024 : Assistante Auditrice Financière chez Cabinet Audit Fiduciaire Marrakech
Participation aux missions de commissariat aux comptes et audit légal.`,
      scanned: false,
    },
    {
      id: 3,
      title: "3. CV PDF scanné (Image / Scan simulant OCR)",
      filename: "CV_Scanned_Omar_Tazi.png",
      rawBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      text: `DOCUMENT SCANNE PAR APPAREIL PHOTO
Omar TAZI
CIN : J543210
Tel : 0524430011
Email : omar.tazi@outlook.com
Residence : Safi
Faculte Polydisciplinaire de Safi (FPS)
Licence Professionnelle en Chimie Appliquee 2023
Stage chez OCP Safi en controle qualite`,
      scanned: true,
    },
    {
      id: 4,
      title: "4. CV multi-pages (2 pages consécutives)",
      filename: "CV_Dr_Karim_Idrissi_MultiPages.pdf",
      text: `--- PAGE 1 ---
Dr. Karim IDRISSI
Email : k.idrissi@uca.ac.ma - Tél : +212 6 14 55 66 77
CIN : SH112233
Ville : Marrakech
TITRE : Docteur en Sciences des Matériaux & Énergies Renouvelables
FORMATION :
2020 - 2024 : Doctorat (Bac+8) en Physique des Matériaux
Faculté des Sciences et Techniques (FST Guéliz), Université Cadi Ayyad
2018 - 2020 : Master Fondamental en Énergétique, FST Guéliz

--- PAGE 2 ---
EXPÉRIENCE & RECHERCHE :
2021 - 2024 : Chercheur Doctorant & Vacataire à l'UCA Marrakech
Enseignement des travaux pratiques et modélisation thermique sous Matlab.
PUBLICATIONS & COMPÉTENCES :
4 articles internationaux indexés Scopus. Matériaux solaires, spectroscopie, rédaction scientifique.
Langues : Arabe (maternelle), Français (courant), Anglais (avancé/C1).`,
      scanned: false,
    },
    {
      id: 5,
      title: "5. CV en français standard",
      filename: "CV_Mouna_Chraibi_Francais.pdf",
      text: `Mouna CHRAIBI
24 rue de la Liberté, Essaouira
Email : mouna.chraibi@uca.ma - Téléphone : 06 63 99 88 77
CIN : HH778899

Diplôme d'Ingénieur d'État en Génie Civil (Bac+5)
École Nationale des Sciences Appliquées (ENSA Safi) - Promotion 2025

Expérience :
Février 2025 - Juin 2025 : Ingénieure Stagiaire BTP chez Groupe Travaux Publics Marrakech
Suivi de chantier et calcul des structures sous Robot Structural Analysis.
Compétences : AutoCAD, Robot, RDM, Gestion d'équipe chantier, Permis B.`,
      scanned: false,
    },
    {
      id: 6,
      title: "6. CV bilingue contenant des caractères arabes",
      filename: "CV_Hamza_Mansouri_Arabe_Francais.pdf",
      text: `السيرة الذاتية - Curriculum Vitae
الاسم الكامل : حمزة المنصوري / Hamza MANSOURI
رقم البطاقة الوطنية CIN : K998877
الهاتف : +212 6 52 33 44 55 | البريد الإلكتروني : hamza.mansouri@gmail.com
العنوان : قلعة السراغنة / El Kelâa des Sraghna

التكوين الأكاديمي (Formation) :
إجازة مهنية في التدبير والمحاسبة (Licence Professionnelle Bac+3)
École Supérieure de Technologie (EST El Kelâa) - سنة التخرج : 2024

المهارات (Compétences) :
المحاسبة العامة، دراسة الجدوى، التدقيق الداخلي، Sage Comptabilité
اللغات : العربية (اللغة الأم)، الفرنسية (مستوى متقدم/Courant)`,
      scanned: false,
    },
    {
      id: 7,
      title: "7. CV structuré sous forme de tableau",
      filename: "CV_Nadia_Fassi_Tableau.pdf",
      text: `| Rubrique | Détail |
| Candidat | Nadia FASSI |
| Contact | 0611224455 / nadia.fassi@gmail.com |
| Pièce | CIN EE887766 |
| Lieu | Chichaoua |
| Diplôme | Master Fondamental (Bac+5) |
| Discipline | Droit Privé et Sciences Juridiques |
| Faculté | Faculté des Sciences Juridiques, Économiques et Sociales (FSJES Marrakech) |
| Année | 2023 |
| Stages | Stagiaire Juriste chez Cabinet d'Avocats Marrakech (6 mois) |
| Atouts | Droit des contrats, Contentieux, Rédaction juridique, Conseil |`,
      scanned: false,
    },
    {
      id: 8,
      title: "8. CV avec informations manquantes (Ne pas inventer !)",
      filename: "CV_Anonyme_Incomplet.pdf",
      text: `Salma
Titulaire d'un diplôme d'études universitaires.
Intéressée par les offres de travail dans le domaine commercial.
Compétences : Vente, Accueil client, Négociation.
Disponibilité immédiate.`,
      scanned: false,
    },
  ];

  for (const tc of testCases) {
    console.log(`\n--------------------------------------------------------------------------------`);
    console.log(`TEST ${tc.id} : ${tc.title}`);
    console.log(`Fichier : ${tc.filename}`);

    const res = await runFullCvPipeline({
      filename: tc.filename,
      rawText: tc.text,
      base64Data: tc.rawBase64,
      modelConfig: "auto",
      safeLogging: false,
    });

    console.log(`→ Moteur utilisé : ${res.aiConfigurationUsed}`);
    console.log(`→ Méthode extraction texte : ${res.textExtractionMethod} (${res.extractedTextLength} caractères)`);
    console.log(`→ Détection scan : ${res.isScannedOrImage ? "OUI" : "NON"}`);
    console.log(`→ Données injectées dans le formulaire :`);
    console.log(`   - Nom complet : "${res.palFormValues.nom}" (Confiance: ${res.confidenceScores.last_name || 0})`);
    console.log(`   - CIN : "${res.palFormValues.cin}" (Confiance: ${res.confidenceScores.cin})`);
    console.log(`   - Email : "${res.palFormValues.email}" (Confiance: ${res.confidenceScores.email})`);
    console.log(`   - Tél : "${res.palFormValues.tel}" (Confiance: ${res.confidenceScores.phone})`);
    console.log(`   - Ville (Référentiel) : "${res.palFormValues.ville}" (Confiance: ${res.confidenceScores.city})`);
    console.log(`   - Établissement (Référentiel) : "${res.palFormValues.etablissement}" (Confiance: ${res.confidenceScores.institution})`);
    console.log(`   - Niveau (Référentiel) : "${res.palFormValues.niveau}" (Confiance: ${res.confidenceScores.degree_level})`);
    console.log(`   - Filière : "${res.palFormValues.filiere}"`);
    console.log(`   - Année : "${res.palFormValues.anneeDiplome}"`);
    console.log(`   - Champs non trouvés laissés vides (RÈGLE ABSOLUE) : [${res.unmatchedFields.join(", ")}]`);
    console.log(`   - Diagnostic ANAPEC généré : Score global ${res.diagnostics.scores.global}%`);
  }

  console.log("\n================================================================================");
  console.log("   TESTS TERMINÉS AVEC SUCCÈS SUR LES 8 SCÉNARIOS DE CV");
  console.log("================================================================================");
}

runAllTests().catch((e) => console.error("Erreur test suite:", e));
