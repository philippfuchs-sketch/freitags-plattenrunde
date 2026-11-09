const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'vinyl-club-admin-2026';
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ============================================================================
// HELPER: Version & Title Normalizer (e.g. "Heroes (1977 Remaster)" == "Heroes - 2017 Remaster")
// ============================================================================
function normalizePart(str) {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\([^)]*(remaster|version|edit|mix|live|mono|stereo|deluxe|anniversary|audio|video|explicit|single|album|\d{4})[^)]*\)/gi, '')
    .replace(/\[[^\]]*(remaster|version|edit|mix|live|mono|stereo|deluxe|anniversary|audio|video|explicit|single|album|\d{4})[^\]]*\]/gi, '')
    .replace(/-\s*.*(remaster|version|edit|mix|live|mono|stereo|deluxe|anniversary|\d{4}).*$/gi, '')
    .replace(/\b(feat|ft|featuring)\b.*$/gi, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeSongKey(artist, title) {
  return `${normalizePart(artist)}::${normalizePart(title)}`;
}

function normalizeArtistKey(artist) {
  return normalizePart(artist);
}

// ============================================================================
// HELPER: Crisp Editorial Album Sleeve SVG Data-URI Generator
// ============================================================================
function makeAlbumCoverSvg(title, artist, accentHex = '#D4A373', bgHex = '#181816', motif = 'circle') {
  const safeTitle = String(title || '').replace(/[<>&"']/g, '').slice(0, 18).toUpperCase();
  const safeArtist = String(artist || '').replace(/[<>&"']/g, '').slice(0, 18).toUpperCase();
  let artElement = '';
  if (motif === 'bowie') {
    artElement = `
      <circle cx="60" cy="56" r="28" fill="#D6D3CD"/>
      <rect x="26" y="42" width="68" height="10" fill="${bgHex}"/>
      <path d="M32 104 C35 76, 85 76, 88 104 Z" fill="#2C2B29"/>
    `;
  } else if (motif === 'stripes') {
    artElement = `
      <rect x="98" y="14" width="8" height="92" fill="${accentHex}"/>
      <rect x="84" y="30" width="8" height="60" fill="#52524E"/>
      <circle cx="50" cy="62" r="24" fill="none" stroke="${accentHex}" stroke-width="2"/>
      <circle cx="50" cy="62" r="7" fill="${accentHex}"/>
    `;
  } else if (motif === 'wave') {
    artElement = `
      <path d="M18 52 Q40 34, 60 52 T102 52" fill="none" stroke="${accentHex}" stroke-width="2"/>
      <path d="M18 64 Q40 46, 60 64 T102 64" fill="none" stroke="#8E8B84" stroke-width="1.5"/>
      <path d="M18 76 Q40 58, 60 76 T102 76" fill="none" stroke="#5A5752" stroke-width="1.2"/>
    `;
  } else if (motif === 'grid') {
    artElement = `
      <rect x="28" y="36" width="64" height="52" fill="none" stroke="${accentHex}" stroke-width="1.5"/>
      <line x1="28" y1="62" x2="92" y2="62" stroke="#5A5752" stroke-width="1"/>
      <line x1="60" y1="36" x2="60" y2="88" stroke="#5A5752" stroke-width="1"/>
      <circle cx="60" cy="62" r="10" fill="${accentHex}"/>
    `;
  } else {
    artElement = `
      <circle cx="60" cy="62" r="26" fill="none" stroke="${accentHex}" stroke-width="2"/>
      <circle cx="60" cy="62" r="16" fill="none" stroke="#5A5752" stroke-width="1"/>
      <circle cx="60" cy="62" r="5" fill="${accentHex}"/>
    `;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
    <rect width="120" height="120" fill="${bgHex}"/>
    <rect x="6" y="6" width="108" height="108" fill="none" stroke="#FFFFFF" stroke-opacity="0.08" stroke-width="1"/>
    ${artElement}
    <text x="14" y="21" fill="#EDEDEA" font-family="sans-serif" font-size="7.5" font-weight="700" letter-spacing="1.4">${safeArtist}</text>
    <text x="14" y="108" fill="#9E9B94" font-family="monospace" font-size="6.8" letter-spacing="1">${safeTitle}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// ============================================================================
// CURATED CATALOG (Instant Cross-Platform Lookup + Offline/Sandbox Fallback)
// ============================================================================
const CATALOG = [
  {
    title: 'Heroes',
    artist: 'David Bowie',
    album: '“Heroes” (1977)',
    cover_url: makeAlbumCoverSvg('Heroes', 'David Bowie', '#D4A373', '#161615', 'bowie'),
    platforms: {
      spotify: { track_id: '7Jh1bpe7JJMuGhFi64neUt', uri: 'spotify:track:7Jh1bpe7JJMuGhFi64neUt', url: 'https://open.spotify.com/track/7Jh1bpe7JJMuGhFi64neUt' },
      youtube: { video_id: 'bsYp9q3QNaQ', url: 'https://www.youtube.com/watch?v=bsYp9q3QNaQ' }
    }
  },
  {
    title: 'Blue Monday',
    artist: 'New Order',
    album: 'Power, Corruption & Lies (1983)',
    cover_url: makeAlbumCoverSvg('Blue Monday', 'New Order', '#5BA4CF', '#131619', 'stripes'),
    platforms: {
      spotify: { track_id: '6hHc7Pks7wtBIW8Z6A0iFq', uri: 'spotify:track:6hHc7Pks7wtBIW8Z6A0iFq', url: 'https://open.spotify.com/track/6hHc7Pks7wtBIW8Z6A0iFq' },
      youtube: { video_id: 'FYH8DsU2WCk', url: 'https://www.youtube.com/watch?v=FYH8DsU2WCk' }
    }
  },
  {
    title: 'Enjoy the Silence',
    artist: 'Depeche Mode',
    album: 'Violator (1990)',
    cover_url: makeAlbumCoverSvg('Enjoy the Silence', 'Depeche Mode', '#C85A5A', '#171212', 'wave'),
    platforms: {
      spotify: { track_id: '6WK9dVrRABMkUXFLNlgWFh', uri: 'spotify:track:6WK9dVrRABMkUXFLNlgWFh', url: 'https://open.spotify.com/track/6WK9dVrRABMkUXFLNlgWFh' },
      youtube: { video_id: 'aGSKrC7dGcY', url: 'https://www.youtube.com/watch?v=aGSKrC7dGcY' }
    }
  },
  {
    title: 'Take On Me',
    artist: 'a-ha',
    album: 'Hunting High and Low (1985)',
    cover_url: makeAlbumCoverSvg('Take On Me', 'a-ha', '#D4A373', '#191714', 'grid'),
    platforms: {
      spotify: { track_id: '2WfaOiMkCvy7F5fcp2zZ8L', uri: 'spotify:track:2WfaOiMkCvy7F5fcp2zZ8L', url: 'https://open.spotify.com/track/2WfaOiMkCvy7F5fcp2zZ8L' },
      youtube: { video_id: 'djV11Xbc914', url: 'https://www.youtube.com/watch?v=djV11Xbc914' }
    }
  },
  {
    title: 'Everybody Wants to Rule the World',
    artist: 'Tears for Fears',
    album: 'Songs from the Big Chair (1985)',
    cover_url: makeAlbumCoverSvg('Rule the World', 'Tears for Fears', '#8FA882', '#141813', 'circle'),
    platforms: {
      spotify: { track_id: '4RvWPyQ5RL0ao9LPZeSouE', uri: 'spotify:track:4RvWPyQ5RL0ao9LPZeSouE', url: 'https://open.spotify.com/track/4RvWPyQ5RL0ao9LPZeSouE' },
      youtube: { video_id: 'aGCdLKXNF3w', url: 'https://www.youtube.com/watch?v=aGCdLKXNF3w' }
    }
  },
  {
    title: 'Sweet Dreams (Are Made of This)',
    artist: 'Eurythmics',
    album: 'Sweet Dreams (1983)',
    cover_url: makeAlbumCoverSvg('Sweet Dreams', 'Eurythmics', '#C98A5B', '#1A1512', 'stripes'),
    platforms: {
      spotify: { track_id: '1TfqLAPs4K3s2rJMoCokcS', uri: 'spotify:track:1TfqLAPs4K3s2rJMoCokcS', url: 'https://open.spotify.com/track/1TfqLAPs4K3s2rJMoCokcS' },
      youtube: { video_id: 'qeMFqkcPYcg', url: 'https://www.youtube.com/watch?v=qeMFqkcPYcg' }
    }
  },
  {
    title: 'Tainted Love',
    artist: 'Soft Cell',
    album: 'Non-Stop Erotic Cabaret (1981)',
    cover_url: makeAlbumCoverSvg('Tainted Love', 'Soft Cell', '#B589D6', '#16131A', 'circle'),
    platforms: {
      spotify: { track_id: '0cGG2EouYCEEC3xfa0tDFV', uri: 'spotify:track:0cGG2EouYCEEC3xfa0tDFV', url: 'https://open.spotify.com/track/0cGG2EouYCEEC3xfa0tDFV' },
      youtube: { video_id: 'XZVpR3Pk-r8', url: 'https://www.youtube.com/watch?v=XZVpR3Pk-r8' }
    }
  },
  {
    title: 'Running Up That Hill (A Deal with God)',
    artist: 'Kate Bush',
    album: 'Hounds of Love (1985)',
    cover_url: makeAlbumCoverSvg('Running Up That Hill', 'Kate Bush', '#C47D8E', '#191315', 'wave'),
    platforms: {
      spotify: { track_id: '75FEaRjZTKLhTrFGsfMUXR', uri: 'spotify:track:75FEaRjZTKLhTrFGsfMUXR', url: 'https://open.spotify.com/track/75FEaRjZTKLhTrFGsfMUXR' },
      youtube: { video_id: 'wp43OdtAAkM', url: 'https://www.youtube.com/watch?v=wp43OdtAAkM' }
    }
  },
  {
    title: 'Once in a Lifetime',
    artist: 'Talking Heads',
    album: 'Remain in Light (1980)',
    cover_url: makeAlbumCoverSvg('Once in a Lifetime', 'Talking Heads', '#D96B52', '#191412', 'grid'),
    platforms: {
      spotify: { track_id: '38Ngied9rBORlAbLYNCl4k', uri: 'spotify:track:38Ngied9rBORlAbLYNCl4k', url: 'https://open.spotify.com/track/38Ngied9rBORlAbLYNCl4k' },
      youtube: { video_id: '5IsSpAOD6K8', url: 'https://www.youtube.com/watch?v=5IsSpAOD6K8' }
    }
  },
  {
    title: 'Das Model',
    artist: 'Kraftwerk',
    album: 'Die Mensch-Maschine (1978)',
    cover_url: makeAlbumCoverSvg('Das Model', 'Kraftwerk', '#D94E4E', '#141414', 'stripes'),
    platforms: {
      spotify: { track_id: '1FL9DHDSED6lxNMDJUJQvB', uri: 'spotify:track:1FL9DHDSED6lxNMDJUJQvB', url: 'https://open.spotify.com/track/1FL9DHDSED6lxNMDJUJQvB' },
      youtube: { video_id: 'OQIYEPe6DWY', url: 'https://www.youtube.com/watch?v=OQIYEPe6DWY' }
    }
  },
  {
    title: 'West End Girls',
    artist: 'Pet Shop Boys',
    album: 'Please (1986)',
    cover_url: makeAlbumCoverSvg('West End Girls', 'Pet Shop Boys', '#D4A373', '#171614', 'grid'),
    platforms: {
      spotify: { track_id: '2yzPBlE5UXK0CqBnRq9BN6', uri: 'spotify:track:2yzPBlE5UXK0CqBnRq9BN6', url: 'https://open.spotify.com/track/2yzPBlE5UXK0CqBnRq9BN6' },
      youtube: { video_id: 'p3j2NYZ8FKs', url: 'https://www.youtube.com/watch?v=p3j2NYZ8FKs' }
    }
  },
  {
    title: 'Don’t Go',
    artist: 'Yazoo',
    album: 'Upstairs at Eric’s (1982)',
    cover_url: makeAlbumCoverSvg('Dont Go', 'Yazoo', '#7BA89E', '#131817', 'circle'),
    platforms: {
      spotify: { track_id: '2V6g40f92c2X5D9Q2c92zT', uri: 'spotify:track:2V6g40f92c2X5D9Q2c92zT', url: 'https://open.spotify.com/track/2V6g40f92c2X5D9Q2c92zT' },
      youtube: { video_id: 'tLTGs4fqxBk', url: 'https://www.youtube.com/watch?v=tLTGs4fqxBk' }
    }
  },
  {
    title: 'Love Will Tear Us Apart',
    artist: 'Joy Division',
    album: 'Single (1980)',
    cover_url: makeAlbumCoverSvg('Love Will Tear Us Apart', 'Joy Division', '#A3A09A', '#111111', 'wave'),
    platforms: {
      spotify: { track_id: '2JO3HwMRPeya8bXbtbyPcf', uri: 'spotify:track:2JO3HwMRPeya8bXbtbyPcf', url: 'https://open.spotify.com/track/2JO3HwMRPeya8bXbtbyPcf' },
      youtube: { video_id: 'zuuObGsB0No', url: 'https://www.youtube.com/watch?v=zuuObGsB0No' }
    }
  },
  {
    title: 'A Forest',
    artist: 'The Cure',
    album: 'Seventeen Seconds (1980)',
    cover_url: makeAlbumCoverSvg('A Forest', 'The Cure', '#7E8C79', '#141613', 'stripes'),
    platforms: {
      spotify: { track_id: '4iVTSRiJAA18d3QglhyJ6Q', uri: 'spotify:track:4iVTSRiJAA18d3QglhyJ6Q', url: 'https://open.spotify.com/track/4iVTSRiJAA18d3QglhyJ6Q' },
      youtube: { video_id: 'xik-y0xlpZ0', url: 'https://www.youtube.com/watch?v=xik-y0xlpZ0' }
    }
  }
];

// ============================================================================
// INITIAL DATABASE SEED
// ============================================================================
function createInitialDb() {
  const now = Date.now();
  const subDeadline = new Date(now + 5 * 86400000).toISOString();
  const voteDeadline = new Date(now + 9 * 86400000).toISOString();

  return {
    users: [
      {
        id: 'user_1',
        name: 'Philipp',
        email: 'philipp@byfanger57.de',
        preferred_platform: 'spotify',
        preferred_theme: 'dark',
        notifications: { email_enabled: true, web_push_enabled: true, deadline_reminders_enabled: true },
        bookmarks: []
      }
    ],
    leagues: [
      {
        id: 'league_01',
        name: 'Freitags-Plattenrunde',
        invite_code: 'PLATTE26',
        season_number: 1,
        season_target_rounds: 6,
        host_user_id: 'user_1',
        co_host_user_id: null,
        next_theme_nominated_by: 'user_1',
        active_round_id: 'round_01',
        members: [
          { user_id: 'user_1', role: 'HOST', status: 'ACTIVE' }
        ],
        theme_ideas: [
          { id: 'idea_1', title: 'Songs mit einer Zahl im Titel', description: 'Egal ob 99 Luftballons, Seven Nation Army oder 1979.', suggested_by: 'user_1', votes: ['user_1'] },
          { id: 'idea_2', title: 'Acoustic Unplugged & Live-Aufnahmen', description: 'Keine Studio-Versionen – nur echte Live-Energie.', suggested_by: 'user_1', votes: ['user_1'] },
          { id: 'idea_3', title: 'Fremdsprachige Perlen (Kein Englisch / Kein Deutsch)', description: 'Französisch, Spanisch, Japanisch, Isländisch...', suggested_by: 'user_1', votes: ['user_1'] }
        ],
        rounds: [
          {
            id: 'round_01',
            number: 1,
            title: 'Runde 01: Freie Wahl & Lieblingstracks',
            description: 'Zum großen Auftakt der Saison: Reiche deinen absoluten All-Time-Favorite oder aktuellen Lieblingssong ein.',
            phase: 'SUBMISSION',
            points_budget: 10,
            max_points_per_track: 3,
            max_one_per_artist: true,
            submission_deadline: subDeadline,
            voting_deadline: voteDeadline,
            tracks: [],
            callouts: [],
            ballots: []
          }
        ]
      }
    ],
    notifications_log: [],
    resolver_cache: {}
  };
}

function loadDb() {
  try {
    if (fs.existsSync(DB_FILE)) {
      return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error reading DB, re-initializing:', e);
  }
  const initial = createInitialDb();
  saveDb(initial);
  return initial;
}

function saveDb(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
}

let db = loadDb();

// ============================================================================
// HELPER: Generate Personalized Notifications on Phase Transitions
// ============================================================================
function emitRoundNotifications(league, round, eventType) {
  const ytIds = round.tracks.map(t => t.platforms?.youtube?.video_id).filter(Boolean);
  const ytPlaylistUrl = ytIds.length > 0
    ? `https://www.youtube.com/watch_videos?video_ids=${ytIds.slice(0, 50).join(',')}`
    : 'https://www.youtube.com';
  const spPlaylistUrl = round.tracks[0]?.platforms?.spotify?.url || 'https://open.spotify.com';

  for (const m of league.members) {
    if (m.status === 'PAUSED') continue;
    const user = db.users.find(u => u.id === m.user_id);
    if (!user) continue;

    const channels = [];
    if (user.notifications?.email_enabled) channels.push('E-Mail');
    if (user.notifications?.web_push_enabled) channels.push('Web-Push');
    if (channels.length === 0) continue; // User opted out of all notifications

    const isYt = user.preferred_platform === 'youtube';
    const playlistUrl = isYt ? ytPlaylistUrl : spPlaylistUrl;

    if (eventType === 'VOTING_STARTED') {
      db.notifications_log.unshift({
        id: 'notif_' + Date.now() + '_' + user.id,
        timestamp: new Date().toISOString(),
        type: 'PHASE_VOTING_READY',
        recipient_user_id: user.id,
        recipient_name: user.name,
        channels,
        platform_preference: user.preferred_platform,
        subject: `${league.name} · Runde 0${round.number}: Playlist „${round.title}“ ist bereit`,
        message: `Alle ${round.tracks.length} Songs wurden eingereicht und zufällig gemischt. Höre die Runde jetzt über deinen Standarddienst (${isYt ? 'YouTube Queue' : 'Spotify'}) und vergib deine ${round.points_budget} Punkte.`,
        playlist_url: playlistUrl
      });
    } else if (eventType === 'REVEAL_STARTED') {
      db.notifications_log.unshift({
        id: 'notif_' + Date.now() + '_' + user.id,
        timestamp: new Date().toISOString(),
        type: 'PHASE_REVEAL_READY',
        recipient_user_id: user.id,
        recipient_name: user.name,
        channels,
        platform_preference: user.preferred_platform,
        subject: `${league.name} · Runde 0${round.number}: Ergebnisse & Detektiv-Auflösung sind da!`,
        message: `Alle Stimmen für „${round.title}“ sind eingeloggt. Schau dir jetzt im Countdown- oder Gesamtmodus an, wer gewonnen hat und wer bei den Detektiv-Tipps richtig lag.`,
        playlist_url: playlistUrl
      });
    }
  }
}

// ============================================================================
// HELPER: Cross-Platform Link Resolver (Odesli API + Cache + Catalog Fallback)
// ============================================================================
function extractSpotifyTrackId(input) {
  const m = String(input).match(/spotify\.com\/(?:intl-[a-z]+\/)?track\/([a-zA-Z0-9]+)/i) ||
            String(input).match(/spotify:track:([a-zA-Z0-9]+)/i);
  return m ? m[1] : null;
}

function extractYoutubeVideoId(input) {
  const m = String(input).match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?.*v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/i);
  return m ? m[1] : null;
}

async function fetchYoutubeOEmbed(ytId) {
  if (!ytId) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${ytId}&format=json`;
    const resp = await fetch(oembedUrl, { signal: controller.signal });
    clearTimeout(timeout);
    if (resp.ok) {
      const data = await resp.json();
      const rawTitle = data.title || 'YouTube Track';
      let title = rawTitle;
      let artist = data.author_name || 'YouTube';
      if (rawTitle.includes(' - ')) {
        const parts = rawTitle.split(' - ');
        artist = parts[0].trim();
        title = parts.slice(1).join(' - ').trim();
      }
      return {
        title,
        artist,
        album: 'YouTube Video',
        cover_url: data.thumbnail_url || `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`,
        platforms: {
          spotify: null,
          youtube: {
            video_id: ytId,
            url: `https://www.youtube.com/watch?v=${ytId}`
          }
        },
        single_platform_only: true
      };
    }
  } catch (_) {}
  return null;
}

async function findYoutubeVideoId(artist, title) {
  if (!artist && !title) return null;
  try {
    const q = `${artist} ${title} audio`;
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" }
    });
    clearTimeout(timeout);
    if (resp.ok) {
      const html = await resp.text();
      const m = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
      return m ? m[1] : null;
    }
  } catch (_) {}
  return null;
}

