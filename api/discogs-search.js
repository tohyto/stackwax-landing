export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { artist, track } = req.query;
  if (!artist || !track) {
    return res.status(400).json({ error: "Missing artist or track parameter" });
  }

  const token = process.env.DISCOGS_TOKEN;
  if (!token) {
    return res.status(500).json({ error: "DISCOGS_TOKEN not configured" });
  }

  try {
    // Search by artist + release title (broad match)
    const q = encodeURIComponent(`${artist} ${track}`);
    const url = `https://api.discogs.com/database/search?q=${q}&type=release&token=${token}&per_page=10`;
    
    const r = await fetch(url, {
      headers: { "User-Agent": "Stackwax/1.0" }
    });
    
    if (!r.ok) {
      return res.status(r.status).json({ error: `Discogs API ${r.status}` });
    }
    
    const data = await r.json();
    const results = d
