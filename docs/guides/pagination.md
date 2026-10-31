# Pages

Rails, search results and "view more" grids come from the server a page at a time. A query defined with `pages` loads them one by one, keeps every page it has loaded, and hands you all of them together, so a screen can append the new page and sgQuery can treat the whole listing as one thing to cache, expire and watch.

```brightscript
sgquery.define("titles", {
    request: { url: "/titles", query: { genre: "{genre}" } }
    parser: "TitlesParser"
    pages: { next: "nextUrl", arg: "url", request: { url: "{url}" } }
})
```

With a parser that returns `{ items: [...], nextUrl: "..." }` for each page:

```brightscript
' Opening the screen: every page loaded so far (just the first, the first time)
promises.chain(sgquery.query("titles", { genre: "drama" }), m).then(function(result as object, m as object) as dynamic
    m.items = []
    for each page in result.pages
        m.items.append(page.items)
    end for
    m.hasMore = result.hasNext
    showItems()
    return invalid
end function)

' Near the end of the grid: one more page
promises.chain(sgquery.nextPage("titles", { genre: "drama" }), m).then(function(result as object, m as object) as dynamic
    m.items.append(result.pages.peek().items)
    m.hasMore = result.hasNext
    showItems()
    return invalid
end function)
```

`query` answers with every page loaded so far, not only the first, so a screen opened on a listing that was paged through earlier gets all of it at once. Draw all of `pages`; `nextPage` then adds the one after the last.

## Defining the pages

`pages` has these keys:

| Key | Meaning |
|---|---|
| `next` | The path in a page's **value** (the parser's result, or the decoded body) to the cursor of the page after it: a url, a page number, a token. Dotted for nested fields (`"paging.next"`). The last page leaves it missing, empty or `false`. |
| `arg` | The arg the cursor is passed as when the next page is requested. Default `"next"`. |
| `request` | The request for pages after the first, when it differs from the definition's. Default: the definition's `request`. |
| `byPosition` | `true` for an API that cuts pages by position, so an expired later page is read again rather than kept. See below. Default `false`. |

The next page's args are the first page's args plus `arg`, so a parser that needs the original args (the genre, the model) still gets them, and the request's other placeholders still fill.

Two common shapes:

```brightscript
' The server sends the next page's url: pass it as the url
pages: { next: "nextUrl", arg: "url", request: { url: "{url}" } }

' The server takes a page number: the parser returns nextPage (page + 1, or invalid on the last)
request: { url: "/favorites", query: { page: "{page}" } }
pages: { next: "nextPage", arg: "page" }
```

## What you get back

For a query with pages, `query`, `nextPage` and `peek` all answer with the same shape:

```brightscript
{ pages: [page1, page2, ...], hasNext: true }
```

`pages` holds each page's value in order, `hasNext` whether the last one points to another. `query` loads the first page if nothing is loaded and otherwise answers with every page so far; `nextPage` loads one more. On the last page, `nextPage` answers at once with what there is, without a request. Two `nextPage` calls for the same args while one is loading share it.

## How pages are kept

Each page is an ordinary cache entry, keyed by its own args (the first page's args plus the cursor). That means a page is deduplicated, kept fresh by `ttl`, persisted with `persist`, and compared by body hash on a refresh exactly like any other value. The first page's entry remembers the pages loaded after it.

Because of that, the cache's rules apply per page and per listing:

- **A changed first page starts the listing over.** When a refresh finds the first page different (a `revalidate` query, a stale query, an `expire` then a query), the pages after it belonged to the old listing and are dropped from it. The query then answers with one page, and a watcher of the query hears about it with `pages` of one. `nextPage` follows the new listing from there; if its pages happen to be the same urls, they're already in memory.
- **A changed page that still points to the same next page keeps the pages after it.** Same cursor, same listing: only the page's own content is new. A first page found byte-for-byte unchanged keeps them too.
- **`byPosition: true` re-reads expired later pages.** An API that cuts pages by position (`page=2`, `offset=20`) shifts entries between pages on every change: add one at the front and the last entry of page 1 moves to page 2. Its next-page cursor stays the same, so by the rule above the old page 2 would be kept, one entry short. With `byPosition`, a later page that has expired (a mutation's `expires`, or `expire`) is no longer part of the listing: the query answers with the pages up to it, `hasNext` is true, and `nextPage` reads it again. Use it for lists the user edits (favorites); leave it off for listings whose later pages don't move when the first changes.
- **`expire(name, args)` and `invalidate(name, args)`** on the first page's args cover the pages after it. By name (`expire("titles")`) they cover every page of every listing, as always.
- **Eviction** can drop a middle page from memory (`maxEntries`). The listing then ends at the page before it, and `nextPage` reloads from there.
- **Persistence** keeps each page on disk. On a cold start the first page is served from disk as usual; later pages are loaded again by `nextPage` (and may come from disk too).

## Watching a listing

`watch(name, callback, args)` with the first page's args hears about the listing: the callback's `value` is `{ pages, hasNext }`. Pages after the first never notify on their own; a change in one of them is reported as the listing's, under the first page's key.

## Next

[Scopes and time buckets](scopes-and-buckets.md)
