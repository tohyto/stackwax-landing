const crypto = require('crypto');

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Trim whitespace from env vars (defensive)
  const host = (process.env.ACRCLOUD_HOST || "").trim();
  const accessKey = (process.env.ACRCLOUD_ACCESS_KEY || "").trim();
  const secretKey = (process.env.ACRCLOUD_SECRET_KEY || "").trim();

  const debug = {
    hostLen: host.length,
    hostStart: host.slice(0, 12),
    accessLen: accessKey.length,
    accessStart: accessKey.slice(0, 6),
    secretLen: secretKey.length,
    secretStart: secretKey.slice(0, 4),
  };

  if (!host || !accessKey || !secretKey) {
    return res.status(500).json({ error: "env vars missing", debug });
  }

  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const audioBuffer = Buffer.concat(chunks);

    if (audioBuffer.length === 0) {
      return res.status(400).json({ error: "empty audio body", debug });
    }

    const httpMethod = "POST";
    const httpUri = "/v1/identify";
    const dataType = "audio";
    const signatureVersion = "1";
    const timestamp = Math.floor(Date.now() / 1000).toString();

    const stringToSign = [httpMethod, httpUri, accessKey, dataType, signatureVersion, timestamp].join("\n");

    const signature = crypto
      .createHmac("sha1", Buffer.from(secretKey, "utf-8"))
      .update(Buffer.from(stringToSign, "utf-8"))
      .digest("base64");

    debug.stringToSignLen = stringToSign.length;
    debug.signaturePrefix = signature.slice(0, 8);
    debug.timestamp = timestamp;

    const form = new FormData();
    form.append("access_key", accessKey);
    form.append("sample_bytes", audioBuffer.length.toString());
    form.append("sample", new Blob([audioBuffer], { type: "audio/webm" }), "sample.webm");
    form.append("timestamp", timestamp);
    form.append("signature", signature);
    form.append("data_type", dataType);
    form.append("signature_version", signatureVersion);

    const r = await fetch(`https://${host}/v1/identify`, { method: "POST", body: form });
    const data = await r.json();

    return res.status(200).json({ ...data, debug, audioBytes: audioBuffer.length });
  } catch (e) {
    return res.status(500).json({ error: e.message, debug });
  }
};
