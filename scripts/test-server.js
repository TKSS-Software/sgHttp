#!/usr/bin/env node
// The HTTP server the transport specs talk to, on this machine's LAN address, so the Roku running
// the specs can reach it.
//
//   node scripts/test-server.js --write-host   writes tests/source/testServer.brs (testServerUrl())
//   require('./test-server').start()           serves until the process exits (scripts/rooibos.js)
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const PORT = Number(process.env.TEST_SERVER_PORT || 8099);

// The IPv4 address on the Roku's subnet, else the first external one
function hostAddress() {
    let rokuIp = process.env.ROKU_HOST || process.env.ROKU_IP || '';
    if (!rokuIp) {
        try {
            const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
            const line = env.split('\n').find((l) => l.startsWith('ROKU_IP='));
            if (line) rokuIp = line.slice('ROKU_IP='.length).trim();
        } catch {}
    }
    const subnet = rokuIp.split('.').slice(0, 3).join('.') + '.';
    const addresses = Object.values(os.networkInterfaces()).flat().filter((a) => a && a.family === 'IPv4' && !a.internal);
    const match = addresses.find((a) => a.address.startsWith(subnet)) || addresses[0];
    if (!match) throw new Error('test-server: no external IPv4 address for the Roku to reach');
    return match.address;
}

function writeHost() {
    const file = path.join(__dirname, '..', 'tests', 'source', 'testServer.brs');
    const url = `http://${hostAddress()}:${PORT}`;
    fs.writeFileSync(file, `' Written by scripts/test-server.js for this run\nfunction testServerUrl() as string\n    return "${url}"\nend function\n`);
    console.log(`test-server: specs will use ${url}`);
}

const hits = {};
function hit(key) {
    hits[key] = (hits[key] || 0) + 1;
    return hits[key];
}

function send(res, code, body, headers = {}) {
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    res.writeHead(code, { 'Content-Type': typeof body === 'string' ? 'text/plain' : 'application/json', ...headers });
    res.end(code === 304 ? undefined : text);
}

// A number in the path, or a 400 instead of a throw that would take the test run down with it
function number(part) {
    const n = Number(part);
    if (!Number.isFinite(n)) throw new BadRoute(`not a number: ${part}`);
    return n;
}
class BadRoute extends Error {}

function handle(req, res, body) {
    try {
        route(req, res, body);
    } catch (e) {
        if (e instanceof BadRoute) return send(res, 400, { error: e.message });
        console.error('test-server:', e);
        if (!res.headersSent) send(res, 500, { error: String(e) });
    }
}

function route(req, res, body) {
    const url = new URL(req.url.startsWith('/;') ? '/proxied' : req.url, 'http://test');
    const parts = url.pathname.split('/').filter(Boolean);
    const echo = { method: req.method, path: req.url, headers: req.headers, body };
    switch (parts[0]) {
        // Everything the server received
        case 'echo':
        case 'proxied':
            return send(res, 200, echo);
        // /status/<code>: that status, with a JSON body
        case 'status':
            return send(res, number(parts[1]), { status: number(parts[1]) });
        // /text: a body that is not JSON
        case 'text':
            return send(res, 200, 'plain text');
        // /flaky/<key>/<n>: 503 for the first n requests, then 200 with the count
        case 'flaky': {
            const count = hit(parts[1]);
            return count <= number(parts[2]) ? send(res, 503, { count }) : send(res, 200, { count });
        }
        // /retry-after/<key>/<seconds>: 503 asking to wait that long, then 200
        case 'retry-after': {
            const count = hit(parts[1]);
            return count === 1 ? send(res, 503, { count }, { 'Retry-After': parts[2] }) : send(res, 200, { count });
        }
        // /hits/<key>: how many requests a key has had, without counting this one
        case 'hits':
            return send(res, 200, { count: hits[parts[1]] || 0 });
        // /slow/<ms>: answers after that long
        case 'slow':
            return setTimeout(() => send(res, 200, { slow: number(parts[1]) }), number(parts[1]));
        // /order/<key>/<label>: the position this request arrived in for the key
        case 'order':
            return send(res, 200, { label: parts[2], position: hit(parts[1]) });
        // GraphQL responses: errors and no data, or data with errors
        case 'graphql-error':
            return send(res, 200, { errors: [{ message: 'bad field' }] });
        case 'graphql-partial':
            return send(res, 200, { data: { a: 1 }, errors: [{ message: 'one field failed' }] });
        // /etag: 304 when the request carries the ETag it sent
        case 'etag':
            return req.headers['if-none-match'] === '"v1"' ? send(res, 304, '') : send(res, 200, { v: 1 }, { ETag: '"v1"' });
        // /file: a small text file; /file-missing: a 404 with an error body
        case 'file':
            return send(res, 200, 'file contents');
        case 'file-missing':
            return send(res, 404, 'no such file');
        // Server-sent event streams (see sse)
        case 'sse':
            return sse(req, res, parts.slice(1), echo);
        // /bench/body/<bytes>: the same JSON listing of about that size every time (npm run bench)
        case 'bench':
            if (parts[1] !== 'body') throw new BadRoute(`unknown bench route: ${parts[1]}`);
            return send(res, 200, benchBody(number(parts[2])), { 'Content-Type': 'application/json' });
        default:
            return send(res, 404, { error: 'unknown route' });
    }
}

// Connections to /sse routes still open, per key, so a spec can tell a stream was closed
const openStreams = {};

function sseHeaders(res) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
}

function sseEvent(res, { event, id, data, retry }) {
    let text = '';
    if (event !== undefined) text += `event: ${event}\n`;
    if (id !== undefined) text += `id: ${id}\n`;
    if (retry !== undefined) text += `retry: ${retry}\n`;
    for (const line of String(data === undefined ? '' : data).split('\n')) text += `data: ${line}\n`;
    res.write(text + '\n');
}

