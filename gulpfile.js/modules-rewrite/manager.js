const _ = require("lodash");
const gulp = require("gulp");

const { settings } = require("./config");

const runners = {
  sass: require("../tasks/sass")
};

let tasks = {};

const defineTask = (runner, name, settings) => {
  let groupTasks = {};

  _.forEach(runner(name, settings), (task, name) => {
    groupTasks[name] = task;
  });

  _.merge(tasks, groupTasks);
};

_.forEach(settings, (runnerSettings, runnerName) => {
  if (runners[runnerName] === undefined) {
    return;
  }

  if (runnerSettings.tasks !== undefined) {
    _.forEach(runnerSettings.tasks, (taskSettings, taskName) => {
      taskSettings.settings = _.merge(taskSettings.settings || {}, runnerSettings.settings || {});
      taskSettings.cwd = settings.cwd;

      defineTask(runners[runnerName], `${runnerName}:${taskName}`, taskSettings);
    });
  }
});

console.log(tasks);

gulp.task("default", done => {
  console.log("default");
  done();
});
