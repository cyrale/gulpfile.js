#!/usr/bin/env node

let args = ["--gulpfile", "node_modules/gulpfile.js/dist/app.js"];

const additionalArgs = process.argv.slice(2);
if (additionalArgs.length) {
  args = [...args, ...additionalArgs];
}

require("child_process").fork("node_modules/gulp/bin/gulp", args);
