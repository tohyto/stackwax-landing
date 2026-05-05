export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  // CORS headers — allow any origin (Capacitor uses capacitor://localhost)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = process.env.AUDD_API_TOKEN;
  if (!token) {
    return res.status(500).json({ error: "AUDD_API_TOKEN not configured" });
  }

  try {
    const contentType = req.headers["content-type"];
    if (!contentType || !contentType.includes("multipart/form-data")) {
      return res.status(400).json({ error: "Expected multipart/form-data" });
    }

    // Read raw body
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);

    // Forward to AudD with token in URL
    const url = `https://api.audd.io/?api_token=${encodeURIComponent(token)}`;
    const auddRes = await fetch(url, {
      method: "POST",
      headers: { "content-type": contentType },
      body
    });

    const text = await auddRes.text();
    
    // Try to parse as JSON, fall back to text
    try {
      const data = JSON.parse(text);
      return res.status(auddRes.status).json(data);
    } catch {
      return res.status(auddRes.status).json({ error: "Invalid response from AudD", body: text });
    }
  } catch (err) {
    return res.status(500).json({ error: "Proxy error", message: err.message, stack: err.stack });
  }
}
