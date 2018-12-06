"use strict";

const gulp = require("gulp");
const tasks = require("./manager");

gulp.task(
  "default",
  gulp.series(
    gulp.parallel(tasks.sprites, tasks.fonts, tasks.svgstore),
    tasks.images,
    gulp.parallel(tasks.pug, tasks.sass, tasks.javascript),
    tasks.browsersync
  )
);
