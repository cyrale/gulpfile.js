import { CLIEngine, Linter } from "eslint";
import log from "fancy-log";
import babel from "gulp-babel";
import { sink } from "gulp-clone";
import concat from "gulp-concat";
import esLint from "gulp-eslint";
import gulpIf from "gulp-if";
import order from "gulp-order";
import rename from "gulp-rename";
import stripe from "gulp-strip-comments";
import terser from "gulp-terser";
import merge from "lodash/merge";
import omit from "lodash/omit";
import path from "path";

import { BuildSettings, Options as TaskOptions } from "./task";
import TaskExtended from "./task-extended";

/**
 * Concatenate Javascript files into one file. This file could be babelified.
 */
export default class Javascript extends TaskExtended {
  /**
   * Global task name.
   * @type {string}
   * @readonly
   */
  public static readonly taskName: string = "javascript";

  /**
   * Level to order task in execution pipeline.
   * @type {number}
   * @readonly
   */
  public static readonly taskOrder: number = 40;

  /**
   * Default settings for babel.
   *
   * @type {{[name: string]: any}}
   * @protected
   * @readonly
   */
  protected static readonly _babelDefaultSettings: {
    [name: string]: unknown;
  } = {
    presets: ["@babel/preset-env"],
  };

  /**
   * Task constructor.
   *
   * @param {TaskOptions} options
   */
  constructor(options: TaskOptions) {
    super(options);

    this._minifySuffix = ".min";

    // This task could build sourcemaps and sync browser with filter.
    this._gulpSourcemaps = true;
    this._browserSyncSettings = { match: "**/*.js" };

    this._settings.settings = this._settings.settings || {};

    // Babel configuration.
    if (typeof this._settings.settings.babel !== "undefined") {
      if (typeof this._settings.settings.babel === "object") {
        this._settings.settings.babel = merge(
          (this.constructor as any)._babelDefaultSettings, // eslint-disable-line @typescript-eslint/no-explicit-any
          this._settings.settings.babel
        );

        this._settings.settings.babel = omit(this._settings.settings.babel, ["_flags"]);
      } else if (typeof this._settings.settings.babel === "string") {
        this._settings.settings.babel = {
          configFile: this._settings.settings.babel,
        };
      }
    }

    // ESLint configuration.
    if (typeof this._settings.settings.eslint !== "undefined") {
      if (typeof this._settings.settings.eslint === "object") {
        if (!this._settings.settings.eslint.cwd) {
          this._settings.settings.eslint.cwd = this._settings.cwd;
        }
      } else if (typeof this._settings.settings.eslint === "string") {
        this._settings.settings.eslint = {
          configFile: this._settings.settings.eslint,
          cwd: this._settings.cwd,
          useEslintrc: false,
        };
      }
    }
  }

  /**
   * Method to add specific steps for the build.
   *
   * @param {NodeJS.ReadableStream} stream
   * @param {BuildSettings} buildSettings
   * @return {NodeJS.ReadableStream}
   * @protected
   */
  protected _hookBuildBefore(stream: NodeJS.ReadableStream, buildSettings: BuildSettings): NodeJS.ReadableStream {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cloneSink: any = sink();

    return stream
      .pipe(order(this._settings.src))
      .pipe(gulpIf(this._settings.settings.babel !== false, babel(this._settings.settings.babel)))
      .pipe(concat(this._settings.filename))
      .pipe(gulpIf(this._settings.sizes.normal, buildSettings.size.collect()))
      .pipe(cloneSink)
      .pipe(stripe())
      .pipe(terser())
      .pipe(rename({ suffix: this._minifySuffix }))
      .pipe(cloneSink.tap());
  }

  /**
   * Method to add specific steps for the lint.
   *
   * @param {NodeJS.ReadWriteStream} stream
   * @return {NodeJS.ReadWriteStream}
   * @protected
   */
  protected _hookLint(stream: NodeJS.ReadWriteStream): NodeJS.ReadWriteStream {
    return stream
      .pipe(esLint(this._settings.settings.eslint))
      .pipe(esLint.format())
      .pipe(
        esLint.results((filesWithErrors: { errorCount: number }): void => {
          this._lintError = filesWithErrors.errorCount > 0;
        })
      );
  }

  /**
   * Display error from Babel, Uglify or other modules used by this task.
   *
   * @param error
   * @protected
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected _displayError(error: any): void {
    const cliEngine: CLIEngine = new CLIEngine({});
    const formatter: CLIEngine.Formatter = cliEngine.getFormatter("stylish");
    const relativeFile: string = path.relative(this._settings.cwd, error.fileName || "");

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
      if (TaskExtended._isBuildRun()) {
        log.error(formatter(formattedMessage));
        process.exit(1);
      }
    } else if (error.message && error.loc) {
      // Message send by gulp-terser or other
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

      log.error(formatter(formattedMessage));
    } else {
      log.error(formattedMessage);
    }
  }
}
