"use strict";

const _ = require("lodash");

const path = require("path");
const del = require("del");
const chalk = require("chalk");

const gulp = require("gulp");
const plumber = require("gulp-plumber");
const imagemin = require("gulp-imagemin");
const newer = require("gulp-newer");

const bsync = require("./browsersync");

const log = require("fancy-log");
const notify = require("../notify");

const Task = require("../task");

class Images extends Task {
  constructor(name, options) {
    super(name, options);

    this.options.settings = _.merge(
      {
        jpegtran: {
          progressive: true
        },
        optipng: {
          optimizationLevel: 5
        },
        gifsicle: {
          interlaced: true,
          optimizationLevel: 3
        },
        svgo: {
          plugins: [{ removeViewBox: true }, { cleanupIDs: false }]
        }
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
        imagemin(
          [
            imagemin.jpegtran(this.options.settings.jpegtran),
            imagemin.optipng(this.options.settings.optipng),
            imagemin.gifsicle(this.options.settings.gifsicle),
            imagemin.svgo(this.options.settings.svgo)
          ],
          { verbose: true }
        )
      )
      .pipe(gulp.dest(this.options.dst, { cwd: this.options.cwd }))
      .pipe(bsync.sync());
  }

  watch(done, task) {
    const src = this.options.src.concat(this.options.watch || []);

    gulp.watch(src, { cwd: this.options.cwd }, gulp.series(task)).on("unlink", filename => {
      let srcFilename = path.resolve(filename);
      let srcParts = srcFilename.split("/");

      let dstFilename = path.resolve(path.join(this.options.cwd, this.options.dst));
      let dstParts = dstFilename.split("/");

      let newFilename = "/";
      let index = 0;

      while (srcParts[index] === dstParts[index] && (index < srcParts.length || index < dstParts.length)) {
        newFilename = path.join(newFilename, srcParts[index]);
        index++;
      }

      for (let i = index; i < dstParts.length; i++) {
        newFilename = path.join(newFilename, dstParts[i]);
      }

      newFilename = path.join(newFilename, path.basename(filename));

      log("gulp-imagemin: Deleted image: " + chalk.blue(path.relative(this.options.cwd, newFilename)));

      del.sync(newFilename, {
        force: true
      });
    });

    done();
  }
}

module.exports = Images;