// Holds the connection open with keep-alive comments until the client goes, counting it as open
function holdOpen(req, res, key) {
    if (key) openStreams[key] = (openStreams[key] || 0) + 1;
    const timer = setInterval(() => res.write(': keep-alive\n\n'), 1000);
    res.on('close', () => {
        clearInterval(timer);
        if (key) openStreams[key] -= 1;
    });
}

// /sse/... routes. Each counts its connections per key with hit(), so a spec can read them at /hits/<key>.
function sse(req, res, parts, echo) {
    switch (parts[0]) {
        // /sse/echo/<key>: one "echo" event whose data is what the server received, then held open
        case 'echo':
            hit(parts[1]);
            sseHeaders(res);
            sseEvent(res, { event: 'echo', id: 'e1', data: JSON.stringify(echo) });
            return holdOpen(req, res, parts[1]);
        // /sse/burst/<key>/<n>: n events at once, ids 1..n, then held open
        case 'burst': {
            hit(parts[1]);
            sseHeaders(res);
            for (let i = 1; i <= number(parts[2]); i++) sseEvent(res, { id: String(i), data: `event ${i}` });
            return holdOpen(req, res, parts[1]);
        }
        // /sse/fields: a comment, then events with every field, multi-line data and no id, then held open
        case 'fields':
            sseHeaders(res);
            res.write(': a comment, never delivered\n\n');
            sseEvent(res, { event: 'greeting', id: 'f1', retry: 4000, data: 'hello' });
            sseEvent(res, { id: 'f2', data: 'line one\nline two' });
            sseEvent(res, { data: '{"score":3}' });
            return holdOpen(req, res, '');
        // /sse/tagged/<tag>/<n>: n events, 100 ms apart, each with the tag as data, then held open
        case 'tagged': {
            sseHeaders(res);
            let sent = 0;
            const timer = setInterval(() => {
                sent += 1;
                sseEvent(res, { id: `${parts[1]}-${sent}`, data: parts[1] });
                if (sent >= number(parts[2])) clearInterval(timer);
            }, 100);
            res.on('close', () => clearInterval(timer));
            return holdOpen(req, res, '');
        }
        // /sse/hold/<key>: one event, then held open with keep-alives, counted at /sse/open/<key>
        case 'hold':
            hit(parts[1]);
            sseHeaders(res);
            sseEvent(res, { id: 'h1', data: 'first' });
            return holdOpen(req, res, parts[1]);
        // /sse/open/<key>: how many of a key's connections are open
        case 'open':
            return send(res, 200, { open: openStreams[parts[1]] || 0, connections: hits[parts[1]] || 0 });
        // /sse/drop/<key>: the first connection sends id d1 and is cut; the next ones echo the
        // Last-Event-ID they sent and are held open
        case 'drop': {
            const count = hit(parts[1]);
            sseHeaders(res);
            if (count === 1) {
                sseEvent(res, { id: 'd1', retry: 200, data: 'before the drop' });
                return setTimeout(() => req.socket.destroy(), 200);
            }
            sseEvent(res, { event: 'resumed', data: JSON.stringify({ count, lastEventId: req.headers['last-event-id'] || null }) });
            return holdOpen(req, res, parts[1]);
        }
        // /sse/end/<key>: the first connection sends one event and ends cleanly; the next is a 204
        case 'end': {
            const count = hit(parts[1]);
            if (count > 1) {
                res.writeHead(204);
                return res.end();
            }
            sseHeaders(res);
            sseEvent(res, { id: 'end1', retry: 200, data: 'only' });
            return setTimeout(() => res.end(), 200);
        }
        // /sse/status/<key>/<code>: that status and a JSON body, never a stream
        case 'status':
            hit(parts[1]);
            return send(res, number(parts[2]), { status: number(parts[2]) });
        // /sse/flaky/<key>: 503 for the first connection, then a stream held open
        case 'flaky': {
            const count = hit(parts[1]);
            if (count === 1) return send(res, 503, { count });
            sseHeaders(res);
            sseEvent(res, { data: JSON.stringify({ count }) });
            return holdOpen(req, res, parts[1]);
        }
        default:
            return send(res, 404, { error: 'unknown sse route' });
    }
}

// A listing of rows like an app's home page, at least `bytes` long once encoded. Built once per
// size, so every response of a size is byte for byte the same (its hash too).
const benchBodies = new Map();
function benchBody(bytes) {
    if (!benchBodies.has(bytes)) {
        const items = [];
        let length = 0;
        for (let i = 0; length < bytes; i++) {
            const item = {
                id: `item-${i}`,
                title: `Item ${i}`,
                description: 'A description long enough to look like the synopsis an app would show under a poster.',
                image: `https://images.example.com/posters/${i}.jpg`,
                duration: 1200 + i,
                tags: ['drama', 'new'],
            };
            items.push(item);
            length += JSON.stringify(item).length + 1;
        }
        benchBodies.set(bytes, JSON.stringify({ items }));
    }
    return benchBodies.get(bytes);
}

function start() {
    const server = http.createServer((req, res) => {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => handle(req, res, body));
    });
    server.on('error', (e) => {
        // A server left by an earlier run answers the same routes; anything else is worth seeing
        if (e.code === 'EADDRINUSE') console.log(`test-server: port ${PORT} is in use, assuming a test server is already running`);
        else console.error('test-server:', e);
    });
    server.listen(PORT, '0.0.0.0');
    server.unref();
    return server;
}

module.exports = { start, writeHost, hostAddress, PORT };

if (require.main === module && process.argv.includes('--write-host')) writeHost();
