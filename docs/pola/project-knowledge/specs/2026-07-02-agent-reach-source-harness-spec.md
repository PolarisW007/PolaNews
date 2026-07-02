# SPEC: PolaNews Source Reach Harness

Date: 2026-07-02

## API Contract

`GET /api/source-reach/doctor`

Query:

- `live`: optional boolean. Default `false`. When `true`, channel checks may perform lightweight network probes with short timeouts.

Response:

```json
{
  "success": true,
  "data": {
    "project": "PolaNews",
    "checked_at": "2026-07-02T00:00:00.000Z",
    "live": false,
    "summary": {"ok": 3, "warn": 1, "off": 2, "error": 0, "total": 6},
    "channels": {
      "rss": {
        "status": "ok",
        "name": "RSS ingestion",
        "message": "Built-in RSS parser available",
        "backends": ["rss-parser"],
        "active_backend": "rss-parser",
        "risk_tier": "P2",
        "requires_config": false,
        "requires_login": false,
        "hint": ""
      }
    }
  }
}
```

## CLI Contract

`polanews source-reach doctor [--live] [--raw]`

- Calls `/api/source-reach/doctor`.
- Uses the same `--base-url`, `--token`, `--timeout`, `--config` options as the existing CLI.
- Prints JSON.

## MCP Contract

Tool: `source_reach_doctor`

Input schema:

```json
{
  "type": "object",
  "properties": {
    "live": {"type": "boolean", "default": false}
  }
}
```

Output: same core doctor object returned by the API `data` field.

## Channel Semantics

| Status | Meaning |
| --- | --- |
| `ok` | Channel can be used now. |
| `warn` | Channel is partially usable or live probe was skipped/failed non-critically. |
| `off` | Optional channel missing config or tool. |
| `error` | Tool/config exists but is broken or timed out. |

## Safety Rules

- Never include raw token, API key, cookie, Authorization header, database URL password, or `.env` value.
- Doctor must not write to DB.
- Doctor must not fetch article bodies unless `live=true`, and even then only lightweight endpoint checks are allowed.
- Login/session-backed channels are reported as optional and disabled for production automation unless explicitly configured later.

## Fulltext Fallback Rules

- Only `http:` and `https:` article URLs are eligible.
- Private localhost-style URLs are not sent to Jina.
- Fallback content is normalized into safe paragraph HTML.
- Failures return null to preserve existing caller behavior.
