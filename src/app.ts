import Config from "./modules/config";
// import TaskFactory from "./modules/task-factory";

const conf = Config.getInstance();
console.log(conf.settings);

// const factory = new TaskFactory();
// const task1 = factory.createTask("sass", "test", {});
// const task2 = factory.createTask("javascript", "test", {});
//
// console.log(task1, task2);

import { parallel, task } from "gulp";

type TCallback = () => void;

task("test1", (done: TCallback) => {
  console.log("test1");
  done();
});

task("test2", (done: TCallback) => {
  console.log("test2");
  done();
});

const defaultT = parallel(["test1", "test2"]);
export default defaultT;
