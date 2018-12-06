"use strict";

const _ = require("lodash");

const path = require("path");
const chalk = require("chalk");

const gulp = require("gulp");
const plumber = require("gulp-plumber");

const pug = require("gulp-pug");
const pugLinter = require("gulp-pug-linter");
const data = require("gulp-data");

const bsync = require("./browsersync");

const events = require("events");
const emitter = new events.EventEmitter();
const PluginError = require("plugin-error");
const log = require("fancy-log");
const notify = require("../notify");

const Config = require("../config");
const conf = new Config();

const Task = require("../task");

class Pug extends Task {
  failOnError(errors, funcName) {
    let filesWithErrors = [];
    let settings = conf.load() || {};
    let errorMessage;
    let allErrors;

    if (errors.length > 0) {
      this.lintError = true;

      // Prepare messages for notification.
      _.each(errors, error => {
        let fileIndex = _.findIndex(filesWithErrors, o => {
          return o.filePath === error.filename;
        });

        if (fileIndex < 0) {
          filesWithErrors.push({
            filePath: error.filename,
            errorCount: 0,
            warningCount: 0,
            messages: []
          });

          fileIndex = filesWithErrors.length - 1;
        }

        filesWithErrors[fileIndex].errorCount++;
        filesWithErrors[fileIndex].messages.push({
          ruleId: error.code,
          message: error.msg,
          line: error.line,
          column: error.column,
          severity: 2
        });
      });

      // Notify errors.
      notify.notify(Task.formatForNotification(filesWithErrors), this.name + ":" + funcName);

      // Prepare messages for the command line.
      errorMessage = filesWithErrors
        .map(file => {
          let messages = [];
          let filename = path.relative(settings.cwd, file.filePath);

          messages.push(Task.formatErrorInformation(file.errorCount, file.warningCount, filename));

          return messages;
        })
        .join("\n");

      allErrors = errors
        .map(error => {
          return error.message;
        })
        .join("\n\n");

      // Emit or display errors.
      log(`\n${allErrors}\n`);

      if (this.isCurrentTask(funcName) || this.isParentTask(funcName)) {
        emitter.emit("error", new PluginError({ plugin: "pug-linter", message: `\n${errorMessage}\n` }));
      } else {
        log(chalk.red(`Error:\n${errorMessage}`));
      }
    }
  }

  lint(done, funcName) {
    this.lintError = false;

    return gulp
      .src(this.options.src, { cwd: this.options.cwd })
      .pipe(pugLinter())
      .pipe(
        pugLinter({
          reporter: errors => this.failOnError(errors, funcName)
        })
      );
  }

  build() {
    let appSettings = conf.load() || {};

    let stream = gulp.src(this.options.src, { cwd: this.options.cwd });

    if (!this.lintError) {
      stream
        .pipe(
          plumber(error => {
            notify.onError(error, this.name);
            emitter.emit("end");
          })
        )
        .pipe(
          data(_.merge(Config.loadYAML(appSettings.pug.settings.data), Config.loadYAML(this.options.settings.data)))
        )
        .pipe(pug())
        .pipe(plumber.stop())
        .pipe(gulp.dest(this.options.dst, { cwd: this.options.cwd }))
        .pipe(bsync.sync());
    }

    return stream;
  }
}

module.exports = Pug;
