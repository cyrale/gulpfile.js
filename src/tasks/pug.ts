import fs from "fs";

import { dest, src, task as gulpTask } from "gulp";

import GulpData from "gulp-data";
import GulpPug from "gulp-pug";
import GulpPugLinter from "gulp-pug-linter";
import PugLintStylish from "puglint-stylish";

import * as yaml from "js-yaml";

import Browsersync from "./browsersync";
import Task, { TaskCallback } from "./task";

export default class Pug extends Task {
  constructor(name: string, settings: object, browserSync: Browsersync) {
    super(name, settings, browserSync);

    this.task = "pug";

    if (typeof this.settings.settings.data === "string") {
      this.watchingFiles = [this.settings.settings.data];
    } else if (typeof this.settings.settings.data === "object") {
      this.watchingFiles = this.settings.settings.data as string[];
    }
  }

  public buildSpecific(stream: NodeJS.ReadWriteStream): void {
    let data: any[] = [];

    if (typeof this.settings.settings.data === "string") {
      data = yaml.safeLoad(fs.readFileSync(this.settings.settings.data, "utf8"));
    } else if (typeof this.settings.settings.data === "object") {
      (this.settings.settings.data as string[]).forEach((filename: string): void => {
        data = Object.assign({}, data, yaml.safeLoad(fs.readFileSync(filename, "utf8")));
      });
    }

    stream.pipe(GulpData(data)).pipe(GulpPug());
  }

  public lintSpecific(stream: NodeJS.ReadWriteStream): void {
    stream.pipe(
      GulpPugLinter({
        reporter: (errors: any[]): void => {
          if (errors.length > 0) {
            this.lintError = true;
            PugLintStylish(errors);
          }
        }
      })
    );
  }

  protected displayError(error: any): void {
    PugLintStylish([error]);
  }
}
