import { CLIEngine, Linter } from "eslint";
import { dest } from "gulp";
import babel from "gulp-babel";
import concat from "gulp-concat";
import esLint from "gulp-eslint";
import gulpIf from "gulp-if";
import rename from "gulp-rename";
import uglify from "gulp-uglify";
import merge from "lodash/merge";
import omit from "lodash/omit";
import path from "path";

import Browsersync from "./browsersync";
import Task, { IGulpOptions } from "./task";

export default class Javascript extends Task {
  public static readonly taskName: string = "javascript";

  protected static readonly babelDefaultSettings: {
    [name: string]: any;
  } = {
    presets: ["@babel/preset-env"],
  };

  private readonly _babelActive: boolean;

  constructor(name: string, settings: object) {
    super(name, settings);

    this.gulpSourcemaps = true;

    this.defaultDest = false;
    this.browserSyncSettings = { match: "**/*.js" };

    const defaultSettings: {} = {
      babel: Javascript.babelDefaultSettings,
    };
    this.settings.settings = merge(defaultSettings, this.settings.settings || {});

    this._babelActive = typeof this.settings.settings.babel === "object" || this.settings.settings.babel !== false;
  }

  protected buildSpecific(stream: NodeJS.ReadWriteStream, options?: IGulpOptions): NodeJS.ReadWriteStream {
    stream
      .pipe(gulpIf(this._babelActive, babel(omit(this.settings.settings.babel, ["_flags"]))))
      .pipe(concat(this.settings.filename))
      .pipe(dest(this.settings.dst, options))
      .pipe(Browsersync.getInstance().sync(this.browserSyncSettings) as NodeJS.ReadWriteStream)
      .pipe(uglify())
      .pipe(rename({ suffix: ".min" }))
      .pipe(dest(this.settings.dst, options))
      .pipe(Browsersync.getInstance().sync(this.browserSyncSettings) as NodeJS.ReadWriteStream);

    return stream;
  }

  protected lintSpecific(stream: NodeJS.ReadWriteStream): NodeJS.ReadWriteStream {
    stream
      .pipe(esLint())
      .pipe(esLint.format())
      .pipe(
        esLint.results((filesWithErrors: { errorCount: number }): void => {
          this.lintError = filesWithErrors.errorCount > 0;
        })
      );

    return stream;
  }

  protected displayError(error: any): void {
    const cliEngine: CLIEngine = new CLIEngine({});
    const formatter: CLIEngine.Formatter = cliEngine.getFormatter("stylish");
    const relativeFile: string = path.relative(this.settings.cwd, error.fileName);

    let formattedMessage: CLIEngine.LintResult[] = [];

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
              severity: 2 as Linter.Severity,
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
              severity: 2 as Linter.Severity,
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
