# mcp-spotify

Spotify MCP — Web API via client_credentials OAuth

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 673+ live data sources.

## Tools

| Tool | Description |
|------|-------------|
| `get_track` | Single track by Spotify ID. Returns artists, album, popularity, preview URL, duration. |
| `get_artist` | Artist record: name, genres, popularity, followers, images. |
| `get_album` | Album record with tracklist. |
| `get_artist_top_tracks` | Top tracks for an artist in a market (Spotify recommendation). |

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

Or connect to the full Pipeworx gateway for access to all 673+ data sources:

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

- [All tools and guides](https://github.com/pipeworx-io/examples)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
