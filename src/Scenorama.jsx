import { useState, useRef, useEffect, useCallback, useMemo, memo, useTransition } from "react";
import { MARKET_DATA } from "./marketData.js";

// No sample text — start with empty state

// ─── Parser ─────────────────────────────────────────────────────────

function parseScreenplay(text, pageBreaks) {
  const lines = text.split("\n");
  const pbSet = new Set(pageBreaks || []);

  const isDialAfter = (idx) => {
    for (let j = idx + 1; j < lines.length && j < idx + 3; j++) {
      const n = lines[j]?.trim();
      if (!n) continue;
      if (/^\(.*\)$/.test(n)) return true;
      if (n.length > 0 && n !== n.toUpperCase()) return true;
      break;
    }
    return false;
  };

  let nonEmptyCount = 0;
  const first = lines.map((line, i) => {
    const tr = line.trim();
    const pg = pbSet.has(i);
    if (tr === "") return { t: "empty", text: "", k: i, pg };
    nonEmptyCount++;
    // Scene headers
    const sceneRx = /^(\d+\s*[\.\-\)]?\s*)?(INT\s*[\.\-\/]|EXT\s*[\.\-\/]|INTÉRIEUR|EXTÉRIEUR|INT\s*\/\s*EXT)/i;
    if (sceneRx.test(tr) && tr === tr.toUpperCase())
      return { t: "scene", text: tr, k: i, pg };
    if (/^\d+\s*(INT|EXT)/i.test(tr) && tr === tr.toUpperCase())
      return { t: "scene", text: tr, k: i, pg };
    if (/^(FONDU|CUT TO|FADE|SMASH CUT|NOIR|OUVERTURE|FERMETURE|ELLIPSE)/i.test(tr) && tr === tr.toUpperCase())
      return { t: "trans", text: tr, k: i, pg };
    if (/^\(.*\)$/.test(tr)) return { t: "paren", text: tr, k: i, pg };
    const isChar = /^[A-ZÉÈÊËÀÂÄÙÛÜÔÖÎÏÇŒÆ\s\-'\.]+(\s*\(.*\))?$/.test(tr);
    if (isChar && tr.length >= 2 && tr.length < 45 && tr === tr.toUpperCase() && !/^\d/.test(tr)) {
      const w = tr.replace(/\(.*\)/, "").trim().split(/\s+/);
      if (w.length <= 5 && isDialAfter(i))
        return { t: "char", text: tr, name: w.join(" "), k: i, pg };
    }
    // Title: first few non-empty lines in caps, skip obvious junk
    if (nonEmptyCount <= 4 && tr === tr.toUpperCase() && tr.length > 1 && !/^(INT|EXT|\d+\s*(INT|EXT))/.test(tr) && !/TVA|SIRET|SARL|©|ISBN|www\./i.test(tr))
      return { t: "title", text: tr, k: i, pg };
    return { t: "action", text: tr, k: i, pg };
  });

  let inD = false, cur = null;
  return first.map((l) => {
    if (l.t === "char") { inD = true; cur = l.name; return l; }
    if (l.t === "paren" && inD) return { ...l, charOwner: cur };
    if (["empty", "scene", "trans"].includes(l.t)) { inD = false; cur = null; return l; }
    if (inD && l.t === "action") return { ...l, t: "dial", charOwner: cur };
    return l;
  });
}

// ─── Stats calculator ───────────────────────────────────────────────

function calcStats(lines, totalPg) {
  const charWords = {};
  const charLines = {};
  let totalDialWords = 0;
  let totalActionWords = 0;
  let sceneCount = 0;
  let intCount = 0;
  let extCount = 0;
  let jourCount = 0;
  let nuitCount = 0;
  const sceneTexts = [];

  lines.forEach((l) => {
    if (l.t === "scene") {
      sceneCount++;
      sceneTexts.push(l.text);
      if (/(\d+\s*)?INT[\s\.]/i.test(l.text)) intCount++;
      else if (/(\d+\s*)?EXT[\s\.]/i.test(l.text)) extCount++;
      if (/JOUR|DAY/i.test(l.text)) jourCount++;
      if (/NUIT|SOIR|NIGHT/i.test(l.text)) nuitCount++;
    }
    if (l.t === "dial" || l.t === "paren") {
      const owner = l.charOwner || "INCONNU";
      const wc = l.text.split(/\s+/).filter(Boolean).length;
      charWords[owner] = (charWords[owner] || 0) + wc;
      charLines[owner] = (charLines[owner] || 0) + 1;
      totalDialWords += wc;
    }
    if (l.t === "action") {
      totalActionWords += l.text.split(/\s+/).filter(Boolean).length;
    }
  });

  const charRanking = Object.entries(charWords)
    .sort((a, b) => b[1] - a[1])
    .map(([name, words]) => ({
      name, words, lines: charLines[name] || 0,
      pct: totalDialWords > 0 ? Math.round((words / totalDialWords) * 100) : 0,
    }));

  const estMinutes = totalPg > 1 ? totalPg : Math.ceil((totalDialWords + totalActionWords) / 180);
  const totalWords = totalDialWords + totalActionWords;
  const dialPct = totalWords > 0 ? Math.round((totalDialWords / totalWords) * 100) : 0;

  // Title detection — first non-empty capitalized line
  const titleLine = lines.find((l) => l.t === "title");
  const title = titleLine ? titleLine.text : "";

  // Author detection — smart: look in first 30 lines for author patterns, skip junk
  const firstLinesArr = lines.slice(0, 30).map((l) => l.text);
  const firstLines = firstLinesArr.join(" ");
  const junkPattern = /TVA|SIRET|SARL|SAS\b|©|copyright|téléphone|tél\.|adresse|www\.|\.com|\.fr|ISBN|dépôt légal|imprim/i;
  
  let author = null;
  // Pattern 1: "scénario de X", "écrit par X", "un film de X"
  const authorMatch = firstLines.match(/(?:scénario\s+(?:de|original\s+de)|écrit\s+par|un\s+film\s+de|adaptation\s+de|scénario\s*:\s*)\s*([^\n,]+)/i);
  if (authorMatch && !junkPattern.test(authorMatch[1])) {
    author = authorMatch[1].trim().replace(/\s+/g, " ");
  }
  // Pattern 2: look for a standalone name line after the title (mixed case, 2-4 words, no junk)
  if (!author) {
    let foundTitle = false;
    for (const lt of firstLinesArr) {
      if (!lt.trim()) continue;
      if (lt === lt.toUpperCase() && lt.length > 2) { foundTitle = true; continue; }
      if (foundTitle && lt.trim().length > 3 && lt.trim().length < 50) {
        const candidate = lt.trim();
        if (!junkPattern.test(candidate) && !/^\d/.test(candidate) && !/^(INT|EXT|FONDU)/.test(candidate)) {
          const words = candidate.split(/\s+/);
          // Author names: 2-5 words, at least one capitalized word
          if (words.length >= 2 && words.length <= 5 && words.some((w) => /^[A-ZÉÈÊÀÂÇÔÎÏÜŒæ]/.test(w))) {
            author = candidate;
            break;
          }
        }
      }
    }
  }

  // Adaptation detection
  const isAdaptation = /d'après|adapté de|tiré de|inspiré de|based on/i.test(firstLines);

  // Structure analysis: rough act breaks by thirds
  const thirdScene = Math.floor(sceneCount / 3);
  const structure = sceneCount >= 6 ? {
    acte1: `Scènes 1–${thirdScene}`,
    acte2: `Scènes ${thirdScene + 1}–${thirdScene * 2}`,
    acte3: `Scènes ${thirdScene * 2 + 1}–${sceneCount}`,
  } : null;

  return {
    sceneCount, intCount, extCount, jourCount, nuitCount,
    totalDialWords, totalActionWords, totalWords,
    charRanking, estMinutes, dialPct,
    title, author, isAdaptation, structure, sceneTexts,
    charCount: charRanking.length,
  };
}

// ─── Themes ─────────────────────────────────────────────────────────

const TH = {
  nuit: {
    bg: "#0c0c0a", surface: "#161614", surfaceAlt: "#1e1e1b",
    text: "#e8e4da", soft: "#c4bfb4", muted: "#706b60",
    accent: "#d4a85c", accent2: "#b8903e",
    char: "#e0dbd0", scene: "#d4a85c", trans: "#5a5650",
    border: "#252520", barBg: "#141412",
    ctrl: "#0f0f0d", hint: "#444038", grad: "#0c0c0a",
    pageNum: "rgba(212,168,92,0.4)",
    hl: "rgba(212,168,92,0.07)", hlB: "rgba(212,168,92,0.3)",
    contrast: "#0c0c0a", noteAccent: "#e4c06a", noteBg: "rgba(212,168,92,0.05)",
    statBar: "#d4a85c", statBarBg: "rgba(212,168,92,0.08)",
    searchBg: "rgba(230,190,70,0.35)", searchActive: "rgba(240,200,60,0.55)",
    inputBg: "#1a1a17", inputBorder: "#2a2a25",
    btnHover: "#1e1e1b",
  },
  jour: {
    bg: "#faf8f4", surface: "#fff", surfaceAlt: "#f2efe8",
    text: "#1a1a15", soft: "#40403a", muted: "#95918a",
    accent: "#a07030", accent2: "#c08840",
    char: "#1a1a15", scene: "#a07030", trans: "#a5a098",
    border: "#e4e0d8", barBg: "#f0ece4",
    ctrl: "#faf8f4", hint: "#c4c0b8", grad: "#faf8f4",
    pageNum: "rgba(160,112,48,0.35)",
    hl: "rgba(160,112,48,0.05)", hlB: "rgba(160,112,48,0.22)",
    contrast: "#faf8f4", noteAccent: "#a07830", noteBg: "rgba(160,112,48,0.04)",
    statBar: "#a07030", statBarBg: "rgba(160,112,48,0.06)",
    searchBg: "rgba(180,140,40,0.18)", searchActive: "rgba(180,140,40,0.32)",
    inputBg: "#f2efe8", inputBorder: "#dcd8d0",
    btnHover: "#f2efe8",
  },
};


// ─── Memoized Line (CSS-var based — no th prop, no re-render on theme change) ──

