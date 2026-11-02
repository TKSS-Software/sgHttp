# Coming from web, tvOS or Fire TV

sgHttp covers what a web app gets from `fetch` plus TanStack Query, SWR or Apollo, and what a native TV app gets from URLSession or OkHttp plus a repository layer. The ideas carry over; most names don't. This page maps them.

## The one that catches people

**To mark data out of date after a write, use `expire`, or a mutation's `expires`, not `remove`.** TanStack Query's `invalidateQueries` is sgHttp's `expire` followed by `refresh`, and a mutation's `expires: [...]` does both for you. sgHttp's `remove` is TanStack's `removeQueries`: the value is deleted from memory and disk, so the next query waits for the server. See [Mutations, expiry and removal](guides/mutations.md).

**`fetch` rejects on a status outside 200–299**, unlike web `fetch`, which resolves on a `404` and leaves you to check `response.ok`. Set `successCodes` to accept others.

## Threads

| Roku | Web | tvOS | Fire TV |
|---|---|---|---|
| Render thread | Main thread | Main actor | Main thread |
| Task node | Web Worker | A background `Task` | `Dispatchers.IO` |
| `roUrlTransfer` (task threads only) | `XMLHttpRequest` | `URLSession` | OkHttp |

As on the main thread elsewhere, the render thread must not wait on the network or the disk, and on Roku the HTTP and file APIs fail there outright. sgHttp runs requests, parsing and disk access on its own tasks and hands you promises on the render thread. See [Threads and memory](guides/threads-and-memory.md).

## Requests

| sgHttp | Web | tvOS | Fire TV |
|---|---|---|---|
| `fetch(spec)` | `fetch` / axios | `URLSession.data(for:)` | OkHttp `newCall` / Retrofit |
| `initialize({ baseUrl })`, `setHeaders` | axios instance defaults | `URLSessionConfiguration.httpAdditionalHeaders` | An interceptor adding headers |
| `onUnauthorized` / `reauthorize` | An axios 401 interceptor with a refresh queue | — | OkHttp `Authenticator` |
| `timeout`, `retries` | `AbortSignal.timeout`, axios-retry | `timeoutIntervalForRequest` | OkHttp timeouts, a retry interceptor |
| `cancel(promise)` | `AbortController` | `Task.cancel()` | `Call.cancel()` |
| `toFile` | — | `URLSession.download(for:)` | The body's `source()` written to an Okio `sink` |
| An error's `kind` | `TypeError: Failed to fetch` | `URLError.Code` | `IOException` subclasses |
| `observeEvents` | — | `URLSessionTaskMetrics` | OkHttp `EventListener` |

See [Requests](guides/requests.md).

## The query cache

| sgHttp | TanStack Query | SWR | Apollo Client |
|---|---|---|---|
| `define(name, { request, … })` | `queryOptions({ queryKey, queryFn })` | A key and a fetcher | A `gql` document |
| `query(name, args)` | `useQuery` | `useSWR` | `useQuery` / `client.query` |
| `ttl` | `staleTime` | — (no freshness time) | — (no freshness time) |
| `maxEntries`, least recently used first | `gcTime`, by time unused | — | `cache.gc()` |
| `query(…, { revalidate: true })` | Stale-while-revalidate, the default | Stale-while-revalidate, the default | `fetchPolicy: 'cache-and-network'` |
| `query(…, { force: true })` | `refetch()` | `mutate(key)` | `fetchPolicy: 'network-only'` |
| One request for simultaneous callers | Request deduplication | `dedupingInterval` | Query deduplication |
| `precache` | `prefetchQuery` | `preload` | — |
| `peek` | `getQueryData` | `cache.get(key)` | `cache.readQuery` |
| `set` | `setQueryData` | `mutate(key, data, { revalidate: false })` | `cache.writeQuery` |
| `expire` | `invalidateQueries({ refetchType: 'none' })` | — | — |
| `refresh` (watched entries only) | `refetchQueries({ type: 'active' })` | `mutate(key)` (mounted hooks only) | `refetchQueries` |
| `expireAll`, then `refresh`, on resume | `refetchOnWindowFocus` | `revalidateOnFocus` | — |
| `remove` | `removeQueries` | — | `cache.evict` |
| `watch` / `unwatch` | `useQuery` re-rendering | `useSWR` re-rendering | `watchQuery` |
| `mutate` with `expires` | `useMutation`, with `invalidateQueries` in `onSuccess` | `useSWRMutation` | `refetchQueries` on the mutation |
| `mutate` with `optimistic` | `onMutate`, with a rollback | `optimisticData` | `optimisticResponse` |
| `nextPage` | `useInfiniteQuery` / `fetchNextPage` | `useSWRInfinite` | `fetchMore` |
| `persist: true` | `persistQueryClient` (restore, or hydrate) | — | `apollo3-cache-persist` |
| `setScope` | The user or profile id in every query key | The id in every key | — |
| A parser | `select`, run on a task thread | — | — |

On tvOS and Fire TV this is usually a repository class over `URLCache`, Room or an in-memory map. sgHttp is that layer, with entries keyed by query name and args.

## What's different

- **No hooks.** A component asks with `query` and receives a promise. To keep receiving changes, it `watch`es the query and is told through a node field, the SceneGraph equivalent of a re-render. See [Watching a query](guides/keeping-data-fresh.md#watching-a-query).
- **Values can be ContentNode trees.** A parser builds them off the render thread, and the cache stores the tree, so a cached row list is assigned without being built again. See [Parsers](guides/parsers.md).
- **Restoring from disk is per query.** With `persist`, each query reads its own saved body the first time it's asked for, instead of the whole cache loading at start-up. `precache` starts that read early. See [Persistence](guides/persistence.md).
- **Seeding the cache.** `set` puts in a value you already have, from a deep link or a file in the package, as if the server had sent it.