async function searchUniversalCatalog(query) {
  if (!query || query.length < 2) return [];
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=8`;
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (resp.ok) {
      const data = await resp.json();
      return (data.results || []).map(r => ({
        title: r.trackName,
        artist: r.artistName,
        album: r.collectionName || 'Single / Album',
        cover_url: r.artworkUrl100 ? r.artworkUrl100.replace('100x100bb', '300x300bb') : makeAlbumCoverSvg(r.trackName, r.artistName),
        audio_preview_url: r.previewUrl || null,
        platforms: {
          spotify: null,
          youtube: {
            video_id: null,
            url: `https://www.youtube.com/results?search_query=${encodeURIComponent(r.artistName + ' ' + r.trackName)}`
          }
        }
      }));
    }
  } catch (_) {}
  return [];
}

async function resolveTrackInput(queryOrUrl) {
  const raw = String(queryOrUrl || '').trim();
  if (!raw) throw new Error('Bitte gib einen Songtitel oder Link ein.');

  // 1. Check local resolver cache first (0ms, 0 API quota)
  const cacheKey = raw.toLowerCase();
  if (db.resolver_cache && db.resolver_cache[cacheKey]) {
    return { ...db.resolver_cache[cacheKey], from_cache: true };
  }

  const spId = extractSpotifyTrackId(raw);
  const ytId = extractYoutubeVideoId(raw);

  // 2. Check curated catalog by ID or text match
  const catalogMatch = CATALOG.find(item => {
    if (spId && item.platforms.spotify?.track_id === spId) return true;
    if (ytId && item.platforms.youtube?.video_id === ytId) return true;
    const normQuery = normalizePart(raw);
    const normItem = normalizePart(`${item.artist} ${item.title}`);
    return normQuery.length > 2 && normItem.includes(normQuery);
  });

  if (catalogMatch) {
    const res = {
      title: catalogMatch.title,
      artist: catalogMatch.artist,
      album: catalogMatch.album,
      cover_url: catalogMatch.cover_url,
      platforms: JSON.parse(JSON.stringify(catalogMatch.platforms)),
      single_platform_only: false
    };
    db.resolver_cache[cacheKey] = res;
    saveDb(db);
    return res;
  }

  // 3. Try live Odesli / Songlink API if input is a Spotify or YouTube URL
  if (spId || ytId) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3500);
      const odesliUrl = `https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(raw)}`;
      const resp = await fetch(odesliUrl, { signal: controller.signal });
      clearTimeout(timeout);

      if (resp.ok) {
        const data = await resp.json();
        const spLink = data.linksByPlatform?.spotify;
        const ytLink = data.linksByPlatform?.youtube || data.linksByPlatform?.youtubeMusic;
        const resolvedSpId = spLink ? extractSpotifyTrackId(spLink.url) : spId;
        const resolvedYtId = ytLink ? extractYoutubeVideoId(ytLink.url) : ytId;

        const entityKey = data.entityUniqueId;
        const entity = (entityKey && data.entitiesByUniqueId?.[entityKey]) || Object.values(data.entitiesByUniqueId || {})[0] || {};
        const title = entity.title || 'Unbekannter Titel';
        const artist = entity.artistName || 'Unbekannter Interpret';

        const result = {
          title,
          artist,
          album: 'Single / Album',
          cover_url: makeAlbumCoverSvg(title, artist, '#D4A373', '#161615', 'circle'),
          platforms: {
            spotify: resolvedSpId
              ? { track_id: resolvedSpId, uri: `spotify:track:${resolvedSpId}`, url: `https://open.spotify.com/track/${resolvedSpId}` }
              : null,
            youtube: resolvedYtId
              ? { video_id: resolvedYtId, url: `https://www.youtube.com/watch?v=${resolvedYtId}` }
              : null
          },
          single_platform_only: !(resolvedSpId && resolvedYtId)
        };
        db.resolver_cache[cacheKey] = result;
        saveDb(db);
        return result;
      }
    } catch (_) {
      // Fallback below if external Odesli call times out
    }

    // Direct YouTube oEmbed fallback (instant metadata without API key)
    if (ytId) {
      const ytOembed = await fetchYoutubeOEmbed(ytId);
      if (ytOembed) {
        db.resolver_cache[cacheKey] = ytOembed;
        saveDb(db);
        return ytOembed;
      }
    }

    // Deterministic fallback for custom Spotify or YouTube links
    const fallbackTitle = spId ? `Spotify Track (${spId.slice(0, 6)})` : `YouTube Track (${ytId.slice(0, 6)})`;
    const fallbackArtist = 'Individueller Link';
    const result = {
      title: fallbackTitle,
      artist: fallbackArtist,
      album: 'Direktlink-Import',
      cover_url: makeAlbumCoverSvg(fallbackTitle, fallbackArtist, '#D4A373', '#161615', 'wave'),
      platforms: {
        spotify: spId
          ? { track_id: spId, uri: `spotify:track:${spId}`, url: `https://open.spotify.com/track/${spId}` }
          : { track_id: '7Jh1bpe7JJMuGhFi64neUt', uri: 'spotify:track:7Jh1bpe7JJMuGhFi64neUt', url: 'https://open.spotify.com/track/7Jh1bpe7JJMuGhFi64neUt' },
        youtube: ytId
          ? { video_id: ytId, url: `https://www.youtube.com/watch?v=${ytId}` }
          : { video_id: 'bsYp9q3QNaQ', url: 'https://www.youtube.com/watch?v=bsYp9q3QNaQ' }
      },
      single_platform_only: false
    };
    return result;
  }

  // 4. Try live search API (Spotify or YouTube) if configured
  try {
    const liveHits = await searchSpotifyApi(raw);
    if (liveHits.length > 0) {
      const top = liveHits[0];
      if (top.platforms?.spotify?.url) {
        try {
          const odesliRes = await fetch(`https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(top.platforms.spotify.url)}`);
          if (odesliRes.ok) {
            const odesliData = await odesliRes.json();
            const ytLink = odesliData.linksByPlatform?.youtube || odesliData.linksByPlatform?.youtubeMusic;
            if (ytLink) {
              top.platforms.youtube = {
                video_id: extractYoutubeVideoId(ytLink.url),
                url: ytLink.url
              };
            }
          }
        } catch (_) {}
      }
      return top;
    }
  } catch (_) {}

  try {
    const ytHits = await searchYouTubeApi(raw);
    if (ytHits.length > 0) return ytHits[0];
  } catch (_) {}

  try {
    const uniHits = await searchUniversalCatalog(raw);
    if (uniHits.length > 0) {
      const top = uniHits[0];
      const ytId = await findYoutubeVideoId(top.artist, top.title);
      if (ytId) {
        top.platforms.youtube = {
          video_id: ytId,
          url: `https://www.youtube.com/watch?v=${ytId}`
        };
      }
      return top;
    }
  } catch (_) {}

  // 5. Free-text custom song entry fallback
  const parts = raw.split(/[-–—]/).map(s => s.trim()).filter(Boolean);
  const artist = parts.length > 1 ? parts[0] : 'Unbekannter Interpret';
  const title = parts.length > 1 ? parts.slice(1).join(' - ') : raw;
  return {
    title,
    artist,
    album: 'Katalog-Eintrag',
    cover_url: makeAlbumCoverSvg(title, artist, '#D4A373', '#161615', 'grid'),
    platforms: {
      spotify: { track_id: '1TfqLAPs4K3s2rJMoCokcS', uri: 'spotify:track:1TfqLAPs4K3s2rJMoCokcS', url: 'https://open.spotify.com/track/1TfqLAPs4K3s2rJMoCokcS' },
      youtube: { video_id: 'qeMFqkcPYcg', url: 'https://www.youtube.com/watch?v=qeMFqkcPYcg' }
    },
    single_platform_only: false
  };
}

