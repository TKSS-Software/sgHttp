<p align="center">
  <img src="media/logo.png" alt="sgHttp" width="640">
</p>

<p align="center">
  <a href="https://github.com/TKSS-Software/sgHttp/actions/workflows/release-candidate.yml"><img src="https://img.shields.io/github/actions/workflow/status/TKSS-Software/sgHttp/release-candidate.yml?branch=main&logo=github" alt="Build status"></a>
  <a href="https://github.com/TKSS-Software/sgHttp/blob/main/LICENSE"><img src="https://img.shields.io/github/license/TKSS-Software/sgHttp" alt="License"></a>
</p>

# sgHttp

An HTTP client for Roku SceneGraph apps, for REST and GraphQL APIs. Send a request from any component and get a promise back, without writing a Task, a message port or an `roUrlTransfer` loop yourself. Requests run on a pooled task thread with retries, timeouts and shared headers; the render thread only ever sees the promise. A request can also name a parser, which decodes the response and turns it into ContentNodes on a task thread. Without one, the JSON is decoded on the render thread as it arrives.

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

When you want your app faster, the same library can also cache what it fetches. Data that was previously fetched through a query is returned from memory without a request, components that ask for the same data at the same time share one request, and on a cold start the last response is read from disk before the network answers.

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

## Using It With sgRouter

sgHttp can integrate well into projects using [sgRouter](https://github.com/rokucommunity/sgRouter). A screen on a `keepAlive` route is suspended rather than destroyed when the user leaves it, so it can keep a watcher open. sgRouter waits for the promise `beforeViewOpen` returns, so the previous screen stays up until the favourites arrive, and when they're already cached the screen opens at once. When the user comes back, a `revalidate` query shows the cached favourites at once and checks the server in the background. If the server has something new, the watcher hands the screen the new value:

```brightscript
function beforeViewOpen(params as object) as dynamic
    m.watcher = sghttp.watch("favorites", "onFavoritesChanged")
    return promises.chain(sghttp.query("favorites"), m).then(function(favorites as object, m as object) as dynamic
        m.rowList.content = favorites
        return invalid   ' not the data: sgRouter reads this value for outgoingRouteConfigOverrides
    end function).toPromise()
end function

function onViewResume(params as object) as dynamic
    sghttp.query("favorites", {}, { revalidate: true })   ' cached value now, server checked in the background
    return promises.resolve(invalid)
end function

sub onFavoritesChanged(event as object)
    m.rowList.content = event.getData().value   ' only when the server's data changed
end sub

function beforeViewClose(params as object) as dynamic
    sghttp.unwatch(m.watcher)
    return promises.resolve(invalid)
end function
```

If the request fails, the navigation fails; add a `.catch` to open the screen with an error state instead.

If a detail screen adds a favourite with a mutation that lists `expires: ["favorites"]`, the catalog shows it when the user goes back. The detail screen doesn't need to tell the catalog anything.

## What's in the box

**The HTTP client**

- `fetch(url)`, `fetch({ url, method, headers, body, query })` or `fetch(queryName)`, with `{placeholders}` filled from args
- A pool of `roUrlTransfer` objects on a task thread, with a queue, per-request timeouts and retries with backoff
- Shared headers for auth, changed at any time with `setHeaders`
- More than one server, each with its own base url, headers and pool
- The whole response back: status, headers and the decoded body, or with a parser, decoding and parsing on a task thread
- An event for every request, so one observer can send the app to sign-in on a 401
- Token renewal: on a 401, requests wait while the app renews its auth headers, then are sent again
- A debugging proxy switch for Charles or mitmproxy
- Three request priorities, with background refreshes and precaches queued behind the requests a screen is waiting on
- Cancellation: `cancel(promise)` drops a queued request or aborts one in flight
- **Server-sent events** on Roku OS 16.0: `openEventStream` delivers each event as it arrives and reconnects with the last event id ([Event streams](docs/guides/event-streams.md))
- **GraphQL support:** queries and mutations with variables filled from args, resolving with `data`, and `errors` treated as failures. Queries are cached like any other ([GraphQL](docs/guides/graphql.md))
- Already have a Task of your own? `createHttpClient` runs the same engine inside it, so that task can send requests without crossing to the render thread ([Requests from a task](docs/guides/tasks.md))

**The query cache**

- Define an endpoint once, query it by name from any component
- One shared cache, with request de-duplication, stale-while-revalidate, and freshness from the definition's `ttl` or the server's `Cache-Control`
- Precaching, so the request for the data a screen needs can be started before the screen opens
- Parsers that build ContentNode trees on a task thread
- Persistence to `cachefs:/`, so the last response is returned on a cold start before the network responds
- Background refreshes that skip parsing and redraws when the server's data hasn't changed
- Paged listings: load the next page by name and get every page back, cached, expired and watched as one
- Mutations that expire or remove the queries they affect and refresh the screens showing them, with optimistic updates that show at once and roll back on failure
- Scopes for per-profile data, time buckets for schedules
- Change watchers and stats

**For fetch and queries alike**

- No framework needed: it works with any SceneGraph navigation, including [sgRouter](https://github.com/rokucommunity/sgRouter)
- Written in [BrighterScript](https://github.com/rokucommunity/brighterscript), installed with [ropm](https://github.com/rokucommunity/ropm), built on [promises](https://github.com/rokucommunity/promises), its only dependency

### [Read the docs →](docs/README.md)

## Install

sgHttp isn't on npm yet. Install the latest release candidate from its GitHub release:

```sh
npx ropm install sghttp@https://github.com/TKSS-Software/sgHttp/releases/download/v0.1.0-rc.7/sghttp-0.1.0-rc.7.tgz
```

Every candidate is listed under [Releases](https://github.com/TKSS-Software/sgHttp/releases), each with its install line.

## Get started

- [Overview](docs/overview.md): the HTTP client, and what the query cache adds
- [Installation](docs/installation.md): add it to your channel with ropm
- [Quick start](docs/quick-start.md): the HTTP client in five minutes, then a cached, parsed and persisted home page
- [Coming from web, tvOS or Fire TV](docs/coming-from.md): sgHttp's names for what TanStack Query, SWR, Apollo, URLSession and OkHttp do
- [API reference](docs/reference/api.md): every function, its parameters and what it returns

sgHttp is a namespace of stateless functions plus one node, attached to the scene, that owns all state. If you know sgRouter, the shape will be familiar, but sgHttp doesn't need it.

## Get involved

- Build the package and run its specs on a Roku: [Contributing](docs/contributing.md)
- Report a bug or ask for a feature in the [issue tracker](https://github.com/TKSS-Software/sgHttp/issues)

## License

[MIT](LICENSE)
