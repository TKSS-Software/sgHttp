# From an OpenAPI spec

sgHttp doesn't read OpenAPI specs, but if your API has one, each operation in it maps onto an sgHttp request in a fixed way. This page shows how to write the definitions from the spec by hand.

## An operation

```yaml
/shows/{showId}/episodes:
  get:
    operationId: listEpisodes
    parameters:
      - { name: showId, in: path, required: true }
      - { name: season, in: query }
```

becomes:

```brightscript
sghttp.define("listEpisodes", {
    request: { url: "/shows/{showId}/episodes", query: { season: "{season}" } }
})

sghttp.query("listEpisodes", { showId: "abc", season: 2 })
```

Without `season` in the args, the parameter is left off the url, as an optional query parameter should be.

## The mapping

| OpenAPI | sgHttp |
|---|---|
| `servers[0].url` | `baseUrl` in [`initialize`](../reference/api.md#initialize). Another server is a [client](multiple-servers.md). |
| `operationId` | The definition's name |
| The path | `request.url`, with its `{placeholders}` as they are |
| A parameter `in: path` | An arg of the same name |
| A parameter `in: query` | An entry in `request.query`: `{ season: "{season}" }` |
| A parameter `in: header` | An entry in `request.headers`, filled from args the same way |
| `requestBody` | `request.body`: `"{name}"` alone passes an arg through as the whole body |
| `get` | A cached query |
| `post`, `put`, `patch`, `delete` | A [mutation](mutations.md): `cache: false`, with the queries it changes in `expires` |
| An operation with `security: []` (none) | `auth: false`, so the shared auth headers aren't sent |
| Success responses other than 2xx | `successCodes` |

[Filling the request](requests.md#filling-the-request) has the exact rules for placeholders.

## Writes

```yaml
/favorites:
  post:
    operationId: addFavorite
    requestBody:
      content:
        application/json:
          schema: { type: object, properties: { showId: { type: string } } }
```

```brightscript
sghttp.define("addFavorite", {
    request: { url: "/favorites", method: "POST", body: { showId: "{showId}" } }
    cache: false
    expires: ["listFavorites"]
})

sghttp.mutate("addFavorite", { showId: "abc" })
```

The spec doesn't say which reads a write changes, so `expires` is yours to fill in.

## Reads sent as a POST

Some APIs search or filter with a `post`. If the operation only reads, define it as a cached query instead of a mutation: leave out `cache: false`. A cached query is retried like a `GET` whatever its method (see [the transport](transport.md#the-built-in-transport)).

## Not covered

- **Response schemas** aren't used: a query resolves with the decoded JSON, or a [parser](parsers.md)'s result.
- **Cookie parameters** have no equivalent. Send the cookie in `request.headers`.
- **Security schemes** beyond on and off: the token itself goes in the shared headers with [`setHeaders`](requests.md#auth-headers-on-every-request).
