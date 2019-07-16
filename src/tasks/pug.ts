import { dest, src, task as gulpTask } from "gulp";
import GPlumber from "gulp-plumber";
import GPug from "gulp-pug";
import GPugLinter from "gulp-pug-linter";
import PugLintStylish from "puglint-stylish";

import Task from "./task";

export default class Pug extends Task {
  constructor(name: string, settings: object) {
    super(name, settings);

    this.task = "pug";
  }

  public build(): string {
    const taskName = this.taskName("build");

    gulpTask(taskName, () => {
      const task = src(this.settings.src, { cwd: this.settings.cwd });

      this.chdir();

      if (!this.lintError) {
        task
          .pipe(GPlumber())
          .pipe(GPug())
          .pipe(GPlumber.stop())
          .pipe(dest(this.settings.dst, { cwd: this.settings.cwd }));
      }

      return task;
    });

    return taskName;
  }

  public lint(): string | false {
    const taskName = this.taskName("lint");

    this.lintError = false;

    gulpTask(taskName, () => {
      this.chdir();

      return src(this.settings.src, { cwd: this.settings.cwd }).pipe(
        GPugLinter({
          reporter: (errors: any[]): void => {
            this.lintError = true;

            if (errors.length > 0) {
              PugLintStylish(errors);
            }
          }
        })
      );
    });

    return taskName;
  }
}
