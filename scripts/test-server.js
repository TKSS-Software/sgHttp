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
        // /bench/body/<bytes>: the same JSON listing of about that size every time (npm run bench)
        case 'bench':
            if (parts[1] !== 'body') throw new BadRoute(`unknown bench route: ${parts[1]}`);
            return send(res, 200, benchBody(number(parts[2])), { 'Content-Type': 'application/json' });
        default:
            return send(res, 404, { error: 'unknown route' });
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
