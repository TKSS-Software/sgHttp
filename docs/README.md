# sgQuery documentation

## Getting started

- [Overview](overview.md): what sgQuery is, the problem it solves, and a first look at the code
- [Installation](installation.md): requirements, installing with ropm, and calling `initialize`
- [Quick start](quick-start.md): a query, a parser and a screen that uses them, end to end

## Guides and concepts

- [Queries and keys](guides/queries.md): defining queries, filling urls from args, and how cache keys are made
- [Caching and freshness](guides/caching.md): what happens on each fetch, `ttl`, stale-while-revalidate and eviction
- [Mutations, expiry and invalidation](guides/mutations.md): writing data and telling the cache what it changed
- [Keeping data fresh](guides/keeping-data-fresh.md): background refreshes, unchanged-payload detection and watchers
- [Scopes and time buckets](guides/scopes-and-buckets.md): per-profile data and data that rolls over with the clock
- [Persistence](guides/persistence.md): serving the last response from `cachefs:/` on a cold start
- [Parsers](guides/parsers.md): turning responses into ContentNode trees on a task thread
- [More than one server](guides/multiple-servers.md): clients, their headers and their transports
- [The transport](guides/transport.md): the built-in HTTP task, retries, timeouts, and replacing it
- [Debugging](guides/debugging.md): cache events, stats, console warnings and routing traffic through Charles
- [Testing your app](guides/testing.md): driving sgQuery from specs with a fake transport
- [Threads and memory](guides/threads-and-memory.md): what runs where, what is shared, and what the cache holds on to

## API reference

- [Functions](reference/api.md): `initialize`, `define`, `fetch`, `mutate`, `peek`, `expire`, `invalidate`, and the rest
- [Query definitions](reference/definition.md): every key `define` accepts
- [Events, stats and errors](reference/events-and-stats.md): the shapes sgQuery reports

## Project

- [Contributing](contributing.md): building the package and running its specs on a Roku
