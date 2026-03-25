# Scénorama

Lecteur de scénarios intelligent — défilement automatique, surlignage par personnage, mode répétition, annotations, statistiques.

---

## 🚀 Mise en ligne — Guide pas à pas

### Prérequis

Tu as besoin de 3 choses sur ton Mac :

1. **Node.js** — le moteur qui fait tourner le projet
2. **Git** — pour versionner et envoyer le code
3. **Un compte GitHub** — pour héberger le code
4. **Un compte Vercel** — pour mettre en ligne (gratuit)

---

### Étape 1 — Installer Node.js

Ouvre le **Terminal** (cherche "Terminal" dans Spotlight avec Cmd+Espace).

Copie-colle cette commande :

```bash
curl -fsSL https://fnm.vercel.app/install | bash
```

Ferme et rouvre le Terminal, puis :

```bash
fnm install 22
node --version
```

Tu dois voir un numéro de version (ex: v22.x.x). Si oui, c'est bon.

---

### Étape 2 — Vérifier que Git est installé

Dans le Terminal :

```bash
git --version
```

Si tu vois un numéro de version, c'est bon. Sinon, le Mac te proposera d'installer les Command Line Tools — accepte.

---

### Étape 3 — Créer un compte GitHub

1. Va sur https://github.com et crée un compte (gratuit)
2. Crée un nouveau repository : clique le bouton vert "New"
3. Nom : `scenorama`
4. Laisse tout par défaut, clique "Create repository"
5. Note l'URL qui s'affiche, elle ressemble à : `https://github.com/TON_PSEUDO/scenorama.git`

---

### Étape 4 — Préparer le projet sur ton Mac

Dans le Terminal, place-toi où tu veux (ex: ton Bureau) :

```bash
cd ~/Desktop
```

Copie tout le dossier `scenorama` que je t'ai préparé sur ton Bureau (glisse-le depuis les fichiers téléchargés).

Puis dans le Terminal :

```bash
cd ~/Desktop/scenorama
npm install
```

Ça va installer toutes les dépendances (ça prend 30 secondes environ).

Pour vérifier que tout marche, lance :

```bash
npm run dev
```

Ouvre http://localhost:5173 dans ton navigateur — tu dois voir Scénorama. Fais Ctrl+C dans le Terminal pour arrêter.

---

### Étape 5 — Envoyer le code sur GitHub

Toujours dans le dossier `scenorama` dans le Terminal :

```bash
git init
git add .
git commit -m "Scénorama V1"
git branch -M main
git remote add origin https://github.com/TON_PSEUDO/scenorama.git
git push -u origin main
```

⚠️ Remplace `TON_PSEUDO` par ton vrai pseudo GitHub.

GitHub te demandera peut-être de te connecter — suis les instructions.

---

### Étape 6 — Déployer sur Vercel (mise en ligne)

1. Va sur https://vercel.com et connecte-toi avec ton compte GitHub
2. Clique "Add New Project"
3. Tu verras ton repo `scenorama` — clique "Import"
4. Vercel détecte automatiquement que c'est un projet Vite
5. Clique "Deploy"
6. Attends 30 secondes... 🎉 Ton site est en ligne !

Vercel te donne une URL du type `scenorama-xxx.vercel.app`. C'est déjà accessible par tout le monde.

---

### Étape 7 — Ajouter ton nom de domaine (optionnel)

1. Achète `scenorama.fr` sur https://www.ovh.com (environ 7€/an) ou `scenorama.app` sur https://www.namecheap.com (~15€/an)
2. Dans Vercel, va dans Settings > Domains > Add
3. Entre ton domaine (ex: scenorama.fr)
4. Vercel te donne des enregistrements DNS à ajouter chez ton registrar (OVH/Namecheap)
5. Ça prend 5-30 minutes pour se propager
6. HTTPS est automatique

---

### Étape 8 — Mettre à jour le site

À chaque fois que tu modifies le code et veux mettre à jour :

```bash
cd ~/Desktop/scenorama
git add .
git commit -m "Description de ce que tu as changé"
git push
```

Vercel redéploie automatiquement en 30 secondes. C'est tout.

---

## 📁 Structure du projet

```
scenorama/
├── index.html          ← Page HTML principale
├── package.json        ← Dépendances du projet
├── vite.config.js      ← Configuration Vite
├── public/
│   └── favicon.svg     ← Icône de l'onglet
└── src/
    ├── main.jsx        ← Point d'entrée React
    └── Scenorama.jsx   ← L'application complète
```

---

## ⌨️ Raccourcis clavier

| Touche | Action |
|--------|--------|
| Espace | Lecture / Pause |
| ↑ / ↓ | Vitesse + / - |
| ← / → | Page précédente / suivante |
| T | Basculer Jour / Nuit |
| F | Mode Focus |
| Échap | Tout arrêter |
| Double-clic | Ajouter une annotation |

---

Fait avec soin à Paris — © 2026
