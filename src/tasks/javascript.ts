import { CLIEngine, Linter } from "eslint";
import log from "fancy-log";
import babel from "gulp-babel";
import clone from "gulp-clone";
import concat from "gulp-concat";
import esLint from "gulp-eslint";
import order from "gulp-order";
import rename from "gulp-rename";
import sourcemaps from "gulp-sourcemaps";
import terser from "gulp-terser";
import merge from "lodash/merge";
import omit from "lodash/omit";
import mergeStream from "merge-stream";
import path from "path";

import Config from "../libs/config";
import { Options as TaskOptions, TaskCallback } from "./task";
import TaskExtended from "./task-extended";
import sourcemapExtractor from "../gulp-plugins/sourcemap-extractor";

type ESLintFile = unknown[];

export interface ESLintErrors extends ESLintFile {
  errorCount: number;
  warningCount: number;
}

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
  public static readonly taskOrder: number = 50;

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

    // This task sync browser with filter.
    this._browserSyncSettings = { match: "**/*.js" };

    this._minifySuffix = ".min";
    this._hideGzippedSize = false;

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
        };
      }
    }
  }

  /**
   * Display error from Babel, Uglify or other modules used by this task.
   *
   * @param {Record<string, unknown>} error
   * @protected
   */
  protected _displayError(error: Record<string, unknown>): void {
    const config: Config = Config.getInstance();
    const cliEngine: CLIEngine = new CLIEngine({});
    const formatter: CLIEngine.Formatter = cliEngine.getFormatter("stylish");
    const relativeFile: string = path.relative(this._settings.cwd, (error.fileName as string) || "");

    let formattedMessage: CLIEngine.LintResult[] = [];

    if (error.cause) {
      const cause: Record<string, string | number> = error.cause as Record<string, string | number>;

      // Message send by gulp-babel
      formattedMessage = [
        {
          errorCount: 1,
          filePath: relativeFile,
          fixableErrorCount: 0,
          fixableWarningCount: 0,
          messages: [
            {
              column: cause.col as number,
              line: cause.line as number,
              message: cause.message as string,
              nodeType: "",
              ruleId: null,
              severity: 2 as Linter.Severity,
              source: null,
            },
          ],
          usedDeprecatedRules: [],
          warningCount: 0,
        },
      ];

      // Particular exit due to the comportment of gulp-babel.
      if (config.isLintRun() || config.isBuildRun()) {
        log.error(formatter(formattedMessage));
        process.exit(1);
      }
    } else if (error.message && error.loc) {
      const location: Record<string, number> = error.loc as Record<string, number>;

      // Message send by gulp-terser or other
      formattedMessage = [
        {
          errorCount: 1,
          filePath: relativeFile,
          fixableErrorCount: 0,
          fixableWarningCount: 0,
          messages: [
            {
              column: location.column,
              line: location.line,
              message: (error.message as string).replace(error.fileName as string, relativeFile),
              nodeType: "",
              ruleId: null,
              severity: 2 as Linter.Severity,
              source: null,
            },
          ],
          usedDeprecatedRules: [],
          warningCount: 0,
        },
      ];

      log.error(formatter(formattedMessage));
    }
  }

  /**
   * Flag current task with error to avoid build execution.
   *
   * @param {ESLintErrors} filesWithErrors
   * @param {TaskCallback} done
   * @protected
   */
  protected _esLintResults(filesWithErrors: ESLintErrors, done?: TaskCallback): void {
    const config: Config = Config.getInstance();

    this._lintError = filesWithErrors.errorCount > 0;

    if (this._lintError && config.isLintRun()) {
      for (const error of filesWithErrors) {
        TaskExtended.taskErrors.push({
          taskName: this._taskName("lint"),
          error,
          done,
        });
      }
    }
  }

  /**
   * Method to add specific steps for the build.
   *
   * @param {NodeJS.ReadableStream} stream
   * @return {NodeJS.ReadableStream}
   * @protected
   */
  protected _hookBuildBefore(stream: NodeJS.ReadableStream): NodeJS.ReadableStream {
    stream = stream.pipe(order(this._settings.src));

    if (this._settings.sourcemaps) {
      stream = stream.pipe(sourcemaps.init());
    }

    if (this._settings.settings.babel !== false) {
      stream = stream.pipe(babel(this._settings.settings.babel));
    }

    stream = stream.pipe(concat(this._settings.filename));
    stream = this._minifyFiles(stream);

    if (this._settings.sourcemaps) {
      stream = stream.pipe(sourcemaps.write(this._settings.sourcemapFiles));
    }

    return stream;
  }

  /**
   * Method to add specific steps for the lint.
   *
   * @param {NodeJS.ReadWriteStream} stream
   * @param {TaskCallback} done
   * @return {NodeJS.ReadWriteStream}
   * @protected
   */
  protected _hookLint(stream: NodeJS.ReadWriteStream, done?: TaskCallback): NodeJS.ReadWriteStream {
    return stream
      .pipe(esLint(this._settings.settings.eslint))
      .pipe(esLint.format())
      .pipe(
        esLint.results((filesWithErrors: ESLintErrors): void => {
          this._esLintResults(filesWithErrors, done);
        })
      );
  }

  /**
   * Add minification to the stream to generate 2 files: normal and minified.
   *
   * @param {NodeJS.ReadableStream} stream
   * @returns {NodeJS.ReadableStream}
   * @protected
   */
  protected _minifyFiles(stream: NodeJS.ReadableStream): NodeJS.ReadableStream {
    const streamMin: NodeJS.ReadableStream = stream
      .pipe(clone())
      .pipe(terser({ output: { comments: false } }))
      .pipe(rename({ suffix: this._minifySuffix }));

    return mergeStream(stream, streamMin);
  }

  /**
   * Add sourcemap and minification to the stream.
   *
   * @param {NodeJS.ReadableStream} stream
   * @returns {NodeJS.ReadableStream}
   * @protected
   */
  protected _sourceMapsAndMinification(stream: NodeJS.ReadableStream): NodeJS.ReadableStream {
    if (this._settings.sourcemaps) {
      stream = stream.pipe(sourcemapExtractor()).pipe(sourcemaps.init());
    }

    stream = this._minifyFiles(stream);

    if (this._settings.sourcemaps) {
      stream = stream.pipe(sourcemaps.write(this._settings.sourcemapFiles));
    }

    return stream;
  }
}
