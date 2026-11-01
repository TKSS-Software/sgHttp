# More than one server

Most channels talk to one API and don't need anything on this page. If yours talks to several, such as your own API, an analytics collector and a partner's catalog, give each extra server a **client**.

## The default client

The top-level settings of `initialize` (the [transport settings](transport.md#settings), plus `transport`) configure the **default client**, named `"default"`. Every definition that doesn't name a client uses it.

## Adding clients

```brightscript
sghttp.initialize({
    baseUrl: "https://api.example.com"            ' the default client
    headers: { "X-Platform": "roku" }
    clients: {
        analytics: { baseUrl: "https://collector.example.com", headers: { "X-Api-Key": apiKey } }
        partner: { baseUrl: "https://partner.example.com", maxConcurrent: 2, timeout: 10 }
    }
})
```

A client takes the same settings as the default client. Each client:

- gets **its own transport** task, with its own connection pool and queue, so a slow server can't hold up another server's requests;
- has **its own shared headers**, so each server's auth token stays with that server;
- inherits **nothing** from the default client. Set every header and setting it needs.

A client can't be named `"default"`; the top-level settings are that client.

## Pointing queries at a client

```brightscript
sghttp.define("homePage", { request: { url: "/home/{slug}" } })                                  ' default client
sghttp.define("partner.homePage", { client: "partner", request: { url: "/home/{slug}" } })
```

All clients share one set of query names, so prefix another server's queries with its name. Each call then shows which server it reaches, and `remove("partner")` or `expire("partner")` covers that whole server.

If a definition names a client that `initialize` didn't set up, sgHttp prints a warning, and queries of it reject without sending anything: `sghttp: query "..." names client "...", which initialize did not set up`.

## Headers per client

```brightscript
sghttp.setHeaders({ Authorization: "Bearer " + token })                  ' the default client
sghttp.setHeaders({ Authorization: "Bearer " + partnerToken }, "partner")
```

Shared headers, `auth: false` and `baseHeaders` work per client as described in [Auth](requests.md#auth-headers-on-every-request).

## What stays shared

The cache, scopes, watchers, `expireAll` and `remove()` cover every client. Two clients can't hold separate copies of the same query name.

## Telling clients apart

- Every [event](../reference/events-and-stats.md#events) carries `client`, so an app can react to one server's `401` without guessing from query names.
- `getStats().clients.<name>` counts each client's `requests`, `errors` and `active` (requests in flight).

```brightscript
sub onCacheEvent(event as object)
    e = event.getData()
    if e.type = "error" and e.code = 401 and e.auth and e.client = "default" then signOut()
end sub
```

## Next

[The transport](transport.md)
