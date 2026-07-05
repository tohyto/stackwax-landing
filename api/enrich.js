// api/enrich.js — DEBUG BUILD. Same behavior as before, but adds a `debug`
// block to the response so we can see what the function actually has:
//   - the Supabase host it is trying to reach (safe to show)
//   - whether the service key is present, and its length (never the value)
//   - the real lookup/upsert error text
// Replace with the clean version once the connection is confirmed working.

const { createClient } = require('@supabase/supabase-js');

const BASE = 'https://www.stackwax.app';

const RAW_URL = process.env.SUPABASE_URL || '';
const RAW_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Parse the host safely for the debug output.
let urlHost = 'MISSING_OR_UNPARSEABLE';
try { urlHost = new URL(RAW_URL).host; } catch (e) { /* leave as-is */ }

const supabase = createClient(RAW_URL, RAW_KEY);

const norm = (s) =>
  (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');

module.exports = async (req, res) => {
  const debug = {
    supabase_host: urlHost,
    url_has_trailing_whitespace: RAW_URL !== RAW_URL.trim(),
    service_key_present: RAW_KEY.length > 0,
    service_key_length: RAW_KEY.length, // ~200+ for a real JWT key; 0 means empty
    lookup_error: null,
    upsert_error: null,
  };

  try {
    const artist = (req.query.artist || '').trim();
    const title = (req.query.title || '').trim();
    if (!artist && !title) {
      return res.status(400).json({ error: 'artist or title required', debug });
    }
    const key = `${norm(artist)}|${norm(title)}`;

    const { data: hit, error: lookErr } = await supabase.rpc('cache_lookup', { p_key: key });
    if (lookErr) { debug.lookup_error = lookErr.message; console.error('[enrich] lookup error:', lookErr.message); }
    if (hit && hit.norm_key) {
      return res.status(200).json({ source: 'cache', ...hit, debug });
    }

    const q = `${artist} ${title}`.trim();
    const updates = { artist, title };
    let foundBpm = false;

    try {
      const sr = await (await fetch(
        `${BASE}/api/spotify-search?q=${encodeURIComponent(q)}&limit=5`
      )).json();
      if (sr.tracks && sr.tracks.items && sr.tracks.items.length) {
        const m = sr.tracks.items[0];
        updates.spotify_url = (m.external_urls && m.external_urls.spotify) || null;
        if (m.album && m.album.images && m.album.images[0]) updates.artwork_url = m.album.images[0].url;
        if (m.artist_genres && m.artist_genres.length) updates.genre = m.artist_genres.slice(0, 3).join(', ');
      }
    } catch (e) { /* continue */ }

    try {
      const queries = [q, artist].filter(Boolean);
      for (const dq of queries) {
        if (foundBpm) break;
        const sr = await (await fetch(
          `${BASE}/api/deezer?path=${encodeURIComponent(`search?q=${dq}&limit=5`)}`
        )).json();
        if (sr.data && sr.data.length) {
          const m = sr.data[0];
          const dt = await (await fetch(`${BASE}/api/deezer?path=track/${m.id}`)).json();
          if (dt.bpm && dt.bpm > 0) { updates.bpm = Math.round(dt.bpm); updates.deezer_track_id = String(m.id); foundBpm = true; }
          if (!updates.artwork_url && dt.album && dt.album.cover_medium) updates.artwork_url = dt.album.cover_medium;
        }
      }
    } catch (e) { /* continue */ }

    const useful = updates.bpm || updates.spotify_url || updates.artwork_url || updates.genre;
    if (useful) {
      const { error: upErr } = await supabase.rpc('cache_upsert', {
        p_key: key, p_artist: artist, p_title: title,
        p_bpm: updates.bpm || null, p_music_key: null, p_mode: null,
        p_genre: updates.genre || null, p_spotify_url: updates.spotify_url || null,
        p_artwork_url: updates.artwork_url || null, p_deezer_track_id: updates.deezer_track_id || null,
      });
      if (upErr) { debug.upsert_error = upErr.message; console.error('[enrich] upsert error:', upErr.message); }
    }

    return res.status(200).json({ source: 'live', found: !!useful, ...updates, debug });
  } catch (e) {
    debug.fatal = e.message;
    return res.status(500).json({ error: 'enrich failed', debug });
  }
};
