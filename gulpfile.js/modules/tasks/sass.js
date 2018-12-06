"use strict";

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

const bsync = require("./browsersync");

const events = require("events");
const emitter = new events.EventEmitter();
const PluginError = require("plugin-error");
const log = require("fancy-log");
const notify = require("../notify");

const Config = require("../config");
const conf = new Config();

const Task = require("../task");

class Sass extends Task {
  constructor(name, options) {
    super(name, options);

    this.build = undefined;
  }

  failOnError(funcName) {
    let filesWithErrors = [];

    return through(
      { objectMode: true },
      function(file, encoding, cb) {
        if (file.isNull()) {
          return cb();
        }

        if (file.isStream()) {
          emitter.emit("error", new PluginError({ plugin: "sass-lint", message: "Streams are not supported!" }));
          return cb();
        }

        if (file.sassLint[0].errorCount > 0) {
          filesWithErrors.push(file);
        }

        this.push(file);
        cb();
      },
      cb => {
        let settings = conf.load() || {};
        let errorMessage;

        if (filesWithErrors.length > 0) {
          this.lintError = true;

          // Notify errors.
          notify.notify(Task.formatForNotification(filesWithErrors, "sassLint"), `${this.name}:${funcName}`);

          // Prepare messages for the command line.
          errorMessage = filesWithErrors
            .map(file => {
              let messages = [];
              let sassLint = file.sassLint[0];
              let filename = path.relative(settings.cwd, sassLint.filePath);

              messages.push(Task.formatErrorInformation(sassLint.errorCount, sassLint.warningCount, filename));

              return messages;
            })
            .join("\n");

          // Emit or display errors.
          if (this.isCurrentTask(funcName) || this.isParentTask(funcName)) {
            emitter.emit("error", new PluginError({ plugin: "sass-lint", message: `\n${errorMessage}\n` }));
          } else {
            log(chalk.red(`Error:\n${errorMessage}`));
          }
        }

        cb();
      }
    );
  }

  lint(done, funcName) {
    this.lintError = false;

    return gulp
      .src(this.options.src, { cwd: this.options.cwd })
      .pipe(sassLint({ configFile: path.join(this.options.cwd, ".sass-lint.yml") }))
      .pipe(sassLint.format())
      .pipe(this.failOnError(funcName));
  }

  nest(done, funcName) {
    return this.compile(false, funcName);
  }

  compress(done, funcName) {
    return this.compile(true, funcName);
  }

  compile(minified, funcName) {
    minified = minified || false;

    let appSettings = conf.load() || {};
    let taskSettings = _.merge(
      {
        sass: { outputStyle: "nested" },
        autoprefixer: { browsers: ["> 1%", "IE >= 9"], grid: true },
        rucksack: { fallbacks: true }
      },
      appSettings.sass.settings || {},
      this.options.settings || {}
    );

    let displayLintError = minified || _.indexOf(conf.options._, `${this.name}:${funcName}`) >= 0;

    let processes = [
      assets(
        _.merge(
          {
            cachebuster: true,
            relative: true
          },
          taskSettings.assets || {}
        )
      ),
      rucksack(taskSettings.rucksack),
      autoprefixer(taskSettings.autoprefixer),
      inlineSVG(
        _.merge(
          {
            path: false
          },
          taskSettings.inlineSVG || {}
        )
      ),
      SVGO()
    ];

    if (minified) {
      processes.push(
        cssnano(
          _.merge(
            {
              preset: [
                "default",
                {
                  cssDeclarationSorter: false
                }
              ]
            },
            this.options.cssnano || {}
          )
        )
      );

      const mqpackerOptions = this.options.mqpacker || {};
      const sortOrder = mqpackerOptions.sort === "mobile" ? sortCSSmq : sortCSSmq.desktopFirst;
      processes.push(mqpacker(_.merge({ sort: sortOrder }, mqpackerOptions)));
    }

    let stream = gulp.src(this.options.src, {
      cwd: this.options.cwd,
      sourcemaps: conf.options.sourcemaps && !minified
    });

    let mainFilename = "";

    if (!this.lintError) {
      stream = stream
        .pipe(
          plumber(error => {
            if (displayLintError) {
              notify.onError(error, `${this.name}:${funcName}`);
            }

            emitter.emit("end");
          })
        )
        .pipe(sass(taskSettings.sass))
        .pipe(
          rename((path, file) => {
            path.basename += minified ? ".min" : "";

            return path;
          })
        );

      let streamExtractMQ = stream
        .pipe(
          rename(path => {
            path.basename = path.basename.replace(/\.min$/, "");
            mainFilename = path.basename;

            return path;
          })
        )
        .pipe(gulpif(taskSettings.extractMQ, extractMQ()))
        .pipe(
          rename(path => {
            if (path.basename.indexOf(mainFilename) !== 0) {
              path.basename = `${mainFilename}.${path.basename}`;
            }

            path.basename += minified ? ".min" : "";

            return path;
          })
        )
        .pipe(
          postcss([
            css => {
              // Remove critical properties.
              css.walkDecls(decl => {
                if (decl.prop === "critical") {
                  decl.remove();
                }
              });
            }
          ])
        );

      let streamCriticalCSS = stream
        .pipe(gulpif(taskSettings.critical, criticalCSS()))
        .pipe(
          rename(path => {
            path.basename = path.basename.replace(".min.critical", ".critical.min");

            return path;
          })
        )
        .pipe(gulp.dest(this.options.dst, { cwd: this.options.cwd }));

      stream = merge(streamExtractMQ, streamCriticalCSS)
        .pipe(postcss(processes))
        .pipe(gulp.dest(this.options.dst, { cwd: this.options.cwd }))
        .pipe(bsync.sync({ match: "**/*.css" }));
    }

    return stream;
  }
}

module.exports = Sass;
