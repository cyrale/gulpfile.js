import fs from "fs";

import { dest, src, task as gulpTask } from "gulp";

import GulpData from "gulp-data";
import GulpPlumber from "gulp-plumber";
import GulpPug from "gulp-pug";
import GulpPugLinter from "gulp-pug-linter";
import PugLintStylish from "puglint-stylish";

import * as yaml from "js-yaml";

import Task from "./task";

export default class Pug extends Task {
  constructor(name: string, settings: object) {
    super(name, settings);

    this.task = "pug";
  }

  public build(): string {
    const taskName = this.taskName("build");

    gulpTask(taskName, done => {
      const task = src(this.settings.src, { cwd: this.settings.cwd }).pipe(
        GulpPlumber(error => {
          this.exitOnError(taskName, error, done);
        })
      );

      this.chdir();

      if (!this.lintError) {
        let data: any[] = [];

        if (typeof this.settings.settings.data === "string") {
          data = yaml.safeLoad(fs.readFileSync(this.settings.settings.data, "utf8"));
        } else if (typeof this.settings.settings.data === "object") {
          (this.settings.settings.data as string[]).forEach((filename: string): void => {
            data = Object.assign({}, data, yaml.safeLoad(fs.readFileSync(filename, "utf8")));
          });
        }

        task
          .pipe(GulpData(data))
          .pipe(GulpPug())
          .pipe(GulpPlumber.stop());
      }

      task.pipe(dest(this.settings.dst, { cwd: this.settings.cwd })).on("finish", () => {
        console.log(`FINISH ${taskName}`);
      });

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
        GulpPugLinter({
          reporter: (errors: any[]): void => {
            if (errors.length > 0) {
              this.lintError = true;
              PugLintStylish(errors);
            }
          }
        })
      );
    });

    return taskName;
  }

  protected displayError(error: any): void {
    PugLintStylish([error]);
  }
}
