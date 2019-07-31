import path from "path";

import { dest } from "gulp";

import GulpBabel from "gulp-babel";
import GulpConcat from "gulp-concat";
import GulpESLint from "gulp-eslint";
import GulpIf from "gulp-if";
import GulpRename from "gulp-rename";
import GulpUglify from "gulp-uglify";

import { CLIEngine, Linter } from "eslint";
import Browsersync from "./browsersync";
import Task, { IGulpOptions } from "./task";
import Severity = Linter.Severity;

export const babelDefaultSettings: {
  [name: string]: any;
} = {
  presets: ["@babel/preset-env"],
};

export default class Javascript extends Task {
  public static readonly taskName: string = "javascript";

  constructor(name: string, settings: object) {
    super(name, settings);

    this.withSourcemaps = true;

    this.defaultDest = false;
    this.browserSyncSettings = { match: "**/*.js" };
  }

  public buildSpecific(stream: NodeJS.ReadWriteStream, options: IGulpOptions): NodeJS.ReadWriteStream {
    const babelActive = typeof this.settings.settings.babel === "object" || this.settings.settings.babel !== false;

    let babelSettings: {} = {};
    if (babelActive && typeof this.settings.settings.babel === "object") {
      babelSettings = { ...babelDefaultSettings, ...this.settings.settings.babel };
    }

    stream
      .pipe(GulpIf(babelActive, GulpBabel(babelSettings)))
      .pipe(GulpConcat(this.settings.filename))
      .pipe(dest(this.settings.dst, options))
      .pipe(Browsersync.getInstance().sync(this.browserSyncSettings) as NodeJS.ReadWriteStream)
      .pipe(GulpUglify({ mangle: false }))
      .pipe(GulpRename({ suffix: ".min" }))
      .pipe(dest(this.settings.dst, options));

    return stream;
  }

  public lintSpecific(stream: NodeJS.ReadWriteStream): NodeJS.ReadWriteStream {
    stream
      .pipe(GulpESLint())
      .pipe(GulpESLint.format())
      .pipe(
        GulpESLint.results((filesWithErrors: { errorCount: number }): void => {
          // this.lintError = filesWithErrors.errorCount > 0;
        })
      );

    return stream;
  }

  protected displayError(error: any): void {
    const cliEngine = new CLIEngine({});
    const formatter = cliEngine.getFormatter("stylish");
    const relativeFile = path.relative(this.settings.cwd, error.fileName);

    console.log(
      formatter([
        {
          errorCount: 1,
          filePath: relativeFile,
          fixableErrorCount: 0,
          fixableWarningCount: 0,
          messages: [
            {
              column: error.loc.column,
              line: error.loc.line,
              message: error.message.replace(error.fileName, relativeFile),
              nodeType: "",
              ruleId: null,
              severity: 2 as Severity,
              source: null,
            },
          ],
          warningCount: 0,
        },
      ])
    );
  }
}