const Line = memo(function Line({ l, fs, charFilter, pgIdx, totalPg, pgRefCb, annotation, onAnnotate, searchQ, isSearchHit, isActiveHit }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef(null);
  const V = (name) => `var(--sc-${name})`;
  const base = { margin: 0, padding: 0 };
  const owner = l.t === "char" ? l.name : l.charOwner;
  const isOwned = !!owner;
  const highlighted = charFilter && owner === charFilter;
  const dimmed = charFilter && isOwned && owner !== charFilter;

  const renderText = (text) => {
    if (!searchQ || searchQ.length < 2 || !text || !isSearchHit) return text;
    const q = searchQ.toLowerCase();
    const idx = text.toLowerCase().indexOf(q);
    if (idx < 0) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark style={{
          background: isActiveHit ? V("searchActive") : V("searchBg"),
          color: "inherit", borderRadius: 2, padding: "1px 2px",
        }}>{text.slice(idx, idx + searchQ.length)}</mark>
        {text.slice(idx + searchQ.length)}
      </>
    );
  };

  const wrapHL = (node) => (
    <div style={{
      background: highlighted ? V("hl") : "transparent",
      borderLeft: highlighted ? `2px solid ${V("hlB")}` : "2px solid transparent",
      paddingLeft: highlighted ? 6 : 0, marginLeft: highlighted ? -8 : 0,
      transition: "all 0.3s", opacity: dimmed ? 0.3 : 1,
    }}>{node}</div>
  );

  const pgBanner = l.pg && totalPg > 1 && pgIdx >= 0 ? (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      marginTop: pgIdx > 0 ? 40 : 8, marginBottom: 16,
    }}>
      <div style={{ flex: 1, height: 1, background: V("border") }} />
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.18em", color: V("pageNum"), fontFamily: "'DM Sans',sans-serif" }}>
        PAGE {pgIdx + 1}
      </span>
      <div style={{ flex: 1, height: 1, background: V("border") }} />
    </div>
  ) : null;

  const noteEl = editing ? (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3, marginBottom: 4 }}>
      <input
        ref={inputRef} type="text" value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { onAnnotate(l.k, draft.trim() || null); setEditing(false); }
          if (e.key === "Escape") setEditing(false);
        }}
        placeholder="Ajouter une note…"
        style={{
          flex: 1, padding: "4px 10px", fontSize: 11,
          background: V("noteBg"), color: V("noteAccent"),
          border: `1px solid ${V("noteAccent")}`, borderRadius: 4,
          fontFamily: "'DM Sans',sans-serif", fontStyle: "italic", outline: "none",
        }}
      />
      <button onClick={() => { onAnnotate(l.k, draft.trim() || null); setEditing(false); }}
        style={{ background: V("noteAccent"), color: V("contrast"), border: "none", borderRadius: 3,
          padding: "3px 10px", fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>
        OK
      </button>
      {annotation && (
        <button onClick={() => { onAnnotate(l.k, null); setEditing(false); }}
          style={{ background: "transparent", color: "#c44", border: "1px solid #c44", borderRadius: 3,
            padding: "3px 8px", fontSize: 10, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>
          Suppr.
        </button>
      )}
      <button onClick={() => setEditing(false)}
        style={{ background: "transparent", color: V("muted"), border: "none", fontSize: 14, cursor: "pointer" }}>
        ×
      </button>
    </div>
  ) : annotation ? (
    <div onClick={() => { setDraft(annotation); setEditing(true); }} style={{
      fontSize: 11, color: V("noteAccent"), fontStyle: "italic", padding: "3px 0 3px 12px",
      borderLeft: `2px solid ${V("noteAccent")}`, marginTop: 2, marginBottom: 4,
      background: V("noteBg"), borderRadius: "0 3px 3px 0",
      fontFamily: "'DM Sans',sans-serif", cursor: "pointer",
    }}>
      {annotation}
    </div>
  ) : null;

  const handleDblClick = () => {
    if (l.t === "empty") return;
    setDraft(annotation || "");
    setEditing(true);
    setTimeout(() => { if (inputRef.current) inputRef.current.focus(); }, 30);
  };

  const content = (() => {
    switch (l.t) {
      case "title":
        return <p style={{ ...base, fontSize: fs * 1.6, fontWeight: 700, textAlign: "center", color: V("text"), letterSpacing: "0.04em", marginBottom: 6, fontFamily: "'Cormorant Garamond',serif" }}>{renderText(l.text)}</p>;
      case "scene":
        return <p style={{ ...base, fontWeight: 700, color: V("scene"), marginTop: 28, marginBottom: 10, textTransform: "uppercase", fontSize: fs * 0.9, letterSpacing: "0.05em", borderLeft: `3px solid ${V("scene")}`, paddingLeft: 14 }}>{renderText(l.text)}</p>;
      case "char":
        return wrapHL(<p style={{ ...base, textAlign: "center", fontWeight: 700, color: V("char"), marginTop: 18, marginBottom: 1, fontSize: fs * 0.88, letterSpacing: "0.12em" }}>{renderText(l.text)}</p>);
      case "paren":
        return wrapHL(<p style={{ ...base, textAlign: "center", fontStyle: "italic", color: V("muted"), fontSize: fs * 0.82, marginBottom: 1 }}>{renderText(l.text)}</p>);
      case "dial":
        return wrapHL(<p style={{ ...base, color: V("soft"), marginBottom: 1, paddingLeft: 72, paddingRight: 36 }}>{renderText(l.text)}</p>);
      case "trans":
        return <p style={{ ...base, textAlign: "center", color: V("trans"), fontWeight: 700, marginTop: 24, marginBottom: 24, fontSize: fs * 0.82, letterSpacing: "0.16em" }}>{renderText(l.text)}</p>;
      case "empty":
        return null;
      default:
        return <p style={{ ...base, color: V("soft"), marginBottom: 1 }}>{renderText(l.text)}</p>;
    }
  })();

  return (
    <div ref={pgRefCb} data-lk={l.k} onDoubleClick={handleDblClick}
      style={{
        ...(l.t === "empty" && !pgBanner ? { height: fs * 0.5 } : {}),
        cursor: l.t !== "empty" ? "text" : "default",
        position: "relative",
      }}>
      {pgBanner}
      {content}
      {noteEl}
    </div>
  );
}, (prev, next) =>
  prev.l === next.l && prev.fs === next.fs && prev.charFilter === next.charFilter
  && prev.pgIdx === next.pgIdx && prev.totalPg === next.totalPg
  && prev.annotation === next.annotation && prev.searchQ === next.searchQ
  && prev.isSearchHit === next.isSearchHit && prev.isActiveHit === next.isActiveHit
);


// ─── Fiche de Lecture Panel (AI-powered) ────────────────────────────

const FichePanel = memo(function FichePanel({ stats, th, onClose, fName, rawText, cachedAnalysis, setCachedAnalysis }) {
  const fm = "'DM Sans',sans-serif";
  const [analysis, setAnalysis] = useState(cachedAnalysis);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const hasRun = useRef(!!cachedAnalysis);

  // Sync analysis state when cachedAnalysis prop changes (e.g. loaded from localStorage)
  useEffect(() => {
    if (cachedAnalysis) {
      setAnalysis(cachedAnalysis);
      hasRun.current = true;
    }
  }, [cachedAnalysis]);

  const section = (title) => (
    <div style={{ fontWeight: 700, fontSize: 11, letterSpacing: "0.12em", color: th.accent, marginBottom: 8, marginTop: 22, textTransform: "uppercase" }}>{title}</div>
  );
  const kv = (label, val) => (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${th.border}` }}>
      <span style={{ color: th.muted, fontSize: 11 }}>{label}</span>
      <span style={{ color: th.text, fontSize: 11, fontWeight: 500, textAlign: "right", maxWidth: "60%" }}>{val}</span>
    </div>
  );

  const runAnalysis = useCallback(() => {
    if (!rawText || rawText.length < 200) return;
    setLoading(true);
    setError(null);

    // Send the full screenplay — Claude Sonnet handles 200K tokens input
    const fullText = rawText;

    // Build market context from embedded data
    const fmtFilm = (f) => `${f.titre}${f.realisateur ? ` (${f.realisateur})` : ""} — ${(f.entrees/1000000).toFixed(1)}M entrées — ${f.genre}`;
    const topFilms2026 = MARKET_DATA.boxOffice2026.slice(0, 12).map(fmtFilm).join("\n");
    const topFilms2025 = MARKET_DATA.boxOffice2025.slice(0, 12).map(fmtFilm).join("\n");
    const topFilms2024 = MARKET_DATA.boxOffice2024.slice(0, 12).map(fmtFilm).join("\n");
    const topFilms2023 = MARKET_DATA.boxOffice2023.slice(0, 8).map(fmtFilm).join("\n");
    const topHistorique = MARKET_DATA.topHistorique.slice(0, 15).map(f => `#${f.rang} ${f.titre} (${f.date}) — ${(f.entrees/1000000).toFixed(1)}M entrées — ${f.genre}`).join("\n");
    const tendances = MARKET_DATA.tendances.join("\n");
    const cannes24 = `Palme d'Or : ${MARKET_DATA.cannes2024.palmeOr.titre} (${MARKET_DATA.cannes2024.palmeOr.realisateur}), Grand Prix : ${MARKET_DATA.cannes2024.grandPrix.titre}, Prix du Jury : ${MARKET_DATA.cannes2024.prixJury.titre}`;
    const cesar25 = `Meilleur film : ${MARKET_DATA.cesar2025.meilleurFilm}, Meilleur premier film : ${MARKET_DATA.cesar2025.meilleurPremierFilm}`;

    const prompt = `Tu es un lecteur professionnel de scénarios pour le cinéma et la télévision française. Tu travailles pour un comité de lecture de producteur. Analyse ce scénario et produis une fiche de lecture complète.

CONTEXTE MARCHÉ (données réelles et à jour, utilise-les pour ancrer ton analyse) :

Box-office France 2026 (en cours) :
${topFilms2026}

Box-office France 2025 :
${topFilms2025}

Box-office France 2024 :
${topFilms2024}

Box-office France 2023 :
${topFilms2023}

Top 15 historique box-office France (films français) :
${topHistorique}

Cannes 2024 : ${cannes24}
César 2025 : ${cesar25}

Tendances du marché :
${tendances}

Fréquentation 2024 : ${MARKET_DATA.frequentation[2024].total/1000000}M entrées, part films français ${MARKET_DATA.frequentation[2024].partFR}%.

UTILISE CES DONNÉES pour :
- Comparer le scénario à des films récents RÉELS qui ont marché (ou pas) dans le même genre
- Situer le potentiel du projet par rapport au box-office historique et récent
- Évaluer le potentiel commercial en fonction des tendances actuelles
- Recommander des plateformes en citant leurs succès récents réels
- Identifier si le projet surfe sur une tendance porteuse ou va à contre-courant (et si c'est un atout ou un risque)

RÈGLES :
- Réponds UNIQUEMENT en JSON valide. Pas de markdown, pas de backticks, pas de texte avant ou après le JSON.
- Le genre doit être précis et cohérent avec le contenu réel — ne te fie pas à un seul mot.
- Pour les auteurs, identifie les vrais noms d'auteurs sur la page de garde. IGNORE les noms de sociétés de production, les numéros SIRET/TVA, les adresses, les noms d'agents ou de diffuseurs.
- Les comparables doivent être des films ou séries réellement existants, de préférence français ou européens quand c'est pertinent.
- L'avis doit être celui d'un vrai lecteur professionnel : honnête, précis, pas complaisant.

POUR LES PLATEFORMES, base-toi sur leurs lignes éditoriales RÉELLES et leur catalogue existant :
- Netflix France : grand public international, thrillers (Lupin, Braqueurs), comédies accessibles (Family Business), teen/YA, true crime. Évite l'art et essai pur, l'auteur trop clivant.
- Canal+ : auteur premium, polar/thriller sombre (Baron Noir, Engrenages, Le Bureau des légendes), comédie noire, sujets politiques/sociétaux. Le plus ouvert au cinéma d'auteur ambitieux.
- Arte (source : lignes éditoriales officielles ARTE France sept. 2023) :
  FICTION : obsession éditoriale = originalité, diversité, créativité. "Des récits vigoureux dotés d'une âme." Pas de sujets mais des points de vue. Le policier/procédural/historique doit offrir une vraie innovation des codes. Miniséries 6-8 épisodes privilégiées (pas de récurrence de saisons). Tous formats dès 26min. Pas d'adaptations de séries étrangères sauf vraie réécriture. Vocation européenne forte.
  COURTS/MOYENS MÉTRAGES : case Court-Circuit (samedi). Recherche de jeunes talents, points de vue personnels, univers originaux, formes audacieuses. Le court comme terrain d'expérimentation. Séries courtes humoristiques 30x2-3min (fiction ou animation) à 20h50.
  DOCUMENTAIRE : émotion + pensée. Accessibilité sans simplification. Perspective européenne (pas franco-française). Cases : investigation (mardi 90min), histoire (grands récits, pas d'historiographie), géopolitique, société (histoires à dramaturgie charpentée, personnages, classes sociales peu représentées), La Lucarne (écritures excentriques, hors sentiers narratifs), grands formats (90min, œuvres ambitieuses).
  NUMÉRIQUE : séries fiction courtes (15min max, 16/9 à 9/16), séries doc format souple, jeux vidéo d'auteur, dispositifs immersifs. Thématiques ancrées dans préoccupations du public, formes innovantes.
  NE CORRESPOND PAS : grand public mainstream, procédural classique, policier sans innovation, sujets strictement nationaux/franco-français.
- France Télévisions (France 2/3/5) : familial large, policiers (Capitaine Marleau), drames sociaux, comédies populaires, historique accessible. Public 40+. Émission Histoires courtes (courts métrages sur France 2). L'unité documentaire cherche aussi des écritures modernes pour les jeunes adultes (collection "Phénomènes !" : 52min, artistes/mouvements culturels marquants, 2e partie de soirée + france.tv). france.tv est la plateforme de rattrapage et de contenus originaux.
- Amazon Prime Video : thriller/action (Citadel, Jack Ryan), comédies décalées, adaptations littéraires. Monte en gamme sur le français.
- Disney+ / Star : familial, franchise, mais aussi thrillers via Star (Oussekine, Parallèles). S'ouvre au drama français adulte.
- Apple TV+ : prestige, cinématographique, peu de volume mais haute qualité (Liaison). Sujets internationaux.
- OCS / Max (HBO) : drama adulte, complexe, sombre (Hippocrate). Proche de la ligne HBO.
- M6 / W9 : comédie grand public, thriller accessible, romcom. Public large et jeune.
- TF1 / TF1+ : familial très large, polar procédural, comédie populaire, biopic. Le plus mainstream.

JSON attendu :
{
  "auteurs": "Nom(s) du ou des scénaristes identifiés sur la page de garde (null si non identifiable)",
  "genre": "Genre(s) précis (ex: Comédie dramatique, Thriller politique, Drame familial)",
  "ton": "Ton en 2-3 mots (ex: Acide et mélancolique)",
  "public": "Public cible (ex: Grand public, Art et essai, Public averti)",
  "synopsis": "Synopsis en 4-5 phrases : situation initiale, élément déclencheur, enjeux, tension principale. Pas de spoiler de fin.",
  "resume": "Résumé factuel en 3-4 phrases de ce qui se passe dans les pages lues.",
  "avis": "Avis critique en 5-6 phrases : qualité de l'écriture, force des dialogues, rythme narratif, originalité du sujet, profondeur des personnages, points faibles s'il y en a. Comme une vraie note de lecture de producteur.",
  "comparables": ["Film/série 1 (année) — pourquoi", "Film/série 2 (année) — pourquoi", "Film/série 3 (année) — pourquoi"],
  "plateformes": [
    {"nom": "Nom de la plateforme", "score": 85, "raison": "Explication en 1-2 phrases", "ref": "Titre comparable dans leur catalogue (année)"}
  ],
  "opportunites": [
    {"nom": "Nom du dispositif/concours", "organisme": "Organisme", "pertinence": "Pourquoi ce scénario correspond", "format": "Court/Long/Série/Doc/Animation", "condition": "Condition clé (ex: premier film, étudiant, etc.)"}
  ],
  "distribution": "1-2 phrases sur la stratégie de distribution recommandée : salle, plateforme, les deux, festival d'abord, etc."
}

POUR LES PLATEFORMES :
- Classe les 4-5 plateformes les plus pertinentes par score de compatibilité (0-100).
- Le score doit refléter la vraie probabilité que cette plateforme s'intéresse au projet.
- Justifie TOUJOURS par un titre existant dans leur catalogue qui ressemble au scénario.
- Si le scénario est clairement cinéma salle et pas plateforme, dis-le.
- IMPORTANT pour Netflix : les soumissions ne sont acceptées que via un agent, producteur, avocat ou manager ayant déjà une relation avec Netflix. Mentionne-le OBLIGATOIREMENT si Netflix est recommandé. De plus, précise que Netflix fonctionne en production exécutive (pas déléguée) : la société de production exécute sous contrôle continu de Netflix, qui garde l'exclusivité totale des droits patrimoniaux. Netflix valide à chaque étape (casting, montage, post-prod) et peut imposer des modifications majeures. Un showrunner fort est indispensable pour préserver la vision artistique dans ce cadre.

POUR LES OPPORTUNITÉS, base-toi sur ces dispositifs réels (recommande uniquement ceux qui correspondent au format et au profil) :
- GREC : concours série courte 5x2min (lieu unique, produit par GREC + France TV), ateliers court métrage (casting, mise en scène, montage), résidence scénario à Porto-Vecchio
- TRANSPA + Maison du Film : concours "Mon Film dans un Camion" (premier long métrage, dotation technique 4 semaines)
- La Fémis "Du court au long" : formation écriture traitement long métrage
- Nef Animation / Première Page : court animation 3min pour jeunes diplômés écoles animation
- Prix Daniel Sabatier : contenus originaux tous formats (fiction, doc, animation, court, mini-série, plateformes/réseaux sociaux), étudiants ou jeunes pros
- Ardèche Images / École documentaire : formations documentaire (écriture, montage, création sonore)
- Addoc : ateliers d'accompagnement documentaire (partage d'écriture, pitchs)
- Mission Cinéma du Ministère de l'Intérieur : comité de lecture gratuit pour vraisemblance policière/judiciaire/action
- CNC : aides à l'écriture, aide au développement, avance sur recettes (mentionner si pertinent)
- SACD : dépôt, fonds d'aide à la création
- France Télévisions "Phénomènes !" : collection doc culturel 8x52min, artistes ou mouvements culturels marquants peu traités en doc, écriture moderne, jeunes adultes + large public, 2e partie de soirée + france.tv. Soumission via société de production à appelprojets.culture@francetv.fr

Ne recommande que les opportunités PERTINENTES pour ce scénario précis (format, genre, profil auteur).

Scénario à analyser :
${fullText}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 600000); // 10 min pour les longs scénarios

    (async () => {
      try {
        const response = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({ prompt }),
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errText}`);
        }

        // Read the SSE stream from the Edge function
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = "";
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Process complete SSE lines
          const lines = buffer.split("\n");
          buffer = lines.pop(); // Keep incomplete line in buffer

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;

            try {
              const evt = JSON.parse(data);
              // Anthropic SSE: content_block_delta contains text chunks
              if (evt.type === "content_block_delta" && evt.delta && evt.delta.text) {
                fullText += evt.delta.text;
              }
              // Check for API errors in the stream
              if (evt.type === "error") {
                throw new Error(evt.error?.message || "Erreur API dans le stream");
              }
            } catch (parseErr) {
              // Ignore non-JSON SSE lines (like event types, comments)
              if (parseErr.message.includes("Erreur API")) throw parseErr;
            }
          }
        }

        if (!fullText.trim()) throw new Error("Réponse vide");

        // Clean and parse JSON — handle various AI formatting issues
        let clean = fullText.trim();
        clean = clean.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
        // Remove any text before the first {
        const firstBrace = clean.indexOf("{");
        if (firstBrace > 0) clean = clean.slice(firstBrace);
        // Remove any text after the last }
        const lastBrace = clean.lastIndexOf("}");
        if (lastBrace >= 0) clean = clean.slice(0, lastBrace + 1);

        let parsed;
        try {
          parsed = JSON.parse(clean);
        } catch (parseErr) {
          console.error("JSON parse failed:", clean.slice(0, 500));
          throw new Error("L'analyse a été générée mais le format est invalide. Réessayez.");
        }

        // Validate and sanitize required fields with defaults
        const safe = {
          auteurs: typeof parsed.auteurs === "string" ? parsed.auteurs : null,
          genre: typeof parsed.genre === "string" ? parsed.genre : "Non déterminé",
          ton: typeof parsed.ton === "string" ? parsed.ton : null,
          public: typeof parsed.public === "string" ? parsed.public : null,
          synopsis: typeof parsed.synopsis === "string" ? parsed.synopsis : "Synopsis non disponible.",
          resume: typeof parsed.resume === "string" ? parsed.resume : "Résumé non disponible.",
          avis: typeof parsed.avis === "string" ? parsed.avis : "Avis non disponible.",
          comparables: Array.isArray(parsed.comparables) ? parsed.comparables.filter((c) => typeof c === "string") : [],
          plateformes: Array.isArray(parsed.plateformes) ? parsed.plateformes.filter((p) =>
            p && typeof p.nom === "string" && typeof p.score === "number"
          ).map((p) => ({
            nom: p.nom,
            score: Math.max(0, Math.min(100, Math.round(p.score))),
            raison: typeof p.raison === "string" ? p.raison : "",
            ref: typeof p.ref === "string" ? p.ref : null,
          })) : [],
          opportunites: Array.isArray(parsed.opportunites) ? parsed.opportunites.filter((o) =>
            o && typeof o.nom === "string"
          ).map((o) => ({
            nom: o.nom,
            organisme: typeof o.organisme === "string" ? o.organisme : "",
            pertinence: typeof o.pertinence === "string" ? o.pertinence : "",
            format: typeof o.format === "string" ? o.format : "",
            condition: typeof o.condition === "string" ? o.condition : null,
          })) : [],
          distribution: typeof parsed.distribution === "string" ? parsed.distribution : null,
        };

        setAnalysis(safe);
        setCachedAnalysis(safe);
        setError(null);
      } catch (err) {
        if (err.name === "AbortError") {
          setError("L'analyse a pris trop de temps (>10 min). Réessayez.");
        } else {
          setError(err.message || "Erreur lors de l'analyse. Réessayez.");
        }
      } finally {
        clearTimeout(timeout);
        setLoading(false);
      }
    })();
  }, [rawText]);

  // Auto-run on first open
  useEffect(() => {
    if (!hasRun.current && rawText && rawText.length >= 200) {
      hasRun.current = true;
      runAnalysis();
    }
  }, [rawText, runAnalysis]);

  return (
    <div style={{
      width: 360, flexShrink: 0,
      background: th.surface, borderLeft: `1px solid ${th.border}`,
      overflowY: "auto", padding: "20px 18px",
      fontFamily: fm, fontSize: 12, color: th.text,
      scrollbarWidth: "thin",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontWeight: 700, fontSize: 16, color: th.accent, fontFamily: "'Cormorant Garamond',serif" }}>Fiche de Lecture</span>
        <button onClick={onClose} style={{ background: "transparent", border: "none", color: th.muted, fontSize: 18, cursor: "pointer" }}>×</button>
      </div>
      {fName && <div style={{ fontSize: 11, color: th.muted, fontStyle: "italic", marginBottom: 14 }}>{fName}</div>}

      {/* Technical stats — always available */}
      {section("Données techniques")}
      {stats.title && kv("Titre", stats.title)}
      {kv("Auteur(s)", (analysis?.auteurs) || stats.author || "—")}
      {kv("Durée estimée", `~${stats.estMinutes} min`)}
      {kv("Scènes", `${stats.sceneCount} (${stats.intCount} INT / ${stats.extCount} EXT)`)}
      {kv("Jour / Nuit", `${stats.jourCount} / ${stats.nuitCount}`)}
      {kv("Personnages", stats.charCount)}
      {kv("Dialogue / Action", `${stats.dialPct}% / ${100 - stats.dialPct}%`)}

      {/* AI analysis */}
      {loading && (
        <div style={{ marginTop: 24, textAlign: "center", color: th.muted }}>
          <div style={{ fontSize: 20, marginBottom: 8 }}>◎</div>
          <div style={{ fontSize: 11 }}>Lecture complète du scénario en cours…</div>
          <div style={{ fontSize: 10, marginTop: 4, color: th.hint }}>Analyse de l'intégralité du texte — cela peut prendre 30 à 60 secondes</div>
        </div>
      )}

      {error && (
        <div style={{ marginTop: 20, padding: "10px 12px", background: `#c4444415`, borderRadius: 6, fontSize: 11, color: "#c44" }}>
          {error}
          <button onClick={() => { setError(null); setAnalysis(null); hasRun.current = false; runAnalysis(); }}
            style={{ display: "block", marginTop: 6, background: "transparent", border: `1px solid #c44`, borderRadius: 4, color: "#c44", padding: "3px 12px", fontSize: 10, cursor: "pointer" }}>
            Réessayer
          </button>
        </div>
      )}

      {analysis && (
        <>
          {analysis.auteurs && (
            <>
              {section("Auteur(s)")}
              <div style={{ fontSize: 12, color: th.text, fontWeight: 600 }}>{analysis.auteurs}</div>
            </>
          )}

          {section("Genre")}
          <div style={{ fontSize: 13, color: th.text, fontWeight: 600 }}>{analysis.genre || "—"}</div>
          {analysis.ton && <div style={{ fontSize: 11, color: th.muted, marginTop: 3 }}>Ton : {analysis.ton}</div>}
          {analysis.public && <div style={{ fontSize: 11, color: th.muted, marginTop: 2 }}>Public : {analysis.public}</div>}

          {analysis.synopsis && (
            <>
              {section("Synopsis")}
              <div style={{ fontSize: 12, color: th.soft, lineHeight: 1.7 }}>{analysis.synopsis}</div>
            </>
          )}

          {analysis.resume && (
            <>
              {section("Résumé")}
              <div style={{ fontSize: 12, color: th.soft, lineHeight: 1.7 }}>{analysis.resume}</div>
            </>
          )}

          {analysis.avis && (
            <>
              {section("Avis critique")}
              <div style={{ fontSize: 12, color: th.soft, lineHeight: 1.7, borderLeft: `2px solid ${th.accent}`, paddingLeft: 12, fontStyle: "italic" }}>{analysis.avis}</div>
            </>
          )}

          {analysis.comparables && analysis.comparables.length > 0 && (
            <>
              {section("Références comparables")}
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {analysis.comparables.map((c, i) => (
                  <div key={i} style={{
                    padding: "7px 12px", background: th.surfaceAlt,
                    borderRadius: 5, border: `1px solid ${th.border}`,
                    fontSize: 11, color: th.text, fontWeight: 500,
                  }}>{c}</div>
                ))}
              </div>
            </>
          )}

          {analysis.plateformes && analysis.plateformes.length > 0 && (
            <>
              {section("Plateformes potentielles")}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {analysis.plateformes.map((p, i) => {
                  const score = p.score || 0;
                  const scoreColor = score >= 75 ? "#5a9a5a" : score >= 50 ? th.accent : th.muted;
                  return (
                    <div key={i} style={{
                      padding: "10px 12px", background: th.surfaceAlt,
                      borderRadius: 6, border: `1px solid ${th.border}`,
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: th.text }}>{p.nom || "—"}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{
                            width: 40, height: 5, background: th.statBarBg, borderRadius: 3, overflow: "hidden",
                          }}>
                            <div style={{ height: "100%", width: `${score}%`, background: scoreColor, borderRadius: 3 }} />
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 700, color: scoreColor, minWidth: 28 }}>{score}%</span>
                        </div>
                      </div>
                      {p.raison && <div style={{ fontSize: 11, color: th.soft, lineHeight: 1.5, marginBottom: 3 }}>{p.raison}</div>}
                      {p.ref && <div style={{ fontSize: 10, color: th.muted, fontStyle: "italic" }}>Réf. catalogue : {p.ref}</div>}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Distribution strategy */}
          {analysis.distribution && (
            <>
              {section("Stratégie de distribution")}
              <div style={{ fontSize: 12, color: th.soft, lineHeight: 1.7, padding: "8px 12px", background: th.surfaceAlt, borderRadius: 6, border: `1px solid ${th.border}` }}>
                {analysis.distribution}
              </div>
            </>
          )}

          {/* Opportunities */}
          {analysis.opportunites && analysis.opportunites.length > 0 && (
            <>
              {section("Appels à projets & dispositifs")}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {analysis.opportunites.map((o, i) => (
                  <div key={i} style={{
                    padding: "9px 12px", background: th.surfaceAlt,
                    borderRadius: 6, border: `1px solid ${th.border}`,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: th.text }}>{o.nom}</span>
                      {o.format && <span style={{ fontSize: 9, color: th.accent, fontWeight: 600, background: `${th.accent}12`, padding: "1px 8px", borderRadius: 10 }}>{o.format}</span>}
                    </div>
                    {o.organisme && <div style={{ fontSize: 10, color: th.muted, marginBottom: 3 }}>{o.organisme}</div>}
                    <div style={{ fontSize: 11, color: th.soft, lineHeight: 1.5 }}>{o.pertinence}</div>
                    {o.condition && <div style={{ fontSize: 10, color: th.accent, marginTop: 3, fontStyle: "italic" }}>Condition : {o.condition}</div>}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* Character ranking */}
      {section("Temps de parole")}
      {stats.charRanking.slice(0, 10).map((c) => (
        <div key={c.name} style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
            <span style={{ fontWeight: 600, color: th.text, fontSize: 11 }}>{c.name}</span>
            <span style={{ color: th.muted, fontSize: 10 }}>{c.words} mots · {c.pct}%</span>
          </div>
          <div style={{ height: 5, background: th.statBarBg, borderRadius: 3, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${c.pct}%`, background: th.statBar, borderRadius: 3 }} />
          </div>
        </div>
      ))}

      {/* Alerts */}
      {(stats.dialPct > 65 || stats.dialPct < 30 || stats.charRanking.length > 15 || stats.estMinutes > 130) && (
        <>
          {section("Points d'attention")}
          <div style={{ fontSize: 11, color: th.soft, lineHeight: 1.7 }}>
            {stats.dialPct > 65 && <div>⚠ Dialogue dominant ({stats.dialPct}%)</div>}
            {stats.dialPct < 30 && <div>⚠ Peu de dialogue ({stats.dialPct}%)</div>}
            {stats.charRanking.length > 15 && <div>⚠ {stats.charRanking.length} personnages — casting lourd</div>}
            {stats.estMinutes > 130 && <div>⚠ Durée longue (~{stats.estMinutes} min)</div>}
          </div>
        </>
      )}

      {/* Export buttons */}
      {analysis && (
        <div style={{ marginTop: 24, paddingTop: 16, borderTop: `1px solid ${th.border}`, display: "flex", flexDirection: "column", gap: 8 }}>
          {/* Export full fiche — HTML */}
          <button onClick={() => {
            const date = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
            const title = stats.title || fName || "Sans titre";
            const auteurs = analysis.auteurs || stats.author || "—";

            const escH = (s) => (s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
            const nl2p = (s) => (s||"—").split(/\n\n+/).map(p => `<p>${escH(p.trim())}</p>`).join("");

            const alerts = [];
            if (stats.dialPct > 65) alerts.push(`Dialogue dominant (${stats.dialPct}%)`);
            if (stats.dialPct < 30) alerts.push(`Peu de dialogue (${stats.dialPct}%)`);
            if (stats.charRanking.length > 15) alerts.push(`${stats.charRanking.length} personnages — casting lourd`);
            if (stats.estMinutes > 130) alerts.push(`Durée longue (~${stats.estMinutes} min)`);

            const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Fiche de Lecture — ${escH(title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
@page{size:A4;margin:20mm 25mm}
body{font-family:'Inter',sans-serif;color:#1a1a1a;background:#f8f6f3;line-height:1.7;font-size:14px;-webkit-font-smoothing:antialiased}
.page{max-width:800px;margin:0 auto;background:#fff;min-height:100vh}
@media print{body{background:#fff}.page{box-shadow:none}}
@media screen{.page{margin:32px auto;box-shadow:0 1px 40px rgba(0,0,0,.08);border-radius:2px}}

/* Header */
.header{padding:56px 56px 40px;border-bottom:3px solid #1a1a1a;position:relative}
.header::before{content:"";position:absolute;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg,#c4956a,#8b6f47)}
.doc-type{font-family:'Inter',sans-serif;font-size:11px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:#8b6f47;margin-bottom:20px}
.title{font-family:'Playfair Display',Georgia,serif;font-size:32px;font-weight:700;line-height:1.2;margin-bottom:8px;color:#1a1a1a}
.subtitle{font-size:15px;color:#555;font-weight:400}
.date-line{font-size:12px;color:#999;margin-top:12px;letter-spacing:.04em}

/* Metadata grid */
.meta{padding:32px 56px;display:grid;grid-template-columns:1fr 1fr;gap:12px 40px;border-bottom:1px solid #e8e4df}
.meta-item{display:flex;justify-content:space-between;align-items:baseline;padding:6px 0;border-bottom:1px dotted #ddd}
.meta-label{font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.1em;color:#8b6f47}
.meta-value{font-size:14px;color:#1a1a1a;font-weight:500;text-align:right}

/* Sections */
.section{padding:32px 56px}
.section+.section{border-top:1px solid #e8e4df}
.section-title{font-family:'Playfair Display',Georgia,serif;font-size:18px;font-weight:600;color:#1a1a1a;margin-bottom:16px;padding-bottom:8px;border-bottom:2px solid #c4956a;display:inline-block}
.section p{margin-bottom:12px;text-align:justify;color:#333}

/* Comparables */
.comparables{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.comparable-tag{background:#f4efe9;border:1px solid #e0d6c8;border-radius:20px;padding:6px 16px;font-size:13px;color:#5a4a3a;font-weight:500}

/* Platforms */
.platform{margin-bottom:16px;padding:16px;background:#faf8f5;border-radius:8px;border-left:3px solid #c4956a}
.platform-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
.platform-name{font-weight:600;font-size:15px;color:#1a1a1a}
.platform-score{font-size:24px;font-weight:700;color:#8b6f47}
.platform-bar{height:6px;background:#e8e4df;border-radius:3px;overflow:hidden;margin-bottom:8px}
.platform-fill{height:100%;background:linear-gradient(90deg,#c4956a,#8b6f47);border-radius:3px}
.platform-detail{font-size:13px;color:#666;line-height:1.5}

/* Opportunities */
.opportunity{margin-bottom:14px;padding:14px 16px;background:#f9f7f4;border-radius:6px}
.opportunity-name{font-weight:600;font-size:14px;color:#1a1a1a;margin-bottom:4px}
.opportunity-org{font-size:12px;color:#8b6f47;font-weight:500;margin-bottom:4px}
.opportunity-detail{font-size:13px;color:#666}

/* Characters / parole */
.char-row{display:flex;align-items:center;gap:12px;margin-bottom:8px}
.char-name{width:120px;font-size:13px;font-weight:600;color:#333;flex-shrink:0}
.char-bar-bg{flex:1;height:8px;background:#e8e4df;border-radius:4px;overflow:hidden}
.char-bar-fill{height:100%;background:linear-gradient(90deg,#c4956a,#8b6f47);border-radius:4px}
.char-pct{width:80px;font-size:12px;color:#888;text-align:right;flex-shrink:0}

/* Alerts */
.alert{display:flex;align-items:flex-start;gap:10px;padding:10px 14px;background:#fff8f0;border-left:3px solid #e6a756;border-radius:0 6px 6px 0;margin-bottom:8px;font-size:13px;color:#7a5c28}

/* Footer */
.footer{padding:32px 56px;border-top:3px solid #1a1a1a;text-align:center;font-size:11px;color:#aaa;letter-spacing:.06em}
.footer strong{color:#8b6f47}
</style></head><body><div class="page">
<div class="header">
<div class="doc-type">Fiche de Lecture</div>
<div class="title">${escH(title)}</div>
<div class="subtitle">${escH(auteurs)}</div>
<div class="date-line">${escH(date)}</div>
</div>

<div class="meta">
<div class="meta-item"><span class="meta-label">Genre</span><span class="meta-value">${escH(analysis.genre)}</span></div>
<div class="meta-item"><span class="meta-label">Ton</span><span class="meta-value">${escH(analysis.ton)}</span></div>
<div class="meta-item"><span class="meta-label">Public</span><span class="meta-value">${escH(analysis.public)}</span></div>
<div class="meta-item"><span class="meta-label">Durée</span><span class="meta-value">~${stats.estMinutes} min</span></div>
<div class="meta-item"><span class="meta-label">Scènes</span><span class="meta-value">${stats.sceneCount} (${stats.intCount} INT / ${stats.extCount} EXT)</span></div>
<div class="meta-item"><span class="meta-label">Jour / Nuit</span><span class="meta-value">${stats.jourCount} / ${stats.nuitCount}</span></div>
<div class="meta-item"><span class="meta-label">Personnages</span><span class="meta-value">${stats.charCount}</span></div>
<div class="meta-item"><span class="meta-label">Dialogue / Action</span><span class="meta-value">${stats.dialPct}% / ${100 - stats.dialPct}%</span></div>
</div>

${analysis.synopsis ? `<div class="section"><div class="section-title">Synopsis</div>${nl2p(analysis.synopsis)}</div>` : ""}
${analysis.resume ? `<div class="section"><div class="section-title">Résumé</div>${nl2p(analysis.resume)}</div>` : ""}
${analysis.avis ? `<div class="section"><div class="section-title">Avis de Lecture</div>${nl2p(analysis.avis)}</div>` : ""}

${analysis.comparables && analysis.comparables.length > 0 ? `<div class="section"><div class="section-title">Références &amp; Comparables</div><div class="comparables">${analysis.comparables.map(c => `<span class="comparable-tag">${escH(c)}</span>`).join("")}</div></div>` : ""}

${analysis.plateformes && analysis.plateformes.length > 0 ? `<div class="section"><div class="section-title">Plateformes Potentielles</div>${analysis.plateformes.map(p => `<div class="platform"><div class="platform-header"><span class="platform-name">${escH(p.nom)}</span><span class="platform-score">${p.score||0}%</span></div><div class="platform-bar"><div class="platform-fill" style="width:${p.score||0}%"></div></div>${p.raison ? `<div class="platform-detail">${escH(p.raison)}</div>` : ""}${p.ref ? `<div class="platform-detail" style="font-style:italic;margin-top:4px">Réf. : ${escH(p.ref)}</div>` : ""}</div>`).join("")}</div>` : ""}

${analysis.distribution ? `<div class="section"><div class="section-title">Stratégie de Distribution</div>${nl2p(analysis.distribution)}</div>` : ""}

${analysis.opportunites && analysis.opportunites.length > 0 ? `<div class="section"><div class="section-title">Appels à Projets &amp; Dispositifs</div>${analysis.opportunites.map(o => `<div class="opportunity"><div class="opportunity-name">${escH(o.nom)}</div>${o.organisme ? `<div class="opportunity-org">${escH(o.organisme)}</div>` : ""}${o.pertinence ? `<div class="opportunity-detail">${escH(o.pertinence)}</div>` : ""}${o.condition ? `<div class="opportunity-detail" style="font-style:italic">Condition : ${escH(o.condition)}</div>` : ""}</div>`).join("")}</div>` : ""}

${stats.charRanking.length > 0 ? `<div class="section"><div class="section-title">Temps de Parole</div>${stats.charRanking.slice(0,12).map(c => `<div class="char-row"><span class="char-name">${escH(c.name)}</span><div class="char-bar-bg"><div class="char-bar-fill" style="width:${c.pct}%"></div></div><span class="char-pct">${c.pct}% · ${c.words} mots</span></div>`).join("")}</div>` : ""}

${alerts.length > 0 ? `<div class="section"><div class="section-title">Points d’Attention</div>${alerts.map(a => `<div class="alert">⚠️ ${escH(a)}</div>`).join("")}</div>` : ""}

<div class="footer">Généré par <strong>Scénorama</strong> — scenorama.vercel.app</div>
</div></body></html>`;

            const blob = new Blob([html], { type: "text/html;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${(title).replace(/[^a-zA-ZÀ-ÿ0-9]/g, "_")}_fiche.html`;
            a.click();
            URL.revokeObjectURL(url);
          }} style={{
            width: "100%", padding: "10px", background: th.accent, color: th.contrast,
            border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600,
            cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
            letterSpacing: "0.04em",
          }}>
            Exporter la fiche complète
          </button>

          {/* Export memo — HTML one-pager */}
          <button onClick={() => {
            const date = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
            const title = stats.title || fName || "Sans titre";
            const auteurs = analysis.auteurs || stats.author || "—";

            const escH = (s) => (s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");

            const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mémo — ${escH(title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
@page{size:A4;margin:18mm 22mm}
body{font-family:'Inter',sans-serif;color:#1a1a1a;background:#f8f6f3;line-height:1.65;font-size:13px;-webkit-font-smoothing:antialiased}
.page{max-width:800px;margin:0 auto;background:#fff;overflow:hidden}
@media print{body{background:#fff}.page{box-shadow:none}}
@media screen{.page{margin:32px auto;box-shadow:0 1px 40px rgba(0,0,0,.08);border-radius:2px}}

.header{padding:44px 48px 28px;position:relative;border-bottom:2px solid #1a1a1a}
.header::before{content:"";position:absolute;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg,#c4956a,#8b6f47)}
.badge{display:inline-block;font-size:10px;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:#fff;background:#8b6f47;padding:4px 12px;border-radius:3px;margin-bottom:16px}
.title{font-family:'Playfair Display',Georgia,serif;font-size:26px;font-weight:700;line-height:1.2;margin-bottom:6px}
.author{font-size:14px;color:#555}.date{font-size:11px;color:#aaa;margin-top:6px}

.quick-facts{display:grid;grid-template-columns:repeat(5,1fr);padding:16px 48px;background:#faf8f5;border-bottom:1px solid #e8e4df}
.fact{text-align:center;padding:8px 0}
.fact-val{font-size:18px;font-weight:700;color:#8b6f47}
.fact-label{font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:#888;margin-top:2px}

.body{padding:28px 48px;display:grid;grid-template-columns:1fr 1fr;gap:0 32px}
.body.full-width{grid-template-columns:1fr}
.col-left,.col-right{min-width:0}

h3{font-family:'Playfair Display',Georgia,serif;font-size:14px;font-weight:600;color:#8b6f47;margin:16px 0 8px;padding-bottom:4px;border-bottom:1px solid #e8e4df}
h3:first-child{margin-top:0}
p{margin-bottom:8px;text-align:justify;color:#333;font-size:13px}
.tag-list{display:flex;flex-wrap:wrap;gap:5px;margin:6px 0 12px}
.tag{background:#f4efe9;border:1px solid #e0d6c8;border-radius:14px;padding:3px 10px;font-size:11px;color:#5a4a3a;font-weight:500}

.plat{display:flex;align-items:center;gap:8px;margin-bottom:6px}
.plat-name{font-size:12px;font-weight:600;width:90px;flex-shrink:0;color:#333}
.plat-bar-bg{flex:1;height:5px;background:#e8e4df;border-radius:3px;overflow:hidden}
.plat-bar-fill{height:100%;background:linear-gradient(90deg,#c4956a,#8b6f47);border-radius:3px}
.plat-score{width:36px;font-size:11px;font-weight:700;color:#8b6f47;text-align:right}

.footer{padding:20px 48px;border-top:2px solid #1a1a1a;text-align:center;font-size:10px;color:#aaa;letter-spacing:.06em}
.footer strong{color:#8b6f47}
</style></head><body><div class="page">

<div class="header">
<div class="badge">Mémo de Présentation</div>
<div class="title">${escH(title)}</div>
<div class="author">${escH(auteurs)}</div>
<div class="date">${escH(date)}</div>
</div>

<div class="quick-facts">
<div class="fact"><div class="fact-val">~${stats.estMinutes}</div><div class="fact-label">minutes</div></div>
<div class="fact"><div class="fact-val">${stats.sceneCount}</div><div class="fact-label">scènes</div></div>
<div class="fact"><div class="fact-val">${stats.charCount}</div><div class="fact-label">personnages</div></div>
<div class="fact"><div class="fact-val">${escH(analysis.genre||"—")}</div><div class="fact-label">genre</div></div>
<div class="fact"><div class="fact-val">${escH(analysis.ton||"—")}</div><div class="fact-label">ton</div></div>
</div>

<div class="body">
<div class="col-left">
<h3>Synopsis</h3>
<p>${escH(analysis.synopsis||"—")}</p>

<h3>Avis de Lecture</h3>
<p>${escH(analysis.avis||"—")}</p>

${analysis.comparables && analysis.comparables.length > 0 ? `<h3>Références</h3><div class="tag-list">${analysis.comparables.map(c => `<span class="tag">${escH(c)}</span>`).join("")}</div>` : ""}
</div>

<div class="col-right">
${analysis.plateformes && analysis.plateformes.length > 0 ? `<h3>Plateformes</h3>${analysis.plateformes.map(p => `<div class="plat"><span class="plat-name">${escH(p.nom)}</span><div class="plat-bar-bg"><div class="plat-bar-fill" style="width:${p.score||0}%"></div></div><span class="plat-score">${p.score||0}%</span></div>`).join("")}` : ""}

${analysis.distribution ? `<h3>Distribution</h3><p>${escH(analysis.distribution)}</p>` : ""}

${analysis.opportunites && analysis.opportunites.length > 0 ? `<h3>Dispositifs</h3>${analysis.opportunites.slice(0,4).map(o => `<p style="margin-bottom:4px"><strong>${escH(o.nom)}</strong>${o.organisme ? ` <span style="color:#8b6f47">(${escH(o.organisme)})</span>` : ""}</p>`).join("")}` : ""}

${stats.charRanking.length > 0 ? `<h3>Temps de Parole</h3>${stats.charRanking.slice(0,6).map(c => `<div class="plat"><span class="plat-name">${escH(c.name)}</span><div class="plat-bar-bg"><div class="plat-bar-fill" style="width:${c.pct}%"></div></div><span class="plat-score">${c.pct}%</span></div>`).join("")}` : ""}
</div>
</div>

<div class="footer">Généré par <strong>Scénorama</strong> — scenorama.vercel.app</div>
</div></body></html>`;

            const blob = new Blob([html], { type: "text/html;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${(title).replace(/[^a-zA-ZÀ-ÿ0-9]/g, "_")}_memo.html`;
            a.click();
            URL.revokeObjectURL(url);
          }} style={{
            width: "100%", padding: "10px", background: "transparent", color: th.accent,
            border: `1px solid ${th.accent}`, borderRadius: 6, fontSize: 12, fontWeight: 600,
            cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
            letterSpacing: "0.04em",
          }}>
            Exporter le mémo (one-pager)
          </button>
          <div style={{ fontSize: 10, color: th.hint, marginTop: 4, textAlign: "center" }}>
            Fiche = document complet · Mémo = one-pager pour diffuseur · Imprimez en PDF via ⌘P
          </div>
        </div>
      )}
    </div>
  );
});




// ─── Contrat Panel — Contract Generator ─────────────────────────────

const CONTRAT_DEFAULTS = {
  type: "long", // long, court, serie
  titre: "",
  auteurNom: "",
  auteurAdresse: "",
  agentNom: "",
  agentAdresse: "",
  prodNom: "",
  prodForme: "SARL",
  prodRcs: "",
  prodSiege: "",
  prodRepresentant: "",
  montantHT: "",
  agentPct: "10",
  etapes: "traitement,v1_dialoguee,v2_dialoguee,v3_definitive",
  duree: "30",
  isAdaptation: false,
  oeuvreOrigine: "",
  auteurOrigine: "",
};



// ─── Contrat Panel — Contract Generator ─────────────────────────────

const ContratPanel = memo(function ContratPanel({ th, onClose, fName }) {
  const fm = "'DM Sans',sans-serif";
  const [form, setForm] = useState({
    type: "long",
    titre: fName?.replace(/\.[^.]+$/, "") || "",
    auteur: "", agentAuteur: "",
    coAuteur: "",
    producteur: "", siretProd: "", gerantProd: "", adresseProd: "",
    adaptation: false, oeuvreOrigine: "",
    montant: "", montantAgent: "",
    etapes: "3",
    duree: "32",
    droit_suite: true,
  });
  const [generated, setGenerated] = useState(null);

  const u = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  const inputStyle = {
    width: "100%", padding: "7px 10px", fontSize: 12,
    background: th.inputBg, color: th.text,
    border: `1px solid ${th.inputBorder}`, borderRadius: 5,
    fontFamily: fm, outline: "none", boxSizing: "border-box",
  };
  const labelStyle = { fontSize: 10, color: th.muted, fontWeight: 600, letterSpacing: "0.04em", display: "block", marginBottom: 3, marginTop: 10 };
  const sectionHead = (title) => (
    <div style={{ fontWeight: 700, fontSize: 11, letterSpacing: "0.12em", color: th.accent, marginBottom: 6, marginTop: 18, textTransform: "uppercase" }}>{title}</div>
  );

  const generateContract = () => {
    const date = new Date().toLocaleDateString("fr-FR");
    const sep = "=".repeat(60);
    const thin = "-".repeat(60);
    const f = form;
    const montantNum = parseFloat(f.montant) || 0;
    const montantAgentNum = parseFloat(f.montantAgent) || 0;
    const totalHT = montantNum + montantAgentNum;
    const typeLabel = { long: "long metrage", court: "court metrage", serie: "serie", doc: "documentaire" }[f.type] || "oeuvre audiovisuelle";
    const nbVersions = parseInt(f.etapes) || 3;

    let c = "";
    c += sep + "\n";
    c += "CONTRAT DE COMMANDE DE TEXTES\n";
    c += "ET DE CESSION DE DROITS D'AUTEUR\n";
    c += "SCENARISTE, ADAPTATEUR ET DIALOGUISTE\n";
    c += sep + "\n\n";
    c += "Projet : " + (f.titre || "A DEFINIR") + "\n";
    c += "Type : " + typeLabel + "\n";
    c += "Date : " + date + "\n\n";
    c += thin + "\n";
    c += "ENTRE LES SOUSSIGNES\n";
    c += thin + "\n\n";
    c += "La societe " + (f.producteur || "[NOM DE LA SOCIETE]");
    if (f.siretProd) c += ", SIRET " + f.siretProd;
    if (f.adresseProd) c += ", dont le siege social est situe au " + f.adresseProd;
    if (f.gerantProd) c += ", representee par " + f.gerantProd;
    c += ".\n\nCi-apres denommee le Producteur.\n\nD'une part,\n\nET\n\n";
    c += (f.auteur || "[NOM DE L'AUTEUR]");
    if (f.agentAuteur) c += ", domicilie(e) chez son agent " + f.agentAuteur;
    c += ".\n\nCi-apres denomme(e) l'Auteur.\n\n";
    if (f.coAuteur) c += "En collaboration avec " + f.coAuteur + ", ci-apres le Co-Auteur.\n\n";
    if (f.agentAuteur) c += "La societe " + f.agentAuteur + ", ci-apres denommee l'Agent.\n\n";
    c += "D'autre part.\n\n";

    c += thin + "\nEXPOSE PREALABLE\n" + thin + "\n\n";
    c += "Le Producteur envisage la production d'un " + typeLabel + " intitule provisoirement \"" + (f.titre || "[TITRE]") + "\".\n\n";
    if (f.adaptation) {
      c += "Le Scenario sera une adaptation de l'oeuvre suivante : " + (f.oeuvreOrigine || "[A PRECISER]") + ".\n";
      c += "Le Producteur declare avoir acquis ou etre en cours d'acquisition des droits d'adaptation de ladite oeuvre.\n\n";
    } else {
      c += "Il s'agit d'un scenario original.\n\n";
    }
    c += "Le present accord a pour objet de definir les modalites de collaboration de l'Auteur a la co-ecriture, l'adaptation et les dialogues du Scenario, et de definir les conditions de la cession de l'Auteur au Producteur des droits y afferents.\n\n";

    c += sep + "\nTITRE I - CONVENTION D'ECRITURE\n" + sep + "\n\n";
    c += "ARTICLE 1 - ETAPES D'ECRITURE\n\n";
    c += "Le Producteur commande a l'Auteur l'ecriture du Scenario selon les etapes suivantes :\n\n";
    c += "  a) Remise d'un traitement\n";
    c += "  b) Remise de la premiere version du scenario dialogue\n";
    c += "     Le Producteur fera part de ses remarques sous 15 jours ouvres.\n";
    if (nbVersions >= 2) c += "  c) Remise de la deuxieme version du scenario dialogue\n     Le Producteur fera part de ses remarques sous 15 jours ouvres.\n";
    if (nbVersions >= 3) c += "  d) Remise de la troisieme et derniere version du scenario dialogue\n     (ci-apres le Scenario Definitif)\n";
    c += "\n";

    c += "ARTICLE 2 - REMUNERATION\n\n";
    c += "En remuneration du travail remis et de la cession des droits correspondants, le Producteur versera a l'Auteur une somme brute HT de :\n\n";
    c += "  " + (totalHT > 0 ? totalHT.toLocaleString("fr-FR") + " EUR" : "[MONTANT] EUR") + " (HT), soit :\n";
    c += "  - " + (montantNum > 0 ? montantNum.toLocaleString("fr-FR") + " EUR" : "[MONTANT]") + " pour l'Auteur\n";
    if (montantAgentNum > 0 || f.agentAuteur) c += "  - " + (montantAgentNum > 0 ? montantAgentNum.toLocaleString("fr-FR") + " EUR" : "[MONTANT]") + " + TVA pour l'Agent\n";
    c += "\n";

    c += "ARTICLE 3 - DECISION DU PRODUCTEUR\n\n";
    c += "A chaque etape d'ecriture, le Producteur aura la possibilite :\n";
    c += "  a) De poursuivre le projet avec la collaboration de l'Auteur ;\n";
    c += "  b) De renoncer a poursuivre sa collaboration avec l'Auteur.\n";
    c += "     Dans ce cas, l'Auteur conservera les sommes versees a titre de dedit forfaitaire.\n\n";

    c += sep + "\nTITRE II - CESSION DE DROITS\n" + sep + "\n\n";
    c += "ARTICLE 4 - OBJET DE LA CESSION\n\n";
    c += "L'Auteur cede au Producteur, a titre exclusif, pour le monde entier, les droits d'exploitation du Film.\n";
    c += "Ces droits comprennent le droit de reproduction et de representation du Film, les droits secondaires, ainsi que les droits d'utilisation derivee.\n\n";

    c += "ARTICLE 5 - DROITS CEDES\n\n";
    c += "Les droits d'exploitation cedes comprennent notamment :\n";
    c += "  - Exploitation cinematographique (salles)\n";
    c += "  - Exploitation par telediffusion (TV, cable, satellite, internet)\n";
    c += "  - Exploitation videographique (DVD, VOD, SVOD)\n";
    c += "  - Exploitation en ligne et numerique\n";
    if (f.droit_suite) c += "  - Droits de remake, prequel, sequel, spin-off\n";
    c += "\n";

    c += "ARTICLE 6 - DUREE\n\n";
    c += "La presente cession est conclue pour une duree de " + f.duree + " ans a compter de la premiere representation commerciale du Film.\n\n";

    c += "ARTICLE 7 - REMUNERATIONS PROPORTIONNELLES\n\n";
    c += "En contrepartie de la cession, l'Auteur recevra les remunerations proportionnelles suivantes :\n\n";
    c += "  Exploitation cinematographique : 0,225% pour l'Auteur\n";
    c += "  Exploitation videographique : 0,135% pour l'Auteur\n";
    c += "  Exploitation TV : 0,9% pour l'Auteur\n";
    c += "  Autres exploitations : 0,9% pour l'Auteur\n\n";

    c += "ARTICLE 8 - PUBLICITE\n\n";
    c += "L'Auteur sera credite de la facon suivante :\n\n";
    c += "  Scenario" + (f.coAuteur ? " et dialogues" : "") + " de " + (f.auteur || "[NOM]") + (f.coAuteur ? " et " + f.coAuteur : "") + "\n\n";
    c += "dans des caracteres dont la taille ne pourra etre inferieure a 75% du nom du realisateur.\n\n";

    c += "ARTICLE 9 - REDDITION DES COMPTES\n\n";
    c += "Le Producteur etablira des redditions de comptes semestriellement les deux premieres annees, puis annuellement.\n\n";

    c += "ARTICLE 10 - RESILIATION\n\n";
    c += "En cas de defaut de paiement, apres mise en demeure par lettre recommandee restee sans effet sous 15 jours, le present contrat sera resilie de plein droit.\n\n";

    c += "ARTICLE 11 - LITIGES\n\n";
    c += "En cas de litiges, attribution de juridiction est faite aux Tribunaux competents de Paris.\n\n";

    c += thin + "\n\n";
    c += "Fait a Paris, le " + date + "\nEn quatre exemplaires originaux dont un pour le RPCA.\n\n\n";
    c += "LE PRODUCTEUR                    L'AUTEUR" + (f.agentAuteur ? "                    L'AGENT" : "") + "\n\n\n\n";
    c += sep + "\n";
    c += "  Document genere par Scenorama - scenorama.vercel.app\n";
    c += "  Ce document est un modele. Il ne constitue pas un avis juridique.\n";
    c += "  Consultez un avocat specialise avant signature.\n";
    c += sep + "\n";

    setGenerated(c);
  };

  const downloadContract = () => {
    if (!generated) return;
    const blob = new Blob([generated], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Contrat_" + (form.titre || "projet").replace(/[^a-zA-Z0-9]/g, "_") + ".txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{
      width: 380, flexShrink: 0,
      background: th.surface, borderLeft: "1px solid " + th.border,
      overflowY: "auto", padding: "20px 18px",
      fontFamily: fm, fontSize: 12, color: th.text,
      scrollbarWidth: "thin",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontWeight: 700, fontSize: 16, color: th.accent, fontFamily: "'Cormorant Garamond',serif" }}>Contrat d'auteur</span>
        <button onClick={onClose} style={{ background: "transparent", border: "none", color: th.muted, fontSize: 18, cursor: "pointer" }}>x</button>
      </div>
      <div style={{ fontSize: 10, color: th.hint, marginBottom: 14, lineHeight: 1.5 }}>
        Generateur de contrat-type base sur les standards du marche francais (structure OSS 117 / Mandarin Cinema). Consultez un avocat avant signature.
      </div>

      {!generated ? (
        <>
          {sectionHead("Type de projet")}
          <select value={form.type} onChange={u("type")} style={inputStyle}>
            <option value="long">Long metrage</option>
            <option value="court">Court metrage</option>
            <option value="serie">Serie</option>
            <option value="doc">Documentaire</option>
          </select>

          <label style={labelStyle}>Titre du projet</label>
          <input value={form.titre} onChange={u("titre")} placeholder="Titre provisoire" style={inputStyle} />

          {sectionHead("Auteur")}
          <label style={labelStyle}>Nom complet de l'auteur</label>
          <input value={form.auteur} onChange={u("auteur")} placeholder="Prenom Nom" style={inputStyle} />
          <label style={labelStyle}>Co-auteur (optionnel)</label>
          <input value={form.coAuteur} onChange={u("coAuteur")} placeholder="Prenom Nom" style={inputStyle} />
          <label style={labelStyle}>Agent (optionnel)</label>
          <input value={form.agentAuteur} onChange={u("agentAuteur")} placeholder="Nom de l'agence" style={inputStyle} />

          {sectionHead("Producteur")}
          <label style={labelStyle}>Societe de production</label>
          <input value={form.producteur} onChange={u("producteur")} placeholder="Nom de la societe" style={inputStyle} />
          <label style={labelStyle}>Gerant / Representant</label>
          <input value={form.gerantProd} onChange={u("gerantProd")} placeholder="Prenom Nom" style={inputStyle} />
          <label style={labelStyle}>Adresse du siege</label>
          <input value={form.adresseProd} onChange={u("adresseProd")} placeholder="Adresse complete" style={inputStyle} />
          <label style={labelStyle}>SIRET (optionnel)</label>
          <input value={form.siretProd} onChange={u("siretProd")} placeholder="XXX XXX XXX XXXXX" style={inputStyle} />

          {sectionHead("Scenario")}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
            <input type="checkbox" checked={form.adaptation} onChange={u("adaptation")} />
            <span style={{ fontSize: 11, color: th.soft }}>Adaptation d'une oeuvre existante</span>
          </div>
          {form.adaptation && (
            <>
              <label style={labelStyle}>Oeuvre d'origine</label>
              <input value={form.oeuvreOrigine} onChange={u("oeuvreOrigine")} placeholder="Titre, auteur" style={inputStyle} />
            </>
          )}

          {sectionHead("Remuneration")}
          <label style={labelStyle}>Montant auteur (EUR HT)</label>
          <input type="number" value={form.montant} onChange={u("montant")} placeholder="ex: 30000" style={inputStyle} />
          <label style={labelStyle}>Montant agent (EUR HT, optionnel)</label>
          <input type="number" value={form.montantAgent} onChange={u("montantAgent")} placeholder="ex: 3000" style={inputStyle} />

          {sectionHead("Modalites")}
          <label style={labelStyle}>Nombre de versions du scenario</label>
          <select value={form.etapes} onChange={u("etapes")} style={inputStyle}>
            <option value="2">2 versions</option>
            <option value="3">3 versions (standard)</option>
          </select>
          <label style={labelStyle}>Duree de la cession (annees)</label>
          <input type="number" value={form.duree} onChange={u("duree")} placeholder="32" style={inputStyle} />
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
            <input type="checkbox" checked={form.droit_suite} onChange={u("droit_suite")} />
            <span style={{ fontSize: 11, color: th.soft }}>Inclure droits de suite (remake, sequel, spin-off)</span>
          </div>

          <button onClick={generateContract} style={{
            width: "100%", padding: "12px", marginTop: 20,
            background: th.accent, color: th.contrast,
            border: "none", borderRadius: 6, fontSize: 13, fontWeight: 700,
            cursor: "pointer", fontFamily: fm, letterSpacing: "0.04em",
          }}>
            Generer le contrat
          </button>
        </>
      ) : (
        <>
          <div style={{
            padding: "12px", background: th.surfaceAlt, borderRadius: 6,
            border: "1px solid " + th.border, marginBottom: 14,
            maxHeight: 400, overflowY: "auto",
            fontFamily: "'Courier Prime',monospace", fontSize: 10,
            lineHeight: 1.6, whiteSpace: "pre-wrap", color: th.soft,
          }}>
            {generated}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={downloadContract} style={{
              flex: 1, padding: "10px", background: th.accent, color: th.contrast,
              border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600,
              cursor: "pointer", fontFamily: fm,
            }}>
              Telecharger (.txt)
            </button>
            <button onClick={() => setGenerated(null)} style={{
              padding: "10px 16px", background: "transparent", color: th.muted,
              border: "1px solid " + th.border, borderRadius: 6, fontSize: 12,
              cursor: "pointer", fontFamily: fm,
            }}>
              Modifier
            </button>
          </div>
          <div style={{ fontSize: 9, color: th.hint, marginTop: 10, lineHeight: 1.5, textAlign: "center" }}>
            Ce document est un modele base sur les usages du marche francais. Il ne constitue pas un avis juridique.
          </div>
        </>
      )}
    </div>
  );
});


// ─── Contrat Panel — Contract Generator ─────────────────────────────



// ─── Main ───────────────────────────────────────────────────────────

export default function Scenorama() {
  const [raw, setRaw] = useState("");
  const [pBreaks, setPBreaks] = useState([]);
  const [fName, setFName] = useState("");
  const [playing, setPlaying] = useState(false);
  const [spd, setSpd] = useState(38);
  const [fs, setFs] = useState(17);
  const [ctrlVis, setCtrlVis] = useState(true);
  const [focus, setFocus] = useState(false);
  const [mode, setMode] = useState("jour");
  const [, startTransition] = useTransition();
  const [charFilter, setCharFilter] = useState(null);
  const [showChars, setShowChars] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showScenes, setShowScenes] = useState(false);
  const [showContrat, setShowContrat] = useState(false);
  const [cachedAnalysis, _setCachedAnalysis] = useState(null);
  // Reload cached fiche from localStorage whenever a file is opened
  useEffect(() => {
    if (!fName) { _setCachedAnalysis(null); return; }
    try {
      const saved = localStorage.getItem(`scenorama-fiche-${fName}`);
      if (saved) _setCachedAnalysis(JSON.parse(saved));
      else _setCachedAnalysis(null);
    } catch { _setCachedAnalysis(null); }
  }, [fName]);
  const setCachedAnalysis = useCallback((data) => {
    _setCachedAnalysis(data);
    if (fName) {
      try {
        if (data) localStorage.setItem(`scenorama-fiche-${fName}`, JSON.stringify(data));
        else localStorage.removeItem(`scenorama-fiche-${fName}`);
      } catch {}
    }
  }, [fName]);
  const [privacyMode, setPrivacyMode] = useState(false);
  const [annotations, setAnnotations] = useState({});
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [searchIdx, setSearchIdx] = useState(0);
  const [elapsed, setElapsed] = useState(0); // reading timer in seconds
  const [dragging, setDragging] = useState(false);

  // ── Persist annotations across sessions ───────────────────────
  // Use localStorage when available (deployed site), fallback gracefully
  const storageKey = fName ? `scenorama-notes-${fName}` : null;

  // Load annotations when file changes
  useEffect(() => {
    if (!storageKey) return;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) setAnnotations(JSON.parse(saved));
    } catch {}
  }, [storageKey]);

  // Save annotations whenever they change
  useEffect(() => {
    if (!storageKey) return;
    try {
      if (Object.keys(annotations).length > 0) {
        localStorage.setItem(storageKey, JSON.stringify(annotations));
      } else {
        localStorage.removeItem(storageKey);
      }
    } catch {}
  }, [annotations, storageKey]);

  const scrRef = useRef(null);
  const progRef = useRef(null);
  const pageRef = useRef(null);
  const animRef = useRef(null);
  const posRef = useRef(0);
  const ltRef = useRef(null);
  const csRef = useRef(38);
  const tsRef = useRef(38);
  const ctrlT = useRef(null);
  const pgRefs = useRef({});
  const playingRef = useRef(false);
  const curPageRef = useRef(1);
  const scrollTick = useRef(0);

  const th = useMemo(() => TH[mode], [mode]);
  const lines = useMemo(() => parseScreenplay(raw, pBreaks), [raw, pBreaks]);
  const totalPg = useMemo(() => Math.max(1, lines.filter((l) => l.pg).length), [lines]);
  const chars = useMemo(() => {
    const s = new Set(); lines.forEach((l) => { if (l.t === "char" && l.name) s.add(l.name); }); return [...s].sort();
  }, [lines]);
  const pgIdxMap = useMemo(() => { const m = {}; pBreaks.forEach((lk, i) => { m[lk] = i; }); return m; }, [pBreaks]);
  const stats = useMemo(() => calcStats(lines, totalPg), [lines, totalPg]);
  const lineElRefs = useRef({});

  // Scene index
  const scenes = useMemo(() => {
    const s = [];
    let sceneNum = 0;
    lines.forEach((l) => {
      if (l.t === "scene") {
        sceneNum++;
        const pgIdx = pBreaks.length > 0
          ? pBreaks.reduce((best, pb, i) => pb <= l.k ? i : best, 0)
          : -1;
        s.push({ key: l.k, num: sceneNum, text: l.text, page: pgIdx >= 0 ? pgIdx + 1 : null });
      }
    });
    return s;
  }, [lines, pBreaks]);

  // Search results
  const searchResults = useMemo(() => {
    if (!searchQ || searchQ.length < 2) return [];
    const q = searchQ.toLowerCase();
    return lines.filter((l) => l.text && l.text.toLowerCase().includes(q)).map((l) => l.k);
  }, [lines, searchQ]);

  // Jump to search result
  const goSearchResult = useCallback((idx) => {
    const results = searchResults;
    if (!results.length) return;
    const clamped = ((idx % results.length) + results.length) % results.length;
    setSearchIdx(clamped);
    const key = results[clamped];
    const el = lineElRefs.current[key];
    if (el && scrRef.current) {
      const top = el.offsetTop - 120;
      scrRef.current.scrollTop = top;
      posRef.current = top;
    }
  }, [searchResults]);

  // Jump to scene
  const goScene = useCallback((key) => {
    const el = lineElRefs.current[key];
    if (el && scrRef.current) {
      const top = el.offsetTop - 48;
      scrRef.current.scrollTop = top;
      posRef.current = top;
    }
    setShowScenes(false);
  }, []);

  useEffect(() => { tsRef.current = spd; }, [spd]);
  useEffect(() => { playingRef.current = playing; }, [playing]);

  // ── Reading timer — counts while playing ────────────────────────
  useEffect(() => {
    if (!playing) return;
    const iv = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(iv);
  }, [playing]);

  const timerStr = useMemo(() => {
    const m = Math.floor(elapsed / 60);
    const s = elapsed % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }, [elapsed]);

  // ── Note navigation ─────────────────────────────────────────────
  const noteKeys = useMemo(() =>
    Object.keys(annotations).map(Number).sort((a, b) => a - b),
  [annotations]);

  const goNote = useCallback((dir) => {
    if (!noteKeys.length || !scrRef.current) return;
    const scrollTop = scrRef.current.scrollTop;
    let target = null;
    if (dir > 0) {
      target = noteKeys.find((k) => {
        const el = lineElRefs.current[k];
        return el && el.offsetTop > scrollTop + 60;
      });
    } else {
      for (let i = noteKeys.length - 1; i >= 0; i--) {
        const el = lineElRefs.current[noteKeys[i]];
        if (el && el.offsetTop < scrollTop - 10) { target = noteKeys[i]; break; }
      }
    }
    if (target != null) {
      const el = lineElRefs.current[target];
      if (el) {
        const top = el.offsetTop - 100;
        scrRef.current.scrollTop = top;
        posRef.current = top;
      }
    }
  }, [noteKeys]);

  // ── Fullscreen toggle (with Safari/webkit fallback) ──────────────
  const toggleFullscreen = useCallback(() => {
    const doc = document;
    const el = document.documentElement;
    const isFS = doc.fullscreenElement || doc.webkitFullscreenElement;
    try {
      if (!isFS) {
        if (el.requestFullscreen) el.requestFullscreen();
        else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
      } else {
        if (doc.exitFullscreen) doc.exitFullscreen();
        else if (doc.webkitExitFullscreen) doc.webkitExitFullscreen();
      }
    } catch {}
  }, []);

  // ── Drag and drop ──────────────────────────────────────────────
  const onDragOver = useCallback((e) => { e.preventDefault(); setDragging(true); }, []);
  const onDragLeave = useCallback(() => setDragging(false), []);
  const onDropRef = useRef(null);

  const updatePageDOM = useCallback((pg) => {
    if (pg !== curPageRef.current) {
      curPageRef.current = pg;
      if (pageRef.current) pageRef.current.textContent = `p. ${pg} / ${totalPg}`;
    }
  }, [totalPg]);

  const detectPage = useCallback(() => {
    const el = scrRef.current; if (!el) return;
    const keys = Object.keys(pgRefs.current).map(Number).sort((a, b) => a - b);
    let pg = 1;
    for (const k of keys) { const m = pgRefs.current[k]; if (m && m.offsetTop <= el.scrollTop + 140) pg = k + 1; }
    updatePageDOM(pg);
  }, [updatePageDOM]);

  // ── Animation ───────────────────────────────────────────────────
  const anim = useCallback((ts) => {
    if (!ltRef.current) { ltRef.current = ts; animRef.current = requestAnimationFrame(anim); return; }
    const dt = Math.min(ts - ltRef.current, 60);
    ltRef.current = ts;
    csRef.current += (tsRef.current - csRef.current) * Math.min(1, dt * 0.005);
    const el = scrRef.current;
    if (!el) { animRef.current = requestAnimationFrame(anim); return; }
    const max = el.scrollHeight - el.clientHeight;
    if (max <= 0) { animRef.current = requestAnimationFrame(anim); return; }
    posRef.current = Math.min(posRef.current + (csRef.current * dt) / 1000, max);
    el.scrollTop = posRef.current;
    if (progRef.current) progRef.current.style.width = ((posRef.current / max) * 100) + "%";
    if (posRef.current >= max) { setPlaying(false); return; }
    animRef.current = requestAnimationFrame(anim);
  }, []);

  useEffect(() => {
    if (playing) {
      if (scrRef.current) posRef.current = scrRef.current.scrollTop;
      ltRef.current = null; csRef.current = tsRef.current;
      animRef.current = requestAnimationFrame(anim);
    } else { if (animRef.current) cancelAnimationFrame(animRef.current); }
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [playing, anim]);

  const onScroll = useCallback(() => {
    const el = scrRef.current; if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    if (max > 0) {
      if (!playingRef.current) posRef.current = el.scrollTop;
      if (progRef.current) progRef.current.style.width = ((el.scrollTop / max) * 100) + "%";
    }
    scrollTick.current++;
    if (scrollTick.current % 8 === 0) detectPage();
  }, [detectPage]);

  const goPage = useCallback((n) => {
    const keys = Object.keys(pgRefs.current).map(Number).sort((a, b) => a - b);
    const c = Math.max(0, Math.min(n - 1, keys.length - 1));
    const el = pgRefs.current[keys[c]];
    if (el && scrRef.current) {
      const top = el.offsetTop - 48;
      scrRef.current.scrollTop = top; posRef.current = top; updatePageDOM(c + 1);
    }
  }, [updatePageDOM]);

  // Keyboard
  useEffect(() => {
    const h = (e) => {
      // Ctrl+F / Cmd+F → open search
      if ((e.ctrlKey || e.metaKey) && e.code === "KeyF") {
        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => { const el = document.getElementById("scenorama-search"); if (el) el.focus(); }, 50);
        return;
      }
      if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") {
        // Enter in search field → next result
        if (e.code === "Enter" && searchOpen) {
          e.preventDefault();
          goSearchResult(e.shiftKey ? searchIdx - 1 : searchIdx + 1);
        }
        if (e.code === "Escape") { setSearchOpen(false); setSearchQ(""); }
        return;
      }
      if (e.code === "Space") { e.preventDefault(); setPlaying((p) => !p); }
      if (e.code === "ArrowUp") { e.preventDefault(); setSpd((s) => Math.min(s + 5, 200)); }
      if (e.code === "ArrowDown") { e.preventDefault(); setSpd((s) => Math.max(s - 5, 5)); }
      if (e.code === "ArrowRight") { e.preventDefault(); goPage(curPageRef.current + 1); }
      if (e.code === "ArrowLeft") { e.preventDefault(); goPage(curPageRef.current - 1); }
      if (e.code === "KeyT") startTransition(() => setMode((m) => m === "nuit" ? "jour" : "nuit"));
      if (e.code === "KeyF") setFocus((f) => !f);
      if (e.code === "Escape") { setPlaying(false); setFocus(false); setShowChars(false); setShowStats(false); setShowScenes(false); setSearchOpen(false); setSearchQ(""); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [goPage, goSearchResult, searchOpen, searchIdx]);

  useEffect(() => {
    const h = () => {
      setCtrlVis(true); clearTimeout(ctrlT.current);
      if (playingRef.current) ctrlT.current = setTimeout(() => setCtrlVis(false), 3000);
    };
    window.addEventListener("mousemove", h);
    return () => { window.removeEventListener("mousemove", h); clearTimeout(ctrlT.current); };
  }, []);

  // ── PDF ─────────────────────────────────────────────────────────
  const loadPdf = () => new Promise((res, rej) => {
    if (window.pdfjsLib) return res(window.pdfjsLib);
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"; res(window.pdfjsLib); };
    s.onerror = rej; document.head.appendChild(s);
  });

  const onFile = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    setFName(f.name); pgRefs.current = {};
    setCharFilter(null); setShowChars(false); setShowStats(false);
    // Annotations will be loaded from storage via useEffect if same file, otherwise reset
    const savedKey = `scenorama-notes-${f.name}`;
    try {
      const saved = localStorage.getItem(savedKey);
      setAnnotations(saved ? JSON.parse(saved) : {});
    } catch { setAnnotations({}); }

    if (/\.(txt|fountain|md)$/i.test(f.name)) {
      setRaw(await f.text()); setPBreaks([]);
    } else if (/\.pdf$/i.test(f.name)) {
      try {
        const buf = await f.arrayBuffer();
        const lib = await loadPdf();
        const pdf = await lib.getDocument({ data: buf }).promise;
        let full = "", lc = 0; const brk = [];
        for (let p = 1; p <= pdf.numPages; p++) {
          brk.push(lc);
          const pg = await pdf.getPage(p);
          const ct = await pg.getTextContent();
          const items = ct.items.filter((x) => x.str !== undefined);
          if (!items.length) { full += "\n"; lc++; continue; }
          const TOL = 3, lm = new Map();
          for (const it of items) {
            const y = Math.round(it.transform[5]), x = it.transform[4];
            let fk = null; for (const k of lm.keys()) { if (Math.abs(k - y) <= TOL) { fk = k; break; } }
            const key = fk ?? y; if (!lm.has(key)) lm.set(key, []); lm.get(key).push({ x, text: it.str });
          }
          const ent = [...lm.entries()].sort((a, b) => b[0] - a[0]);
          const srt = ent.map(([, its]) => { its.sort((a, b) => a.x - b.x); return its.map((x) => x.text).join(""); });
          const yv = ent.map(([y]) => y);
          const gaps = []; for (let j = 1; j < yv.length; j++) gaps.push(Math.abs(yv[j-1] - yv[j]));
          const med = gaps.length ? [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)] : 14;
          for (let j = 0; j < srt.length; j++) { full += srt[j] + "\n"; lc++; if (j < gaps.length && gaps[j] > med * 1.6) { full += "\n"; lc++; } }
          full += "\n"; lc++;
        }
        setRaw(full.replace(/\n{4,}/g, "\n\n\n")); setPBreaks(brk);
      } catch { setRaw("Erreur lecture PDF."); setPBreaks([]); }
    }
    if (scrRef.current) scrRef.current.scrollTop = 0;
    posRef.current = 0; if (progRef.current) progRef.current.style.width = "0%";
    curPageRef.current = 1; if (pageRef.current) pageRef.current.textContent = `p. 1 / ${totalPg}`;
    setPlaying(false);
    setElapsed(0);
    setCachedAnalysis(null);
  };

  // ── Drag-drop handler ──────────────────────────────────────────
  const onDrop = useCallback((e) => {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      const dt = new DataTransfer();
      dt.items.add(file);
      onFile({ target: { files: dt.files } });
    }
  }, []);

  const onAnnotate = useCallback((key, note) => {
    setAnnotations((a) => {
      const n = { ...a };
      if (note) n[key] = note; else delete n[key];
      return n;
    });
  }, []);

  // ── Export annotated screenplay as .txt ─────────────────────────
  const exportAnnotated = useCallback(() => {
    let output = "";
    const dateStr = new Date().toLocaleDateString("fr-FR");
    output += `── Scénorama — Export annoté ──\n`;
    output += `Fichier : ${fName || "Sans titre"}\n`;
    output += `Date : ${dateStr}\n`;
    output += `Notes : ${Object.keys(annotations).length}\n`;
    output += `${"─".repeat(50)}\n\n`;

    lines.forEach((l) => {
      if (l.t === "empty") {
        output += "\n";
      } else {
        // Indent dialogue
        const prefix = l.t === "dial" ? "    " : l.t === "paren" ? "    " : l.t === "char" ? "  " : "";
        output += prefix + l.text + "\n";
      }
      // Add annotation below the line
      if (annotations[l.k]) {
        output += `  ▸ NOTE : ${annotations[l.k]}\n`;
      }
    });

    // Also generate a summary of all notes at the end
    const noteEntries = Object.entries(annotations);
    if (noteEntries.length > 0) {
      output += `\n\n${"─".repeat(50)}\n`;
      output += `RÉCAPITULATIF DES NOTES (${noteEntries.length})\n`;
      output += `${"─".repeat(50)}\n\n`;
      noteEntries.forEach(([key, note]) => {
        const line = lines.find((l) => l.k === parseInt(key));
        const lineText = line ? line.text : "—";
        const truncated = lineText.length > 60 ? lineText.slice(0, 60) + "…" : lineText;
        output += `• "${truncated}"\n  → ${note}\n\n`;
      });
    }

    // Download
    const blob = new Blob([output], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(fName || "scenorama").replace(/\.[^.]+$/, "")}_annoté.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [lines, annotations, fName]);

  const jumpTo = (pct) => {
    if (!scrRef.current) return;
    const t = (pct / 100) * (scrRef.current.scrollHeight - scrRef.current.clientHeight);
    scrRef.current.scrollTop = t; posRef.current = t;
    if (progRef.current) progRef.current.style.width = pct + "%";
  };

  const spdL = spd <= 20 ? "Lent" : spd <= 50 ? "Normal" : spd <= 100 ? "Rapide" : "Turbo";
  const btnS = {
    background: "transparent", color: th.muted,
    border: `1px solid ${th.border}`, borderRadius: 6,
    width: 26, height: 26, fontSize: 12, cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
    transition: "all 0.2s ease", fontFamily: "inherit", padding: 0,
  };
  // Collect line element refs via DOM after render — no per-line callback props needed
  useEffect(() => {
    if (!scrRef.current) return;
    const els = scrRef.current.querySelectorAll("[data-lk]");
    const newLineRefs = {};
    const newPgRefs = {};
    els.forEach((el) => {
      const key = parseInt(el.getAttribute("data-lk"));
      newLineRefs[key] = el;
      if (pgIdxMap[key] !== undefined) newPgRefs[pgIdxMap[key]] = el;
    });
    lineElRefs.current = newLineRefs;
    pgRefs.current = newPgRefs;
  }, [lines, pgIdxMap]);

  // Convert searchResults to Set for O(1) lookup instead of O(n)
  const searchHitSet = useMemo(() => new Set(searchResults), [searchResults]);
  const annotCount = Object.keys(annotations).length;

  // CSS variables as inline style — changes are instant, no CSS reparsing
  const cssVars = {
    "--sc-bg": th.bg, "--sc-surface": th.surface, "--sc-surfaceAlt": th.surfaceAlt,
    "--sc-text": th.text, "--sc-soft": th.soft, "--sc-muted": th.muted,
    "--sc-accent": th.accent, "--sc-accent2": th.accent2,
    "--sc-char": th.char, "--sc-scene": th.scene, "--sc-trans": th.trans,
    "--sc-border": th.border, "--sc-barBg": th.barBg,
    "--sc-ctrl": th.ctrl, "--sc-hint": th.hint, "--sc-grad": th.grad,
    "--sc-pageNum": th.pageNum,
    "--sc-hl": th.hl, "--sc-hlB": th.hlB,
    "--sc-contrast": th.contrast, "--sc-noteAccent": th.noteAccent, "--sc-noteBg": th.noteBg,
    "--sc-statBar": th.statBar, "--sc-statBarBg": th.statBarBg,
    "--sc-searchBg": th.searchBg, "--sc-searchActive": th.searchActive,
    "--sc-inputBg": th.inputBg, "--sc-inputBorder": th.inputBorder,
  };

  return (
    <div
      onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
      style={{
        ...cssVars,
        width: "100%", height: "100vh",
        background: focus ? th.grad : th.bg, color: th.text,
        fontFamily: "'Courier Prime','Courier New',monospace",
        display: "flex", flexDirection: "column", overflow: "hidden",
        position: "relative",
      }}>

      {/* ── Drag overlay ── */}
      {dragging && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 100,
          background: `${th.bg}ee`,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexDirection: "column", gap: 12,
        }}>
          <div style={{
            width: 120, height: 120, borderRadius: "50%",
            border: `3px dashed ${th.accent}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 40, color: th.accent,
          }}>↓</div>
          <span style={{
            fontFamily: "'DM Sans',sans-serif", fontSize: 16,
            color: th.accent, fontWeight: 600, letterSpacing: "0.06em",
          }}>Déposez votre scénario ici</span>
          <span style={{
            fontFamily: "'DM Sans',sans-serif", fontSize: 12,
            color: th.muted,
          }}>.pdf, .txt, .fountain, .md</span>
        </div>
      )}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Courier+Prime:ital,wght@0,400;0,700;1,400&family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap');
        *::-webkit-scrollbar{width:6px;height:6px}
        *::-webkit-scrollbar-track{background:transparent}
        *::-webkit-scrollbar-thumb{background:${th.border};border-radius:3px}
        *::-webkit-scrollbar-thumb:hover{background:${th.muted}}
        *{scrollbar-width:thin;scrollbar-color:${th.border} transparent}
        ::selection{background:${th.accent};color:${th.contrast}}
        input::placeholder{color:${th.muted};opacity:0.7}
        @keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideIn{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:translateX(0)}}
      `}</style>

      {/* ═══ TOP BAR ═══ */}
      <div style={{
        borderBottom: `1px solid ${th.border}`, background: th.ctrl,
        opacity: ctrlVis ? 1 : 0, transition: "opacity 0.5s ease, background 0.5s",
        zIndex: 20, flexShrink: 0, fontFamily: "'DM Sans',sans-serif",
      }}>
        {/* Primary row: brand + file + pages */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 20px 6px", gap: 10, flexWrap: "wrap",
        }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
            <span style={{
              fontSize: 14, fontWeight: 700, letterSpacing: "0.22em",
              color: th.accent, textTransform: "uppercase",
              fontFamily: "'DM Sans',sans-serif",
            }}>Scénorama</span>
            {fName && <span style={{
              fontSize: 11, color: th.muted, maxWidth: 200,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              fontStyle: "italic",
            }}>{fName}</span>}
          </div>
          {totalPg > 1 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button onClick={() => goPage(curPageRef.current - 1)}
                style={{ ...btnS, width: 22, height: 22, fontSize: 9 }}>◂</button>
              <span ref={pageRef} style={{
                fontSize: 12, color: th.accent, fontWeight: 600,
                minWidth: 72, textAlign: "center", letterSpacing: "0.04em",
              }}>p. 1 / {totalPg}</span>
              <button onClick={() => goPage(curPageRef.current + 1)}
                style={{ ...btnS, width: 22, height: 22, fontSize: 9 }}>▸</button>
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
            <button onClick={() => startTransition(() => setMode((m) => m === "nuit" ? "jour" : "nuit"))} style={{
              background: "transparent", color: th.accent, border: "none",
              padding: "4px 10px", fontSize: 18, cursor: "pointer", transition: "all 0.2s",
              lineHeight: 1, borderRadius: 4,
            }}>{mode === "nuit" ? "☀" : "☾"}</button>
            <label style={{
              fontSize: 11, color: th.soft, cursor: "pointer", padding: "5px 14px",
              border: `1px solid ${th.border}`, borderRadius: 5,
              transition: "all 0.2s", fontWeight: 500,
            }}>
              Ouvrir<input type="file" accept=".pdf,.txt,.fountain,.md" onChange={onFile} style={{ display: "none" }} />
            </label>
          </div>
        </div>
        {/* Secondary row: tools — only when file loaded */}
        {raw && <div style={{
          display: "flex", alignItems: "center", padding: "0 20px 8px",
          gap: 6, flexWrap: "wrap",
        }}>
          {[
            ["Recherche", searchOpen, () => { setSearchOpen((s) => !s); if (!searchOpen) setTimeout(() => { const el = document.getElementById("scenorama-search"); if (el) el.focus(); }, 50); }],
            ["Scènes", showScenes, () => setShowScenes((s) => !s)],
            ["Fiche", showStats, () => setShowStats((s) => !s)],
            ...(chars.length > 0 ? [["Personnages", showChars || !!charFilter, () => setShowChars((s) => !s)]] : []),
            ["Focus", focus, () => setFocus((f) => !f)],
            ["Contrat", showContrat, () => setShowContrat((s) => !s)],
            ["Privé", privacyMode, () => setPrivacyMode((p) => !p)],
            ["Plein écran", false, toggleFullscreen],
          ].map(([label, active, onClick]) => (
            <button key={label} onClick={onClick} style={{
              background: active ? th.accent : "transparent",
              color: active ? th.contrast : th.muted,
              border: `1px solid ${active ? th.accent : th.border}`,
              borderRadius: 20, padding: "3px 14px", fontSize: 11,
              cursor: "pointer", transition: "all 0.25s ease",
              fontFamily: "inherit", fontWeight: 500, letterSpacing: "0.02em",
            }}>{label}</button>
          ))}
          {annotCount > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: 6 }}>
              <button onClick={() => goNote(-1)} title="Note précédente"
                style={{ ...btnS, width: 20, height: 20, fontSize: 9, borderRadius: 10 }}>▲</button>
              <span style={{
                fontSize: 10, color: th.noteAccent, fontWeight: 600,
                padding: "3px 10px", background: th.noteBg,
                borderRadius: 20,
              }}>{annotCount} note{annotCount > 1 ? "s" : ""}</span>
              <button onClick={() => goNote(1)} title="Note suivante"
                style={{ ...btnS, width: 20, height: 20, fontSize: 9, borderRadius: 10 }}>▼</button>
              <button onClick={exportAnnotated} style={{
                background: "transparent", color: th.noteAccent,
                border: `1px solid ${th.noteAccent}`, borderRadius: 20,
                padding: "3px 14px", fontSize: 11, cursor: "pointer",
                transition: "all 0.2s", fontFamily: "inherit", fontWeight: 500,
              }}>Exporter</button>
            </div>
          )}
        </div>}
      </div>

      {/* ═══ CHAR PANEL — floating compact ═══ */}
      {showChars && (
        <div style={{
          position: "absolute", top: 80, left: 20, zIndex: 25,
          padding: "8px 12px", background: th.surface,
          border: `1px solid ${th.border}`, borderRadius: 10,
          display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap",
          fontFamily: "'DM Sans',sans-serif", fontSize: 11,
          boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
          animation: "fadeIn 0.2s ease",
          maxWidth: "calc(100% - 40px)",
        }}>
          <button onClick={() => setCharFilter(null)} style={{
            background: !charFilter ? th.accent : "transparent", color: !charFilter ? th.contrast : th.soft,
            border: `1px solid ${!charFilter ? th.accent : th.border}`, borderRadius: 14, padding: "2px 10px", fontSize: 10, cursor: "pointer",
          }}>Tous</button>
          {chars.map((c) => (
            <button key={c} onClick={() => setCharFilter(charFilter === c ? null : c)} style={{
              background: charFilter === c ? th.accent : "transparent", color: charFilter === c ? th.contrast : th.soft,
              border: `1px solid ${charFilter === c ? th.accent : th.border}`, borderRadius: 14, padding: "2px 10px", fontSize: 10, cursor: "pointer",
            }}>{c}</button>
          ))}
          <button onClick={() => setShowChars(false)} style={{
            background: "transparent", border: "none", color: th.muted, fontSize: 14, cursor: "pointer", marginLeft: 4,
          }}>×</button>
        </div>
      )}

      {/* ═══ SEARCH BAR ═══ */}
      {searchOpen && (
        <div style={{
          padding: "8px 20px", background: th.surface, borderBottom: `1px solid ${th.border}`,
          display: "flex", alignItems: "center", gap: 10,
          fontFamily: "'DM Sans',sans-serif", fontSize: 12, zIndex: 15,
          animation: "fadeIn 0.2s ease",
        }}>
          <input
            id="scenorama-search"
            type="text"
            value={searchQ}
            onChange={(e) => { setSearchQ(e.target.value); setSearchIdx(0); }}
            placeholder="Rechercher…"
            style={{
              flex: 1, maxWidth: 300, padding: "7px 14px",
              background: th.inputBg, color: th.text,
              border: `1px solid ${th.inputBorder}`, borderRadius: 6,
              fontSize: 12, fontFamily: "inherit", outline: "none",
              transition: "border-color 0.2s",
            }}
            onFocus={(e) => e.target.style.borderColor = th.accent}
            onBlur={(e) => e.target.style.borderColor = th.inputBorder}
          />
          {searchResults.length > 0 && (
            <>
              <span style={{ color: th.muted, fontSize: 11, minWidth: 60 }}>
                {searchIdx + 1} / {searchResults.length}
              </span>
              <button onClick={() => goSearchResult(searchIdx - 1)}
                style={{ ...btnS, width: 22, height: 22, fontSize: 10 }}>▲</button>
              <button onClick={() => goSearchResult(searchIdx + 1)}
                style={{ ...btnS, width: 22, height: 22, fontSize: 10 }}>▼</button>
            </>
          )}
          {searchQ.length >= 2 && searchResults.length === 0 && (
            <span style={{ color: th.muted, fontSize: 11, fontStyle: "italic" }}>Aucun résultat</span>
          )}
          <button onClick={() => { setSearchOpen(false); setSearchQ(""); }}
            style={{ background: "transparent", border: "none", color: th.muted, fontSize: 16, cursor: "pointer" }}>×</button>
        </div>
      )}

      {/* ═══ PROGRESS ═══ */}
      <div style={{ height: 2, background: th.barBg, flexShrink: 0, cursor: "pointer" }}
        onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); jumpTo(((e.clientX - r.left) / r.width) * 100); }}>
        <div ref={progRef} style={{
          height: "100%", width: "0%",
          background: `linear-gradient(90deg, ${th.accent}, ${th.accent2})`,
          transition: playing ? "none" : "width 0.15s",
        }} />
      </div>

      {/* ═══ CONTENT AREA (flex row: optional scene panel + scroll + stats) ═══ */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* ── Scene Index Sidebar ── */}
        {showScenes && (
          <div style={{
            width: 280, flexShrink: 0,
            background: th.surface, borderRight: `1px solid ${th.border}`,
            overflowY: "auto", padding: "14px 0",
            fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: th.text,
            scrollbarWidth: "none",
          }}>
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "0 14px", marginBottom: 12,
            }}>
              <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: "0.08em", color: th.accent }}>
                SCÈNES ({scenes.length})
              </span>
              <button onClick={() => setShowScenes(false)} style={{
                background: "transparent", border: "none", color: th.muted, fontSize: 18, cursor: "pointer",
              }}>×</button>
            </div>
            {scenes.length === 0 && (
              <div style={{ padding: "0 14px", color: th.muted, fontStyle: "italic" }}>Aucune scène détectée</div>
            )}
            {scenes.map((sc) => (
              <button key={sc.key} onClick={() => goScene(sc.key)} style={{
                display: "flex", alignItems: "baseline", gap: 8, width: "100%",
                padding: "7px 14px", background: "transparent",
                border: "none", borderBottom: `1px solid ${th.border}`,
                cursor: "pointer", textAlign: "left",
                fontFamily: "'Courier Prime',monospace", fontSize: 11,
                color: th.soft, transition: "background 0.15s",
              }}
                onMouseEnter={(e) => e.currentTarget.style.background = th.surfaceAlt}
                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
              >
                <span style={{ color: th.accent, fontWeight: 700, minWidth: 22, fontSize: 10, fontFamily: "'DM Sans',sans-serif" }}>
                  {sc.num}
                </span>
                <span style={{ flex: 1, lineHeight: 1.4 }}>{sc.text}</span>
                {sc.page && (
                  <span style={{ color: th.muted, fontSize: 10, fontFamily: "'DM Sans',sans-serif", flexShrink: 0 }}>
                    p.{sc.page}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

      {/* ═══ CONTENT ═══ */}
      <div ref={scrRef} onScroll={onScroll} style={{
        flex: 1, overflowY: "auto",
        padding: focus ? "18vh 0" : "48px 0",
        scrollbarWidth: "none",
        transition: "padding 0.3s",
      }}>
        {/* Welcome screen when no file is loaded */}
        {!raw && (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            minHeight: "70vh", padding: "40px 32px", textAlign: "center",
            fontFamily: "'DM Sans',sans-serif",
            animation: "fadeIn 0.6s ease",
          }}>
            <style>{`
              @keyframes pulse { 0%,100%{box-shadow:0 0 0 0 ${th.accent}30} 50%{box-shadow:0 0 0 16px ${th.accent}00} }
              .sc-play-btn:hover { transform:scale(1.08); border-color:${th.accent} !important; background:${th.accent}10 !important; }
              .sc-play-btn:active { transform:scale(0.96); }
              .sc-drop-zone:hover { border-color:${th.accent} !important; background:${th.accent}08 !important; }
            `}</style>

            {/* Interactive play button — triggers file open */}
            <label className="sc-play-btn" style={{
              width: 90, height: 90, borderRadius: "50%",
              border: `2px solid ${th.border}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              marginBottom: 28, cursor: "pointer",
              transition: "all 0.3s ease",
              animation: "pulse 2.5s ease infinite",
            }}>
              <span style={{ fontSize: 34, color: th.accent, lineHeight: 1, marginLeft: 4 }}>▶</span>
              <input type="file" accept=".pdf,.txt,.fountain,.md" onChange={onFile} style={{ display: "none" }} />
            </label>

            <h1 style={{
              fontFamily: "'Cormorant Garamond',serif",
              fontSize: 32, fontWeight: 700, color: th.text,
              margin: "0 0 10px", letterSpacing: "0.02em",
            }}>Scénorama</h1>

            <p style={{
              fontSize: 15, color: th.muted, maxWidth: 420,
              lineHeight: 1.6, margin: "0 0 32px",
            }}>
              Lecteur de scénarios intelligent. Cliquez ou déposez un fichier.
            </p>

            {/* Drop zone */}
            <label className="sc-drop-zone" style={{
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              width: "100%", maxWidth: 400, padding: "32px 24px",
              border: `2px dashed ${th.border}`,
              borderRadius: 12, cursor: "pointer",
              transition: "all 0.3s ease",
              background: th.surfaceAlt,
            }}>
              <span style={{ fontSize: 14, color: th.accent, fontWeight: 600, marginBottom: 6 }}>
                Ouvrir un scénario
              </span>
              <span style={{ fontSize: 12, color: th.muted }}>
                ou glissez-déposez un fichier ici
              </span>
              <span style={{ fontSize: 11, color: th.hint, marginTop: 8 }}>
                PDF · TXT · Fountain · Markdown
              </span>
              <input type="file" accept=".pdf,.txt,.fountain,.md" onChange={onFile} style={{ display: "none" }} />
            </label>

            {/* Keyboard shortcut hint */}
            <div style={{ marginTop: 28, display: "flex", gap: 20, fontSize: 10, color: th.hint }}>
              <span>Espace : lecture</span>
              <span>↑↓ : vitesse</span>
              <span>Double-clic : annoter</span>
            </div>
          </div>
        )}

        {/* Screenplay content */}
        {raw && (
          <div style={{ maxWidth: 640, margin: "0 auto", padding: "0 32px", fontSize: fs, lineHeight: 1.78, letterSpacing: "0.005em", position: "relative" }}>
            {privacyMode && (
              <div onClick={() => setPrivacyMode(false)} style={{
                position: "absolute", inset: 0, zIndex: 10, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <div style={{
                  background: th.surface, border: `1px solid ${th.border}`, borderRadius: 10,
                  padding: "20px 28px", textAlign: "center", fontFamily: "'DM Sans',sans-serif",
                  boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
                }}>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>🔒</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: th.text }}>Mode privé activé</div>
                  <div style={{ fontSize: 11, color: th.muted, marginTop: 4 }}>Cliquez pour déverrouiller</div>
                </div>
              </div>
            )}
            <div style={{ filter: privacyMode ? "blur(12px)" : "none", transition: "filter 0.3s", userSelect: privacyMode ? "none" : "auto" }}>
            {focus && <div style={{ position: "fixed", top: 0, left: 0, right: showStats ? 320 : 0, height: "26%", background: `linear-gradient(to bottom, ${th.grad} 45%, transparent)`, pointerEvents: "none", zIndex: 5 }} />}
            {focus && <div style={{ position: "fixed", bottom: 0, left: 0, right: showStats ? 320 : 0, height: "26%", background: `linear-gradient(to top, ${th.grad} 45%, transparent)`, pointerEvents: "none", zIndex: 5 }} />}

            {lines.map((l) => (
              <Line key={l.k} l={l} fs={fs}
                charFilter={charFilter}
                pgIdx={l.pg ? (pgIdxMap[l.k] ?? -1) : -1}
                totalPg={totalPg}
                annotation={annotations[l.k] || null}
                onAnnotate={onAnnotate}
                searchQ={searchQ}
                isSearchHit={searchHitSet.has(l.k)}
                isActiveHit={searchResults.length > 0 && searchResults[searchIdx] === l.k}
                pgRefCb={(el) => {
                  if (el) lineElRefs.current[l.k] = el;
                  if (l.pg) { const idx = pgIdxMap[l.k]; if (idx !== undefined) pgRefs.current[idx] = el; }
                }}
              />
            ))}
            <div style={{ height: "50vh" }} />
            </div>{/* close blur wrapper */}
          </div>
        )}
      </div>

      {/* ═══ FICHE DE LECTURE ═══ */}
      {showStats && <FichePanel stats={stats} th={th} onClose={() => setShowStats(false)} fName={fName} rawText={raw} cachedAnalysis={cachedAnalysis} setCachedAnalysis={setCachedAnalysis} />}

      {/* ═══ CONTRAT ═══ */}
      {showContrat && <ContratPanel th={th} onClose={() => setShowContrat(false)} fName={fName} stats={stats} />}

      </div>{/* ← close flex row (scenes + content + stats) */}

      {/* ═══ BOTTOM BAR ═══ */}
      {raw && <div style={{
        borderTop: `1px solid ${th.border}`,
        background: focus ? th.grad : th.ctrl,
        opacity: ctrlVis ? 1 : 0, transition: "opacity 0.5s ease, background 0.5s",
        zIndex: 20, flexShrink: 0, fontFamily: "'DM Sans',sans-serif",
      }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 20,
          padding: "12px 20px", flexWrap: "wrap",
        }}>
          {/* Font size — compact */}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 12, color: th.muted, fontWeight: 300 }}>A</span>
            <button onClick={() => setFs((s) => Math.max(12, s - 1))} style={btnS}>−</button>
            <span style={{ fontSize: 11, color: th.soft, minWidth: 18, textAlign: "center", fontWeight: 500 }}>{fs}</span>
            <button onClick={() => setFs((s) => Math.min(30, s + 1))} style={btnS}>+</button>
          </div>

          <div style={{ width: 1, height: 16, background: th.border, opacity: 0.6 }} />

          {/* Speed */}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button onClick={() => setSpd((s) => Math.max(5, s - 8))} style={btnS}>◂</button>
            <span style={{ fontSize: 11, color: th.accent, minWidth: 50, textAlign: "center", fontWeight: 600, letterSpacing: "0.02em" }}>{spd} px/s</span>
            <button onClick={() => setSpd((s) => Math.min(200, s + 8))} style={btnS}>▸</button>
          </div>

          <div style={{ width: 1, height: 16, background: th.border, opacity: 0.6 }} />

          {/* Play — the hero button */}
          <button onClick={() => setPlaying((p) => !p)} style={{
            background: playing ? th.accent : "transparent",
            color: playing ? th.contrast : th.accent,
            border: `2px solid ${th.accent}`, borderRadius: 24,
            padding: "7px 28px", fontSize: 12, fontWeight: 700,
            cursor: "pointer", letterSpacing: "0.14em", transition: "all 0.3s ease",
            fontFamily: "inherit",
            boxShadow: playing ? `0 0 20px ${th.accent}30` : "none",
          }}>{playing ? "❚❚  PAUSE" : "▶  LECTURE"}</button>

          <div style={{ width: 1, height: 16, background: th.border, opacity: 0.6 }} />

          {/* Timer */}
          <span style={{
            fontSize: 13, color: playing ? th.accent : th.muted,
            fontFamily: "'Courier Prime',monospace", fontWeight: 600,
            minWidth: 44, textAlign: "center", letterSpacing: "0.05em",
            transition: "color 0.3s",
          }}>{timerStr}</span>

          <div style={{ width: 1, height: 16, background: th.border, opacity: 0.6 }} />

          {/* Reset */}
          <button onClick={() => {
            if (scrRef.current) scrRef.current.scrollTop = 0;
            posRef.current = 0; if (progRef.current) progRef.current.style.width = "0%";
            curPageRef.current = 1; if (pageRef.current) pageRef.current.textContent = `p. 1 / ${totalPg}`;
            setPlaying(false); setElapsed(0);
          }} style={{ ...btnS, fontSize: 14, width: 30, height: 30 }} title="Retour au début">⏮</button>
        </div>

        {/* Hints — very subtle */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 18,
          padding: "0 20px 7px", fontSize: 9, color: th.hint, letterSpacing: "0.03em",
        }}>
          {["Espace : play", "↑↓ vitesse", "←→ pages", "T thème", "F focus", "Double-clic : annoter"].map((h, i) => (
            <span key={i} style={{ opacity: 0.7 }}>{h}</span>
          ))}
        </div>
      </div>}
    </div>
  );
}
