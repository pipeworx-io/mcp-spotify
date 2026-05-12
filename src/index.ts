interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * Spotify MCP — Web API via client_credentials OAuth
 *
 * client_credentials gives access to catalog / public endpoints (search,
 * tracks, artists, albums, audio features, top tracks) without any user
 * scope. User-specific stuff (saved tracks, playlists you own) requires the
 * full OAuth code flow and is out of scope here.
 *
 * Auth: pass `_apiKey=<client_id>:<client_secret>` (colon-joined). The pack
 * exchanges them for a bearer access_token (1h TTL) and caches it in worker
 * memory keyed by client_id.
 *
 * API: https://developer.spotify.com/documentation/web-api
 *
 * Tools:
 * - search:                tracks / albums / artists / playlists / podcasts
 * - get_track:             single track
 * - get_artist:            artist record
 * - get_album:             album record + tracks
 * - get_artist_top_tracks: top N tracks for an artist by market
 * - get_audio_features:    tempo / key / energy / danceability / etc.
 */


const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const API_URL = 'https://api.spotify.com/v1';

const tools: McpToolExport['tools'] = [
  {
    name: 'search',
    description:
      'Search the Spotify catalog. type = comma-separated of album, artist, playlist, track, show, episode, audiobook. Returns matched items in named sections.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        type: { type: 'string', description: 'Comma-separated types (default "track")' },
        market: { type: 'string', description: 'ISO 3166-1 alpha-2 market code (e.g., "US")' },
        limit: { type: 'number', description: '1-50 (default 20)' },
        offset: { type: 'number', description: '0-1000 (default 0)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_track',
    description: 'Single track by Spotify ID. Returns artists, album, popularity, preview URL, duration.',
    inputSchema: {
      type: 'object',
      properties: {
        track_id: { type: 'string', description: 'Spotify track ID (base62)' },
        market: { type: 'string', description: 'Market for availability' },
      },
      required: ['track_id'],
    },
  },
  {
    name: 'get_artist',
    description: 'Artist record: name, genres, popularity, followers, images.',
    inputSchema: {
      type: 'object',
      properties: {
        artist_id: { type: 'string', description: 'Spotify artist ID' },
      },
      required: ['artist_id'],
    },
  },
  {
    name: 'get_album',
    description: 'Album record with tracklist.',
    inputSchema: {
      type: 'object',
      properties: {
        album_id: { type: 'string', description: 'Spotify album ID' },
        market: { type: 'string', description: 'Market for availability' },
      },
      required: ['album_id'],
    },
  },
  {
    name: 'get_artist_top_tracks',
    description: 'Top tracks for an artist in a market (Spotify recommendation).',
    inputSchema: {
      type: 'object',
      properties: {
        artist_id: { type: 'string', description: 'Spotify artist ID' },
        market: { type: 'string', description: 'ISO market code (default "US")' },
      },
      required: ['artist_id'],
    },
  },
  {
    name: 'get_audio_features',
    description:
      'Audio features for a track: tempo (BPM), key, mode (major/minor), time_signature, energy, danceability, valence, acousticness, instrumentalness, liveness, speechiness, loudness.',
    inputSchema: {
      type: 'object',
      properties: {
        track_id: { type: 'string', description: 'Spotify track ID' },
      },
      required: ['track_id'],
    },
  },
];

// ── Token cache (per worker isolate) ──────────────────────────────────
interface CachedToken {
  access_token: string;
  expires_at: number;
}
const TOKEN_CACHE = new Map<string, CachedToken>();
const TOKEN_TTL_MS = 55 * 60 * 1000; // Spotify tokens are 1h — refresh slightly early

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const apiKey = (args._apiKey as string | undefined)?.trim();
  if (!apiKey) {
    throw new Error(
      'Spotify requires client credentials. Pass ?_apiKey=<client_id>:<client_secret> on the gateway URL. Register an app at https://developer.spotify.com/dashboard.',
    );
  }
  const colon = apiKey.indexOf(':');
  if (colon < 1 || colon === apiKey.length - 1) {
    throw new Error('Spotify _apiKey must be "client_id:client_secret" (colon-joined).');
  }
  const clientId = apiKey.slice(0, colon);
  const clientSecret = apiKey.slice(colon + 1);

  const token = await getAccessToken(clientId, clientSecret);
  switch (name) {
    case 'search':
      return search(token, args);
    case 'get_track':
      return spotifyGet(token, `/tracks/${encodeURIComponent(reqStr(args, 'track_id', '"4cOdK2wGLETKBW3PvgPWqT"'))}`, marketParams(args));
    case 'get_artist':
      return spotifyGet(token, `/artists/${encodeURIComponent(reqStr(args, 'artist_id', '"4Z8W4fKeB5YxbusRsdQVPb"'))}`, new URLSearchParams());
    case 'get_album':
      return spotifyGet(token, `/albums/${encodeURIComponent(reqStr(args, 'album_id', '"4aawyAB9vmqN3uQ7FjRGTy"'))}`, marketParams(args));
    case 'get_artist_top_tracks': {
      const id = reqStr(args, 'artist_id', '"4Z8W4fKeB5YxbusRsdQVPb"');
      const params = new URLSearchParams({ market: (args.market as string) ?? 'US' });
      return spotifyGet(token, `/artists/${encodeURIComponent(id)}/top-tracks`, params);
    }
    case 'get_audio_features':
      return spotifyGet(
        token,
        `/audio-features/${encodeURIComponent(reqStr(args, 'track_id', '"4cOdK2wGLETKBW3PvgPWqT"'))}`,
        new URLSearchParams(),
      );
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function reqStr(args: Record<string, unknown>, key: string, example: string): string {
  const v = args[key];
  if (typeof v !== 'string' || !v.trim()) {
    throw new Error(`Required argument "${key}" is missing or empty. Pass a string like ${example}.`);
  }
  return v;
}

function marketParams(args: Record<string, unknown>): URLSearchParams {
  const p = new URLSearchParams();
  if (args.market) p.set('market', String(args.market));
  return p;
}

async function getAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const cached = TOKEN_CACHE.get(clientId);
  if (cached && cached.expires_at > Date.now()) return cached.access_token;

  const basic = btoa(`${clientId}:${clientSecret}`);
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Spotify OAuth: ${res.status} ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { access_token?: string; expires_in?: number; token_type?: string };
  if (!data.access_token) throw new Error('Spotify OAuth: response missing access_token');
  const ttlMs = (data.expires_in ?? 3600) * 1000;
  TOKEN_CACHE.set(clientId, {
    access_token: data.access_token,
    expires_at: Date.now() + Math.min(ttlMs, TOKEN_TTL_MS),
  });
  return data.access_token;
}

async function spotifyGet<T = unknown>(token: string, path: string, params: URLSearchParams): Promise<T> {
  const url = `${API_URL}${path}${params.toString() ? `?${params}` : ''}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (res.status === 401) throw new Error('Spotify: unauthorized — token expired or invalid');
  if (res.status === 404) throw new Error('Spotify: not found (HTTP 404)');
  if (res.status === 429) throw new Error('Spotify: rate-limit (HTTP 429)');
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Spotify error: ${res.status} ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

async function search(token: string, args: Record<string, unknown>) {
  const params = new URLSearchParams({
    q: String(args.query),
    type: (args.type as string) ?? 'track',
    limit: String(Math.min(50, Math.max(1, (args.limit as number) ?? 20))),
    offset: String(Math.min(1000, Math.max(0, (args.offset as number) ?? 0))),
  });
  if (args.market) params.set('market', String(args.market));
  return spotifyGet(token, '/search', params);
}

export default { tools, callTool, meter: { credits: 2 } } satisfies McpToolExport;
