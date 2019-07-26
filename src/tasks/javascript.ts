import Browsersync from "./browsersync";
import Task from "./task";

export default class Javascript extends Task {
  constructor(name: string, settings: object, browserSync: Browsersync) {
    super(name, settings, browserSync);

    this.task = "javascript";
  }

  // tslint:disable-next-line:no-empty
  public buildSpecific(stream: NodeJS.ReadWriteStream): void {}

  // tslint:disable-next-line:no-empty
  public lintSpecific(stream: NodeJS.ReadWriteStream): void {}
}
