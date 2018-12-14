const _ = require("lodash");

const path = require("path");
const through = require("through2");
const chalk = require("chalk");
const merge = require("merge-stream");

const gulp = require("gulp");
const plumber = require("gulp-plumber");
const gulpif = require("gulp-if");

const sass = require("gulp-sass");
const sassLint = require("gulp-sass-lint");
const extractMQ = require("gulp-extract-media-queries");
const criticalCSS = require("gulp-critical-css");
const postcss = require("gulp-postcss");
const assets = require("postcss-assets");
const autoprefixer = require("autoprefixer");
const rucksack = require("rucksack-css");
const inlineSVG = require("postcss-inline-svg");
const SVGO = require("postcss-svgo");
const cssnano = require("cssnano");
const mqpacker = require("css-mqpacker");
const sortCSSmq = require("sort-css-media-queries");
const rename = require("gulp-rename");

const task = require("../modules-rewrite/task");
// const { options } = require("../modules-rewrite/config");

// const events = require("events");
// const emitter = new events.EventEmitter();
// const PluginError = require("plugin-error");
// const log = require("fancy-log");
// const notify = require("../notify");

const lint = () => {};

const compile = (minified, settings) => {
  console.log(minified, settings);
  return task.gulp
    .src(settings.src, { cwd: settings.cwd })
    .pipe(
      plumber(error => {
        console.log(error);
      })
    )
    .pipe(sass())
    .pipe(gulp.dest(settings.dst, { cwd: settings.cwd }));
};

module.exports = (name, settings) => {
  let tasks = {};

  tasks[`${name}:build`] = [compile(false, settings), compile(true, settings), task.check];

  return tasks;
};
