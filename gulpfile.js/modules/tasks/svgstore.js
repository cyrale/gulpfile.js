"use strict";

const _ = require("lodash");

const path = require("path");

const gulp = require("gulp");
const plumber = require("gulp-plumber");
const rename = require("gulp-rename");
const svgstore = require("gulp-svgstore");
const svgmin = require("gulp-svgmin");
const newer = require("gulp-newer");

const bsync = require("./browsersync");

const notify = require("../notify");

const Task = require("../task");

class SVGStore extends Task {
  constructor(name, options) {
    super(name, options);

    this.options.settings = _.merge(
      {
        plugins: [
          {
            inlineStyles: {
              onlyMatchedOnce: false
            }
          },
          {
            removeDoctype: true
          },
          {
            removeComments: true
          },
          {
            removeMetadata: true
          },
          {
            removeTitle: true
          },
          {
            removeDesc: true
          },
          {
            removeViewBox: false
          },
          {
            removeDimensions: true
          }
        ]
      },
      this.options.settings || {}
    );
  }

  build() {
    return gulp
      .src(this.options.src, { cwd: this.options.cwd })
      .pipe(newer(path.join(this.options.cwd, this.options.dst)))
      .pipe(
        plumber(error => {
          notify.onError(error, this.name);
        })
      )
      .pipe(
        svgmin(file => {
          return _.merge(this.options.settings, {
            plugins: [
              {
                cleanupIDs: {
                  prefix: path.basename(file.relative, path.extname(file.relative)) + "-",
                  minify: true,
                  force: true
                }
              }
            ]
          });
        })
      )
      .pipe(svgstore())
      .pipe(
        rename({
          basename: path.basename(this.options.filename, path.extname(this.options.filename)),
          extname: ".svg"
        })
      )
      .pipe(gulp.dest(this.options.dst, { cwd: this.options.cwd }))
      .pipe(bsync.sync());
  }
}

module.exports = SVGStore;
