// api/discogs.js
// Proxies Discogs API. Discogs requires a User-Agent header on every request,
// which is awkward to send from a browser/Capacitor WebView. Routing through
// here also lets us swap to a server-side token later if we want.
// Usage: /api/discogs?path=users/USERNAME/collection/folders/0/releases&per_page=50&page=1&token=XXX
//        /api/discogs?path=releases/12345&token=XXX

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { path, ...rest } = req.query;
  if (!path) return res.status(400).json({ error: 'Missing path parameter' });

  // Reject anything sketchy in the path
  if (path.includes('..') || path.includes('://')) {
    return res.status(400).json({ error: 'Invalid path' });
  }

  // Reconstruct query string from remaining params
  const params = new URLSearchParams(rest).toString();
  const url = `https://api.discogs.com/${path}${params ? '?' + params : ''}`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Stackwax/1.0 +https://stackwax.app',
        'Accept': 'application/json',
      },
    });
    const data = await response.json();

    if (!response.ok) return res.status(response.status).json(data);
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
