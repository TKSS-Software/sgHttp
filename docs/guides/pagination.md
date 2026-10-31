# Pages

Rails, search results and "view more" grids come from the server a page at a time. A query defined with `pages` loads them one at a time and keeps every page it has loaded. It returns all of the loaded pages together, so a screen can append each new page as it arrives. sgHttp caches, expires and watches the whole listing as one unit.

```brightscript
sghttp.define("titles", {
    request: { url: "/titles", query: { genre: "{genre}" } }
    parser: "TitlesParser"
    pages: { next: "nextUrl", arg: "url", request: { url: "{url}" } }
})
```

With a parser that returns `{ items: [...], nextUrl: "..." }` for each page:

```brightscript
' Opening the screen: every page loaded so far (just the first, the first time)
promises.chain(sghttp.query("titles", { genre: "drama" }), m).then(function(result as object, m as object) as dynamic
    m.items = []
    for each page in result.pages
        m.items.append(page.items)
    end for
    m.hasMore = result.hasNext
    showItems()
    return invalid
end function)

' Near the end of the grid: one more page
promises.chain(sghttp.nextPage("titles", { genre: "drama" }), m).then(function(result as object, m as object) as dynamic
    m.items.append(result.pages.peek().items)
    m.hasMore = result.hasNext
    showItems()
    return invalid
end function)
```

`query` returns every page loaded so far, not only the first. So when a screen opens on a listing the user paged through earlier, it gets all of those pages at once. Draw every page in `pages`. `nextPage` then loads the page after the last one.

## Defining the pages

`pages` has these keys:

| Key | Meaning |
|---|---|
| `next` | The path, in a page's **value** (the parser's result, or the decoded body), to the cursor of the next page: a url, a page number or a token. Use dots for nested fields (`"paging.next"`). On the last page it's missing, empty or `false`. |
| `arg` | The name of the arg that carries the cursor when the next page is requested. Default `"next"`. |
| `request` | The request for pages after the first, when it differs from the definition's. Default: the definition's `request`. |
| `byPosition` | `true` for an API that cuts pages by position, so an expired later page is read again rather than kept. See below. Default `false`. |

The next page's args are the first page's args plus `arg`, so a parser that needs the original args (the genre, the model) still gets them, and the request's other placeholders are still filled.

Two common shapes:

```brightscript
' The server sends the next page's url: pass it as the url
pages: { next: "nextUrl", arg: "url", request: { url: "{url}" } }

' The server takes a page number: the parser returns nextPage (page + 1, or invalid on the last)
request: { url: "/favorites", query: { page: "{page}" } }
pages: { next: "nextPage", arg: "page" }
```

## What you get back

For a query with pages, `query`, `nextPage` and `peek` all return the same shape:

```brightscript
{ pages: [page1, page2, ...], hasNext: true }
```

`pages` holds each page's value in order, and `hasNext` says whether the last one points to another. `query` loads the first page if nothing is loaded yet, and otherwise returns every page loaded so far. `nextPage` loads one more. When the last page has been loaded, `nextPage` returns the pages it has at once, without sending a request. If `nextPage` is called twice for the same args while a page is loading, both calls share that load.

## How pages are kept

Each page is an ordinary cache entry, keyed by its own args (the first page's args plus the cursor). That means a page is deduplicated, kept fresh by `ttl`, persisted with `persist`, and compared by body hash on a refresh exactly like any other value. The first page's entry remembers the pages loaded after it.

Because of that, the cache's rules apply per page and per listing:

- **A first page whose next-page cursor changed starts the listing over.** When a refresh finds the first page different (a `revalidate` query, a stale query, an `expire` then a query) and its cursor to the next page changed too, the pages after it belong to the old listing, so they're dropped from it. The query then returns one page, and a watcher of the query is notified with `pages` holding that one page. `nextPage` follows the new listing from there; if its pages happen to have the same urls, they're already in memory.
- **A changed page that still points to the same next page keeps the pages after it.** If the cursor is the same, the listing is treated as the same one, and only that page's own content is new. A first page that is found byte-for-byte unchanged keeps the pages after it too.
- **`byPosition: true` re-reads expired later pages.** An API that cuts pages by position (`page=2`, `offset=20`) shifts entries between pages on every change: add one at the front, and the last entry of page 1 moves to page 2. The next-page cursor stays the same, so under the rule above the old page 2 would be kept, one entry short. With `byPosition`, a later page that has expired (through a mutation's `expires`, or `expire`) is no longer part of the listing. The query returns the pages before it, `hasNext` is true, and `nextPage` loads it again. Use it for lists the user edits, like favorites; leave it off for listings whose later pages don't move when the first one changes.
- **`expire(name, args)` and `invalidate(name, args)`** on the first page's args cover the pages after it. By name (`expire("titles")`) they cover every page of every listing, as always.
- **Eviction** can drop a middle page from memory (`maxEntries`). The listing then ends at the page before it, and `nextPage` reloads from there.
- **Persistence** keeps each page on disk. On a cold start, the first page is returned from disk as usual. Later pages are loaded again by `nextPage`, and may also come from disk.

## Watching a listing

A watcher made with `watch(name, callback, args)` and the first page's args is notified about the whole listing; the callback's `value` is `{ pages, hasNext }`. Pages after the first never send notifications of their own. A change in one of them is reported as a change to the listing, under the first page's key.

## Next

[Scopes and time buckets](scopes-and-buckets.md)
