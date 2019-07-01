import { task as gulpTask } from "gulp";
import Task from "./task";

export default class Javascript extends Task {
  constructor(name: string, settings: object) {
    super(name, settings);

    this.task = "javascript";
  }

  public build(): string {
    const taskName = this.taskName("build");

    return taskName;
  }

  public lint(): string {
    const taskName = this.taskName("lint");

    return taskName;
  }
}
