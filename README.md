<p align="center">
  <img src="media/logo.png" alt="sgQuery" width="640">
</p>

# sgQuery

Server-state management for Roku SceneGraph apps: fetching, caching, de-duplicating, persisting and refreshing the data your channel gets from its APIs, without blocking the render thread.

- Declarative queries: define an endpoint once, then fetch it by name from any component
- One shared cache for the whole app, with request de-duplication and stale-while-revalidate
- HTTP, JSON decoding and your parsers all run on task threads, never on the render thread
- Persistence to `cachefs:/`, so a cold start shows data before the network answers
- Background refreshes that skip parsing and redraws when the server's data hasn't changed
- Mutations that expire or invalidate the queries they affect
- Scopes (per-profile data), time buckets (now-and-next schedules) and more than one API server
- Change watchers, cache events and stats for redraws, auth handling and debugging
- No framework needed: works with any SceneGraph navigation, and plays nicely with [sgRouter](https://github.com/rokucommunity/sgRouter)

```brightscript
sgquery.define("homePage", {
    request: { url: "/home/{slug}" }
    parser: "HomePageParser"
    ttl: 300
    persist: true
})

promises.chain(sgquery.fetch("homePage", { slug: "main" }), m).then(function(page as object, m as object) as dynamic
    ' page is the parser's ContentNode tree; a second fetch within 5 minutes needs no request
    m.rowList.content = page
    return invalid
end function)
```

### [Read the docs →](docs/README.md)

## Get started

- [Overview](docs/overview.md): why sgQuery exists and what it does for you
- [Installation](docs/installation.md): add it to your channel with ropm
- [Quick start](docs/quick-start.md): your first query, parser and screen in ten minutes
- [API reference](docs/reference/api.md): every function, its parameters and what it returns

sgQuery is written in [BrighterScript](https://github.com/rokucommunity/brighterscript), ships as a [ropm](https://github.com/rokucommunity/ropm) package and builds on [promises](https://github.com/rokucommunity/promises). Its only dependency is promises. It is a namespace of stateless functions plus one node, attached to the scene, that owns all state, so if you know sgRouter the shape will be familiar, but sgRouter is not required.

## Get involved

- Build the package and run its specs on a Roku: [Contributing](docs/contributing.md)
- Report a bug or ask for a feature in the [issue tracker](https://github.com/TKSS-Software/sgQueury/issues)
