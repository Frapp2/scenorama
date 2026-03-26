export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Clé API stockée côté serveur (variable d'environnement Vercel)
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Clé API non configurée sur le serveur." });
  }

  const { prompt } = req.body || {};

  if (!prompt || typeof prompt !== "string" || prompt.length < 100) {
    return res.status(400).json({ error: "Contenu manquant." });
  }

  // Protection basique : limite la taille du prompt (évite les abus)
  if (prompt.length > 400000) {
    return res.status(400).json({ error: "Scénario trop long." });
  }

  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 3000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await upstream.json();
    console.log("Anthropic response status:", upstream.status);
    console.log("Anthropic response:", JSON.stringify(data).slice(0, 500));

    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: data?.error?.message || "Erreur API Anthropic." });
    }

    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: "Erreur serveur : " + err.message });
  }
}
