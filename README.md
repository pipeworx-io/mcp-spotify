# @pipeworx/spotify

Spotify Web API MCP — catalog metadata via client_credentials OAuth.

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

## Tools

- `search(query, type?, market?, limit?, offset?)`
- `get_track(track_id, market?)`
- `get_artist(artist_id)`
- `get_album(album_id, market?)`
- `get_artist_top_tracks(artist_id, market?)`
- `get_audio_features(track_id)` — tempo, key, energy, danceability, etc.

## Auth

- **Platform key:** gateway env `PLATFORM_SPOTIFY_KEY`, format `client_id:client_secret`.
- **BYO:** `?_apiKey=client_id:client_secret` (colon-joined) after registering an app at https://developer.spotify.com/dashboard.

User-scope features (saved tracks, owned playlists) require the full Authorization Code flow and are out of scope.

## Data source

- Token: `https://accounts.spotify.com/api/token` (client_credentials grant)
- API: `https://api.spotify.com/v1/`

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "spotify": {
      "url": "https://gateway.pipeworx.io/spotify/mcp"
    }
  }
}
```

Or connect to the full Pipeworx gateway for access to all 1394+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Spotify data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
