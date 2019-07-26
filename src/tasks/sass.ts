import { dest, src, task as gulpTask } from "gulp";
import GulpPlumber from "gulp-plumber";

import Browsersync from "./browsersync";
import Task, { TaskCallback } from "./task";

export default class Sass extends Task {
  constructor(name: string, settings: object, browserSync: Browsersync) {
    super(name, settings, browserSync);

    this.task = "sass";
  }

  // tslint:disable-next-line:no-empty
  public buildSpecific(stream: NodeJS.ReadWriteStream): void {}

  // tslint:disable-next-line:no-empty
  public lintSpecific(stream: NodeJS.ReadWriteStream): void {}
}