// ============================================================================
// SPOTIFY WEB API CLIENT CREDENTIALS INTEGRATION (OPTIONAL LIVE SEARCH)
// ============================================================================
let cachedSpotifyToken = null;
let spotifyTokenExpiresAt = 0;

async function getSpotifyApiToken() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  if (cachedSpotifyToken && Date.now() < spotifyTokenExpiresAt - 60000) {
    return cachedSpotifyToken;
  }

  try {
    const creds = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const resp = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${creds}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    });
    if (resp.ok) {
      const data = await resp.json();
      cachedSpotifyToken = data.access_token;
      spotifyTokenExpiresAt = Date.now() + (data.expires_in * 1000);
      return cachedSpotifyToken;
    }
  } catch (err) {
    console.error('Spotify token fetch error:', err.message);
  }
  return null;
}

async function searchSpotifyApi(query) {
  const token = await getSpotifyApiToken();
  if (!token) return [];
  try {
    const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=8`;
    const resp = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (resp.ok) {
      const data = await resp.json();
      const items = data.tracks?.items || [];
      return items.map(t => ({
        title: t.name,
        artist: t.artists.map(a => a.name).join(', '),
        album: t.album.name,
        cover_url: t.album.images?.[0]?.url || makeAlbumCoverSvg(t.name, t.artists[0]?.name),
        platforms: {
          spotify: {
            track_id: t.id,
            uri: t.uri,
            url: t.external_urls?.spotify || `https://open.spotify.com/track/${t.id}`
          },
          youtube: null
        }
      }));
    }
  } catch (err) {
    console.error('Spotify search error:', err.message);
  }
  return [];
}

