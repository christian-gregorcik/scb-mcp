# scb-mcp

An MCP server over Statistics Sweden's business register. Point an assistant at it and
it can search, count and read Swedish workplaces and legal entities without knowing
anything about cursors, path versions or API keys.

No dependencies. The protocol is implemented against the specification rather than
wrapped, which is the point: the handshake, the framing and the error codes are all in
`src/`, in about three hundred lines you can read.

## Use it

```jsonc
// Claude Desktop, claude_desktop_config.json
{
  "mcpServers": {
    "scb": {
      "command": "npx",
      "args": ["-y", "scb-mcp"],
      "env": { "SCB_API_KEY": "the key you were given" }
    }
  }
}
```

The key goes in the environment, never on the command line and never in a path. It
travels in the `X-API-Key` header that the register's contract asks for, and it is not
written to the log.

## The tools

| tool | what it does |
| --- | --- |
| `search_workplaces` | Workplaces, filtered on one of kommun, län, näringsgren or size class |
| `count_workplaces` | The same filters, but only the number |
| `get_workplace` | One workplace by its CFAR number |
| `search_legal_entities` | The same, over legal entities |
| `count_legal_entities` | |
| `get_legal_entity` | One legal entity by organisation number |

Every search takes `limit` and follows the register's cursor until it has that many.
`full: true` asks for every available variable instead of the usual selection.

## See it work

```
node --experimental-strip-types examples/handshake.ts
```

A stubbed register, the real protocol:

```
-> {"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05"}}
<- {"protocolVersion":"2024-11-05","capabilities":{"tools":{"listChanged":false}},"serverInfo":{"name":"scb-mcp","version":"0.1.0"}}
-> {"jsonrpc":"2.0","method":"notifications/initialized"}
   (notification, nothing to answer)
-> {"jsonrpc":"2.0","id":2,"method":"tools/list"}
<- 6 tools: search_workplaces, count_workplaces, get_workplace, search_legal_entities, count_legal_entities, get_legal_entity
-> {"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"count_workplaces","arguments":{"...
<- ok: { "count": 1403 }
-> {"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"search_workplaces","arguments":{...
<- ok: { "count": 2, "hasMore": true, "items": [ { "cfarNr": "10000001", "namn": "Nordvik Bygg AB", "kommun": "0486",
-> {"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"get_workplace","arguments":{"cfa...
<- tool error: no such resource in the register: {"message":"unknown path"}
```

## Three decisions

**A tool that fails is a result, not a protocol error.** The last line above is a 404
from the register, and it comes back inside `tools/call` with `isError: true`. A model
reads that and tries a different identifier. A JSON-RPC error would take the whole
turn down for something the model could have handled.

**Paging is not the model's problem.** The register hands out pages with `limit` and
`cursorId` and says `hasMore` when there is more. The search tools follow that until
they have what was asked for and report whether anything was left, so a model never
has to hold a cursor across turns.

**The register filters on one thing at a time.** That is the API's restriction, not
this server's, and giving two filters comes back as
`the register filters on one thing at a time; kommun and lan were both given` rather
than one of them being dropped quietly.

## Development

```
npm run check    # types
npm test         # 56 tests, no network, no key
npm run build
```

`fetch` is injected into the client, which is why every test runs offline. The
register's own contract is at `apiafr.scb.se`; the paths here follow it, including the
`/v1` segment and the `/count` and `/full` variants.

MIT licensed.
