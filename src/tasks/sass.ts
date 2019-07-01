import { task as gulpTask } from "gulp";
import Task from "./task";

export default class Sass extends Task {
  constructor(name: string, settings: object) {
    super(name, settings);

    this.task = "sass";
  }

  public build(): string {
    const taskName = this.taskName("build");

    return taskName;
  }

  public lint(): string | false {
    if (!this.withLinter) {
      return false;
    }

    const taskName = this.taskName("lint");

    return taskName;
  }
}
