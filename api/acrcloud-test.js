const crypto = require('crypto');

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const host = process.env.ACRCLOUD_HOST;
  const accessKey = process.env.ACRCLOUD_ACCESS_KEY;
  const secretKey = process.env.ACRCLOUD_SECRET_KEY;

  if (!host || !accessKey || !secretKey) {
    return res.status(500).json({ error: "ACRCloud env vars missing" });
  }

  try {
    // Read the raw audio body (binary)
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const audioBuffer = Buffer.concat(chunks);

    // Build the HMAC-SHA1 signature
    const httpMethod = "POST";
    const httpUri = "/v1/identify";
    const dataType = "audio";
    const signatureVersion = "1";
    const timestamp = Math.floor(Date.now() / 1000).toString();

    const stringToSign = [
      httpMethod, httpUri, accessKey, dataType, signatureVersion, timestamp
    ].join("\n");

    const signature = crypto
      .createHmac("sha1", secretKey)
      .update(Buffer.from(stringToSign, "utf-8"))
      .digest("base64");

    // Build multipart form-data manually (fetch in Node 18+ supports FormData with Blob)
    const form = new FormData();
    form.append("sample", new Blob([audioBuffer]), "sample.webm");
    form.append("sample_bytes", audioBuffer.length.toString());
    form.append("access_key", accessKey);
    form.append("data_type", dataType);
    form.append("signature_version", signatureVersion);
    form.append("signature", signature);
    form.append("timestamp", timestamp);

    const r = await fetch(`https://${host}/v1/identify`, {
      method: "POST",
      body: form,
    });

    const data = await r.json();
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
