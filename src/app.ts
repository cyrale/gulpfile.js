import _ from "lodash";
import path from "path";
// const requireDir = require("require-dir");

// Fallback for Windows backs out of node_modules folder to root of project
process.env.PWD = process.env.PWD || path.resolve(process.cwd(), "../../");

// Change working directory
process.chdir(process.env.PWD as string);

import { parallel, series } from "gulp";

import Config from "./modules/config";
import TaskFactory from "./modules/task-factory";

const conf = Config.getInstance();
const factory = new TaskFactory();

// TODO: initialize browserify first.

let gulpTasks: string[] = [];

Object.keys(conf.settings).forEach((task: string) => {
  const tasks = conf.settings[task] as object;

  if (factory.isValidTask(task)) {
    gulpTasks = _.merge(gulpTasks, factory.createTasks(task, tasks));
  }
});

const globalTasks = factory.createGlobalTasks(gulpTasks);

export default series(
  globalTasks.map((tasks: string[]) => {
    return parallel(tasks);
  })
);