const crypto = require('crypto');

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const host = (process.env.ACRCLOUD_HOST || "").trim();
  const access_key = (process.env.ACRCLOUD_ACCESS_KEY || "").trim();
  const access_secret = (process.env.ACRCLOUD_SECRET_KEY || "").trim();

  if (!host || !access_key || !access_secret) {
    return res.status(500).json({ error: "env vars missing" });
  }

  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const sample_bytes = Buffer.concat(chunks);

    if (sample_bytes.length === 0) {
      return res.status(400).json({ error: "empty audio body" });
    }

    const data_type = "audio";
    const signature_version = "1";

    const ts_float = Date.now() / 1000;
    const timestamp = String(ts_float);

    const string_to_sign = ["POST", "/v1/identify", access_key, data_type, signature_version, timestamp].join("\n");

    const signature = crypto
      .createHmac("sha1", Buffer.from(access_secret, "ascii"))
      .update(Buffer.from(string_to_sign, "ascii"))
      .digest("base64");

    const form = new FormData();
    form.append("sample", new Blob([sample_bytes], { type: "audio/wav" }), "sample.wav");
    form.append("sample_bytes", String(sample_bytes.length));
    form.append("access_key", access_key);
    form.append("data_type", data_type);
    form.append("signature_version", signature_version);
    form.append("signature", signature);
    form.append("timestamp", timestamp);

    const r = await fetch(`https://${host}/v1/identify`, {
      method: "POST",
      body: form,
    });

    const data = await r.json();

    return res.status(200).json({
      ...data,
      debug: {
        stringToSign: string_to_sign,
        timestamp,
        signature,
        sampleBytes: sample_bytes.length,
      },
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
