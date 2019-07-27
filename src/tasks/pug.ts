import fs from "fs";

import GulpData from "gulp-data";
import GulpPug from "gulp-pug";
import GulpPugLinter from "gulp-pug-linter";
import PugLintStylish from "puglint-stylish";

import * as yaml from "js-yaml";

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

  public buildSpecific(stream: NodeJS.ReadWriteStream): NodeJS.ReadWriteStream {
    let data: any[] = [];

    if (typeof this.settings.settings.data === "string") {
      data = yaml.safeLoad(fs.readFileSync(this.settings.settings.data, "utf8"));
    } else if (typeof this.settings.settings.data === "object") {
      (this.settings.settings.data as string[]).forEach((filename: string): void => {
        data = Object.assign({}, data, yaml.safeLoad(fs.readFileSync(filename, "utf8")));
      });
    }

    stream.pipe(GulpData(data)).pipe(GulpPug());

    return stream;
  }

  public lintSpecific(stream: NodeJS.ReadWriteStream): NodeJS.ReadWriteStream {
    stream.pipe(
      GulpPugLinter({
        reporter: (errors: any[]): void => {
          if (errors.length > 0) {
            this.lintError = true;
            PugLintStylish(errors);
          }
        },
      })
    );

    return stream;
  }

  protected displayError(error: any): void {
    PugLintStylish([error]);
  }
}
