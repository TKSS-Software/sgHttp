# sgHttp documentation

## Getting started

- [Overview](overview.md): the HTTP client, and what the query cache adds
- [Installation](installation.md): requirements, installing with ropm, and calling `initialize`
- [Quick start](quick-start.md): the HTTP client in five minutes, then a cached, parsed and persisted home page

## The HTTP client

Everything in these guides works without defining any queries.

- [Requests](guides/requests.md): urls, methods, bodies, headers, auth, failures and the response
- [More than one server](guides/multiple-servers.md): clients, their headers and their transports
- [The transport](guides/transport.md): the built-in HTTP task, retries, timeouts, priorities, and replacing it
- [Debugging](guides/debugging.md): events, stats, console warnings and routing traffic through Charles

## The query cache

A **query** is a request defined with `define` and called with `query`, so that its result is cached. These guides cover what the cache does with queries; each builds on the one before.

- [Queries and keys](guides/queries.md): defining a request and querying it by name, filling urls from args, and how cache keys are made
- [Caching and freshness](guides/caching.md): what happens on each query, `ttl`, stale-while-revalidate, precaching and eviction
- [Mutations, expiry and invalidation](guides/mutations.md): writing data, showing the change at once, and telling the cache what it changed
- [Keeping data fresh](guides/keeping-data-fresh.md): background refreshes, unchanged-payload detection and watchers
- [Pages](guides/pagination.md): loading a listing a page at a time, and keeping, expiring and watching it as one
- [Scopes and time buckets](guides/scopes-and-buckets.md): per-profile data and data that rolls over with the clock
- [Persistence](guides/persistence.md): serving the last response from `cachefs:/` on a cold start
- [Parsers](guides/parsers.md): turning responses into ContentNode trees on a task thread

## Either way

- [Testing your app](guides/testing.md): driving sgHttp from specs with a fake transport
- [Threads and memory](guides/threads-and-memory.md): what runs where, what is shared, and what the cache holds on to

## API reference

- [Functions](reference/api.md): `initialize`, `fetch`, `setHeaders`, then `define`, `query`, `precache`, `cancel`, `nextPage`, `mutate`, `peek`, `expire`, `invalidate`, and the rest
- [Query definitions](reference/definition.md): every key `define` accepts
- [Events, stats and errors](reference/events-and-stats.md): the shapes sgHttp reports

## Project

- [Contributing](contributing.md): building the package and running its specs on a Roku
