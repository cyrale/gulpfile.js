"use strict";

const _ = require("lodash");
const gulp = require("gulp");

const Config = require("./config");
const conf = new Config();

let options = conf.load();

// Tasks runners.
let runners = {
  browsersync: require("./tasks/browsersync"),
  pug: require("./tasks/pug"),
  images: require("./tasks/images"),
  sprites: require("./tasks/sprites"),
  svgstore: require("./tasks/svgstore"),
  fonts: require("./tasks/fonts"),
  sass: require("./tasks/sass"),
  javascript: require("./tasks/javascript")
};

// Task names.
let defaultTasks = ["lint", "nest", "compress", "build", "watch"];

// List of all tasks.
let tasks = {};

// List of all tasks ordered by type (lint, build and watch).
let tasksByType = {};

/**
 * Export names from a task array.
 *
 * @param tasks
 *   List of tasks runners.
 *
 * @returns {Array}
 *   Names of tasks.
 */
let taskNames = tasks => {
  let names = [];

  _.forEach(tasks, task => {
    names.push(task.name);
  });

  return names;
};

_.forEach(runners, (runner, name) => {
  // Tasks for this runner.
  let tasksList = {};

  // Define an empty task if there is no one for this runner.
  if (undefined === options[name]) {
    gulp.task(`${name}:no`, done => {
      done();
    });

    tasks[name] = `${name}:no`;

    return true;
  }

  // Initialize lists of tasks for this runner.
  tasks[name] = [];

  _.forEach(defaultTasks, funcName => {
    tasksList[funcName] = [];
  });

  if ("browsersync" === name) {
    gulp.task(`${name}:start`, runner.start);
    tasks[name].push(`${name}:start`);

    if (undefined !== options.browsersync.watch) {
      gulp.task(`${name}:watch`, runner.watch);
      tasks[name].push(`${name}:watch`);
    }
  } else {
    // Run through each specific task.
    _.forEach(options[name].tasks, (taskOptions, taskName) => {
      taskOptions.settings = _.merge(options[name].settings || {}, taskOptions.settings || {});

      let realTaskName = `${name}:${taskName}`;
      let task = new runner(realTaskName, taskOptions);
      let taskProcess = {
        pre: [],
        build: [],
        post: []
      };

      _.forEach(defaultTasks, funcName => {
        let currentTask = {
          name: `${realTaskName}:${funcName}`
        };

        // Concat 'nest' and 'compress' task into 'build'
        if ("build" === funcName && undefined === task[funcName] && taskProcess.build.length > 1) {
          gulp.task(currentTask.name, gulp.series(taskNames(taskProcess.build)));
          tasksList[funcName].push(currentTask);
        }

        if (undefined === task[funcName]) {
          return true;
        }

        if ("watch" === funcName) {
          // Define watch tasks.
          currentTask.func = done => {
            task.watch(done, _.concat(taskNames(taskProcess.pre), taskNames(taskProcess.build)));
          };
        } else {
          // Define all other tasks (lint, build...)
          currentTask.func = done => {
            return task[funcName](done, funcName);
          };
        }

        tasksList[funcName].push(currentTask);

        gulp.task(currentTask.name, currentTask.func);

        if ("lint" === funcName) {
          taskProcess.pre.push(currentTask);
        } else if ("watch" === funcName) {
          taskProcess.post.push(currentTask);
        } else {
          taskProcess.build.push(currentTask);
        }
      });

      // Group all sub tasks into a specific one.
      gulp.task(
        realTaskName,
        gulp.series(_.concat(taskNames(taskProcess.pre), taskNames(taskProcess.build), taskNames(taskProcess.post)))
      );
      tasks[name].push(realTaskName);
    });

    // Define global tasks for each section (lint, build, watch...)
    _.forEach(tasksList, (currentTasks, funcName) => {
      if (0 === currentTasks.length || "nest" === funcName || "compress" === funcName) {
        return true;
      } else if (1 === currentTasks.length && undefined !== currentTasks[0].func) {
        gulp.task(`${name}:${funcName}`, currentTasks[0].func);
      } else if (1 <= currentTasks.length) {
        gulp.task(`${name}:${funcName}`, gulp.parallel(taskNames(currentTasks)));
      }

      // Order tasks by type.
      if (undefined === tasksByType[funcName]) {
        tasksByType[funcName] = [];
      }
      tasksByType[funcName].push(`${name}:${funcName}`);
    });
  }

  // Define task for this runner.
  if (!_.isEmpty(tasks[name])) {
    gulp.task(name, gulp.parallel(tasks[name]));
    tasks[name] = name;
  }
});

// Define global tasks for each type (lint, build and watch).
_.forEach(tasksByType, (tasks, funcName) => {
  gulp.task(funcName, gulp.series(tasks));
});

module.exports = tasks;
