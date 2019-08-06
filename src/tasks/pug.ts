import fs from "fs";
import gulpData from "gulp-data";
import pug from "gulp-pug";
import pugLinter from "gulp-pug-linter";
import * as yaml from "js-yaml";
import pugLintStylish from "puglint-stylish";

import Task from "./task";

export default class Pug extends Task {
  public static readonly taskName: string = "pug";

  constructor(name: string, settings: object) {
    super(name, settings);

    if (typeof this.settings.settings.data === "string") {
      this.watchingFiles = [this.settings.settings.data];
    } else if (typeof this.settings.settings.data === "object") {
      this.watchingFiles = this.settings.settings.data as string[];
    }
  }

  protected buildSpecific(stream: NodeJS.ReadWriteStream): NodeJS.ReadWriteStream {
    let data: any[] = [];

    if (typeof this.settings.settings.data === "string") {
      data = yaml.safeLoad(fs.readFileSync(this.settings.settings.data, "utf8"));
    } else if (typeof this.settings.settings.data === "object") {
      (this.settings.settings.data as string[]).forEach((filename: string): void => {
        data = Object.assign({}, data, yaml.safeLoad(fs.readFileSync(filename, "utf8")));
      });
    }

    stream.pipe(gulpData(data)).pipe(pug());

    return stream;
  }

  protected lintSpecific(stream: NodeJS.ReadWriteStream): NodeJS.ReadWriteStream {
    stream.pipe(
      pugLinter({
        reporter: (errors: any[]): void => {
          if (errors.length > 0) {
            this.lintError = true;
            pugLintStylish(errors);
          }
        },
      })
    );

    return stream;
  }

  protected displayError(error: any): void {
    pugLintStylish([error]);
  }
}
