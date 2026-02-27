# mcp-ffmpeg

MCP server wrapping [FFmpeg](https://ffmpeg.org/) and FFprobe for local media processing.

Works with Claude Code, Codex, Claude Desktop, Cursor, VS Code, Windsurf, and any MCP-compatible client.

## Prerequisites

- **Node.js** 18+
- **FFmpeg** and **FFprobe** installed and in PATH

Install FFmpeg:

```bash
brew install ffmpeg
```

## Installation

### Claude Code

```bash
claude mcp add ffmpeg -- npx -y github:pauloFroes/mcp-ffmpeg
```

### Codex

Add to your `codex.toml`:

```toml
[mcp.ffmpeg]
command = "npx"
args = ["-y", "github:pauloFroes/mcp-ffmpeg"]
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "ffmpeg": {
      "command": "npx",
      "args": ["-y", "github:pauloFroes/mcp-ffmpeg"]
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "ffmpeg": {
      "command": "npx",
      "args": ["-y", "github:pauloFroes/mcp-ffmpeg"]
    }
  }
}
```

### VS Code

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "ffmpeg": {
      "command": "npx",
      "args": ["-y", "github:pauloFroes/mcp-ffmpeg"]
    }
  }
}
```

### Windsurf

Add to `~/.windsurf/mcp.json`:

```json
{
  "mcpServers": {
    "ffmpeg": {
      "command": "npx",
      "args": ["-y", "github:pauloFroes/mcp-ffmpeg"]
    }
  }
}
```

## Available Tools

| Tool | Description |
|------|-------------|
| `check_dependencies` | Check if ffmpeg and ffprobe are installed and available |
| `get_media_info` | Get media file metadata (duration, resolution, codecs, format) |
| `extract_frames` | Extract frames from video at regular intervals (returns base64 images) |
| `extract_audio` | Extract/convert audio from video to MP3 |
| `split_audio` | Split audio file into chunks of N minutes |

## License

MIT
