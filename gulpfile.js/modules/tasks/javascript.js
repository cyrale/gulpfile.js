"use strict";

const _ = require("lodash");

const fs = require("fs");
const path = require("path");
const chalk = require("chalk");

const source = require("vinyl-source-stream");
const buffer = require("vinyl-buffer");

const gulp = require("gulp");
const eslint = require("gulp-eslint");
const browserify = require("browserify");
const babelify = require("babelify");
const babel = require("gulp-babel");
const concat = require("gulp-concat");
const uglify = require("gulp-uglify");

const plumber = require("gulp-plumber");
const gulpif = require("gulp-if");
const rename = require("gulp-rename");

const bsync = require("./browsersync");

const events = require("events");
const emitter = new events.EventEmitter();
const PluginError = require("plugin-error");
const log = require("fancy-log");
const notify = require("../notify");

const Config = require("../config");
const conf = new Config();

const Task = require("../task");

class JavaScript extends Task {
  constructor(name, options) {
    super(name, options);

    this.build = undefined;
  }

  failOnError(filesWithErrors, funcName) {
    let settings = conf.load() || {};
    let errorCount = 0;
    let errorMessage;

    this.lintError = false;

    if (filesWithErrors.length > 0) {
      // Prepare messages for the command line.
      errorMessage = filesWithErrors
        .map(file => {
          let messages = [];
          let filename = path.relative(settings.cwd, file.filePath);

          errorCount += file.errorCount;

          if (file.errorCount > 0) {
            messages.push(Task.formatErrorInformation(file.errorCount, file.warningCount, filename));
          }

          return messages;
        })
        .join("\n");

      // Emit or display errors.
      if (errorCount > 0) {
        this.lintError = true;

        // Notify errors.
        notify.notify(Task.formatForNotification(filesWithErrors), this.name + ":" + funcName);

        if (this.isCurrentTask(funcName) || this.isParentTask(funcName)) {
          emitter.emit("error", new PluginError({ plugin: "eslint", message: `\n${errorMessage}\n` }));
        } else {
          log(chalk.red(`Error:\n${errorMessage}`));
        }
      }
    }
  }

  lint(done, funcName) {
    let eslintIgnore = path.join(this.options.cwd, ".eslintignore");
    let eslintOptions = {};

    try {
      if (fs.lstatSync(eslintIgnore).isFile()) {
        eslintOptions.ignorePath = eslintIgnore;
      }
    } catch (e) {}

    return gulp
      .src(this.options.src, { cwd: this.options.cwd })
      .pipe(eslint(eslintOptions))
      .pipe(eslint.format())
      .pipe(
        eslint.results(filesWithErrors => {
          return this.failOnError(filesWithErrors, funcName);
        })
      );
  }

  nest(done, funcName) {
    return this.compile(false, done, funcName);
  }

  compress(done, funcName) {
    return this.compile(true, done, funcName);
  }

  compile(minified, done, funcName) {
    minified = minified || false;

    let displayLintError = minified || _.indexOf(conf.options._, `${this.name}:${funcName}`) >= 0;

    const browserifySettings = _.merge(
      {
        entries: this.options.src,
        insertGlobals: true,
        debug: this.options.debug || false
      },
      this.options.settings.browserify || {}
    );

    const babelSettings = _.merge(
      {
        presets: ["@babel/preset-env"]
      },
      this.options.settings.babel || {}
    );

    let stream;

    if (false === this.options.settings.browserify) {
      stream = gulp.src(this.options.src, {
        cwd: this.options.cwd,
        sourcemaps: conf.options.sourcemaps && !minified
      });
    } else {
      stream = browserify(browserifySettings)
        .transform(babelify, babelSettings)
        .bundle()
        .pipe(source(this.options.filename))
        .pipe(buffer());
    }

    if (!this.lintError) {
      stream
        .pipe(
          plumber(error => {
            if (displayLintError) {
              notify.onError(error, `${this.name}:${funcName}`);
            }

            emitter.emit("end");
          })
        )
        .pipe(
          gulpif(
            false === this.options.settings.browserify && false !== this.options.settings.babel,
            babel(babelSettings)
          )
        )
        .pipe(gulpif(false === this.options.settings.browserify, concat(this.options.filename)))
        .pipe(gulpif(minified, uglify()))
        .pipe(
          rename({
            suffix: minified ? ".min" : ""
          })
        )
        .pipe(gulp.dest(this.options.dst, { cwd: this.options.cwd }))
        .pipe(gulpif(minified, bsync.sync({ match: "**/*.js" })));
    }

    return stream;
  }
}

module.exports = JavaScript;
