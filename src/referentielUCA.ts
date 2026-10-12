/**
 * Référentiel Officiel PAL-UCA (Université Cadi Ayyad & ANAPEC)
 * Utilisé pour la validation, normalisation et appariement intelligent des CVs
 */

export interface ConfidenceValue<T = string> {
  value: T;
  confidence: number; // 0.0 à 1.0
  source?: "exact_match" | "fuzzy_match" | "extracted" | "fallback" | "unmatched";
}

export interface StructuredCvOutput {
  personal_information: {
    first_name: ConfidenceValue<string | null>;
    last_name: ConfidenceValue<string | null>;
    cin: ConfidenceValue<string | null>;
    date_of_birth: ConfidenceValue<string | null>;
    phone: ConfidenceValue<string | null>;
    email: ConfidenceValue<string | null>;
    address: ConfidenceValue<string | null>;
    city: ConfidenceValue<string | null>;
  };
  education: Array<{
    degree_level: ConfidenceValue<string | null>;
    degree: ConfidenceValue<string | null>;
    field_of_study: ConfidenceValue<string | null>;
    institution: ConfidenceValue<string | null>;
    graduation_year: ConfidenceValue<string | number | null>;
  }>;
  experiences: Array<{
    company: ConfidenceValue<string | null>;
    job_title: ConfidenceValue<string | null>;
    start_date: ConfidenceValue<string | null>;
    end_date: ConfidenceValue<string | null>;
    description: ConfidenceValue<string | null>;
  }>;
  skills: Array<ConfidenceValue<string>>;
  languages: Array<{
    language: ConfidenceValue<string>;
    level: ConfidenceValue<string>;
  }>;
  certifications: Array<ConfidenceValue<string>>;
  internships: Array<{
    company: ConfidenceValue<string | null>;
    job_title: ConfidenceValue<string | null>;
    start_date: ConfidenceValue<string | null>;
    end_date: ConfidenceValue<string | null>;
    description: ConfidenceValue<string | null>;
  }>;
}

export const PAL_UCA_REFERENTIEL = {
  villes: [
    "Marrakech",
    "Al Haouz",
    "Chichaoua",
    "El Kelâa des Sraghna",
    "Essaouira",
    "Rehamna",
    "Safi",
    "Youssoufia",
    "Casablanca",
    "Rabat",
    "Agadir Ida-Outanane",
    "Fès",
    "Tanger-Assilah",
    "Meknès",
    "Oujda-Angad",
    "Kénitra",
    "Tétouan",
    "Béni Mellal",
    "Autre province",
  ],

  etablissements: [
    {
      id: "FSSM",
      nom: "Faculté des Sciences Semlalia (FSSM)",
      aliases: ["fssm", "faculte des sciences semlalia", "semlalia", "sciences semlalia"],
    },
    {
      id: "FST",
      nom: "Faculté des Sciences et Techniques (FST Guéliz)",
      aliases: ["fst", "fst gueliz", "faculte des sciences et techniques", "sciences et techniques", "fstg"],
    },
    {
      id: "FSJES",
      nom: "Faculté des Sciences Juridiques, Économiques et Sociales (FSJES)",
      aliases: ["fsjes", "droit", "economie", "fsjes marrakech", "sciences juridiques", "juridique et economique"],
    },
    {
      id: "FLSH",
      nom: "Faculté des Lettres et des Sciences Humaines (FLSH)",
      aliases: ["flsh", "lettres et sciences humaines", "faculte des lettres", "flsh marrakech"],
    },
    {
      id: "ENSA_MRK",
      nom: "École Nationale des Sciences Appliquées (ENSA Marrakech)",
      aliases: ["ensa", "ensa marrakech", "ensamk", "ecole nationale des sciences appliquees"],
    },
    {
      id: "ENCG_MRK",
      nom: "École Nationale de Commerce et de Gestion (ENCG Marrakech)",
      aliases: ["encg", "encg marrakech", "ecole nationale de commerce et de gestion"],
    },
    {
      id: "ENS",
      nom: "École Normale Supérieure (ENS Marrakech)",
      aliases: ["ens", "ens marrakech", "ecole normale superieure"],
    },
    {
      id: "FMPM",
      nom: "Faculté de Médecine et de Pharmacie (FMPM)",
      aliases: ["fmpm", "medecine", "pharmacie", "faculte de medecine"],
    },
    {
      id: "EST_ESS",
      nom: "École Supérieure de Technologie (EST Essaouira)",
      aliases: ["est essaouira", "ecole superieure de technologie essaouira"],
    },
    {
      id: "EST_SAF",
      nom: "École Supérieure de Technologie (EST Safi)",
      aliases: ["est safi", "ecole superieure de technologie safi"],
    },
    {
      id: "EST_KEL",
      nom: "École Supérieure de Technologie (EST El Kelâa)",
      aliases: ["est kelaa", "est el kelaa", "est des sraghna"],
    },
    {
      id: "FPS",
      nom: "Faculté Polydisciplinaire de Safi (FPS)",
      aliases: ["fps", "polydisciplinaire safi", "faculte polydisciplinaire"],
    },
    {
      id: "ENSA_SAF",
      nom: "ENSA Safi",
      aliases: ["ensa safi", "ensa de safi"],
    },
    {
      id: "AUTRE",
      nom: "Autre établissement",
      aliases: ["autre", "hors uca"],
    },
  ],

  niveaux: [
    {
      nom: "Bac+2 (DEUG, DUT, BTS)",
      aliases: ["bac+2", "deug", "dut", "bts", "deust", "dts"],
    },
    {
      nom: "Licence Fondamentale (Bac+3)",
      aliases: ["licence fondamentale", "bac+3", "licence", "bachelor", "lf"],
    },
    {
      nom: "Licence Professionnelle (Bac+3)",
      aliases: ["licence professionnelle", "licence pro", "lp"],
    },
    {
      nom: "Master Fondamental (Bac+5)",
      aliases: ["master fondamental", "master recherche", "master", "m2", "bac+5"],
    },
    {
      nom: "Master Spécialisé (Bac+5)",
      aliases: ["master spécialisé", "master specialise", "master pro", "ms"],
    },
    {
      nom: "Diplôme d'Ingénieur d'État (Bac+5)",
      aliases: ["ingenieur d'etat", "diplome d'ingenieur", "cycle ingenieur", "ingenieur"],
    },
    {
      nom: "Diplôme ENCG (Bac+5)",
      aliases: ["diplome encg", "laureat encg", "cycle normal encg"],
    },
    {
      nom: "Doctorat (Bac+8)",
      aliases: ["doctorat", "bac+8", "phd", "docteur", "these"],
    },
  ],

  filieres: [
    "Génie Informatique & Systèmes",
    "Sciences Économiques & Gestion",
    "Sciences Juridiques & Droit",
    "Sciences Mathématiques & Informatique",
    "Physique & Ingénierie Énergétique",
    "Biologie, Santé & Environnement",
    "Génie Civil & BTP",
    "Génie Industriel & Logistique",
    "Lettres, Langues & Communication",
    "Tourisme, Hôtellerie & Patrimoine",
  ],

  experiences: [
    "Débutant / Premier emploi",
    "1 à 2 ans",
    "3 à 5 ans",
    "Plus de 5 ans",
  ],

  niveauxLangue: {
    francais: ["Courant", "Intermédiaire", "Notions", "Bilingue"],
    anglais: ["Courant", "Intermédiaire", "Débutant"],
    arabe: ["Maternelle", "Courant", "Intermédiaire"],
  },
};
