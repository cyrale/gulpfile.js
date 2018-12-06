"use strict";

const path = require("path");
const requireDir = require("require-dir");

// Fallback for windows backs out of node_modules folder to root of project
process.env.PWD = process.env.PWD || path.resolve(process.cwd(), "../../");

// Change working directory
process.chdir(process.env.PWD);

requireDir("./modules", { recurse: true });
