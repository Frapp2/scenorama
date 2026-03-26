export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Clé API non configurée sur le serveur." });
  }

  const { prompt } = req.body || {};

  if (!prompt || typeof prompt !== "string" || prompt.length < 100) {
    return res.status(400).json({ error: "Contenu manquant." });
  }

  if (prompt.length > 400000) {
    return res.status(400).json({ error: "Scénario trop long." });
  }

  // Liste les modèles disponibles pour trouver le bon
  const MODELS = [
    "claude-sonnet-4-5-20250514",
    "claude-3-5-sonnet-20241022",
    "claude-3-5-sonnet-latest",
    "claude-sonnet-4-20250514",
    "claude-3-haiku-20240307",
  ];

  let lastError = null;

  for (const model of MODELS) {
    try {
      console.log("Trying model:", model);
      const upstream = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 3000,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      const data = await upstream.json();
      console.log("Model", model, "status:", upstream.status);

      if (upstream.ok) {
        console.log("SUCCESS with model:", model);
        return res.status(200).json(data);
      }

      // Si not_found, essayer le modèle suivant
      if (data?.error?.type === "not_found_error") {
        console.log("Model not found, trying next...");
        lastError = data;
        continue;
      }

      // Autre erreur (auth, billing, etc.) — pas la peine de continuer
      console.log("Error:", JSON.stringify(data).slice(0, 300));
      return res.status(upstream.status).json({ error: data?.error?.message || "Erreur API." });

    } catch (err) {
      console.log("Fetch error for model", model, ":", err.message);
      lastError = { error: { message: err.message } };
    }
  }

  // Aucun modèle n'a fonctionné
  return res.status(404).json({ error: "Aucun modèle disponible. " + (lastError?.error?.message || "") });
}
