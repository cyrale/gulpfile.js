import { CLIEngine, Linter } from "eslint";
import log from "fancy-log";
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

  protected static readonly _babelDefaultSettings: {
    [name: string]: any;
  } = {
    presets: ["@babel/preset-env"],
  };

  private readonly _babelActive: boolean;

  constructor(name: string, settings: object) {
    super(name, settings);

    this._gulpSourcemaps = true;

    this._defaultDest = false;
    this._browserSyncSettings = { match: "**/*.js" };

    const defaultSettings: {} = {
      babel: Javascript._babelDefaultSettings,
    };
    this._settings.settings = merge(defaultSettings, this._settings.settings || {});

    this._babelActive = typeof this._settings.settings.babel === "object" || this._settings.settings.babel !== false;
  }

  protected _buildSpecific(stream: NodeJS.ReadWriteStream, options?: IGulpOptions): NodeJS.ReadWriteStream {
    stream
      .pipe(gulpIf(this._babelActive, babel(omit(this._settings.settings.babel, ["_flags"]))))
      .pipe(concat(this._settings.filename))
      .pipe(dest(this._settings.dst, options))
      .pipe(Browsersync.getInstance().sync(this._browserSyncSettings) as NodeJS.ReadWriteStream)
      .pipe(uglify())
      .pipe(rename({ suffix: ".min" }))
      .pipe(dest(this._settings.dst, options))
      .pipe(Browsersync.getInstance().sync(this._browserSyncSettings) as NodeJS.ReadWriteStream);

    return stream;
  }

  protected _lintSpecific(stream: NodeJS.ReadWriteStream): NodeJS.ReadWriteStream {
    stream
      .pipe(esLint())
      .pipe(esLint.format())
      .pipe(
        esLint.results((filesWithErrors: { errorCount: number }): void => {
          this._lintError = filesWithErrors.errorCount > 0;
        })
      );

    return stream;
  }

  protected _displayError(error: any): void {
    const cliEngine: CLIEngine = new CLIEngine({});
    const formatter: CLIEngine.Formatter = cliEngine.getFormatter("stylish");
    const relativeFile: string = path.relative(this._settings.cwd, error.fileName);

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
      if (Task._isBuildRun()) {
        log.error(formatter(formattedMessage));
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

    log.error(formatter(formattedMessage));
  }
}
