<p align="center">
  <img src="media/logo.png" alt="sgQuery" width="640">
</p>

# sgQuery

An HTTP client for Roku SceneGraph apps, with a query cache that grows on top of it. Start with plain requests on a task thread; add names, caching, parsing, persistence and background refreshes one key at a time, without ever blocking the render thread.

```brightscript
sgquery.initialize({ baseUrl: "https://api.example.com" })

' A request: sent from a pooled task thread, back as a promise with the whole response
promises.chain(sgquery.request({ url: "/home/main" }), m).then(function(response as object, m as object) as dynamic
    print response.code, response.body.rows.count()
    return invalid
end function)

' A query: the same request with a name, cached for every component to share
sgquery.define("homePage", { request: { url: "/home/{slug}" }, ttl: 300 })

promises.chain(sgquery.fetch("homePage", { slug: "main" }), m).then(function(page as object, m as object) as dynamic
    ' a second fetch within 5 minutes needs no request
    m.titleLabel.text = page.rows[0].title
    return invalid
end function)
```

Everything beyond that is a key on the definition: a `parser` that builds ContentNode trees off the render thread, `persist` for a cold start that shows data before the network answers, `scopes` for per-profile data, `expires` on the mutations that change it.

- A pooled, queued HTTP client on a task thread: retries with backoff, timeouts, shared headers, a debugging proxy and JSON decoding, with promises back on the render thread
- `request` for one-off calls: no definition, no cache, the whole response back
- Declarative queries: define an endpoint once, then fetch it by name from any component
- One shared cache for the whole app, with request de-duplication and stale-while-revalidate
- Parsers that turn responses into ContentNode trees on a task thread, never on the render thread
- Persistence to `cachefs:/`, so a cold start shows data before the network answers
- Background refreshes that skip parsing and redraws when the server's data hasn't changed
- Mutations that expire or invalidate the queries they affect
- Scopes (per-profile data), time buckets (now-and-next schedules) and more than one API server
- Change watchers, cache events and stats for redraws, auth handling and debugging
- No framework needed: works with any SceneGraph navigation, and plays nicely with [sgRouter](https://github.com/rokucommunity/sgRouter)

### [Read the docs →](docs/README.md)

## Get started

- [Overview](docs/overview.md): why sgQuery exists and what it does for you
- [Installation](docs/installation.md): add it to your channel with ropm
- [Quick start](docs/quick-start.md): from one request to a cached, parsed, persisted screen, one step at a time
- [API reference](docs/reference/api.md): every function, its parameters and what it returns

sgQuery is written in [BrighterScript](https://github.com/rokucommunity/brighterscript), ships as a [ropm](https://github.com/rokucommunity/ropm) package and builds on [promises](https://github.com/rokucommunity/promises). Its only dependency is promises. It is a namespace of stateless functions plus one node, attached to the scene, that owns all state, so if you know sgRouter the shape will be familiar, but sgRouter is not required.

## Get involved

- Build the package and run its specs on a Roku: [Contributing](docs/contributing.md)
- Report a bug or ask for a feature in the [issue tracker](https://github.com/TKSS-Software/sgQuery/issues)
