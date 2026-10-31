# Debugging

## Events

sgHttp reports every request and every cache decision as an event. Observe them from any component:

```brightscript
sghttp.observeEvents("onCacheEvent")

sub onCacheEvent(event as object)
    e = event.getData()
    print "[cache] "; e.type; " "; e.name; " from "; e.source; " in "; e.ms; "ms"
end sub
```

The event types and their fields are in [Events](../reference/events-and-stats.md#events). Stop observing with `sghttp.unobserveEvents()`.

## Printing every event

With `initialize({ debug: true })`, sgHttp prints every event and change as it happens, with the cache key, so you can follow a session's traffic on the console:

```
[sghttp] resolve homePage via network (412ms) homePage|profile=|{"slug":"home-page"}
[sghttp] hit homePage via memory (0ms) homePage|profile=|{"slug":"home-page"}
[sghttp] error favorites.add via network (1203ms) code 401 
[sghttp] change homePage via network homePage|profile=|{"slug":"home-page"}
```

The key shows the args, and the cursor for any page after the first, so you can tell which page or profile a line is about. It's the same information `observeEvents` delivers. Turn it on in development builds only.

## Stats

`sghttp.getStats()` returns counters kept since `initialize`:

```brightscript
stats = sghttp.getStats()
print "hit rate: "; stats.hits; "/"; stats.hits + stats.staleHits + stats.misses
print "entries: "; stats.entries; ", watchers: "; stats.watchers
print "partner in flight: "; stats.clients.partner.active
```

Useful checks:

- **`watchers` only grows** as you move between screens: something calls `watch` and never `unwatch`.
- **`entries` sits at `maxEntries`**: the cache is evicting. Look at which args are creating extra keys (see [Cache keys](queries.md#cache-keys)), or raise the cap.
- **`requests` is far above `misses`**: many background refreshes, or many `fetch` and mutation calls, which count as requests but never as misses. Look at your `ttl`s.
- **`unchanged` is close to `requests`**: most refreshes find nothing new. Longer `ttl`s would save requests, and `conditional: true` saves bandwidth if the server sends validators.

## Console warnings

sgHttp prints to the BrightScript console (port 8085) when something is probably a mistake:

| Message | Meaning |
|---|---|
| `"x" is defined again: the new definition replaces the first` | `define` was called twice with one name |
| `"x" names client "y", which initialize did not set up; its requests will fail` | A typo in `client`, or a missing `clients` entry |
| `"x" url has an unfilled placeholder: ...` | An arg the url needs wasn't passed, and no scope provides it |
| `proxy "..." is not host:port, ignoring it` | The `proxy` setting couldn't be used |
| `setHeaders: no client "y"` | `setHeaders` named a client that doesn't exist |
| `a client cannot be named "default"` | `clients` has an entry named `default` |
| `precache: no query named "x"` / `set: no query named "x"` | `precache` or `set` named a query that isn't defined |
| `precache: "x" is cache: false, nothing to keep` / `set: "x" is cache: false, nothing to set` | `precache` or `set` was called for a mutation |
| `transport: request ... delivered twice` / `parser: job ... delivered twice` | A field update to a task was lost. Please report it, with what the app was doing. |

## Routing traffic through a proxy

Roku apps can't set an HTTP proxy. A proxy such as Charles can still see their traffic, though, if each url is prefixed with the proxy's address. Pass `proxy` to `initialize`, or to a client:

```brightscript
sghttp.initialize({
    baseUrl: "https://api.example.com"
    proxy: "192.168.1.20:8888"
})
```

Every request url then becomes `http://192.168.1.20:8888/;https://api.example.com/...`. Configure the proxy to forward urls in that form.

- Requests to private and local hosts (`10.*`, `127.*`, `172.16-31.*`, `192.168.*`, `169.254.*`, `localhost`, `*.local`) go direct, since the proxy may not be able to reach that network.
- A definition with `proxy: false` always goes direct.
- An empty or missing `proxy` turns proxying off. A value that isn't `host:port` is ignored, with a console warning.

Keep it out of release builds.

## Next

The query cache: [Queries and keys](queries.md)
