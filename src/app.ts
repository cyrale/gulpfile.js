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

import TaskFactory from "./modules/task-factory";

const factory = new TaskFactory();
factory.createAllTasks();
