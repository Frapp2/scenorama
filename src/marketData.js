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

  // ── BOX OFFICE FRANCE 2026 (en cours — top 30) ────────────────────
  boxOffice2026: [
    { titre: "Marsupilami", entrees: 5670544, genre: "Comédie" },
    { titre: "Gourou", entrees: 1996406, genre: "Thriller" },
    { titre: "Les Enfants de la Résistance", realisateur: "Christophe Barratier", entrees: 1212194, genre: "Aventure / Action" },
    { titre: "L'Affaire Bojarski", realisateur: "Jean-Paul Salomé", entrees: 1157959, genre: "Drame" },
    { titre: "Marty Supreme", entrees: 976233, genre: "Drame" },
    { titre: "Jumpers", entrees: 963395, genre: "Animation" },
    { titre: "Scream 7", entrees: 943227, genre: "Horreur" },
    { titre: "LOL 2.0", realisateur: "Lisa Azuelos", entrees: 926627, genre: "Comédie" },
    { titre: "Chers parents", entrees: 820792, genre: "Comédie" },
    { titre: "Le Mage du Kremlin", realisateur: "Olivier Assayas", entrees: 680293, genre: "Thriller" },
    { titre: "Goat — rêver plus haut", entrees: 677606, genre: "Animation" },
    { titre: "Le Rêve américain", entrees: 631183, genre: "Comédie" },
    { titre: "Hurlevent", entrees: 545847, genre: "Drame" },
    { titre: "Hamnet", entrees: 521870, genre: "Drame" },
    { titre: "Nuremberg", entrees: 521838, genre: "Drame" },
    { titre: "L'Infiltrée", entrees: 449875, genre: "Comédie" },
    { titre: "Projet dernière chance", entrees: 413204, genre: "Science-Fiction" },
    { titre: "Les Légendaires, le film", entrees: 385067, genre: "Animation" },
    { titre: "La Maison des femmes", entrees: 359130, genre: "Drame" },
    { titre: "Les Rayons et les Ombres", entrees: 303452, genre: "Drame" },
    { titre: "Father Mother Sister Brother", realisateur: "Jim Jarmusch", entrees: 294791, genre: "Comédie dramatique" },
    { titre: "Le Crime du 3e étage", entrees: 287683, genre: "Comédie dramatique" },
    { titre: "Le Gâteau du Président", entrees: 253645, genre: "Drame" },
    { titre: "Aucun autre choix", entrees: 242751, genre: "Comédie" },
    { titre: "À pied d'œuvre", entrees: 237553, genre: "Comédie dramatique" },
    { titre: "Furcy, né libre", entrees: 235191, genre: "Drame" },
    { titre: "LES K D'OR", entrees: 233980, genre: "Comédie" },
  ],

  // ── BOX OFFICE FRANCE 2025 (top 30) ──────────────────────────────
  boxOffice2025: [
    { titre: "Avatar : de feu et de cendres", entrees: 8843567, genre: "Science-Fiction" },
    { titre: "Zootopie 2", entrees: 8682173, genre: "Animation" },
    { titre: "Lilo & Stitch (2025)", entrees: 5162390, genre: "Film familial" },
    { titre: "La Femme de ménage", entrees: 4439560, genre: "Thriller" },
    { titre: "F1 Le Film", entrees: 3371524, genre: "Aventure / Action" },
    { titre: "Jurassic World : Renaissance", entrees: 3021177, genre: "Aventure / Action" },
    { titre: "God Save the Tuche", entrees: 3007866, genre: "Comédie" },
    { titre: "Minecraft, Le Film", entrees: 2712147, genre: "Aventure / Action" },
    { titre: "Dragons (2025)", entrees: 2580896, genre: "Fantasy" },
    { titre: "Mission: Impossible — The Final Reckoning", entrees: 2498716, genre: "Aventure / Action" },
    { titre: "Conjuring : l'heure du jugement", entrees: 2368089, genre: "Horreur" },
    { titre: "Paddington au Pérou", entrees: 1856674, genre: "Film familial" },
    { titre: "Demon Slayer: La Forteresse Infinie", entrees: 1759440, genre: "Animation" },
    { titre: "Superman (2025)", entrees: 1655928, genre: "Comicbook" },
    { titre: "Ma Mère, Dieu et Sylvie Vartan", entrees: 1506984, genre: "Comédie dramatique" },
    { titre: "Un ours dans le Jura", entrees: 1482761, genre: "Comédie" },
    { titre: "Chien 51", realisateur: "Cédric Jimenez", entrees: 1386155, genre: "Science-Fiction" },
    { titre: "Le Chant des forêts", entrees: 1280430, genre: "Documentaire" },
    { titre: "Chasse gardée 2", entrees: 1171306, genre: "Comédie" },
    { titre: "Mickey 17", entrees: 1190565, genre: "Science-Fiction" },
  ],

  // ── BOX OFFICE FRANCE 2024 (top 30 tous films) ───────────────────
  boxOffice2024: [
    { titre: "Un p'tit truc en plus", entrees: 10830209, genre: "Comédie" },
    { titre: "Le Comte de Monte-Cristo", entrees: 9382216, genre: "Aventure / Action" },
    { titre: "Vice-Versa 2", entrees: 8427652, genre: "Animation" },
    { titre: "Vaiana 2", entrees: 8081044, genre: "Animation" },
    { titre: "Mufasa : Le Roi Lion", entrees: 5235083, genre: "Animation" },
    { titre: "L'Amour ouf", realisateur: "Gilles Lellouche", entrees: 4939189, genre: "Romance / Thriller" },
    { titre: "Moi, Moche et Méchant 4", entrees: 4469132, genre: "Animation" },
    { titre: "Dune : Deuxième Partie", entrees: 4203460, genre: "Science-Fiction" },
    { titre: "Deadpool & Wolverine", entrees: 3716702, genre: "Comicbook" },
    { titre: "Gladiator II", entrees: 3051129, genre: "Péplum" },
    { titre: "En fanfare", entrees: 2618966, genre: "Comédie" },
    { titre: "Sonic 3", entrees: 2604791, genre: "Aventure / Action" },
    { titre: "La Planète des Singes : Le Nouveau Royaume", entrees: 2487931, genre: "Science-Fiction" },
    { titre: "Kung Fu Panda 4", entrees: 2395786, genre: "Animation" },
    { titre: "Monsieur Aznavour", entrees: 2034429, genre: "Musical / Biopic" },
    { titre: "Cocorico", entrees: 1956846, genre: "Comédie" },
    { titre: "Bob Marley: One Love", entrees: 1902472, genre: "Drame / Biopic" },
    { titre: "Le Robot Sauvage", entrees: 1812999, genre: "Animation" },
    { titre: "Beetlejuice Beetlejuice", entrees: 1713702, genre: "Fantasy" },
    { titre: "Juré n°2", realisateur: "Clint Eastwood", entrees: 1629125, genre: "Drame" },
    { titre: "Une vie (2024)", entrees: 1586333, genre: "Drame" },
    { titre: "Maison de retraite 2", entrees: 1557651, genre: "Comédie" },
    { titre: "Emilia Pérez", realisateur: "Jacques Audiard", entrees: 1247702, genre: "Drame / Musical" },
    { titre: "Conclave", entrees: 1244210, genre: "Thriller" },
  ],

  // ── BOX OFFICE FRANCE 2023 (top 30) ────────────────────────────────
  boxOffice2023: [
    { titre: "Super Mario Bros, le film", entrees: 7359395, genre: "Animation" },
    { titre: "Barbie", entrees: 5846809, genre: "Film familial" },
    { titre: "Astérix et Obélix : L'Empire du Milieu", realisateur: "Guillaume Canet", entrees: 4598637, genre: "Comédie" },
    { titre: "Oppenheimer", realisateur: "Christopher Nolan", entrees: 4446424, genre: "Drame" },
    { titre: "Alibi.com 2", entrees: 4277971, genre: "Comédie" },
    { titre: "Wonka", entrees: 3744133, genre: "Fantasy" },
    { titre: "Les Trois Mousquetaires : D'Artagnan", entrees: 3337706, genre: "Aventure / Action" },
    { titre: "Les Trois Mousquetaires : Milady", entrees: 2576308, genre: "Aventure / Action" },
    { titre: "Chasse gardée", entrees: 1924712, genre: "Comédie" },
    { titre: "Anatomie d'une chute", entrees: 1907961, genre: "Thriller / Drame" },
    { titre: "3 jours max", entrees: 1898935, genre: "Comédie" },
    { titre: "Miraculous — le film", entrees: 1632108, genre: "Animation" },
    { titre: "Le Garçon et le Héron", realisateur: "Hayao Miyazaki", entrees: 1599925, genre: "Animation" },
    { titre: "Babylon", realisateur: "Damien Chazelle", entrees: 1505989, genre: "Drame" },
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
