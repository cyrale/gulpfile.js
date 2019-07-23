import "source-map-support/register";

import path from "path";
import process from "process";

try {
  // Fallback for Windows backs out of node_modules folder to root of project
  process.env.PWD = process.env.PWD || path.resolve(process.cwd(), "../../");

  // Change working directory
  process.chdir(process.env.PWD as string);
} catch (err) {
  console.error(`chdir: ${err}`);
}

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
    gulpTasks = [...gulpTasks, ...factory.createTasks(task, tasks)];
  }
});

const globalTasks = factory.createGlobalTasks(gulpTasks);
factory.createSuperGlobalTasks(gulpTasks);

// console.log(globalTasks);

export default series(
  globalTasks.map((tasks: string[]) => {
    return parallel(tasks);
  })
);
