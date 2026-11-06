#!/usr/bin/env node
// npm run bench: builds the benchmark app (bench/, with src/), sideloads it to the Roku in .env,
// reads its results off the debug console (port 8085) and prints them as a table. Each run's
// results are saved to build/bench/<commit>.json, so a later run can be compared against it.
//
//   npm run bench                                   20 timed runs per case
//   npm run bench -- --runs 50                      more runs per case
//   npm run bench -- --busy                         an animation and script on the render thread
//                                                   throughout, saved as <commit>-busy.json
//   npm run bench -- --compare build/bench/abc1234.json
//                                                   adds the saved run's medians and the change
//
// The device's debug console must be free: a VS Code debug session or a telnet on 8085 makes
// the run fail. The dev channel is replaced, not deleted, so the registry every sideloaded app
// shares survives (see scripts/rooibos.js).
const fs = require('fs');
const net = require('net');
const path = require('path');
const { execFileSync } = require('child_process');
const { rokuDeploy } = require('roku-deploy');
const testServer = require('./test-server');

const root = path.join(__dirname, '..');
const CONSOLE_PORT = 8085;
// Generous: 12 cases of 20 runs take about a minute on a Roku Express 4K
const TIMEOUT_MS = 15 * 60 * 1000;

function option(name, fallback) {
    const index = process.argv.indexOf(`--${name}`);
    return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] : fallback;
}

function envValue(name) {
    if (process.env[name]) return process.env[name];
    try {
        const line = fs.readFileSync(path.join(root, '.env'), 'utf8').split('\n').find((l) => l.startsWith(`${name}=`));
        return line ? line.slice(name.length + 1).trim() : '';
    } catch {
        return '';
    }
}

// Ends the run with a message. The script then exits on its own once nothing is left open:
// process.exit() would cut off output still on its way down a pipe (asynchronous on macOS).
class BenchError extends Error {}
function fail(message) {
    throw new BenchError(message);
}
// The console being watched, so a failure can close it
let openConsole = null;

