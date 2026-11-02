# Overview

sgHttp is an HTTP client for Roku SceneGraph apps. Its job is to send requests and hand back responses without blocking the render thread. A request can name a parser, which is not required, but lets the response be turned into ContentNodes on a task thread instead of the render thread. sgHttp also has a query cache. The cache returns previously fetched data from memory, saves responses to disk for the next launch, and refreshes data in the background. Each of these is turned on per request, in its definition, and `fetch` works the same whether or not the app uses them.

## Motivation

SceneGraph gives you `roUrlTransfer`, Task nodes and message ports, and leaves combining them to you. Every channel ends up solving the same problems:

- **Threads.** `roUrlTransfer` can't run on the render thread, so every request means a Task, a port, a field to observe and a callback to route the answer back.
- **Concurrency.** A screen that needs five things wants five requests in flight, but not fifty. That means writing a pool and a queue.
- **Failures.** Requests need timeouts and retries with backoff, and not every failure is safe to retry: a `POST` may already have gone through.
- **Headers.** The auth token has to reach every request, and change when the user signs in or out.
- **Decoding.** JSON parsing on the render thread can stall animation. It belongs on the task.
- **Answers.** The component that asked wants something it can chain, not a field to poll.

sgHttp's HTTP client does that work. Each server gets a transport task with a pool of `roUrlTransfer` objects, retries and timeouts. Shared headers are added to every request, JSON is decoded on the task, a debugging proxy can be set in `initialize`, and the render thread receives a promise.

### The query cache

Much of an app's data is requested by more than one screen, and more than once. Define such a request with `define` and call it with `query` instead of `fetch`, and the cache handles the following for it:

- **Caching and de-duplication.** Two screens showing the same rail cause one request, and three components asking at the same moment receive the same response. When the user goes back to a screen, its data is returned from memory, so the screen can draw without a spinner.
- **Staleness.** Knowing when cached data is out of date, and refreshing it in the background while the cached copy is still shown.
- **Cold starts.** Showing the first screen after launch from the last response, instead of waiting for the network.
- **Writes.** After the user adds a favorite, every screen showing favorites needs the new list.
- **Per-user data.** Switching profile must never show the previous profile's data.
- **Memory.** A Roku has little memory, so the cache has a limit on the number of entries it holds.

Each query's definition says which of these it uses. A request you never define is never cached, and `fetch` behaves the same whether or not the app uses queries anywhere else.

## Next

[Installation](installation.md)
