# GraphQL

sgHttp supports GraphQL. Put the operation in a request's `graphql` key, and sgHttp sends it as JSON in a `POST`, fills its variables from args, resolves with the response's `data`, and treats a response with `errors` and no `data` as a failure. Everything else works as it does for any request. `fetch` sends one, and once you use the [query cache](queries.md), `define` and `query` cache it like any other query.

## A request

```brightscript
const SHOW_QUERY = "query Show($id: ID!) { show(id: $id) { title description } }"

request = { url: "/graphql", graphql: { query: SHOW_QUERY, variables: { id: "{id}" } } }
promises.chain(sghttp.fetch(request, { id: "pilot" }), m).then(function(response as object, m as object) as dynamic
    m.titleLabel.text = response.body.show.title   ' body is the data
    return invalid
end function)
```

The request's `url` is the GraphQL endpoint, relative to the client's `baseUrl` or absolute. `graphql` takes:

| Key | Meaning |
|---|---|
| `query` | The operation's text. It's sent exactly as written. |
| `variables` | The operation's variables, filled from args (see below). Optional. |
| `operationName` | Which operation to run, when the text has more than one. Optional. |

The request's own `query` key is still the url's query string. The operation goes in `graphql.query`.

The method is `POST` unless the request sets one. Headers, `auth`, `timeout`, `client` and the other request settings apply as usual.

## Variables

A variable whose value is exactly `"{name}"` takes the arg called `name`, or the scope, with its type: a number stays a number, and an object or array is sent as one. Other strings are filled as text, and nested objects and arrays are filled the same way:

```brightscript
variables: {
    first: "{count}"                     ' args.count, a number
    filter: { genre: "{genre}" }         ' nested values are filled too
    label: "row-{genre}"                 ' filled as text: "row-drama"
}
```

A `"{name}"` with no arg or scope is left out, so the server sees the variable as null. The operation's text is never filled: `{ show { slug } }` contains `{slug}`, but it's part of the query, not a placeholder.

## The value

`response.body` is the response's `data`, not the whole `{ data, errors }` response. A [parser](parsers.md) receives `data` too, and so does a cached query.

## Errors

A GraphQL server reports a failed operation in the body as `{ errors: [...] }` with no `data`, with a `200` or with a `4xx`. sgHttp treats that as a failure: the promise rejects, an `error` event is emitted, and nothing is cached or written to disk. The error is the usual [error](../reference/events-and-stats.md#errors), with the server's errors added:

```brightscript
{ code: 200, errors: [{ message: "Cannot query field \"nope\" on type \"Query\".", ... }], message: "Cannot query field \"nope\" on type \"Query\".", body: "<raw response text>", ... }
```

`message` is the first error's message. A `4xx` or `5xx` whose body has GraphQL errors carries them the same way.

A response with `data` and `errors` succeeds: some fields failed, and the rest of the data is usable. `response.body` is the `data`, and `response.errors` has the errors. A cached query resolves with the `data`.

This check is done by the built-in transport. A [replacement transport](transport.md#replacing-the-transport) would have to do it itself.

## With the query cache

The rest of this page uses the [query cache](queries.md): read it after [Queries and keys](queries.md) if you haven't defined a query yet.

### A cached query

```brightscript
sghttp.define("show", {
    request: { url: "/graphql", graphql: { query: SHOW_QUERY, variables: { id: "{id}" } } }
    ttl: 300
})

promises.chain(sghttp.query("show", { id: "pilot" }), m).then(function(data as object, m as object) as dynamic
    m.titleLabel.text = data.show.title
    return invalid
end function)
```

A query resolves with the `data`. Args are part of the cache key as usual, so `query("show", { id: "pilot" })` and `query("show", { id: "finale" })` are cached separately.

### Mutations

sgHttp reads the operation's type from its text. When the document has more than one operation, `operationName` decides which is read; without it, a document with any `mutation` counts as one. A `mutation` is a write, without `cache: false`:

```brightscript
const ADD_FAVORITE = "mutation AddFavorite($id: ID!) { addFavorite(id: $id) { ok } }"

sghttp.define("favorites.add", {
    request: { url: "/graphql", graphql: { query: ADD_FAVORITE, variables: { id: "{id}" } } }
    expires: ["favorites"]
})

sghttp.mutate("favorites.add", { id: "pilot" })
```

- It's never cached, so `mutate` accepts it, with `expires`, `removes` and optimistic updates as in [Mutations](mutations.md).
- It's retried only when it can't have been applied, like any `POST`. See [the transport](transport.md#the-built-in-transport).
- Once sent, it isn't aborted by [`cancel`](requests.md#cancelling-a-request).

A GraphQL query, by contrast, is a read even though it's sent as a `POST`. It's retried like a `GET`, and a cancelled `fetch` of one is aborted in flight.

### Pages

A query with [pages](pagination.md) passes the cursor as a variable. For a Relay connection:

```brightscript
const SHOWS_QUERY = "query Shows($after: String) { shows(first: 20, after: $after) { edges { node { title } } pageInfo { endCursor hasNextPage } } }"

sghttp.define("shows", {
    request: { url: "/graphql", graphql: { query: SHOWS_QUERY, variables: { after: "{next}" } } }
    pages: { next: "shows.pageInfo.endCursor", hasNext: "shows.pageInfo.hasNextPage" }
})

sghttp.query("shows")      ' the first page: no next arg, so after is left out
sghttp.nextPage("shows")   ' the next page, with after set to the last page's endCursor
```

The paths are into the `data`. Relay's `endCursor` is usually still set on the last page, so `hasNext` points at `hasNextPage`, and a page whose `hasNextPage` is `false` is the last. Each page in `pages` is that page's `data`.

## Next

[More than one server](multiple-servers.md)
