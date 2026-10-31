# Overview

sgHttp is an HTTP client for Roku SceneGraph apps. Its job is to send requests and hand back responses without blocking the render thread. Everything else it offers (a query cache, parsers, disk persistence, background refreshes) is built on top of that and switched on per request, when you ask for it. You can use sgHttp for the life of an app without defining a single query.

## Motivation

SceneGraph gives you `roUrlTransfer`, Task nodes and message ports, and leaves combining them to you. Every channel ends up solving the same problems:

- **Threads.** `roUrlTransfer` can't run on the render thread, so every request means a Task, a port, a field to observe and a callback to route the answer back.
- **Concurrency.** A screen that needs five things wants five requests in flight, but not fifty. That's a pool and a queue to write.
- **Failures.** Timeouts, retries with backoff, and knowing which failures are safe to retry: not a `POST` that may already have gone through.
- **Headers.** The auth token has to reach every request, and change when the user signs in or out.
- **Decoding.** JSON parsing on the render thread stalls animation. It belongs on the task.
- **Answers.** The component that asked wants something it can chain, not a field to poll.

sgHttp's HTTP client is that work done once: a pooled transport task per server, retries, timeouts, shared headers, a debugging proxy, JSON decoding, and a promise back on the render thread.

### And, only when you want it, a cache

Some data is asked for by more than one screen, more than once. For that, sgHttp can treat a request as a **query** and take on the next set of problems:

- **Caching and de-duplication.** Two screens showing the same rail make one request; going back to a screen shows no spinner; three components asking at the same moment share one answer.
- **Staleness.** Knowing when data is out of date, and refreshing it without making the user wait for data they already have.
- **Cold starts.** The first screen after launch shouldn't wait for the network when the app showed the same data an hour ago.
- **Writes.** After the user adds a favorite, every screen showing favorites needs the new list.
- **Per-user data.** Switching profile must never show the previous profile's data.
- **Memory.** A Roku has little of it, so the cache needs a bound.

Each of these is opt-in, per definition. A request you never define is never cached, and `fetch` behaves the same whether or not the app uses queries anywhere else.

## Optionally, name a request

With `sghttp.initialize({ baseUrl })` in the main scene, `fetch` works from any component (the [quick start](quick-start.md) walks through it). If the home page is wanted by several screens, define it:

```brightscript
sghttp.define("homePage", { request: { url: "/home/{slug}" }, ttl: 300 })
```

and query it instead of fetching it:

```brightscript
promises.chain(sghttp.query("homePage", { slug: "main" }), m).then(function(page as object, m as object) as dynamic
    m.titleLabel.text = page.rows[0].title
    return invalid
end function)
```

The first call sends the request, exactly as `fetch` would, and keeps the body in memory under the query's name and args. From then on:

- **For the next five minutes** (the `ttl`), a query with the same args, from any component, is answered from memory. No request is sent.
- **After that**, the value is stale. A query is still answered from memory at once, and sgHttp sends a request in the background to check. If the server's answer is different, the cache is updated and any watcher of the query hears about it. If it's byte-for-byte the same, nothing happens.
- **At any moment**, if a request for this query is already in flight, a second query joins it instead of sending another.

From here, each need is one more key on the definition. `parser: "HomePageParser"` builds a ContentNode tree on a task thread, and the cache stores the tree. `persist: true` keeps the body on `cachefs:/`, so the next launch draws the screen before the network answers. `scopes: ["profile"]` keeps one profile's data from reaching another. A mutation lists the queries it `expires`. The [quick start](quick-start.md) adds them in that order, after the HTTP client.

## What next

- Install it: [Installation](installation.md)
- Use it: [Quick start](quick-start.md)
- Everything `fetch` can do: [Requests](guides/requests.md)
- If you want the cache: [Queries and keys](guides/queries.md)
- Look something up: [API reference](reference/api.md)
