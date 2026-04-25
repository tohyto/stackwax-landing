
// api/deezer.js
// Proxies Deezer API. No key required by Deezer for basic endpoints,
// but routing through here keeps the architecture consistent and lets us
// add caching or rate-limiting later without changing the app.
// Usage: /api/deezer?path=search&q=track+name
//        /api/deezer?path=track/12345

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  
  const { path, ...rest } = req.query;
  if (!path) return res.status(400).json({ error: 'Missing path parameter' });
  
  // Reject anything sketchy in the path (no slashes for traversal, no protocols)
  if (path.includes('..') || path.includes('://')) {
    return res.status(400).json({ error: 'Invalid path' });
  }
  
  // Reconstruct query string from remaining params
  const params = new URLSearchParams(rest).toString();
  const url = `https://api.deezer.com/${path}${params ? '?' + params : ''}`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    if (!response.ok) return res.status(response.status).json(data);
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
