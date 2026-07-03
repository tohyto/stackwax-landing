// api/enrich.js — global track metadata cache (CommonJS, per project config).
// GET /api/enrich?artist=...&title=...
// 1. Look up Supabase cache (service role). Hit -> return cached metadata.
// 2. Miss -> replicate the client enrichment (Spotify then Deezer, via the
//    existing proxies so results match the app exactly), write cache, return.
// GetSongBPM intentionally excluded (dropped from the recognition chain).

const { createClient } = require('@supabase/supabase-js');

const BASE = 'https://www.stackwax.app';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const norm = (s) =>
  (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');

module.exports = async (req, res) => {
  try {
    const artist = (req.query.artist || '').trim();
    const title = (req.query.title || '').trim();
    if (!artist && !title) {
      return res.status(400).json({ error: 'artist or title required' });
    }
    const key = `${norm(artist)}|${norm(title)}`;

    // 1. Cache lookup (atomic, increments hit_count)
    const { data: hit, error: lookErr } = await supabase.rpc('cache_lookup', { p_key: key });
    if (lookErr) console.error('[enrich] lookup error:', lookErr.message);
    if (hit && hit.norm_key) {
      return res.status(200).json({ source: 'cache', ...hit });
    }

    // 2. Miss — enrich via the existing proxies (same order as the client)
    const q = `${artist} ${title}`.trim();
    const updates = { artist, title };
    let foundBpm = false;

    // Spotify: url, artwork, genres
    try {
      const sr = await (await fetch(
        `${BASE}/api/spotify-search?q=${encodeURIComponent(q)}&limit=5`
      )).json();
      if (sr.tracks && sr.tracks.items && sr.tracks.items.length) {
        const m = sr.tracks.items[0];
        updates.spotify_url = (m.external_urls && m.external_urls.spotify) || null;
        if (m.album && m.album.images && m.album.images[0]) {
          updates.artwork_url = m.album.images[0].url;
        }
        if (m.artist_genres && m.artist_genres.length) {
          updates.genre = m.artist_genres.slice(0, 3).join(', ');
        }
      }
    } catch (e) { /* continue to Deezer */ }

    // Deezer: BPM, artwork fallback, genre fallback
    try {
      const queries = [q, artist].filter(Boolean);
      for (const dq of queries) {
        if (foundBpm) break;
        const sr = await (await fetch(
          `${BASE}/api/deezer?path=${encodeURIComponent(`search?q=${dq}&limit=5`)}`
        )).json();
        if (sr.data && sr.data.length) {
          const m = sr.data[0];
          const dt = await (await fetch(
            `${BASE}/api/deezer?path=track/${m.id}`
          )).json();
          if (dt.bpm && dt.bpm > 0) {
            updates.bpm = Math.round(dt.bpm);
            updates.deezer_track_id = String(m.id);
            foundBpm = true;
          }
          if (!updates.artwork_url && dt.album && dt.album.cover_medium) {
            updates.artwork_url = dt.album.cover_medium;
          }
          try {
            if (dt.album && dt.album.id && !updates.genre) {
              const al = await (await fetch(
                `${BASE}/api/deezer?path=album/${dt.album.id}`
              )).json();
              if (al.genres && al.genres.data && al.genres.data.length) {
                updates.genre = al.genres.data.map(g => g.name).slice(0, 3).join(', ');
              }
            }
          } catch (e) { /* genre optional */ }
        }
      }
    } catch (e) { /* proceed with whatever we have */ }

    // 3. Write cache only if enrichment produced something useful
    const useful = updates.bpm || updates.spotify_url || updates.artwork_url || updates.genre;
    if (useful) {
      const { error: upErr } = await supabase.rpc('cache_upsert', {
        p_key: key,
        p_artist: artist,
        p_title: title,
        p_bpm: updates.bpm || null,
        p_music_key: null,
        p_mode: null,
        p_genre: updates.genre || null,
        p_spotify_url: updates.spotify_url || null,
        p_artwork_url: updates.artwork_url || null,
        p_deezer_track_id: updates.deezer_track_id || null,
      });
      if (upErr) console.error('[enrich] upsert error:', upErr.message);
    }

    return res.status(200).json({ source: 'live', found: !!useful, ...updates });
  } catch (e) {
    console.error('[enrich] fatal:', e.message);
    return res.status(500).json({ error: 'enrich failed' });
  }
};
