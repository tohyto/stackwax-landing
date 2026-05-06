// api/spotify-search.js
// Searches Spotify and enriches the first result with artist genres.

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { q, type = 'track', limit = '5' } = req.query;
  if (!q) return res.status(400).json({ error: 'Missing query parameter q' });

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: 'Spotify credentials not configured' });
  }

  try {
    // 1. Get access token
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) return res.status(tokenRes.status).json(tokenData);

    const accessToken = tokenData.access_token;

    // 2. Search
    const searchUrl = `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=${type}&limit=${limit}`;
    const searchRes = await fetch(searchUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    const searchData = await searchRes.json();
    if (!searchRes.ok) return res.status(searchRes.status).json(searchData);

    // 3. Enrich first track with artist genres
    const firstArtistId = searchData.tracks?.items?.[0]?.artists?.[0]?.id;
    if (firstArtistId) {
      try {
        const artistRes = await fetch(`https://api.spotify.com/v1/artists/${firstArtistId}`, {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        });
        if (artistRes.ok) {
          const artistData = await artistRes.json();
          searchData.tracks.items[0].artists[0].genres = artistData.genres || [];
        }
      } catch (e) {
        // Genre enrichment is optional, don't fail the whole request
      }
    }

    return res.status(200).json(searchData);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
