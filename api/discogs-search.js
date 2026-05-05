module.exports = async function handler(req, res) {
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
    const q = encodeURIComponent(`${artist} ${track}`);
    const url = `https://api.discogs.com/database/search?q=${q}&type=release&token=${token}&per_page=10`;

    const r = await fetch(url, {
      headers: { "User-Agent": "Stackwax/1.0" }
    });

    if (!r.ok) {
      return res.status(r.status).json({ error: `Discogs API ${r.status}` });
    }

    const data = await r.json();
    const results = data.results || [];

    if (results.length === 0) {
      return res.status(200).json({ found: false });
    }

    const top = results[0];

    return res.status(200).json({
      found: true,
      releaseId: top.id,
      masterId: top.master_id || null,
      title: top.title,
      year: top.year,
      thumb: top.thumb,
      url: top.master_id
        ? `https://www.discogs.com/master/${top.master_id}`
        : `https://www.discogs.com/release/${top.id}`,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
