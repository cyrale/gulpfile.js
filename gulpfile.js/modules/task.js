"use strict";

const _ = require("lodash");
const gulp = require("gulp");

const path = require("path");

const Config = require("./config");
const conf = new Config();

class Task {
  constructor(name, options) {
    if (!(this instanceof Task)) {
      return new Task(name, options);
    }

    let settings = conf.load() || {};

    this.name = name;
    this.lintError = false;
    this.options = options || {};

    this.options.cwd = this.options.cwd || settings.cwd;
  }

  build(done) {
    done();
  }

  watch(done, task) {
    const src = this.options.src.concat(this.options.watch || []);

    gulp.watch(src, { cwd: this.options.cwd }, gulp.series(task));
    done();
  }

  isBuildTask() {
    return (
      _.indexOf(conf.options._, "build") >= 0 ||
      _.indexOf(conf.options._, "compress") >= 0 ||
      _.indexOf(conf.options._, "nest") >= 0
    );
  }

  isCurrentTask(funcName) {
    return _.indexOf(conf.options._, `${this.name}:${funcName}`) >= 0;
  }

  isParentTask(funcName) {
    let task = this.name.split(":");
    return _.indexOf(conf.options._, `${task[0]}:${funcName}`) >= 0;
  }

  static formatForNotification(filesWithErrors, property = "") {
    let settings = conf.load() || {};
    let errorMessage;

    if (filesWithErrors.length > 0) {
      errorMessage = filesWithErrors
        .map(file => {
          let messages = [];
          let lint = "" === property || undefined !== file.filePath ? file : file[property][0];
          let filename = undefined !== file.relative ? file.relative : path.relative(settings.cwd, file.filePath);

          messages.push(Task.formatErrorInformation(lint.errorCount, lint.warningCount, filename) + "\n--------");

          _.each(lint.messages, message => {
            messages.push(Task.formatErrorMessage(message));
          });

          return messages.join("\n");
        })
        .join("\n\n");
    }

    return errorMessage;
  }

  static formatErrorInformation(errorCount, warningCount, filename) {
    let total = errorCount + warningCount;

    return (
      `${total} problem` +
      (total !== 1 ? "s" : "") +
      ` (${errorCount} error` +
      (errorCount !== 1 ? "s" : "") +
      `, ${warningCount} warning` +
      (warningCount !== 1 ? "s" : "") +
      `) in ${filename}`
    );
  }

  static formatErrorMessage(error) {
    let message = `${error.line}:${error.column} ${error.message} (${error.ruleId})`;

    if (error.severity === 1) {
      message = `Warning: ${message}`;
    } else if (error.severity === 2) {
      message = `Error: ${message}`;
    }

    return message;
  }
}

module.exports = Task;
