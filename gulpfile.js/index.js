'use strict';

const path       = require('path');
const requireDir = require('require-dir');

// Fallback for windows backs out of node_modules folder to root of project
process.env.PWD = process.env.PWD || path.resolve(process.cwd(), '../../');

requireDir('./modules', {recurse: true});
