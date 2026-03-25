export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { prompt, apiKey } = req.body || {};

  if (!apiKey || typeof apiKey !== "string" || !apiKey.startsWith("sk-ant-")) {
    return res.status(400).json({ error: "Clé API Anthropic invalide ou manquante." });
  }

  if (!prompt || typeof prompt !== "string" || prompt.length < 100) {
    return res.status(400).json({ error: "Contenu manquant." });
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
        model: "claude-sonnet-4-20250514",
        max_tokens: 3000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: data?.error?.message || "Erreur API Anthropic." });
    }

    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: "Erreur serveur : " + err.message });
  }
}
