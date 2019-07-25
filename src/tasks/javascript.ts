import { task as gulpTask } from "gulp";

import Browsersync from "./browsersync";
import Task from "./task";

export default class Javascript extends Task {
  constructor(name: string, settings: object, browserSync: Browsersync) {
    super(name, settings, browserSync);

    this.task = "javascript";
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
