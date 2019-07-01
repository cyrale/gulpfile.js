import { dest, src, task as gulpTask } from "gulp";
import GPug from "gulp-pug";

import { TCallback } from "../modules/config";
import Task from "./task";

export default class Pug extends Task {
  constructor(name: string, settings: object) {
    super(name, settings);

    this.task = "pug";
  }

  public lint(): string {
    const taskName = this.taskName("lint");

    gulpTask(taskName, (done: TCallback) => done());

    return taskName;
  }

  public build(): string {
    const taskName = this.taskName("build");

    gulpTask(taskName, () => {
      return src(this.settings.src, { cwd: this.settings.cwd })
        .pipe(GPug())
        .pipe(dest(this.settings.dst, { cwd: this.settings.cwd }));
    });

    return taskName;
  }
}
