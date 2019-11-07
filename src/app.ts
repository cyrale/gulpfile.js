import "source-map-support/register";

import log from "fancy-log";
import path from "path";
import process from "process";

try {
  // Fallback for Windows backs out of node_modules folder to root of project.
  process.env.PWD = process.env.PWD || path.resolve(process.cwd(), "../../../");

  // Change working directory.
  process.chdir(process.env.PWD as string);
} catch (err) {
  log.error(`chdir: ${err}`);
}

import TaskFactory from "./libs/task-factory";

// Load all tasks.
const factory: TaskFactory = new TaskFactory();
factory.createAllTasks();
