// Données marché cinéma français — mise à jour trimestrielle
// Dernière mise à jour : mars 2025

export const MARKET_DATA = {

  // ── TOP 50 HISTORIQUE BOX OFFICE FRANCE (films français) ─────────
  topHistorique: [
    { rang: 1, titre: "Bienvenue chez les Ch'tis", date: "2008", entrees: 20489303, genre: "Comédie" },
    { rang: 2, titre: "Intouchables", date: "2011", entrees: 19490688, genre: "Comédie dramatique" },
    { rang: 3, titre: "La Grande Vadrouille", date: "1966", entrees: 17267607, genre: "Comédie / Aventure" },
    { rang: 4, titre: "Astérix et Obélix : Mission Cléopâtre", date: "2002", entrees: 14559509, genre: "Comédie / Aventure" },
    { rang: 5, titre: "Les Visiteurs", date: "1993", entrees: 13782991, genre: "Comédie" },
    { rang: 6, titre: "Le Petit Monde de Don Camillo", date: "1952", entrees: 12791168, genre: "Comédie" },
    { rang: 7, titre: "Qu'est-ce qu'on a fait au Bon Dieu ?", date: "2014", entrees: 12366033, genre: "Comédie" },
    { rang: 8, titre: "Le Corniaud", date: "1965", entrees: 11739783, genre: "Comédie / Aventure" },
    { rang: 9, titre: "Un p'tit truc en plus", date: "2024", entrees: 10830209, genre: "Comédie" },
    { rang: 10, titre: "Les Bronzés 3 : Amis pour la vie", date: "2006", entrees: 10355930, genre: "Comédie" },
    { rang: 11, titre: "Taxi 2", date: "2000", entrees: 10345901, genre: "Comédie / Action" },
    { rang: 12, titre: "Trois hommes et un couffin", date: "1985", entrees: 10251465, genre: "Comédie" },
    { rang: 13, titre: "Le Dîner de cons", date: "1998", entrees: 9247001, genre: "Comédie" },
    { rang: 14, titre: "Astérix et Obélix contre César", date: "1999", entrees: 8948624, genre: "Comédie / Aventure" },
    { rang: 15, titre: "La Vache et le prisonnier", date: "1959", entrees: 8844199, genre: "Comédie" },
    { rang: 16, titre: "Les Choristes", date: "2004", entrees: 8636016, genre: "Drame / Comédie" },
    { rang: 17, titre: "Rien à déclarer", date: "2011", entrees: 8150825, genre: "Comédie" },
    { rang: 18, titre: "Les Visiteurs II", date: "1998", entrees: 8043129, genre: "Comédie" },
    { rang: 19, titre: "La Vérité si je mens ! 2", date: "2001", entrees: 7826393, genre: "Comédie" },
    { rang: 20, titre: "Le Gendarme de Saint-Tropez", date: "1964", entrees: 7809334, genre: "Comédie" },
    { rang: 21, titre: "La Famille Bélier", date: "2014", entrees: 7450944, genre: "Comédie dramatique" },
    { rang: 22, titre: "Les Aventures de Rabbi Jacob", date: "1973", entrees: 7295727, genre: "Comédie" },
    { rang: 23, titre: "Les Trois Frères", date: "1995", entrees: 6897098, genre: "Comédie" },
    { rang: 24, titre: "Astérix aux Jeux Olympiques", date: "2008", entrees: 6817803, genre: "Comédie / Aventure" },
    { rang: 25, titre: "Qu'est-ce qu'on a encore fait au Bon Dieu ?", date: "2019", entrees: 6711618, genre: "Comédie" },
    { rang: 26, titre: "Taxi", date: "1998", entrees: 6522121, genre: "Comédie / Action" },
    { rang: 27, titre: "La Gloire de mon père", date: "1990", entrees: 6291402, genre: "Drame / Comédie" },
    { rang: 28, titre: "Taxi 3", date: "2003", entrees: 6151691, genre: "Comédie / Action" },
    { rang: 29, titre: "Les Tuche 3", date: "2018", entrees: 5687200, genre: "Comédie" },
    { rang: 30, titre: "Marsupilami", date: "2026", entrees: 5670544, genre: "Comédie / Aventure" },
    { rang: 31, titre: "La Ch'tite famille", date: "2018", entrees: 5626049, genre: "Comédie" },
  ],

  // ── TOP BOX OFFICE FRANCE 2024 (films français) ──────────────────
  boxOffice2024: [
    { titre: "Un p'tit truc en plus", realisateur: "Artus", entrees: 10700000, genre: "Comédie", distrib: "Pan Distribution" },
    { titre: "Le Comte de Monte-Cristo", realisateur: "Matthieu Delaporte, Alexandre de La Patellière", entrees: 9400000, genre: "Aventure historique", distrib: "Pathé" },
    { titre: "Tout sauf toi", realisateur: "Will Gluck", entrees: 4200000, genre: "Comédie romantique", distrib: "Sony" },
    { titre: "Nous, les Leroy", realisateur: "Florian Zeller", entrees: 3100000, genre: "Comédie dramatique", distrib: "Gaumont" },
    { titre: "L'Amour ouf", realisateur: "Gilles Lellouche", entrees: 2900000, genre: "Drame romantique / Thriller", distrib: "StudioCanal" },
    { titre: "Le Fil", realisateur: "Daniel Auteuil", entrees: 2200000, genre: "Drame judiciaire", distrib: "UGC" },
    { titre: "Monsieur Aznavour", realisateur: "Grand Corps Malade, Mehdi Idir", entrees: 2000000, genre: "Biopic musical", distrib: "Pathé" },
    { titre: "Survivre", realisateur: "Frédéric Jardin", entrees: 1800000, genre: "Thriller", distrib: "SND" },
    { titre: "Emilia Pérez", realisateur: "Jacques Audiard", entrees: 1600000, genre: "Comédie musicale / Drame", distrib: "Pathé" },
    { titre: "Jamais sans mon psy", realisateur: "Tristan Séguéla", entrees: 1500000, genre: "Comédie", distrib: "StudioCanal" },
    { titre: "Bonne conduite", realisateur: "Jonathan Barré", entrees: 1400000, genre: "Comédie", distrib: "UGC" },
    { titre: "Le Roman de Jim", realisateur: "Arnaud Larrieu, Jean-Marie Larrieu", entrees: 500000, genre: "Drame", distrib: "Ad Vitam" },
    { titre: "Vingt Dieux", realisateur: "Louise Courvoisier", entrees: 450000, genre: "Comédie dramatique", distrib: "Diaphana" },
    { titre: "Miséricorde", realisateur: "Alain Guiraudie", entrees: 400000, genre: "Thriller rural", distrib: "Les Films du Losange" },
    { titre: "Les Graines du figuier sauvage", realisateur: "Mohammad Rasoulof", entrees: 380000, genre: "Drame politique", distrib: "Pyramide" },
  ],

  // ── TOP BOX OFFICE FRANCE 2023 (films français) ──────────────────
  boxOffice2023: [
    { titre: "Astérix et Obélix : L'Empire du Milieu", realisateur: "Guillaume Canet", entrees: 4600000, genre: "Comédie / Aventure", distrib: "Pathé" },
    { titre: "Alibi.com 2", realisateur: "Philippe Lacheau", entrees: 3800000, genre: "Comédie", distrib: "StudioCanal" },
    { titre: "Anatomie d'une chute", realisateur: "Justine Triet", entrees: 3400000, genre: "Drame judiciaire", distrib: "Le Pacte" },
    { titre: "Le Règne animal", realisateur: "Thomas Cailley", entrees: 2400000, genre: "Fantastique / Drame", distrib: "Gaumont" },
    { titre: "Normale", realisateur: "Olivier Babinet", entrees: 1200000, genre: "Comédie", distrib: "Le Pacte" },
    { titre: "Chien et Chat", realisateur: "Reem Kherici", entrees: 2100000, genre: "Comédie familiale", distrib: "Pathé" },
    { titre: "Sur les chemins noirs", realisateur: "Denis Imbert", entrees: 1100000, genre: "Aventure / Drame", distrib: "SND" },
    { titre: "Yannick", realisateur: "Quentin Dupieux", entrees: 1000000, genre: "Comédie absurde", distrib: "Diaphana" },
    { titre: "L'Abbé Pierre — Une vie de combats", realisateur: "Frédéric Tellier", entrees: 950000, genre: "Biopic", distrib: "UGC" },
    { titre: "Passages", realisateur: "Ira Sachs", entrees: 300000, genre: "Drame", distrib: "SBS" },
  ],

  // ── PALMARÈS CANNES 2024 ──────────────────────────────────────────
  cannes2024: {
    palmeOr: { titre: "Anora", realisateur: "Sean Baker", pays: "USA" },
    grandPrix: { titre: "All We Imagine as Light", realisateur: "Payal Kapadia", pays: "Inde/France" },
    prixJury: { titre: "Emilia Pérez", realisateur: "Jacques Audiard", pays: "France" },
    prixMiseEnScene: { titre: "Les Graines du figuier sauvage", realisateur: "Mohammad Rasoulof", pays: "Allemagne/Iran" },
    prixInterpretationF: { titre: "Emilia Pérez", actrice: "Adriana Paz, Zoe Saldaña, Karla Sofía Gascón, Selena Gomez" },
    prixInterpretationM: { titre: "Kinds of Kindness", acteur: "Jesse Plemons" },
    prixScenario: { titre: "The Substance", realisateur: "Coralie Fargeat" },
    cameraOr: { titre: "Armand", realisateur: "Halfdan Ullmann Tøndel", pays: "Norvège" },
  },

  // ── PALMARÈS CANNES 2023 ──────────────────────────────────────────
  cannes2023: {
    palmeOr: { titre: "Anatomie d'une chute", realisateur: "Justine Triet", pays: "France" },
    grandPrix: { titre: "The Zone of Interest", realisateur: "Jonathan Glazer", pays: "UK" },
    prixJury: { titre: "Les Feuilles mortes", realisateur: "Aki Kaurismäki", pays: "Finlande" },
    prixMiseEnScene: { titre: "La Passion de Dodin Bouffant", realisateur: "Trần Anh Hùng", pays: "France" },
    prixInterpretationF: { titre: "Monster", actrice: "Merve Dizdar" },
    prixInterpretationM: { titre: "Anatomie d'une chute", acteur: "Kōji Yakusho" },
  },

  // ── CÉSAR 2025 (cérémonie fév. 2025, films 2024) ─────────────────
  cesar2025: {
    meilleurFilm: "Emilia Pérez",
    meilleurRealisation: "Jacques Audiard (Emilia Pérez)",
    meilleurActrice: "Karla Sofía Gascón (Emilia Pérez)",
    meilleurActeur: "François Civil (Le Comte de Monte-Cristo)",
    meilleurPremierFilm: "Vingt Dieux (Louise Courvoisier)",
    meilleurScenarioOriginal: "Anatomie d'une chute (Justine Triet, Arthur Harari)",
    meilleurFilmEtranger: "The Substance (Coralie Fargeat)",
  },

  // ── CÉSAR 2024 (cérémonie fév. 2024, films 2023) ─────────────────
  cesar2024: {
    meilleurFilm: "Anatomie d'une chute",
    meilleurRealisation: "Justine Triet",
    meilleurActrice: "Sandra Hüller (Anatomie d'une chute)",
    meilleurActeur: "Arieh Worthalter (Le Procès Goldman)",
    meilleurPremierFilm: "Le Règne animal (Thomas Cailley)",
  },

  // ── TENDANCES MARCHÉ 2024-2025 ────────────────────────────────────
  tendances: [
    "Fréquentation 2024 : ~181M d'entrées en France, en hausse vs 2023 (175M). Le cinéma français reprend des couleurs.",
    "Le phénomène 'Un p'tit truc en plus' (10.7M entrées) prouve que la comédie populaire inclusive reste le genre roi en France.",
    "Retour en force du film historique/aventure : Le Comte de Monte-Cristo (9.4M) montre l'appétit pour les grandes fresques.",
    "Le drame d'auteur peut encore cartonner en salle : Anatomie d'une chute (3.4M en 2023) portée par la Palme d'Or.",
    "Les plateformes investissent massivement le cinéma français : Netflix (Sous la Seine, En Place), Canal+ reste leader.",
    "Émergence du thriller français : Survivre (1.8M), L'Amour ouf montre l'appétit pour le genre.",
    "Le premier film reste une voie d'accès : Vingt Dieux (César du premier film 2025), budget modeste, succès critique.",
    "Tendance biopic/musical : Monsieur Aznavour (2M), confirmant la tendance post-Edith Piaf, Cloclo, France.",
    "L'art et essai a ses champions : Miséricorde (Guiraudie), Le Roman de Jim montrent que le circuit art et essai fonctionne avec un bon film.",
    "Le court métrage français reste dynamique : Cannes, Clermont-Ferrand, César. Voie d'accès privilégiée pour les premiers réalisateurs.",
  ],

  // ── DONNÉES PLATEFORMES 2024-2025 ─────────────────────────────────
  plateformesRecentes: {
    netflix: {
      succesRecents: ["Sous la Seine (2024, thriller)", "En Place S2 (2024, comédie)", "Lupin S3 (2025)", "Ad Vitam (2025, thriller SF)"],
      tendance: "Monte en puissance sur le cinéma français. Cherche des concepts high-concept exportables. Budget moyen-haut.",
    },
    canalPlus: {
      succesRecents: ["Tapie (2023, biopic)", "Les Guerres de Lucas (2024)", "Black Butterflies S2 (2024)", "Syndrome E (2024, thriller)"],
      tendance: "Reste le partenaire historique du cinéma français. Investit dans le premium sombre et auteur.",
    },
    arte: {
      succesRecents: ["En thérapie S3 (2024)", "Tout va bien (2024, drame social)", "Polar Park (2024, comédie noire)"],
      tendance: "Miniséries 6-8 épisodes, originalité de forme, sujets sociétaux. Budget modeste mais liberté créative maximale.",
    },
    franceTv: {
      succesRecents: ["HPI S4 (2024, comédie policière)", "Marianne (2024)", "Un si grand soleil (quotidienne)"],
      tendance: "france.tv se positionne comme plateforme de rattrapage + originaux. Public 40+, familial, policier.",
    },
    disneyPlus: {
      succesRecents: ["Oussekine (2022, drame)", "Parallèles (2022, SF YA)", "Tout va bien (2023)"],
      tendance: "Réduit les investissements en contenu local. Moins de nouvelles productions françaises.",
    },
    primeVideo: {
      succesRecents: ["Flashback (2024, thriller)", "Les Combattantes (2022, historique)"],
      tendance: "Investissement sélectif. Cherche du thriller/action à potentiel international.",
    },
  },

  // ── FRÉQUENTATION ANNUELLE ────────────────────────────────────────
  frequentation: {
    2024: { total: 181000000, partFR: 44, nbFilms: 720 },
    2023: { total: 175000000, partFR: 40, nbFilms: 700 },
    2022: { total: 152000000, partFR: 41, nbFilms: 680 },
    2021: { total: 96000000, partFR: 41, nbFilms: 590 },
    2020: { total: 65000000, partFR: 45, nbFilms: 430 },
    2019: { total: 213000000, partFR: 35, nbFilms: 720 },
  },
};
