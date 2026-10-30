# sgQuery documentation

## Getting started

- [Overview](overview.md): what sgQuery does, and what it does only if you ask
- [Installation](installation.md): requirements, installing with ropm, and calling `initialize`
- [Quick start](quick-start.md): the HTTP client in five minutes, then the cache if you want it

## The HTTP client

This is sgQuery. Everything here works with nothing defined.

- [Requests](guides/requests.md): urls, methods, bodies, headers, auth, failures and the response
- [More than one server](guides/multiple-servers.md): clients, their headers and their transports
- [The transport](guides/transport.md): the built-in HTTP task, retries, timeouts, and replacing it
- [Debugging](guides/debugging.md): events, stats, console warnings and routing traffic through Charles

## The query cache (optional)

Naming a request makes it a query, and these guides apply. In order, each builds on the one before.

- [Queries and keys](guides/queries.md): giving a request a name, filling urls from args, and how cache keys are made
- [Caching and freshness](guides/caching.md): what happens on each query, `ttl`, stale-while-revalidate and eviction
- [Mutations, expiry and invalidation](guides/mutations.md): writing data and telling the cache what it changed
- [Keeping data fresh](guides/keeping-data-fresh.md): background refreshes, unchanged-payload detection and watchers
- [Scopes and time buckets](guides/scopes-and-buckets.md): per-profile data and data that rolls over with the clock
- [Persistence](guides/persistence.md): serving the last response from `cachefs:/` on a cold start
- [Parsers](guides/parsers.md): turning responses into ContentNode trees on a task thread

## Either way

- [Testing your app](guides/testing.md): driving sgQuery from specs with a fake transport
- [Threads and memory](guides/threads-and-memory.md): what runs where, what is shared, and what the cache holds on to

## API reference

- [Functions](reference/api.md): `initialize`, `fetch`, `setHeaders`, then `define`, `query`, `mutate`, `peek`, `expire`, `invalidate`, and the rest
- [Query definitions](reference/definition.md): every key `define` accepts
- [Events, stats and errors](reference/events-and-stats.md): the shapes sgQuery reports

## Project

- [Contributing](contributing.md): building the package and running its specs on a Roku
