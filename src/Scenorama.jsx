import { useState, useRef, useEffect, useCallback, useMemo, memo, useTransition } from "react";
import { MARKET_DATA } from "./marketData.js";
import talentsTimeArt from "./talentsTimeArt.js";
import talentsUBBA from "./talentsUBBA.js";
import talentsArtmedia from "./talentsArtmedia.js";
import talentsCineArt from "./talentsCineArt.js";

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
    const sceneRx = /^(\d+\s*[\.\-\)]?\s*)?(INT\s*[\.\-\/\s]|EXT\s*[\.\-\/\s]|INTÉRIEUR|EXTÉRIEUR|INT\s*\/\s*EXT)/i;
    if (sceneRx.test(tr) && tr === tr.toUpperCase())
      return { t: "scene", text: tr, k: i, pg };
    if (/^\d+\s*(INT|EXT)/i.test(tr) && tr === tr.toUpperCase())
      return { t: "scene", text: tr, k: i, pg };
    if (/^(FONDU|CUT TO|FADE|SMASH CUT|NOIR|OUVERTURE|FERMETURE|ELLIPSE)/i.test(tr) && tr === tr.toUpperCase())
      return { t: "trans", text: tr, k: i, pg };
    if (/^\(.*\)$/.test(tr)) return { t: "paren", text: tr, k: i, pg };
    const isChar = /^[A-ZÉÈÊËÀÂÄÙÛÜÔÖÎÏÇŒÆ\s\-'\.]+(\s*\(.*\))?$/.test(tr);
    const charBlacklist = /^(\.\.\.|\.+|SUITE|FIN|CONT'?D?|CONTINUED|GÉNÉRIQUE|TITRE|INTERTITRE|NOIR|FONDU|CUT|TRANSITION|V\.?\s*O\.?|NOTE|CARTON|INSERT|FLASH|TEXTE|ÉCRAN|SOUS[- ]?TITRE|SUPER|SILENCE|MUSIQUE|BRUIT|SON)$/;
    // Lines starting with INT/EXT are scene headings, never characters
    if (/^(INT|EXT)\b/i.test(tr)) return { t: "scene", text: tr, k: i, pg };
    if (isChar && tr.length >= 2 && tr.length < 45 && tr === tr.toUpperCase() && !/^\d/.test(tr)) {
      const cleaned = tr.replace(/\(.*\)/, "").trim();
      if (charBlacklist.test(cleaned)) return { t: "action", text: tr, k: i, pg };
      const w = cleaned.split(/\s+/);
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
    .filter(([name, words]) => words >= 15 && name.length >= 2 && !/^\.+$/.test(name))
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
  // Pattern 1: "scénario de X", "écrit par X", "un film de X" — match per line to avoid bleed
  for (const singleLine of firstLinesArr) {
    const authorMatch = singleLine.match(/(?:scénario\s+(?:de|original\s+de)|écrit\s+par|un\s+film\s+de|adaptation\s+de|scénario\s*:\s*)\s*(.+)/i);
    if (authorMatch && !junkPattern.test(authorMatch[1]) && authorMatch[1].trim().length < 80) {
      author = authorMatch[1].trim().replace(/\s+/g, " ");
      break;
    }
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

    // Anthropic rate limit on $5 tier: 30K input tokens/min ≈ 100K chars
    // Market context ≈ 5K tokens, prompt template ≈ 3K tokens → ~22K tokens left for screenplay
    // 22K tokens ≈ 88K chars. We cap at 85K to be safe.
    const MAX_SCRIPT_CHARS = 50000;
    const isTruncated = rawText.length > MAX_SCRIPT_CHARS;
    const fullText = isTruncated ? rawText.slice(0, MAX_SCRIPT_CHARS) + "\n\n[... TEXTE TRONQUÉ — le scénario fait " + rawText.length + " caractères, seuls les " + MAX_SCRIPT_CHARS + " premiers sont analysés pour respecter les limites API. L'analyse porte sur environ " + Math.round(MAX_SCRIPT_CHARS / rawText.length * 100) + "% du scénario.]" : rawText;

    // Build market context from embedded data
    const fmtFilm = (f) => `${f.titre} — ${(f.entrees/1000000).toFixed(1)}M — ${f.genre}`;
    const topFilms2026 = MARKET_DATA.boxOffice2026.slice(0, 8).map(fmtFilm).join("\n");
    const topFilms2025 = MARKET_DATA.boxOffice2025.slice(0, 8).map(fmtFilm).join("\n");
    const topFilms2024 = MARKET_DATA.boxOffice2024.slice(0, 10).map(fmtFilm).join("\n");
    const topFilms2023 = MARKET_DATA.boxOffice2023.slice(0, 6).map(fmtFilm).join("\n");
    const topHistorique = MARKET_DATA.topHistorique.slice(0, 10).map(f => `${f.titre} (${f.date}) — ${(f.entrees/1000000).toFixed(1)}M — ${f.genre}`).join("\n");
    const tendances = MARKET_DATA.tendances.join("\n");
    const cannes24 = `Palme d'Or : ${MARKET_DATA.cannes2024.palmeOr.titre} (${MARKET_DATA.cannes2024.palmeOr.realisateur}), Grand Prix : ${MARKET_DATA.cannes2024.grandPrix.titre}, Prix du Jury : ${MARKET_DATA.cannes2024.prixJury.titre}`;
    const cesar25 = `Meilleur film : ${MARKET_DATA.cesar2025.meilleurFilm}, Meilleur premier film : ${MARKET_DATA.cesar2025.meilleurPremierFilm}`;

    const prompt = `Tu es un lecteur professionnel de scénarios pour le cinéma et la télévision française. Tu travailles pour un comité de lecture d'un producteur établi. Ton analyse doit être au niveau d'une vraie note de lecture professionnelle — précise, honnête, utile pour la prise de décision.

CONTEXTE MARCHÉ (données réelles, utilise-les pour les comparables) :
Box-office France 2026 : ${topFilms2026}
Box-office France 2025 : ${topFilms2025}
Box-office France 2024 : ${topFilms2024}
Box-office France 2023 : ${topFilms2023}
Top historique France : ${topHistorique}
Cannes 2024 : ${cannes24}
César 2025 : ${cesar25}
Tendances : ${tendances}
Fréquentation 2024 : ${MARKET_DATA.frequentation[2024].total/1000000}M entrées, part films français ${MARKET_DATA.frequentation[2024].partFR}%.

RÈGLES :
- Réponds UNIQUEMENT en JSON valide. Pas de markdown, pas de backticks, pas de texte avant ou après le JSON.
- Le genre doit être précis et cohérent avec le contenu réel.
- Pour les auteurs, identifie les vrais noms d'auteurs sur la page de garde. IGNORE sociétés de production, SIRET/TVA, adresses.
- Les comparables doivent être des films/séries RÉELS avec leurs données box-office quand disponibles.
- L'avis doit être celui d'un vrai lecteur professionnel : honnête, précis, pas complaisant, pas flatteur.
- JAMAIS de mention "données non disponibles", "non disponible dans le référentiel", ou équivalent. Si tu ne sais pas, n'en parle pas. N'affiche jamais tes limites.

JSON attendu :
{
  "auteurs": "Nom(s) du ou des scénaristes (null si non identifiable)",
  "genre": "Genre(s) précis (ex: Comédie noire, Thriller domestique)",
  "ton": "Ton en 2-3 mots (ex: Acide et désenchanté)",
  "public": "Public cible précis (ex: Grand public adulte 25-50 ans)",
  "synopsis": "Synopsis en 4-5 phrases : situation initiale, élément déclencheur, enjeux, tension principale. Pas de spoiler de fin.",
  "resume": "Résumé factuel complet en 4-6 phrases couvrant l'ensemble du récit.",
  "avis": "Avis critique DÉTAILLÉ en 8-10 phrases. Qualité de l'écriture, force des dialogues, construction dramaturgique (structure en actes, points de bascule, climax), rythme narratif, originalité, profondeur des personnages, arcs narratifs. Points forts ET points faibles sans complaisance. C'est la section la plus importante — elle doit être substantielle et argumentée.",
  "comparables_marche": [
    {"titre": "Titre du film (année)", "entrees": "X.XM entrées France", "rapport": "En 2-3 phrases : POURQUOI ce film est comparable (genre, ton, structure, public), ce que ça nous apprend sur le potentiel commercial de ce scénario, et les différences clés. Utile pour un dossier de financement CNC/SOFICA."}
  ],
  "vigilance_production": [
    {"point": "Description concrète (ex: 22 scènes de nuit, 3 scènes avec animaux)", "impact": "Impact réel sur budget/planning (ex: surcoût équipe nuit ~15-20%, dresseur animalier)"}
  ],
  "developpement": "Recommandations de développement CONCRÈTES en 6-8 phrases. Structurées comme des notes de script doctor : quels personnages renforcer, quels arcs manquent de résolution, où le rythme faiblit, quelles scènes couper ou réécrire, si l'acte 2 est trop long, si le climax arrive trop tôt/tard, etc. Sois précis (cite des numéros de scène ou pages si possible).",
  "casting_profils": [
    {"personnage": "Nom du personnage", "profil": "Description du profil recherché (âge, registre, type de jeu)", "suggestions": [{"nom": "Prénom Nom", "agence": "Nom agence si connue", "raison": "Pourquoi ce comédien colle au rôle (1 phrase courte)"}]}
  ]
}

POUR LES COMPARABLES MARCHÉ :
- Cite 3-4 films RÉELS, de préférence français, sortis dans les 5-10 dernières années.
- Inclus TOUJOURS les entrées France quand tu les connais (utilise les données fournies).
- Explique le rapport avec le scénario analysé de façon utile pour un producteur qui monte un dossier de financement.
- Si le scénario ressemble à un film qui a échoué commercialement, dis-le aussi — c'est une info utile.

POUR LA VIGILANCE PRODUCTION :
- Liste 4-6 points FACTUELS tirés de ta lecture du scénario.
- Chaque point doit être un CONSTAT tiré directement du texte (ex: "22 scènes de nuit", "3 scènes avec animaux", "12 décors différents").
- Le champ "impact" doit rester factuel : décris ce que ça implique concrètement, SANS inventer de pourcentages, estimations chiffrées ou projections budgétaires. Tu n'es pas chef de poste. Ne pense pas pour le producteur.
- Exemples : nombre de décors, scènes de nuit, figurants, animaux, véhicules spéciaux, effets spéciaux, scènes d'action, enfants acteurs, lieux publics nécessitant autorisations, reconstitution historique, etc.

POUR LES PROFILS CASTING :
- Liste les 3-5 personnages principaux uniquement.
- Le profil doit être utile pour un directeur de casting : âge, registre (dramatique, comique, les deux), type physique si pertinent.
- IMPORTANT : Privilégie des suggestions parmi les comédiens et comédiennes des agences partenaires ci-dessous (Time Art, UBBA, Artmedia, CinéArt). Précise l'agence entre parenthèses. Si aucun talent ne correspond, tu peux suggérer d'autres comédiens français.
- Pour chaque personnage, propose 2-3 noms avec une courte justification du matching.

TALENTS AGENCES PARTENAIRES :
Time Art : ${talentsTimeArt.comediens.slice(0, 25).join(", ")}, ${talentsTimeArt.comediennes.slice(0, 25).join(", ")}
UBBA : ${talentsUBBA.comediens.slice(0, 25).join(", ")}, ${talentsUBBA.comediennes.slice(0, 25).join(", ")}
Artmedia : ${talentsArtmedia.comediens.join(", ")}, ${talentsArtmedia.comediennes.join(", ")}
CinéArt : ${talentsCineArt.comediens.slice(0, 25).join(", ")}, ${talentsCineArt.comediennes.slice(0, 25).join(", ")}

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
          comparables_marche: Array.isArray(parsed.comparables_marche) ? parsed.comparables_marche.filter((c) =>
            c && typeof c.titre === "string"
          ).map((c) => ({
            titre: c.titre,
            entrees: typeof c.entrees === "string" ? c.entrees : "",
            rapport: typeof c.rapport === "string" ? c.rapport : "",
          })) : [],
          vigilance_production: Array.isArray(parsed.vigilance_production) ? parsed.vigilance_production.filter((v) =>
            v && typeof v.point === "string"
          ).map((v) => ({
            point: v.point,
            impact: typeof v.impact === "string" ? v.impact : "",
          })) : [],
          developpement: typeof parsed.developpement === "string" ? parsed.developpement : null,
          casting_profils: Array.isArray(parsed.casting_profils) ? parsed.casting_profils.filter((c) =>
            c && typeof c.personnage === "string"
          ).map((c) => ({
            personnage: c.personnage,
            profil: typeof c.profil === "string" ? c.profil : "",
            suggestions: Array.isArray(c.suggestions) ? c.suggestions.filter((s) => s && s.nom).map((s) => ({
              nom: s.nom,
              agence: s.agence || "",
              raison: s.raison || "",
            })) : [],
          })) : [],
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

  // Auto-run on first open — but NOT if cache already loaded
  useEffect(() => {
    if (!hasRun.current && !analysis && !cachedAnalysis && rawText && rawText.length >= 200) {
      hasRun.current = true;
      runAnalysis();
    }
  }, [rawText, runAnalysis, analysis, cachedAnalysis]);

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

          {/* Comparables marché */}
          {analysis.comparables_marche && analysis.comparables_marche.length > 0 && (
            <>
              {section("Comparables marché")}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {analysis.comparables_marche.map((c, i) => (
                  <div key={i} style={{
                    padding: "10px 12px", background: th.surfaceAlt,
                    borderRadius: 6, border: `1px solid ${th.border}`,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: th.text }}>{c.titre || "—"}</span>
                      {c.entrees && <span style={{ fontSize: 10, fontWeight: 600, color: th.accent }}>{c.entrees}</span>}
                    </div>
                    {c.rapport && <div style={{ fontSize: 11, color: th.soft, lineHeight: 1.5 }}>{c.rapport}</div>}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Vigilance production */}
          {analysis.vigilance_production && analysis.vigilance_production.length > 0 && (
            <>
              {section("Vigilance production")}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {analysis.vigilance_production.map((v, i) => (
                  <div key={i} style={{
                    padding: "9px 12px", background: th.surfaceAlt,
                    borderRadius: 6, border: `1px solid ${th.border}`,
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: th.text, marginBottom: 3 }}>{v.point}</div>
                    <div style={{ fontSize: 11, color: th.accent, fontStyle: "italic" }}>{v.impact}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Recommandations de développement */}
          {analysis.developpement && (
            <>
              {section("Notes de développement")}
              <div style={{ fontSize: 12, color: th.soft, lineHeight: 1.7, borderLeft: `2px solid ${th.accent}`, paddingLeft: 12 }}>{analysis.developpement}</div>
            </>
          )}

          {/* Profils casting */}
          {analysis.casting_profils && analysis.casting_profils.length > 0 && (
            <>
              {section("Profils casting")}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {analysis.casting_profils.map((c, i) => (
                  <div key={i} style={{
                    padding: "12px 14px", background: th.surfaceAlt,
                    borderRadius: 8, border: `1px solid ${th.border}`,
                  }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: th.text, display: "block", marginBottom: 6 }}>{c.personnage}</span>
                    <div style={{ fontSize: 11, color: th.soft, lineHeight: 1.5, marginBottom: 8 }}>{c.profil}</div>
                    {c.suggestions && c.suggestions.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {c.suggestions.map((s, j) => (
                          <div key={j} style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                            <a href={`https://www.allocine.fr/rechercher/?q=${encodeURIComponent(s.nom)}`}
                              target="_blank" rel="noopener noreferrer"
                              style={{
                                display: "inline-block", padding: "3px 10px",
                                background: th.accent + "15", border: `1px solid ${th.accent}40`,
                                borderRadius: 16, fontSize: 13, fontWeight: 700,
                                color: th.accent, textDecoration: "none", transition: "0.2s",
                                cursor: "pointer", whiteSpace: "nowrap",
                              }}
                              onMouseEnter={(e) => { e.target.style.background = th.accent + "30"; }}
                              onMouseLeave={(e) => { e.target.style.background = th.accent + "15"; }}
                            >
                              {s.nom}{s.agence ? ` · ${s.agence}` : ""}
                            </a>
                            <span style={{ fontSize: 11, color: th.soft }}>{s.raison}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Fallback pour ancien format */}
                    {c.reference && !c.suggestions && (
                      <div style={{ fontSize: 12, color: th.accent, marginTop: 4, fontWeight: 600 }}>{c.reference}</div>
                    )}
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
            <span style={{ color: th.muted, fontSize: 10 }}>{c.lines} répl. · {c.pct}%</span>
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
            {stats.charRanking.length > 20 && <div>⚠ {stats.charRanking.length} rôles parlants — distribution importante</div>}
            {stats.estMinutes > 130 && <div>⚠ Durée longue (~{stats.estMinutes} min)</div>}
          </div>
        </>
      )}

      {/* Relaunch button */}
      {analysis && !loading && (
        <div style={{ marginTop: 16 }}>
          <button onClick={() => { setError(null); setAnalysis(null); setCachedAnalysis(null); hasRun.current = false; runAnalysis(); }}
            style={{ width: "100%", padding: "8px 14px", background: "transparent", border: `1px solid ${th.border}`, borderRadius: 6, color: th.soft, fontSize: 11, cursor: "pointer", transition: "0.2s" }}>
            Relancer l'analyse
          </button>
        </div>
      )}

      {/* Export buttons */}
      {analysis && (
        <div style={{ marginTop: 12, paddingTop: 16, borderTop: `1px solid ${th.border}`, display: "flex", flexDirection: "column", gap: 8 }}>
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
            if (stats.charRanking.length > 20) alerts.push(`${stats.charRanking.length} rôles parlants — distribution importante`);
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

${analysis.comparables_marche && analysis.comparables_marche.length > 0 ? `<div class="section"><div class="section-title">Comparables Marché</div>${analysis.comparables_marche.map(c => `<div class="platform"><div class="platform-header"><span class="platform-name">${escH(c.titre)}</span><span style="font-size:13px;font-weight:600;color:#8b6f47">${escH(c.entrees||"")}</span></div><div class="platform-detail">${escH(c.rapport)}</div></div>`).join("")}</div>` : ""}

${analysis.vigilance_production && analysis.vigilance_production.length > 0 ? `<div class="section"><div class="section-title">Vigilance Production</div>${analysis.vigilance_production.map(v => `<div class="opportunity"><div class="opportunity-name">${escH(v.point)}</div><div class="opportunity-detail" style="font-style:italic;color:#8b6f47">${escH(v.impact)}</div></div>`).join("")}</div>` : ""}

${analysis.developpement ? `<div class="section"><div class="section-title">Notes de Développement</div>${nl2p(analysis.developpement)}</div>` : ""}

${analysis.casting_profils && analysis.casting_profils.length > 0 ? `<div class="section"><div class="section-title">Profils Casting</div>${analysis.casting_profils.map(c => `<div class="opportunity"><div class="opportunity-name">${escH(c.personnage)}</div><div class="opportunity-detail">${escH(c.profil)}</div>${c.suggestions && c.suggestions.length > 0 ? `<div style="margin-top:8px">${c.suggestions.map(s => `<div style="margin-bottom:6px"><a href="https://www.allocine.fr/rechercher/?q=${encodeURIComponent(s.nom)}" target="_blank" style="font-weight:700;font-size:14px;color:#a07030;text-decoration:none">${escH(s.nom)}</a>${s.agence ? ` <span style="font-size:12px;color:#999">· ${escH(s.agence)}</span>` : ""}<br/><span style="font-size:12px;color:#666">${escH(s.raison || "")}</span></div>`).join("")}</div>` : ""}${c.reference && !c.suggestions ? `<div class="opportunity-detail" style="font-style:italic;margin-top:4px">${escH(c.reference)}</div>` : ""}</div>`).join("")}</div>` : ""}

${stats.charRanking.length > 0 ? `<div class="section"><div class="section-title">Temps de Parole</div>${stats.charRanking.slice(0,12).map(c => `<div class="char-row"><span class="char-name">${escH(c.name)}</span><div class="char-bar-bg"><div class="char-bar-fill" style="width:${c.pct}%"></div></div><span class="char-pct">${c.pct}% · ${c.lines} répl.</span></div>`).join("")}</div>` : ""}

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
${analysis.comparables_marche && analysis.comparables_marche.length > 0 ? `<h3>Comparables</h3>${analysis.comparables_marche.map(c => `<div class="plat"><span class="plat-name">${escH(c.titre)}</span><span class="plat-score">${escH(c.entrees||"")}</span></div>`).join("")}` : ""}

${analysis.developpement ? `<h3>Développement</h3><p>${escH(analysis.developpement).substring(0,300)}${analysis.developpement.length > 300 ? "..." : ""}</p>` : ""}

${analysis.vigilance_production && analysis.vigilance_production.length > 0 ? `<h3>Vigilance Production</h3>${analysis.vigilance_production.slice(0,4).map(v => `<p style="margin-bottom:4px"><strong>${escH(v.point)}</strong></p>`).join("")}` : ""}

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
    const date = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
    const escH = (s) => (s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    const titre = escH(form.titre || "Projet");

    const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Contrat \u2014 ${titre}</title>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
@page{size:A4;margin:25mm 30mm}
body{font-family:'Inter',sans-serif;font-size:11pt;line-height:1.7;color:#1a1a1a;max-width:800px;margin:0 auto;padding:40px 50px}
h1{font-family:'Playfair Display',serif;font-size:22pt;text-align:center;margin-bottom:4px;letter-spacing:1px;text-transform:uppercase}
h2{font-family:'Playfair Display',serif;font-size:11pt;text-align:center;margin-bottom:24px;font-weight:400;letter-spacing:0.5px;color:#555}
.meta{text-align:center;margin-bottom:32px;padding-bottom:20px;border-bottom:2px solid #1a1a1a}
.meta span{display:block;font-size:10pt;color:#555;margin:2px 0}
.meta .projet{font-size:14pt;font-weight:600;margin:8px 0}
.parties{background:#f9f7f4;padding:20px 24px;border-radius:6px;margin-bottom:28px}
.parties h3{font-family:'Playfair Display',serif;font-size:10pt;text-transform:uppercase;letter-spacing:1.5px;color:#8b7355;margin-bottom:10px}
.parties p{margin-bottom:8px;font-size:10.5pt}
.expose{font-style:italic;padding:16px 24px;border-left:3px solid #8b7355;margin:24px 0;background:#fdfcfa}
.titre-section{font-family:'Playfair Display',serif;font-size:13pt;text-transform:uppercase;letter-spacing:2px;text-align:center;padding:12px 0;margin:28px 0 20px;border-top:1px solid #ccc;border-bottom:1px solid #ccc;color:#1a1a1a}
.article{margin-bottom:20px}
.article h4{font-family:'Inter',sans-serif;font-weight:600;font-size:10.5pt;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:8px;color:#333}
.article p,.article ul{font-size:10.5pt;margin-bottom:6px}
.article ul{padding-left:24px}
.article li{margin-bottom:4px}
.montant{font-weight:600;font-size:11pt;color:#1a1a1a}
.signatures{margin-top:48px;display:flex;justify-content:space-between;gap:40px;page-break-inside:avoid}
.sig-block{flex:1;text-align:center;padding-top:60px;border-top:1px solid #999}
.sig-block .label{font-size:9pt;text-transform:uppercase;letter-spacing:1px;color:#666}
.footer{margin-top:40px;padding-top:16px;border-top:1px solid #ddd;text-align:center;font-size:8pt;color:#999}
.footer em{display:block;margin-top:4px}
@media print{body{padding:0;max-width:none}.parties{background:#f9f7f4 !important;-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body>

<h1>Contrat de commande</h1>
<h2>et de cession de droits d\u2019auteur \u2014 sc\u00e9nariste, adaptateur et dialoguiste</h2>

<div class="meta">
<div class="projet">\u00ab\u00a0${titre}\u00a0\u00bb</div>
<span>${escH({ long:"Long m\u00e9trage", court:"Court m\u00e9trage", serie:"S\u00e9rie", doc:"Documentaire" }[form.type] || "\u0152uvre audiovisuelle")}</span>
<span>${date}</span>
</div>

<div class="parties">
<h3>Entre les soussign\u00e9s</h3>
<p>La soci\u00e9t\u00e9 <strong>${escH(form.producteur || "[NOM DE LA SOCI\u00c9T\u00c9]")}</strong>${form.siretProd ? `, SIRET ${escH(form.siretProd)}` : ""}${form.adresseProd ? `, dont le si\u00e8ge social est situ\u00e9 au ${escH(form.adresseProd)}` : ""}${form.gerantProd ? `, repr\u00e9sent\u00e9e par ${escH(form.gerantProd)}` : ""},<br>ci-apr\u00e8s d\u00e9nomm\u00e9e <strong>le Producteur</strong>.</p>
<p style="text-align:center;margin:12px 0;font-size:10pt;color:#888">d\u2019une part,</p>
<p style="text-align:center;margin:8px 0;font-weight:600;font-size:10pt">ET</p>
<p><strong>${escH(form.auteur || "[NOM DE L'AUTEUR]")}</strong>${form.agentAuteur ? `, domicili\u00e9(e) chez son agent ${escH(form.agentAuteur)}` : ""},<br>ci-apr\u00e8s d\u00e9nomm\u00e9(e) <strong>l\u2019Auteur</strong>.</p>
${form.coAuteur ? `<p>En collaboration avec <strong>${escH(form.coAuteur)}</strong>, ci-apr\u00e8s le Co-Auteur.</p>` : ""}
${form.agentAuteur ? `<p>La soci\u00e9t\u00e9 <strong>${escH(form.agentAuteur)}</strong>, ci-apr\u00e8s d\u00e9nomm\u00e9e <strong>l\u2019Agent</strong>.</p>` : ""}
<p style="text-align:center;margin-top:8px;font-size:10pt;color:#888">d\u2019autre part.</p>
</div>

<div class="expose">
<p>Le Producteur envisage la production d\u2019un ${escH({ long:"long m\u00e9trage", court:"court m\u00e9trage", serie:"s\u00e9rie", doc:"documentaire" }[form.type] || "\u0153uvre audiovisuelle")} intitul\u00e9 provisoirement \u00ab\u00a0${titre}\u00a0\u00bb.</p>
${form.adaptation ? `<p>Le sc\u00e9nario sera une adaptation de l\u2019\u0153uvre suivante : ${escH(form.oeuvreOrigine || "[A PR\u00c9CISER]")}.</p>` : `<p>Il s\u2019agit d\u2019un sc\u00e9nario original.</p>`}
<p>Le pr\u00e9sent accord a pour objet de d\u00e9finir les modalit\u00e9s de collaboration et les conditions de cession des droits y aff\u00e9rents.</p>
</div>

<div class="titre-section">Titre I \u2014 Convention d\u2019\u00e9criture</div>

<div class="article"><h4>Article 1 \u2014 \u00c9tapes d\u2019\u00e9criture</h4>
<p>Le Producteur commande \u00e0 l\u2019Auteur l\u2019\u00e9criture du Sc\u00e9nario selon les \u00e9tapes suivantes :</p>
<ul>
<li>Remise d\u2019un traitement</li>
<li>Remise de la premi\u00e8re version du sc\u00e9nario dialogu\u00e9 \u2014 le Producteur fera part de ses remarques sous 15 jours ouvr\u00e9s</li>
${parseInt(form.etapes) >= 2 ? `<li>Remise de la deuxi\u00e8me version du sc\u00e9nario dialogu\u00e9 \u2014 le Producteur fera part de ses remarques sous 15 jours ouvr\u00e9s</li>` : ""}
${parseInt(form.etapes) >= 3 ? `<li>Remise de la troisi\u00e8me et derni\u00e8re version du sc\u00e9nario dialogu\u00e9 (ci-apr\u00e8s le Sc\u00e9nario D\u00e9finitif)</li>` : ""}
</ul></div>

<div class="article"><h4>Article 2 \u2014 R\u00e9mun\u00e9ration</h4>
<p>En r\u00e9mun\u00e9ration du travail et de la cession des droits, le Producteur versera :</p>
<p class="montant">${(parseFloat(form.montant) || 0) + (parseFloat(form.montantAgent) || 0) > 0 ? ((parseFloat(form.montant) || 0) + (parseFloat(form.montantAgent) || 0)).toLocaleString("fr-FR") + " \u20ac HT" : "[MONTANT] \u20ac HT"}</p>
<ul>
<li>${parseFloat(form.montant) > 0 ? parseFloat(form.montant).toLocaleString("fr-FR") + " \u20ac" : "[MONTANT]"} pour l\u2019Auteur</li>
${form.agentAuteur || parseFloat(form.montantAgent) > 0 ? `<li>${parseFloat(form.montantAgent) > 0 ? parseFloat(form.montantAgent).toLocaleString("fr-FR") + " \u20ac" : "[MONTANT]"} + TVA pour l\u2019Agent</li>` : ""}
</ul></div>

<div class="article"><h4>Article 3 \u2014 D\u00e9cision du Producteur</h4>
<p>\u00c0 chaque \u00e9tape, le Producteur pourra :</p>
<ul>
<li>Poursuivre le projet avec la collaboration de l\u2019Auteur</li>
<li>Renoncer \u00e0 la collaboration \u2014 l\u2019Auteur conservera les sommes vers\u00e9es \u00e0 titre de d\u00e9dit forfaitaire</li>
</ul></div>

<div class="titre-section">Titre II \u2014 Cession de droits</div>

<div class="article"><h4>Article 4 \u2014 Objet de la cession</h4>
<p>L\u2019Auteur c\u00e8de au Producteur, \u00e0 titre exclusif, pour le monde entier, les droits d\u2019exploitation du Film, comprenant les droits de reproduction, de repr\u00e9sentation, les droits secondaires et les droits d\u2019utilisation d\u00e9riv\u00e9e.</p></div>

<div class="article"><h4>Article 5 \u2014 Droits c\u00e9d\u00e9s</h4>
<ul>
<li>Exploitation cin\u00e9matographique (salles)</li>
<li>Exploitation par t\u00e9l\u00e9diffusion (TV, c\u00e2ble, satellite, internet)</li>
<li>Exploitation vid\u00e9ographique (DVD, VOD, SVOD)</li>
<li>Exploitation en ligne et num\u00e9rique</li>
${form.droit_suite ? `<li>Droits de remake, prequel, sequel, spin-off</li>` : ""}
</ul></div>

<div class="article"><h4>Article 6 \u2014 Dur\u00e9e</h4>
<p>La pr\u00e9sente cession est conclue pour une dur\u00e9e de <strong>${escH(form.duree)} ans</strong> \u00e0 compter de la premi\u00e8re repr\u00e9sentation commerciale du Film.</p></div>

<div class="article"><h4>Article 7 \u2014 R\u00e9mun\u00e9rations proportionnelles</h4>
<ul>
<li>Exploitation cin\u00e9matographique : <strong>0,225%</strong></li>
<li>Exploitation vid\u00e9ographique : <strong>0,135%</strong></li>
<li>Exploitation TV : <strong>0,9%</strong></li>
<li>Autres exploitations : <strong>0,9%</strong></li>
</ul></div>

<div class="article"><h4>Article 8 \u2014 Publicit\u00e9</h4>
<p>L\u2019Auteur sera cr\u00e9dit\u00e9(e) : <strong>Sc\u00e9nario${form.coAuteur ? " et dialogues" : ""} de ${escH(form.auteur || "[NOM]")}${form.coAuteur ? " et " + escH(form.coAuteur) : ""}</strong></p>
<p>dans des caract\u00e8res dont la taille ne pourra \u00eatre inf\u00e9rieure \u00e0 75% du nom du r\u00e9alisateur.</p></div>

<div class="article"><h4>Article 9 \u2014 Reddition des comptes</h4>
<p>Le Producteur \u00e9tablira des redditions de comptes semestriellement les deux premi\u00e8res ann\u00e9es, puis annuellement.</p></div>

<div class="article"><h4>Article 10 \u2014 R\u00e9siliation</h4>
<p>En cas de d\u00e9faut de paiement, apr\u00e8s mise en demeure par lettre recommand\u00e9e rest\u00e9e sans effet sous 15 jours, le pr\u00e9sent contrat sera r\u00e9sili\u00e9 de plein droit.</p></div>

<div class="article"><h4>Article 11 \u2014 Litiges</h4>
<p>En cas de litiges, attribution de juridiction est faite aux Tribunaux comp\u00e9tents de Paris.</p></div>

<div class="signatures">
<div class="sig-block"><div class="label">Le Producteur</div></div>
<div class="sig-block"><div class="label">L\u2019Auteur</div></div>
${form.agentAuteur ? `<div class="sig-block"><div class="label">L\u2019Agent</div></div>` : ""}
</div>

<div class="footer">
Fait \u00e0 Paris, le ${date} \u2014 en ${form.agentAuteur ? "quatre" : "trois"} exemplaires originaux dont un pour le RPCA.
<em>Document g\u00e9n\u00e9r\u00e9 par Sc\u00e9norama \u2014 scenorama.vercel.app \u2014 Ce document est un mod\u00e8le. Il ne constitue pas un avis juridique. Consultez un avocat sp\u00e9cialis\u00e9 avant signature.</em>
</div>

</body></html>`;

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Contrat_" + (form.titre || "projet").replace(/[^a-zA-Z0-9\u00e0-\u00fc]/g, "_") + ".html";
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
    // Ne pas effacer le cache ici — le useEffect sur fName gère le rechargement depuis localStorage
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
