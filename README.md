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

An HTTP client for Roku SceneGraph apps. Send a request from any component and get a promise back, without writing a Task, a message port or an `roUrlTransfer` loop yourself. Requests run on a pooled task thread with retries, timeouts, shared headers and JSON decoding; the render thread only ever sees the promise.

```brightscript
' once, in the main scene
sghttp.initialize({ baseUrl: "https://api.example.com" })

' anywhere
promises.chain(sghttp.fetch("/home/main"), m).then(function(response as object, m as object) as dynamic
    m.titleLabel.text = response.body.rows[0].title   ' response is { code, headers, body, url, ms }
    return invalid
end function)

sghttp.fetch({ url: "/favorites", method: "POST", body: { slug: "pilot" } })
sghttp.setHeaders({ Authorization: "Bearer " + token })   ' on every request from now on
```

That is the library. Nothing has to be defined, cached or configured beyond a `baseUrl`, and most code never needs more than `fetch`.

## Optional: a query cache

When the same data is wanted in more than one place, you can give a request a name. Then it's a **query**: sgHttp caches the result for every component to share, merges simultaneous calls into one request, and refreshes it in the background when it goes stale. Each further feature is one more key on the definition. None of it is required, and `fetch` keeps working exactly as before beside it.

```brightscript
sghttp.define("homePage", { request: { url: "/home/{slug}" }, ttl: 300 })

promises.chain(sghttp.query("homePage", { slug: "main" }), m).then(function(page as object, m as object) as dynamic
    m.titleLabel.text = page.rows[0].title   ' a second query within 5 minutes sends no request
    return invalid
end function)
```

## What's in the box

**The HTTP client**

- `fetch(url)` or `fetch({ url, method, headers, body, query })`, with `{placeholders}` filled from args
- A pool of `roUrlTransfer` objects on a task thread, with a queue, per-request timeouts and retries with backoff
- Shared headers for auth, changed at any time with `setHeaders`
- More than one server, each with its own base url, headers and pool
- JSON decoding off the render thread, and the whole response back: status, headers and body
- An event for every request, so one observer can send the app to sign-in on a 401
- A debugging proxy switch for Charles or mitmproxy

**The query cache, when you want it**

- Define an endpoint once, query it by name from any component
- One shared cache, with request de-duplication and stale-while-revalidate
- Precaching, so the data a screen needs is on its way before the screen opens
- Parsers that build ContentNode trees on a task thread
- Persistence to `cachefs:/`, so a cold start draws before the network answers
- Background refreshes that skip parsing and redraws when the server's data hasn't changed
- Paged listings: load the next page by name and get every page back, cached, expired and watched as one
- Mutations that expire or invalidate the queries they affect and refresh the screens showing them, with optimistic updates that show at once and roll back on failure
- Scopes for per-profile data, time buckets for schedules
- Change watchers and stats

**Either way**

- No framework needed: works with any SceneGraph navigation, and plays nicely with [sgRouter](https://github.com/rokucommunity/sgRouter)
- Written in [BrighterScript](https://github.com/rokucommunity/brighterscript), installed with [ropm](https://github.com/rokucommunity/ropm), built on [promises](https://github.com/rokucommunity/promises), its only dependency

### [Read the docs →](docs/README.md)

## Get started

- [Overview](docs/overview.md): what sgHttp does, and what it does only if you ask
- [Installation](docs/installation.md): add it to your channel with ropm
- [Quick start](docs/quick-start.md): the HTTP client in five minutes, then the cache if you want it
- [API reference](docs/reference/api.md): every function, its parameters and what it returns

sgHttp is a namespace of stateless functions plus one node, attached to the scene, that owns all state. If you know sgRouter the shape will be familiar, but sgRouter is not required.

## Get involved

- Build the package and run its specs on a Roku: [Contributing](docs/contributing.md)
- Report a bug or ask for a feature in the [issue tracker](https://github.com/TKSS-Software/sgHttp/issues)

## License

[MIT](LICENSE)
