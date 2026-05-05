export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = process.env.AUDD_API_TOKEN;
  if (!token) {
    return res.status(500).json({ error: "AUDD_API_TOKEN not configured" });
  }

  try {
    // Read the raw multipart body from the client
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);

    // Get the original content-type (multipart boundary)
    const contentType = req.headers["content-type"];
    if (!contentType || !contentType.includes("multipart/form-data")) {
      return res.status(400).json({ error: "Expected multipart/form-data" });
    }

    // Inject api_token into the multipart body by appending a new part
    // before forwarding. Easier approach: parse the form, add token, re-send.
    // Simplest: the client already sends api_token in the form. We just need
    // to forward to AudD. But for security, the client should NOT send
    // api_token — we add it server-side.
    //
    // Cleanest way: use Node's native fetch + FormData reconstruction.
    // Since we have the raw body and it's already a valid multipart payload,
    // we forward the file part and re-add api_token via a new FormData.

    // Forward as-is to AudD (client sends file; we add token via URL param)
    const url = `https://api.audd.io/?api_token=${encodeURIComponent(token)}`;
    const auddRes = await fetch(url, {
      method: "POST",
      headers: { "content-type": contentType },
      body
    });

    const data = await auddRes.json();
    return res.status(auddRes.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