function git(...args) {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

// What the device answers a second client of its console with, before closing it
const CONSOLE_IN_USE = 'Console connection is already in use';
// How long a new connection must stay open to count as ours: a refused one closes within a few ms
const CONSOLE_SETTLE_MS = 500;

// Watches the device's debug console for the lines the app prints that start with [bench].
// The console replays recent output to a new connection, earlier runs' lines included, so only
// lines after this run's "[bench] start <runId>" count. ready resolves once the console is ours,
// and rejects when another client holds it. done resolves with the lines once the app says done;
// a BrightScript crash rejects it. A console that drops (the channel being replaced) is
// connected again, keeping the lines so far.
function watchConsole(host, runId) {
    const lines = [];
    const recent = [];
    let socket = null;
    let finished = false;
    let reconnects = 0;
    let started = false;
    let resolveReady, rejectReady, resolveDone, rejectDone;
    const ready = new Promise((resolve, reject) => ((resolveReady = resolve), (rejectReady = reject)));
    const done = new Promise((resolve, reject) => ((resolveDone = resolve), (rejectDone = reject)));
    // Awaited only after the sideload: until then a failure must not count as unhandled
    done.catch(() => {});
    const timer = setTimeout(() => finish(new Error(`no "[bench] done" after ${TIMEOUT_MS / 60000} minutes`)), TIMEOUT_MS);

    function finish(error) {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        socket.destroy();
        if (error) {
            rejectReady(error);
            rejectDone(error);
        } else {
            resolveDone(lines);
        }
    }

    function onLine(line) {
        if (line.includes(CONSOLE_IN_USE)) {
            return finish(new Error(`the debug console on ${host}:${CONSOLE_PORT} is in use: close the VS Code debug session or telnet attached to it, then run again`));
        }
        const at = line.indexOf('[bench] ');
        const text = at < 0 ? '' : line.slice(at + '[bench] '.length);
        if (!started) {
            started = text === `start ${runId}`;
            return;
        }
        recent.push(line);
        if (recent.length > 40) recent.shift();
        if (/Brightscript Debugger|BrightScript Micro Debugger/i.test(line)) {
            return finish(new Error(`the app crashed:\n${recent.join('\n')}`));
        }
        if (at < 0) return;
        lines.push(text);
        if (text.startsWith('case ')) console.log(`  ${text.slice(5)}`);
        if (text.startsWith('error ')) console.error(`  error: ${text.slice(6)}`);
        if (text.startsWith('stall ')) console.error(`  stalled: ${text.slice(6)}`);
        if (text === 'done') finish();
    }

    function connect() {
        let buffer = '';
        // The replay repeats what an earlier connection already read, from this run's start on
        started = false;
        lines.length = 0;
        socket = net.connect(CONSOLE_PORT, host);
        socket.setEncoding('utf8');
        socket.on('connect', () => setTimeout(() => !finished && !socket.destroyed && resolveReady(), CONSOLE_SETTLE_MS));
        socket.on('data', (chunk) => {
            buffer += chunk;
            const parts = buffer.split(/\r?\n/);
            buffer = parts.pop();
            parts.forEach(onLine);
            // The in-use notice may come without a newline before the close
            if (buffer.includes(CONSOLE_IN_USE)) onLine(buffer);
        });
        socket.on('error', (e) => {
            if (reconnects === 0) finish(new Error(`debug console ${host}:${CONSOLE_PORT}: ${e.message}`));
        });
        socket.on('close', () => {
            if (finished) return;
            if (++reconnects > 20) return finish(new Error(`the debug console on ${host}:${CONSOLE_PORT} kept closing`));
            setTimeout(connect, 250);
        });
    }

    connect();
    return { ready, done, close: () => finish(new Error('closed')) };
}

// formatJson writes an associative array's keys in lower case (wrongSource arrives as wrongsource)
function parseResults(lines) {
    const json = (prefix) => lines.filter((l) => l.startsWith(prefix)).map((l) => JSON.parse(l.slice(prefix.length)));
    return { device: json('device ').pop() || {}, results: json('result ') };
}

function ms(value) {
    return value === undefined || value === null ? '-' : `${Math.round(value * 10) / 10}`;
}

function change(now, before) {
    if (!before || now === undefined || now === null) return '';
    const percent = ((now - before) / before) * 100;
    return `${percent > 0 ? '+' : ''}${Math.round(percent)}%`;
}

function printTable(run, baseline) {
    const before = new Map((baseline ? baseline.results : []).map((r) => [r.case, r]));
    const header = ['case', 'caller median', 'caller p90', 'store median', 'store p90', 'block median', 'block max'];
    if (baseline) header.push(`caller median @${baseline.commit}`, 'change');
    header.push('notes');
    const rows = run.results.map((r) => {
        const notes = [];
        if (r.failures) notes.push(`${r.failures} failed`);
        if (r.wrongsource) notes.push(`${r.wrongsource} took another path`);
        const row = [r.case, ms(r.caller?.median), ms(r.caller?.p90), ms(r.store?.median), ms(r.store?.p90), ms(r.block?.median), ms(r.block?.max)];
        if (baseline) {
            const old = before.get(r.case);
            row.push(ms(old?.caller?.median), change(r.caller?.median, old?.caller?.median));
        }
        row.push(notes.join(', '));
        return row;
    });
    const widths = header.map((h, i) => Math.max(h.length, ...rows.map((row) => String(row[i]).length)));
    const line = (cells) => cells.map((c, i) => (i === 0 || i === cells.length - 1 ? String(c).padEnd(widths[i]) : String(c).padStart(widths[i]))).join('  ');
    console.log('');
    console.log(`${run.device.name || run.device.model || 'device'} (${run.device.model || '?'}), OS ${run.device.os || '?'}, ${run.device.runs} runs per case, commit ${run.commit}${run.device.busy ? ', render thread busy' : ''}`);
    console.log('Milliseconds. caller: query() to the caller\'s then. store: the store\'s own event.');
    console.log('block: the longest the render thread went without servicing a timer due every frame, during a run.');
    console.log('');
    console.log(line(header));
    console.log(line(widths.map((w) => '-'.repeat(w))));
    rows.forEach((row) => console.log(line(row)));
    console.log('');
}

async function main() {
    const host = envValue('ROKU_HOST') || envValue('ROKU_IP');
    const password = envValue('ROKU_PASSWORD');
    if (!host || !password) fail('set ROKU_IP and ROKU_PASSWORD in .env (or ROKU_HOST and ROKU_PASSWORD in the environment)');
    const runs = Number(option('runs', '20'));
    if (!Number.isInteger(runs) || runs < 1) fail('--runs takes a whole number');
    const busy = process.argv.includes('--busy');
    const comparePath = option('compare', '');
    const baseline = comparePath ? JSON.parse(fs.readFileSync(path.resolve(comparePath), 'utf8')) : null;

    const dirty = git('status', '--porcelain').length > 0;
    const commit = git('rev-parse', '--short', 'HEAD') + (dirty ? '-dirty' : '');

    testServer.writeHost();
    // Tells this run's lines from the earlier ones the console replays (see watchConsole)
    const runId = `${Date.now()}`;
    fs.writeFileSync(
        path.join(root, 'bench', 'source', 'benchConfig.brs'),
        `' Written by scripts/bench.js for this run\nfunction benchRuns() as integer\n    return ${runs}\nend function\n\nfunction benchRunId() as string\n    return "${runId}"\nend function\n\nfunction benchBusy() as boolean\n    return ${busy}\nend function\n`
    );
    execFileSync(path.join(root, 'node_modules', '.bin', 'bsc'), ['--project', 'bsconfig-bench.json'], { cwd: root, stdio: 'inherit' });

    const outDir = path.join(root, 'build', 'bench');
    fs.mkdirSync(outDir, { recursive: true });
    await rokuDeploy.zipFolder(path.join(root, 'build', 'bench-staging'), path.join(outDir, 'sghttp-bench.zip'));

    testServer.start();
    // Listening before the sideload, which launches the app: its first lines are not missed
    const deviceConsole = (openConsole = watchConsole(host, runId));
    await deviceConsole.ready;
    console.log(`bench: sideloading to ${host}, ${runs} runs per case${busy ? ', render thread busy' : ''}`);
    await rokuDeploy.publish({ host, password, outDir, outFile: 'sghttp-bench.zip', failOnCompileError: true });
    const lines = await deviceConsole.done;

    const run = { commit, date: new Date().toISOString(), ...parseResults(lines) };
    if (run.results.length === 0) fail('the app reported no results');
    const savedPath = path.join(outDir, `${commit}${busy ? '-busy' : ''}.json`);
    fs.writeFileSync(savedPath, JSON.stringify(run, null, 2));
    printTable(run, baseline);
    console.log(`bench: saved to ${path.relative(root, savedPath)}${baseline ? '' : `; compare a later run with --compare ${path.relative(root, savedPath)}`}`);
    if (run.results.some((r) => r.failures)) process.exitCode = 1;
}

main().catch((e) => {
    console.error(`bench: ${e.message}`);
    if (openConsole) openConsole.close();
    process.exitCode = 1;
});
