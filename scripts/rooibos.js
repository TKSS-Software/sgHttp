#!/usr/bin/env node
// Runs the Rooibos CLI without deleting the dev channel first.
//
// The CLI sideloads through roku-deploy v4, whose sideload() deletes the installed dev channel
// unless told not to, and the CLI has no option for it. Deleting (rather than replacing) the dev
// channel wipes its registry, which every sideloaded app shares: running these specs signed the
// developer out of whichever app was sideloaded next. A plain replace keeps the registry.
const path = require('path');

const cliPath = require.resolve('rooibos-roku/dist/cli.js');
// The roku-deploy the CLI itself loads (its own nested copy), not the package's
const { RokuDeploy } = require(require.resolve('roku-deploy', { paths: [path.dirname(cliPath)] }));

// Fail loudly rather than silently resume wiping the registry if rooibos-roku moves to a
// roku-deploy whose sideload or option name differs from the one this was written against
const rokuDeployVersion = require(require.resolve('roku-deploy/package.json', { paths: [path.dirname(cliPath)] })).version;
const sideload = RokuDeploy.prototype.sideload;
if (typeof sideload !== 'function' || !rokuDeployVersion.startsWith('4.')) {
    console.error(`scripts/rooibos.js: expected rooibos-roku to sideload through roku-deploy 4.x's RokuDeploy.prototype.sideload (found roku-deploy ${rokuDeployVersion}); check that deleteDevChannel is still the option to disable and update this script`);
    process.exit(1);
}
RokuDeploy.prototype.sideload = function (options) {
    return sideload.call(this, { deleteDevChannel: false, ...options });
};

// The server the transport specs talk to (see scripts/test-server.js), for as long as the run lasts
require('./test-server').start();

process.argv = [process.argv[0], cliPath, ...process.argv.slice(2)];
require(cliPath);
