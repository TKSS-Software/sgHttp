# Debugging

## Events

Every cache decision is reported as an event. Observe them from any component:

```brightscript
sgquery.observeEvents("onCacheEvent")

sub onCacheEvent(event as object)
    e = event.getData()
    print "[cache] "; e.type; " "; e.name; " from "; e.source; " in "; e.ms; "ms"
end sub
```

| `type` | When |
|---|---|
| `hit` | A fresh value was served from memory |
| `stale` | A cached value was served and a background refresh started (a stale value, or any value fetched with `revalidate`) |
| `dedupe` | The query joined a request already in flight |
| `resolve` | A value arrived from the network or disk and the query resolved |
| `unchanged` | The server's answer matched the cached value; the entry was renewed |
| `error` | A request or parse failed |

Each event is `{ type, name, key, source, ms, client }`, plus `code` and `auth` on errors. The full shapes are in [Events, stats and errors](../reference/events-and-stats.md).

### Sending the user to sign in on a 401

Error events say whether the request carried the client's shared headers (`auth`), so an app can tell an expired token from a public endpoint's failure:

```brightscript
sub onCacheEvent(event as object)
    e = event.getData()
    if e.type = "error" and e.code = 401 and e.auth then m.top.signedOut = true
end sub
```

Stop observing with `sgquery.unobserveEvents()`.

## Printing every event

`initialize({ debug: true })` prints each event and each change as it happens, with the cache key, so a session's traffic reads straight off the console:

```
[sgquery] miss homePage via memory (0ms) homePage|profile=|{"slug":"home-page"}
[sgquery] resolve homePage via network (412ms) homePage|profile=|{"slug":"home-page"}
[sgquery] hit homePage via memory (0ms) homePage|profile=|{"slug":"home-page"}
[sgquery] error favorites.add via network (1203ms) code 401 
[sgquery] change homePage via network homePage|profile=|{"slug":"home-page"}
```

The key shows the args (and, for a page after the first, the cursor), so it tells which page or which profile a line is about. It's the same information `observeEvents` delivers, printed; turn it on in development builds only.

## Stats

`sgquery.getStats()` returns running counters since `initialize`:

```brightscript
stats = sgquery.getStats()
print "hit rate: "; stats.hits; "/"; stats.hits + stats.staleHits + stats.misses
print "entries: "; stats.entries; ", watchers: "; stats.watchers
print "partner in flight: "; stats.clients.partner.active
```

Useful checks:

- **`watchers` only grows** as you move between screens: something calls `watch` without `unwatch`.
- **`entries` sits at `maxEntries`**: the cache is evicting. Look at which args fork your keys (see [Cache keys](queries.md#cache-keys)), or raise the cap.
- **`requests` is far above `misses`**: many background refreshes. Look at your `ttl`s.
- **`unchanged` is close to `requests`**: refreshes are mostly finding nothing. Longer `ttl`s, or `conditional: true`, would save bandwidth.

## Console warnings

sgQuery prints to the BrightScript console (port 8085) when something is probably a mistake:

| Message | Meaning |
|---|---|
| `"x" is defined again: the new definition replaces the first` | `define` was called twice with one name |
| `"x" names client "y", which initialize did not set up; its requests will fail` | A typo in `client`, or a missing `clients` entry |
| `"x" url has an unfilled placeholder: ...` | An arg the url needs wasn't passed, and no scope provides it |
| `proxy "..." is not host:port, ignoring it` | The `proxy` setting couldn't be used |
| `setHeaders: no client "y"` | `setHeaders` named a client that doesn't exist |
| `a client cannot be named "default"` | `clients` has an entry named `default` |
| `transport: request ... delivered twice` / `parser: job ... delivered twice` | A field update to a task was lost. Please report it, with what the app was doing. |

## Routing traffic through a proxy

Roku apps can't set an HTTP proxy, but a proxy such as Charles can still see their traffic if each url is prefixed with the proxy's address. Pass `proxy` to `initialize` (or to a client):

```brightscript
sgquery.initialize({
    baseUrl: "https://api.example.com"
    proxy: "192.168.1.20:8888"
})
```

Every request url then becomes `http://192.168.1.20:8888/;https://api.example.com/...`. Configure the proxy to forward urls in that form.

- Requests to private and local hosts (`10.*`, `172.16-31.*`, `192.168.*`, `169.254.*`, `localhost`, `*.local`) go direct, since the proxy may not be able to reach that network.
- A definition with `proxy: false` always goes direct.
- An empty or missing `proxy` turns it off. A value that isn't `host:port` is ignored, with a console warning.

Keep it out of release builds.

## Next

Optional, the query cache: [Queries and keys](queries.md)
