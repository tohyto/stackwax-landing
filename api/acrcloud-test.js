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
    const timestamp = String(Date.now() / 1000);

    const string_to_sign = ["POST", "/v1/identify", access_key, data_type, signature_version, timestamp].join("\n");

    const signature = crypto
      .createHmac("sha1", Buffer.from(access_secret, "ascii"))
      .update(Buffer.from(string_to_sign, "ascii"))
      .digest("base64");

    // Build multipart body manually to match Python's requests library exactly
    const boundary = "----stackwax" + crypto.randomBytes(8).toString("hex");
    const CRLF = "\r\n";

    const textPart = (name, value) =>
      Buffer.from(`--${boundary}${CRLF}Content-Disposition: form-data; name="${name}"${CRLF}${CRLF}${value}${CRLF}`, "utf-8");

    // File part header (matches Python requests' default for ('filename', bytes, 'mime'))
    const fileHeader = Buffer.from(
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="sample"; filename="sample.wav"${CRLF}` +
      `Content-Type: audio/wav${CRLF}${CRLF}`,
      "utf-8"
    );
    const fileFooter = Buffer.from(CRLF, "utf-8");
    const closingBoundary = Buffer.from(`--${boundary}--${CRLF}`, "utf-8");

    const body = Buffer.concat([
      // File first, like Python's requests does when files= is used
      fileHeader,
      sample_bytes,
      fileFooter,
      // Then the form fields
      textPart("access_key", access_key),
      textPart("sample_bytes", String(sample_bytes.length)),
      textPart("timestamp", timestamp),
      textPart("signature", signature),
      textPart("data_type", data_type),
      textPart("signature_version", signature_version),
      closingBoundary,
    ]);

    const r = await fetch(`https:/
