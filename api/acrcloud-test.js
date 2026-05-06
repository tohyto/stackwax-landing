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
    // IGNORE the audio from the app — fetch a known-good MP3 instead
    const sampleResp = await fetch("https://www.soundjay.com/misc/sounds/bell-ringing-05.mp3");
    const sample_bytes = Buffer.from(await sampleResp.arrayBuffer());

    const data_type = "audio";
    const signature_version = "1";
    const timestamp = Math.floor(Date.now() / 1000).toString();

    const string_to_sign = ["POST", "/v1/identify", access_key, data_type, signature_version, timestamp].join("\n");

    const signature = crypto
      .createHmac("sha1", access_secret)
      .update(string_to_sign)
      .digest("base64");

    const form = new FormData();
    form.append("sample", new Blob([sample_bytes], { type: "audio/mpeg" }), "sample.mp3");
    form.append("sample_bytes", sample_bytes.length.toString());
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
        usingTestMP3: true,
      },
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
