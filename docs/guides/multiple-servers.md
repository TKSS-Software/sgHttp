# More than one server

Most channels talk to one API, and need nothing from this page. When yours talks to several (your API, an analytics collector, a partner's catalog), give each extra server a **client**.

## The default client

The top-level settings of `initialize` (the [transport settings](transport.md#settings), plus `transport`) configure the **default client**, named `"default"`. Every definition that doesn't name a client uses it.

## Adding clients

```brightscript
sgquery.initialize({
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
sgquery.define("homePage", { request: { url: "/home/{slug}" } })                                  ' default client
sgquery.define("partner.homePage", { client: "partner", request: { url: "/home/{slug}" } })
```

Query names are shared by every client, so prefix another server's queries with its name. Each call then says which server it reaches, and `invalidate("partner")` or `expire("partner")` covers that whole server.

Defining a query that names a client `initialize` didn't set up prints a warning. Its queries reject with `sgquery: query "..." names client "...", which initialize did not set up`, without sending anything.

## Headers per client

```brightscript
sgquery.setHeaders({ Authorization: "Bearer " + token })                  ' the default client
sgquery.setHeaders({ Authorization: "Bearer " + partnerToken }, "partner")
```

Shared headers, `auth: false` and `baseHeaders` work per client as described in [Auth](requests.md#auth-headers-on-every-request).

## What stays shared

The cache, scopes, watchers, `expireAll` and `invalidate()` cover every client. Two clients can't hold separate copies of the same query name.

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
