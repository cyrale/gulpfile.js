import { CLIEngine, Linter } from "eslint";
import log from "fancy-log";
import babel from "gulp-babel";
import concat from "gulp-concat";
import esLint from "gulp-eslint";
import gulpIf from "gulp-if";
import rename from "gulp-rename";
import uglify from "gulp-uglify";
import merge from "lodash/merge";
import omit from "lodash/omit";
import path from "path";

import TaskFactory from "../modules/task-factory";
import { IBuildSettings } from "./task";
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
    [name: string]: any;
  } = {
    presets: ["@babel/preset-env"],
    sourceType: "unambiguous",
  };

  /**
   * Flag to define if Babel is active or not.
   * @type {boolean}
   * @private
   * @readonly
   */
  private readonly _babelActive: boolean = false;

  /**
   * Task constructor.
   *
   * @param {string} name
   * @param {object} settings
   */
  constructor(name: string, settings: object) {
    super(name, settings);

    this._minifySuffix = ".min";

    // This task could build sourcemaps and sync browser with filter.
    this._gulpSourcemaps = true;
    this._browserSyncSettings = { match: "**/*.js" };

    // Merge settings only for an object of type of Javascript, not for children.
    if (this.constructor.name === "Javascript") {
      const defaultSettings: {} = {
        babel: Javascript._babelDefaultSettings,
      };

      this._settings.settings = merge(defaultSettings, this._settings.settings || {});

      this._babelActive = typeof this._settings.settings.babel === "object" || this._settings.settings.babel !== false;
    }
  }

  /**
   * Method to add specific steps for the build.
   *
   * @param {NodeJS.ReadWriteStream} stream
   * @param {IBuildSettings} buildSettings
   * @return {NodeJS.ReadWriteStream}
   * @protected
   */
  protected _buildSpecific(stream: NodeJS.ReadWriteStream, buildSettings: IBuildSettings): NodeJS.ReadWriteStream {
    const browserSync = TaskFactory.getUniqueInstanceOf("browsersync");
    const taskName = this._taskName("build");

    return stream
      .pipe(gulpIf(this._babelActive, babel(omit(this._settings.settings.babel, ["_flags"]))))
      .pipe(concat(this._settings.filename))
      .pipe(gulpIf(this._settings.sizes.normal, buildSettings.size.collect()))
      .pipe(gulpIf(browserSync, browserSync.memorize(taskName)))
      .pipe(uglify())
      .pipe(rename({ suffix: this._minifySuffix }));
  }

  /**
   * Method to add specific steps for the lint.
   *
   * @param {NodeJS.ReadWriteStream} stream
   * @return {NodeJS.ReadWriteStream}
   * @protected
   */
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

  /**
   * Display error from Babel, Uglify or other modules used by this task.
   *
   * @param error
   * @protected
   */
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

      log.error(formatter(formattedMessage));
    } else {
      log.error(formattedMessage);
    }
  }
}
