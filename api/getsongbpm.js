
// api/getsongbpm.js
// Proxies GetSongBPM API. Frontend never sees the API key.
// Usage: /api/getsongbpm?type=song&lookup=song:Title+artist:Name
//        /api/getsongbpm?type=both&lookup=song:Title+artist:Name

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  
  const apiKey = process.env.GETSONGBPM_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GetSongBPM key not configured' });
  }
  
  const { type, lookup } = req.query;
  if (!type || !lookup) {
    return res.status(400).json({ error: 'Missing type or lookup parameter' });
  }
  
  try {
    const url = `https://api.getsong.co/${encodeURIComponent(type)}/?api_key=${apiKey}&lookup=${encodeURIComponent(lookup)}`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (!response.ok) return res.status(response.status).json(data);
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
