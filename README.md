<p align="center">
  <img src="media/logo.png" alt="sgHttp" width="640">
</p>

<p align="center">
  <a href="https://github.com/TKSS-Software/sgHttp/actions/workflows/build.yml"><img src="https://img.shields.io/github/actions/workflow/status/TKSS-Software/sgHttp/build.yml?branch=main&logo=github" alt="Build status"></a>
  <a href="https://www.npmjs.com/package/sghttp"><img src="https://img.shields.io/npm/v/sghttp?logo=npm" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/sghttp"><img src="https://img.shields.io/npm/dm/sghttp" alt="Monthly downloads"></a>
  <a href="https://github.com/TKSS-Software/sgHttp/blob/main/LICENSE"><img src="https://img.shields.io/github/license/TKSS-Software/sgHttp" alt="License"></a>
</p>

# sgHttp

An HTTP client for Roku SceneGraph apps. Send a request from any component and get a promise back, without writing a Task, a message port or an `roUrlTransfer` loop yourself. Requests run on a pooled task thread with retries, timeouts, shared headers and JSON decoding; the render thread only ever sees the promise. A request can also name a parser, which is not required, but lets the response be turned into ContentNodes on a task thread instead of the render thread.

When you want your app faster, the same library can also cache what it fetches. Data that was previously fetched through a query is returned from memory without a request, components that ask for the same data at the same time share one request, and on a cold start the last response is read from disk before the network answers.

```brightscript
' once, either in the main scene or another function that runs before your first request
sghttp.initialize({ baseUrl: "https://api.example.com" })

' anywhere
promises.chain(sghttp.fetch("/home/main"), m).then(function(response as object, m as object) as dynamic
    m.titleLabel.text = response.body.rows[0].title   ' response is { code, headers, body, url, ms }
    return invalid
end function)

sghttp.fetch({ url: "/favorites", method: "POST", body: { slug: "pilot" } })
sghttp.setHeaders({ Authorization: "Bearer " + token })   ' on every request from now on
```

Nothing else is needed to send requests: there is nothing to define and nothing to configure beyond a `baseUrl`. `fetch` works the same way whether or not the app uses the cache.

## The query cache

Roku apps often spend a lot of time fetching data they have already fetched before: the home page on every launch, a rail that appears on three screens, the screen the user just backed out of. Define such a request with `define` and call it with `query`, and sgHttp caches the result instead of fetching it again:

- **Returned from memory.** Data that was fetched before is returned at once, with no request, so a screen the user goes back to, or another screen showing the same data, can draw without a spinner.
- **One request for simultaneous callers.** When three components ask for the home page at the same moment, one request is sent and all three receive its response.
- **Returned from disk on a cold start.** The last response is saved to `cachefs:/` and returned on the next launch, so the first screen can draw before the network answers. It's then refreshed in the background.
- **Unchanged responses are not parsed.** When a background refresh returns the same body as before, sgHttp detects that before parsing and doesn't notify watchers, so nothing is redrawn.
- **Parsing runs on a task thread.** A parser builds the ContentNode tree on a task thread, and the cache stores the tree.
- **Data can be requested ahead of time.** Call `precache` for the data the next screen needs, for example when its menu item gets focus, so the request is already in flight or finished when the screen opens.

```brightscript
sghttp.define("homePage", {
    request: { url: "/home/{slug}" }
    ttl: 300                      ' fresh for 5 minutes: queries in that time send no request
    parser: "HomePageParser"      ' ContentNode tree built on a task thread
    persist: true                 ' on the next launch, returned from disk at once
})

promises.chain(sghttp.query("homePage", { slug: "main" }), m).then(function(content as object, m as object) as dynamic
    m.rowList.content = content
    return invalid
end function)
```

Each feature is one more key on the definition. Requests can be converted from `fetch` to queries individually.

## What's in the box

**The HTTP client**

- `fetch(url)`, `fetch({ url, method, headers, body, query })` or `fetch(queryName)`, with `{placeholders}` filled from args
- A pool of `roUrlTransfer` objects on a task thread, with a queue, per-request timeouts and retries with backoff
- Shared headers for auth, changed at any time with `setHeaders`
- More than one server, each with its own base url, headers and pool
- JSON decoding off the render thread, and the whole response back: status, headers and body
- An event for every request, so one observer can send the app to sign-in on a 401
- A debugging proxy switch for Charles or mitmproxy
- Three request priorities, with background refreshes and precaches queued behind the requests a screen is waiting on
- Cancellation: `cancel(promise)` drops a queued request or aborts one in flight

**The query cache**

- Define an endpoint once, query it by name from any component
- One shared cache, with request de-duplication, stale-while-revalidate, and freshness from the definition's `ttl` or the server's `Cache-Control`
- Precaching, so the request for the data a screen needs can be started before the screen opens
- Parsers that build ContentNode trees on a task thread
- Persistence to `cachefs:/`, so the last response is returned on a cold start before the network responds
- Background refreshes that skip parsing and redraws when the server's data hasn't changed
- Paged listings: load the next page by name and get every page back, cached, expired and watched as one
- Mutations that expire or invalidate the queries they affect and refresh the screens showing them, with optimistic updates that show at once and roll back on failure
- Scopes for per-profile data, time buckets for schedules
- Change watchers and stats

**Either way**

- No framework needed: it works with any SceneGraph navigation, including [sgRouter](https://github.com/rokucommunity/sgRouter)
- Written in [BrighterScript](https://github.com/rokucommunity/brighterscript), installed with [ropm](https://github.com/rokucommunity/ropm), built on [promises](https://github.com/rokucommunity/promises), its only dependency

### [Read the docs →](docs/README.md)

## Get started

- [Overview](docs/overview.md): the HTTP client, and what the query cache adds
- [Installation](docs/installation.md): add it to your channel with ropm
- [Quick start](docs/quick-start.md): the HTTP client in five minutes, then a cached, parsed and persisted home page
- [API reference](docs/reference/api.md): every function, its parameters and what it returns

sgHttp is a namespace of stateless functions plus one node, attached to the scene, that owns all state. If you know sgRouter, the shape will be familiar, but sgHttp doesn't need it.

## Get involved

- Build the package and run its specs on a Roku: [Contributing](docs/contributing.md)
- Report a bug or ask for a feature in the [issue tracker](https://github.com/TKSS-Software/sgHttp/issues)

## License

[MIT](LICENSE)
