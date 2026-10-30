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

const sideload = RokuDeploy.prototype.sideload;
RokuDeploy.prototype.sideload = function (options) {
    return sideload.call(this, { deleteDevChannel: false, ...options });
};

process.argv = [process.argv[0], cliPath, ...process.argv.slice(2)];
require(cliPath);
