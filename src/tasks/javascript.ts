import merge from "lodash/merge";
import path from "path";

import { dest } from "gulp";

import { CLIEngine, Linter } from "eslint";
import Severity = Linter.Severity;
import LintResult = CLIEngine.LintResult;

import GulpBabel from "gulp-babel";
import GulpConcat from "gulp-concat";
import GulpESLint from "gulp-eslint";
import GulpIf from "gulp-if";
import GulpRename from "gulp-rename";
import GulpUglify from "gulp-uglify";

import Browsersync from "./browsersync";
import Task, { IGulpOptions } from "./task";

export default class Javascript extends Task {
  public static readonly taskName: string = "javascript";

  protected static readonly babelDefaultSettings: {
    [name: string]: any;
  } = {
    presets: ["@babel/preset-env"],
  };

  constructor(name: string, settings: object) {
    super(name, settings);

    this.gulpSourcemaps = true;

    this.defaultDest = false;
    this.browserSyncSettings = { match: "**/*.js" };

    const defaultSettings = {
      babel: Javascript.babelDefaultSettings,
    };
    this.settings.settings = merge(defaultSettings, this.settings.settings || {});
    this.settings.settings.babelActive =
      typeof this.settings.settings.babel === "object" || this.settings.settings.babel !== false;
  }

  protected buildSpecific(stream: NodeJS.ReadWriteStream, options?: IGulpOptions): NodeJS.ReadWriteStream {
    stream
      .pipe(GulpIf(this.settings.settings.babelActive, GulpBabel(this.settings.settings.babel)))
      .pipe(GulpConcat(this.settings.filename))
      .pipe(dest(this.settings.dst, options))
      .pipe(Browsersync.getInstance().sync(this.browserSyncSettings) as NodeJS.ReadWriteStream)
      .pipe(GulpUglify())
      .pipe(GulpRename({ suffix: ".min" }))
      .pipe(dest(this.settings.dst, options))
      .pipe(Browsersync.getInstance().sync(this.browserSyncSettings) as NodeJS.ReadWriteStream);

    return stream;
  }

  protected lintSpecific(stream: NodeJS.ReadWriteStream): NodeJS.ReadWriteStream {
    stream
      .pipe(GulpESLint())
      .pipe(GulpESLint.format())
      .pipe(
        GulpESLint.results((filesWithErrors: { errorCount: number }): void => {
          this.lintError = filesWithErrors.errorCount > 0;
        })
      );

    return stream;
  }

  protected displayError(error: any): void {
    const cliEngine = new CLIEngine({});
    const formatter = cliEngine.getFormatter("stylish");
    const relativeFile = path.relative(this.settings.cwd, error.fileName);

    let formattedMessage: LintResult[] = [];

    if (error.cause) {
      // Message send by gulp-babel
      formattedMessage = [
        {
          errorCount: 1,
          filePath: relativeFile,
          fixableErrorCount: 0,
          fixableWarningCount: 0,
          messages: [
            {
              column: error.cause.col,
              line: error.cause.line,
              message: error.cause.message,
              nodeType: "",
              ruleId: null,
              severity: 2 as Severity,
              source: null,
            },
          ],
          warningCount: 0,
        },
      ];

      // Particular exit due to the comportment of gulp-babel.
      if (Task.isBuildRun()) {
        console.log(formatter(formattedMessage));
        process.exit(1);
      }
    } else {
      // Message send by gulp-uglify or other
      formattedMessage = [
        {
          errorCount: 1,
          filePath: relativeFile,
          fixableErrorCount: 0,
          fixableWarningCount: 0,
          messages: [
            {
              column: error.loc ? error.loc.column : 0,
              line: error.loc ? error.loc.line : 0,
              message: error.message.replace(error.fileName, relativeFile),
              nodeType: "",
              ruleId: null,
              severity: 2 as Severity,
              source: null,
            },
          ],
          warningCount: 0,
        },
      ];
    }

    console.log(formatter(formattedMessage));
  }
}