async function searchYouTubeApi(query) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return [];
  try {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=8&q=${encodeURIComponent(query)}&key=${apiKey}`;
    const resp = await fetch(url);
    if (resp.ok) {
      const data = await resp.json();
      const items = data.items || [];
      return items.filter(it => it.id?.videoId).map(item => {
        const vid = item.id.videoId;
        const rawTitle = item.snippet?.title || 'YouTube Track';
        const title = rawTitle.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
        const artist = item.snippet?.channelTitle || 'YouTube';
        return {
          title,
          artist,
          album: 'YouTube Video',
          cover_url: item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || makeAlbumCoverSvg(title, artist),
          platforms: {
            spotify: null,
            youtube: {
              video_id: vid,
              url: `https://www.youtube.com/watch?v=${vid}`
            }
          }
        };
      });
    }
  } catch (err) {
    console.error('YouTube search error:', err.message);
  }
  return [];
}

// ============================================================================
// HTTP SERVER & API ROUTES
// ============================================================================
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 5 * 1024 * 1024) req.destroy();
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // --- GET /api/state ---
  if (req.method === 'GET' && pathname === '/api/state') {
    return sendJson(res, 200, { db, catalog: CATALOG });
  }

  // --- GET /api/search?q=... ---
  if (req.method === 'GET' && pathname === '/api/search') {
    const q = (parsedUrl.searchParams.get('q') || '').trim();
    const platform = (parsedUrl.searchParams.get('platform') || 'all').toLowerCase();
    if (!q) return sendJson(res, 200, { results: CATALOG.slice(0, 8) });

    // 1. Instant Direct URL resolution (YouTube or Spotify links)
    const directSpId = extractSpotifyTrackId(q);
    const directYtId = extractYoutubeVideoId(q);
    if (directSpId || directYtId) {
      try {
        const resolved = await resolveTrackInput(q);
        if (resolved) {
          return sendJson(res, 200, { results: [resolved], source: 'direct_url' });
        }
      } catch (_) {}
    }

    // 2. Spotify live API
    let spotifyResults = [];
    if (platform !== 'youtube') {
      spotifyResults = await searchSpotifyApi(q);
    }

    // 3. YouTube live API (if key configured)
    let youtubeResults = [];
    if (platform === 'youtube' || (!spotifyResults.length && process.env.YOUTUBE_API_KEY)) {
      youtubeResults = await searchYouTubeApi(q);
    }

    const liveResults = [...spotifyResults, ...youtubeResults];
    if (liveResults.length > 0) {
      return sendJson(res, 200, { results: liveResults.slice(0, 8), source: 'live_api' });
    }

    // 4. Universal open music catalog (zero auth, 100% free search for any song)
    const universalResults = await searchUniversalCatalog(q);
    if (universalResults.length > 0) {
      return sendJson(res, 200, { results: universalResults.slice(0, 8), source: 'universal_api' });
    }

    // 5. Curated local catalog fallback
    const qLower = q.toLowerCase();
    const matches = CATALOG.filter(item =>
      item.title.toLowerCase().includes(qLower) ||
      item.artist.toLowerCase().includes(qLower) ||
      item.album.toLowerCase().includes(qLower)
    );
    return sendJson(res, 200, { results: matches.slice(0, 8), source: 'catalog' });
  }

  // --- POST /api/resolve ---
  if (req.method === 'POST' && pathname === '/api/resolve') {
    try {
      const body = await parseBody(req);
      let resolved = null;
      if (body.track) {
        resolved = { ...body.track };
        if (!resolved.platforms?.youtube?.video_id) {
          const ytId = await findYoutubeVideoId(resolved.artist, resolved.title);
          if (ytId) {
            resolved.platforms = resolved.platforms || {};
            resolved.platforms.youtube = {
              video_id: ytId,
              url: `https://www.youtube.com/watch?v=${ytId}`
            };
          }
        }
      } else {
        resolved = await resolveTrackInput(body.queryOrUrl);
      }
      return sendJson(res, 200, { resolved });
    } catch (err) {
      return sendJson(res, 400, { error: err.message || 'Auflösung fehlgeschlagen' });
    }
  }

  // --- POST /api/action ---
  if (req.method === 'POST' && pathname === '/api/action') {
    try {
      const body = await parseBody(req);
      const { type, payload } = body;

      const getLeagueAndRound = (leagueId, roundId) => {
        const league = db.leagues.find(l => l.id === leagueId) || db.leagues[0];
        const round = league.rounds.find(r => r.id === roundId) || league.rounds.find(r => r.id === league.active_round_id) || league.rounds[0];
        return { league, round };
      };

      // 1. Update User Preferences (Platform, Theme, Notifications, Name)
      if (type === 'UPDATE_USER_PREFS') {
        const user = db.users.find(u => u.id === payload.user_id);
        if (user) {
          if (payload.preferred_platform) user.preferred_platform = payload.preferred_platform;
          if (payload.preferred_theme) user.preferred_theme = payload.preferred_theme;
          if (payload.name) user.name = String(payload.name).trim();
          if (payload.email) user.email = String(payload.email).trim();
          if (payload.notifications) {
            user.notifications = { ...user.notifications, ...payload.notifications };
          }
          saveDb(db);
        }
        return sendJson(res, 200, { db });
      }

      // 2. Join League via Invite Code / Create User
      if (type === 'JOIN_LEAGUE') {
        const code = String(payload.invite_code || '').trim().toUpperCase();
        const league = db.leagues.find(l => l.invite_code.toUpperCase() === code);
        if (!league) {
          return sendJson(res, 400, { error: `Ungültiger Liga-Einladungscode „${code}“. (Tipp: SYNTH84 oder STUDIOB)` });
        }
        let user = db.users.find(u => u.email.toLowerCase() === String(payload.email || '').trim().toLowerCase());
        if (!user) {
          user = {
            id: 'user_' + Date.now(),
            name: String(payload.name || 'Neuer Spieler').trim(),
            email: String(payload.email || 'neu@plattenrunde.de').trim(),
            preferred_platform: payload.preferred_platform || 'spotify',
            preferred_theme: payload.preferred_theme || 'dark',
            notifications: {
              email_enabled: payload.email_enabled !== false,
              web_push_enabled: payload.web_push_enabled !== false,
              deadline_reminders_enabled: true
            },
            bookmarks: []
          };
          db.users.push(user);
        }
        if (!league.members.some(m => m.user_id === user.id)) {
          league.members.push({ user_id: user.id, role: 'PLAYER', status: 'ACTIVE' });
        }
        saveDb(db);
        return sendJson(res, 200, { db, joined_user_id: user.id, joined_league_id: league.id });
      }

      // 3. GDPR Account Anonymization ("Ehemaliges Mitglied")
      if (type === 'DELETE_USER_ACCOUNT') {
        const user = db.users.find(u => u.id === payload.user_id);
        if (user) {
          user.name = 'Ehemaliges Mitglied';
          user.email = `deleted_${user.id}@anonymized.local`;
          user.notifications = { email_enabled: false, web_push_enabled: false, deadline_reminders_enabled: false };
          user.bookmarks = [];
          db.leagues.forEach(l => {
            const mem = l.members.find(m => m.user_id === user.id);
            if (mem) mem.status = 'PAUSED';
          });
          saveDb(db);
        }
        return sendJson(res, 200, { db });
      }

      // 4. Submit or Update Song + Optional Callout Prediction (Phase 01)
      if (type === 'SUBMIT_TRACK') {
        const { league, round } = getLeagueAndRound(payload.league_id, payload.round_id);
        const userId = payload.user_id;
        const trackData = payload.track;
        const normKey = normalizeSongKey(trackData.artist, trackData.title);
        const normArtist = normalizeArtistKey(trackData.artist);

        // Season-wide duplicate check across all rounds in this league (excluding own current submission in this round)
        for (const r of league.rounds) {
          for (const existing of r.tracks) {
            if (r.id === round.id && existing.submitted_by === userId) continue;
            const sameNorm = existing.normalized_key === normKey;
            const sameSp = trackData.platforms?.spotify?.track_id && existing.platforms?.spotify?.track_id === trackData.platforms.spotify.track_id;
            const sameYt = trackData.platforms?.youtube?.video_id && existing.platforms?.youtube?.video_id === trackData.platforms.youtube.video_id;

            if (sameNorm || sameSp || sameYt) {
              const whereMsg = r.id === round.id
                ? 'wurde bereits in dieser Runde von einem anderen Mitspieler eingereicht'
                : `lief bereits in Runde 0${r.number} („${r.title}“) dieser Saison`;
              return sendJson(res, 400, {
                error: `Duplikat-Sperre: „${trackData.title}“ von ${trackData.artist} ${whereMsg} (inkl. Remaster-/Versions-Abgleich).`
              });
            }
          }
        }

        // Optional per-round Artist Lock check ("Max. 1 Song pro Interpret")
        if (round.max_one_per_artist) {
          const sameArtistTrack = round.tracks.find(
            t => t.submitted_by !== userId && normalizeArtistKey(t.artist) === normArtist
          );
          if (sameArtistTrack) {
            return sendJson(res, 400, {
              error: `Interpreten-Sperre aktiv: Von „${trackData.artist}“ wurde in dieser Runde bereits ein anderer Song eingereicht.`
            });
          }
        }

        // Upsert user's track in current round
        const existingIdx = round.tracks.findIndex(t => t.submitted_by === userId);
        const newTrackObj = {
          id: existingIdx >= 0 ? round.tracks[existingIdx].id : `track_${round.id}_${Date.now()}`,
          shuffle_order: existingIdx >= 0 ? round.tracks[existingIdx].shuffle_order : round.tracks.length + 1,
          title: trackData.title,
          artist: trackData.artist,
          album: trackData.album || 'Single / Album',
          normalized_key: normKey,
          cover_url: trackData.cover_url || makeAlbumCoverSvg(trackData.title, trackData.artist),
          pitch: String(trackData.pitch || '').trim(),
          pitch_visibility: trackData.pitch_visibility === 'REVEAL' ? 'REVEAL' : 'VOTING',
          submitted_by: userId,
          platforms: trackData.platforms,
          replies: existingIdx >= 0 ? round.tracks[existingIdx].replies : []
        };

        if (existingIdx >= 0) {
          round.tracks[existingIdx] = newTrackObj;
        } else {
          round.tracks.push(newTrackObj);
        }

        // Upsert optional Callout Prediction ("Offensichtlicher Song" - spy-proof: never reveals if already submitted!)
        round.callouts = round.callouts.filter(c => c.user_id !== userId);
        if (payload.callout && payload.callout.title && payload.callout.artist) {
          const calloutNorm = normalizeSongKey(payload.callout.artist, payload.callout.title);
          if (calloutNorm === normKey) {
            return sendJson(res, 400, { error: 'Du kannst nicht deinen eigenen eingereichten Song als „Offensichtlichen Song“ tippen.' });
          }
          round.callouts.push({
            user_id: userId,
            predicted_track: {
              title: payload.callout.title,
              artist: payload.callout.artist,
              normalized_key: calloutNorm,
              cover_url: payload.callout.cover_url || makeAlbumCoverSvg(payload.callout.title, payload.callout.artist),
              spotify_track_id: payload.callout.platforms?.spotify?.track_id || null,
              youtube_video_id: payload.callout.platforms?.youtube?.video_id || null
            }
          });
        }

        // Check if ALL active players have now submitted -> auto-advance to VOTING
        const activeMemberIds = league.members.filter(m => m.status === 'ACTIVE').map(m => m.user_id);
        const allSubmitted = activeMemberIds.every(uid => round.tracks.some(t => t.submitted_by === uid));
        let autoAdvanced = false;
        if (round.phase === 'SUBMISSION' && allSubmitted && payload.auto_advance_if_complete) {
          round.phase = 'VOTING';
          emitRoundNotifications(league, round, 'VOTING_STARTED');
          autoAdvanced = true;
        }

        saveDb(db);
        return sendJson(res, 200, { db, autoAdvanced });
      }

      // 5. Save Vote Ballot (DRAFT vs. SUBMITTED)
      if (type === 'SAVE_BALLOT') {
        const { league, round } = getLeagueAndRound(payload.league_id, payload.round_id);
        const voterId = payload.voter_id;
        const mode = payload.mode === 'SUBMITTED' ? 'SUBMITTED' : 'DRAFT';
        const incomingVotes = Array.isArray(payload.votes) ? payload.votes : [];

        // Validate points
        let totalPoints = 0;
        const seenGuesses = new Set();
        for (const v of incomingVotes) {
          const track = round.tracks.find(t => t.id === v.track_id);
          if (!track) continue;
          if (track.submitted_by === voterId && v.points > 0) {
            return sendJson(res, 400, { error: 'Für den eigenen Beitrag können keine Punkte vergeben werden.' });
          }
          const pts = Math.max(0, Math.min(round.max_points_per_track, Number(v.points) || 0));
          totalPoints += pts;
          if (v.guessed_user_id) {
            if (seenGuesses.has(v.guessed_user_id)) {
              return sendJson(res, 400, { error: 'Jeder Mitspieler darf pro Runde nur maximal 1× als Tipp zugeordnet werden.' });
            }
            seenGuesses.add(v.guessed_user_id);
          }
        }

        if (totalPoints > round.points_budget) {
          return sendJson(res, 400, { error: `Du hast ${totalPoints} Punkte verteilt – maximal erlaubt sind ${round.points_budget} Punkte.` });
        }

        if (mode === 'SUBMITTED' && totalPoints !== round.points_budget) {
          return sendJson(res, 400, { error: `Zum finalen Absenden müssen exakt alle ${round.points_budget} von ${round.points_budget} Punkten verteilt sein (aktuell: ${totalPoints}).` });
        }

        const existingIdx = round.ballots.findIndex(b => b.voter_id === voterId);
        if (existingIdx >= 0 && round.ballots[existingIdx].status === 'SUBMITTED') {
          return sendJson(res, 400, { error: 'Deine Wertung wurde bereits final abgesendet und ist gesperrt. (Der Host kann sie im Notfall entsperren).' });
        }

        const nowIso = new Date().toISOString();
        const ballotObj = {
          voter_id: voterId,
          status: mode,
          saved_at: nowIso,
          submitted_at: mode === 'SUBMITTED' ? nowIso : null,
          votes: incomingVotes
        };

        if (existingIdx >= 0) {
          round.ballots[existingIdx] = ballotObj;
        } else {
          round.ballots.push(ballotObj);
        }

        // Check if ALL active players who submitted a song in this round have now finalized their ballot -> auto-advance to REVEAL
        const activeSubmitterIds = round.tracks.map(t => t.submitted_by).filter(uid => {
          const mem = league.members.find(m => m.user_id === uid);
          return !mem || mem.status === 'ACTIVE';
        });
        const allVotedFinal = activeSubmitterIds.length > 0 && activeSubmitterIds.every(uid => {
          const b = round.ballots.find(bal => bal.voter_id === uid);
          return b && b.status === 'SUBMITTED';
        });

        let autoAdvanced = false;
        if (round.phase === 'VOTING' && mode === 'SUBMITTED' && allVotedFinal) {
          round.phase = 'REVEAL';
          emitRoundNotifications(league, round, 'REVEAL_STARTED');
          autoAdvanced = true;
        }

        saveDb(db);
        return sendJson(res, 200, { db, autoAdvanced });
      }

      // 6. Switch Phase / Host Controls (Advance Phase, Unlock Ballot, Repair Track Link, Extend Deadline, Toggle Member Pause)
      if (type === 'SET_ROUND_PHASE') {
        const { league, round } = getLeagueAndRound(payload.league_id, payload.round_id);
        const newPhase = payload.phase;
        if (['SUBMISSION', 'VOTING', 'REVEAL', 'UPCOMING'].includes(newPhase)) {
          // If advancing from VOTING to REVEAL on deadline expiry: auto-promote complete 10/10 drafts!
          if (round.phase === 'VOTING' && newPhase === 'REVEAL') {
            round.ballots.forEach(b => {
              if (b.status === 'DRAFT') {
                const sum = (b.votes || []).reduce((acc, v) => acc + (Number(v.points) || 0), 0);
                if (sum === round.points_budget) {
                  b.status = 'SUBMITTED';
                  b.submitted_at = new Date().toISOString();
                }
              }
            });
            emitRoundNotifications(league, round, 'REVEAL_STARTED');
          } else if (round.phase === 'SUBMISSION' && newPhase === 'VOTING') {
            emitRoundNotifications(league, round, 'VOTING_STARTED');
          }
          round.phase = newPhase;
          league.active_round_id = round.id;
          saveDb(db);
        }
        return sendJson(res, 200, { db });
      }

      if (type === 'HOST_UNLOCK_BALLOT') {
        const { round } = getLeagueAndRound(payload.league_id, payload.round_id);
        const ballot = round.ballots.find(b => b.voter_id === payload.voter_id);
        if (ballot) {
          ballot.status = 'DRAFT';
          ballot.submitted_at = null;
          saveDb(db);
        }
        return sendJson(res, 200, { db });
      }

      if (type === 'HOST_REPAIR_LINK') {
        const { round } = getLeagueAndRound(payload.league_id, payload.round_id);
        const track = round.tracks.find(t => t.id === payload.track_id);
        if (track) {
          if (payload.spotify_input) {
            const spId = extractSpotifyTrackId(payload.spotify_input) || payload.spotify_input.trim();
            track.platforms.spotify = {
              track_id: spId,
              uri: `spotify:track:${spId}`,
              url: `https://open.spotify.com/track/${spId}`
            };
          }
          if (payload.youtube_input) {
            const ytId = extractYoutubeVideoId(payload.youtube_input) || payload.youtube_input.trim();
            track.platforms.youtube = {
              video_id: ytId,
              url: `https://www.youtube.com/watch?v=${ytId}`
            };
          }
          saveDb(db);
        }
        return sendJson(res, 200, { db });
      }

      if (type === 'HOST_EXTEND_DEADLINE') {
        const { round } = getLeagueAndRound(payload.league_id, payload.round_id);
        const field = round.phase === 'SUBMISSION' ? 'submission_deadline' : 'voting_deadline';
        const current = new Date(round[field] || Date.now());
        current.setHours(current.getHours() + (Number(payload.hours) || 24));
        round[field] = current.toISOString();
        saveDb(db);
        return sendJson(res, 200, { db });
      }

      if (type === 'HOST_TOGGLE_MEMBER_STATUS') {
        const { league } = getLeagueAndRound(payload.league_id, null);
        const member = league.members.find(m => m.user_id === payload.user_id);
        if (member) {
          member.status = member.status === 'PAUSED' ? 'ACTIVE' : 'PAUSED';
          saveDb(db);
        }
        return sendJson(res, 200, { db });
      }

      if (type === 'HOST_DELEGATE_THEME_RIGHT') {
        const { league } = getLeagueAndRound(payload.league_id, null);
        league.next_theme_nominated_by = payload.user_id;
        saveDb(db);
        return sendJson(res, 200, { db });
      }

      if (type === 'HOST_SEND_REMINDER') {
        const { league, round } = getLeagueAndRound(payload.league_id, payload.round_id);
        const targetUser = db.users.find(u => u.id === payload.user_id);
        if (targetUser) {
          db.notifications_log.unshift({
            id: 'notif_' + Date.now(),
            timestamp: new Date().toISOString(),
            type: 'DEADLINE_REMINDER',
            recipient_user_id: targetUser.id,
            recipient_name: targetUser.name,
            channels: ['E-Mail', 'Web-Push'],
            platform_preference: targetUser.preferred_platform,
            subject: `Erinnerung: ${league.name} · Runde 0${round.number} wartet auf dich`,
            message: round.phase === 'SUBMISSION'
              ? `Bitte reiche noch deinen Song für „${round.title}“ ein.`
              : `Fast alle Stimmen sind da! Bitte sende noch deine ${round.points_budget} Punkte für „${round.title}“ final ab.`,
            playlist_url: ''
          });
          saveDb(db);
        }
        return sendJson(res, 200, { db });
      }

      // 7. Post-Reveal Reply Comments (Phase 03)
      if (type === 'ADD_TRACK_REPLY') {
        const { round } = getLeagueAndRound(payload.league_id, payload.round_id);
        const track = round.tracks.find(t => t.id === payload.track_id);
        const text = String(payload.text || '').trim();
        if (track && text) {
          track.replies = track.replies || [];
          track.replies.push({
            id: 'rep_' + Date.now(),
            user_id: payload.user_id,
            text,
            created_at: new Date().toISOString()
          });
          saveDb(db);
        }
        return sendJson(res, 200, { db });
      }

      // 8. Toggle Personal Bookmark ("Merkliste")
      if (type === 'TOGGLE_BOOKMARK') {
        const user = db.users.find(u => u.id === payload.user_id);
        if (user) {
          user.bookmarks = user.bookmarks || [];
          const idx = user.bookmarks.indexOf(payload.track_id);
          if (idx >= 0) user.bookmarks.splice(idx, 1);
          else user.bookmarks.push(payload.track_id);
          saveDb(db);
        }
        return sendJson(res, 200, { db });
      }

      // 9. Theme Ideas Pool (Suggest & Upvote)
      if (type === 'ADD_THEME_IDEA') {
        const { league } = getLeagueAndRound(payload.league_id, null);
        const title = String(payload.title || '').trim();
        if (title) {
          league.theme_ideas.unshift({
            id: 'idea_' + Date.now(),
            title,
            description: String(payload.description || '').trim(),
            suggested_by: payload.user_id,
            votes: [payload.user_id]
          });
          saveDb(db);
        }
        return sendJson(res, 200, { db });
      }

      if (type === 'TOGGLE_IDEA_VOTE') {
        const { league } = getLeagueAndRound(payload.league_id, null);
        const idea = league.theme_ideas.find(i => i.id === payload.idea_id);
        if (idea) {
          const idx = idea.votes.indexOf(payload.user_id);
          if (idx >= 0) idea.votes.splice(idx, 1);
          else idea.votes.push(payload.user_id);
          saveDb(db);
        }
        return sendJson(res, 200, { db });
      }

      if (type === 'PROMOTE_IDEA_TO_ROUND') {
        const { league } = getLeagueAndRound(payload.league_id, null);
        const idea = league.theme_ideas.find(i => i.id === payload.idea_id);
        if (idea) {
          const nextNum = league.rounds.length + 1;
          const newRound = {
            id: `round_0${nextNum}_${Date.now()}`,
            number: nextNum,
            title: idea.title,
            description: idea.description || 'Aus der gemeinsamen Motto-Ideenbox gewählt.',
            phase: 'UPCOMING',
            points_budget: Number(payload.points_budget) || 10,
            max_points_per_track: 3,
            max_one_per_artist: payload.max_one_per_artist !== false,
            submission_deadline: new Date(Date.now() + 7 * 86400000).toISOString(),
            voting_deadline: new Date(Date.now() + 11 * 86400000).toISOString(),
            tracks: [],
            callouts: [],
            ballots: []
          };
          league.rounds.push(newRound);
          league.theme_ideas = league.theme_ideas.filter(i => i.id !== idea.id);
          saveDb(db);
        }
        return sendJson(res, 200, { db });
      }

      if (type === 'HOST_RESET_TO_CLEAN_SEASON') {
        const clean = createInitialDb();
        const existingHost = db.users.find(u => u.id === payload.user_id) || db.users[0];
        if (existingHost) {
          clean.users[0].id = existingHost.id || 'user_1';
          clean.users[0].name = existingHost.name || 'Philipp';
          clean.users[0].email = existingHost.email || 'philipp@byfanger57.de';
          clean.users[0].preferred_platform = existingHost.preferred_platform || 'spotify';
          clean.users[0].preferred_theme = existingHost.preferred_theme || 'dark';
          clean.leagues[0].host_user_id = clean.users[0].id;
          clean.leagues[0].members[0].user_id = clean.users[0].id;
          clean.leagues[0].next_theme_nominated_by = clean.users[0].id;
        }
        if (payload.first_round_title) {
          clean.leagues[0].rounds[0].title = payload.first_round_title;
        }
        if (payload.first_round_desc) {
          clean.leagues[0].rounds[0].description = payload.first_round_desc;
        }
        saveDb(db);
        return sendJson(res, 200, { db });
      }

      if (type === 'HOST_UPDATE_ROUND') {
        const { round } = getLeagueAndRound(payload.league_id, payload.round_id);
        if (round) {
          if (payload.title) round.title = String(payload.title).trim();
          if (payload.description !== undefined) round.description = String(payload.description).trim();
          if (payload.points_budget) round.points_budget = Number(payload.points_budget) || 10;
          if (payload.max_one_per_artist !== undefined) round.max_one_per_artist = Boolean(payload.max_one_per_artist);
          saveDb(db);
        }
        return sendJson(res, 200, { db });
      }

      if (type === 'HOST_CREATE_ROUND') {
        const { league } = getLeagueAndRound(payload.league_id, null);
        const nextNum = league.rounds.length + 1;
        const newRound = {
          id: `round_0${nextNum}_${Date.now()}`,
          number: nextNum,
          title: String(payload.title || `Runde 0${nextNum}`).trim(),
          description: String(payload.description || '').trim(),
          phase: payload.start_immediately ? 'SUBMISSION' : 'UPCOMING',
          points_budget: 10,
          max_points_per_track: 3,
          max_one_per_artist: true,
          submission_deadline: new Date(Date.now() + 7 * 86400000).toISOString(),
          voting_deadline: new Date(Date.now() + 11 * 86400000).toISOString(),
          tracks: [],
          callouts: [],
          ballots: []
        };
        league.rounds.push(newRound);
        if (payload.start_immediately) {
          league.active_round_id = newRound.id;
        }
        saveDb(db);
        return sendJson(res, 200, { db, created_round_id: newRound.id });
      }

      if (type === 'HOST_DELETE_ROUND') {
        const { league, round } = getLeagueAndRound(payload.league_id, payload.round_id);
        if (round && league.rounds.length > 1) {
          league.rounds = league.rounds.filter(r => r.id !== round.id);
          league.rounds.forEach((r, idx) => { r.number = idx + 1; });
          if (league.active_round_id === round.id) {
            league.active_round_id = league.rounds[0].id;
          }
          saveDb(db);
        }
        return sendJson(res, 200, { db });
      }

      return sendJson(res, 400, { error: 'Unbekannte Aktion' });
    } catch (err) {
      return sendJson(res, 500, { error: err.message || 'Serverfehler' });
    }
  }

  // --- Static Files ---
  let filePath = pathname === '/' ? '/index.html' : pathname;
  const fullPath = path.join(__dirname, 'public', path.normalize(filePath).replace(/^(\.\.[\/\\])+/, ''));
  if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
    const ext = path.extname(fullPath);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    fs.createReadStream(fullPath).pipe(res);
  } else {
    const indexFallback = path.join(__dirname, 'public', 'index.html');
    if (fs.existsSync(indexFallback)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      fs.createReadStream(indexFallback).pipe(res);
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Listening Club Server running at http://localhost:${PORT}`);
});
