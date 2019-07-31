import GulpESLint from "gulp-eslint";

import Browsersync from "./browsersync";
import Task, { IGulpOptions } from "./task";

export default class Javascript extends Task {
  public static readonly taskName: string = "javascript";

  constructor(name: string, settings: object) {
    super(name, settings);

    this.withSourcemaps = true;

    this.defaultDest = false;
    this.browserSyncSettings = { match: "**/*.js" };
  }

  public buildSpecific(stream: NodeJS.ReadWriteStream, options: IGulpOptions): NodeJS.ReadWriteStream {
    return stream;
  }

  public lintSpecific(stream: NodeJS.ReadWriteStream): NodeJS.ReadWriteStream {
    stream
      .pipe(GulpESLint())
      .pipe(GulpESLint.format())
      .pipe(
        GulpESLint.results((filesWithErrors: any[]): void => {
          this.lintError = filesWithErrors.errorCount > 0;
        })
      );

    return stream;
  }
}
