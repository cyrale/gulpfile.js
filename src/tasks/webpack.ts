import { CLIEngine, Linter } from "eslint";
import log from "fancy-log";
import { src } from "gulp";
import rename from "gulp-rename";
import merge from "lodash/merge";
import omit from "lodash/omit";
import path from "path";
import named from "vinyl-named";
import webpack from "webpack";
import webpackStream from "webpack-stream";

import Javascript from "./javascript";
import { Options as TaskOptions } from "./task";

/**
 * Package Javascript using Webpack.
 */
export default class Webpack extends Javascript {
  public static readonly runInParallel: boolean = false;

  /**
   * Global task name.
   * @type {string}
   * @readonly
   */
  public static readonly taskName: string = "webpack";

  /**
   * Level to order task in execution pipeline.
   * @type {number}
   * @readonly
   */
  public static readonly taskOrder: number = 40;

  /**
   * Task constructor.
   *
   * @param {TaskOptions} options
   */
  constructor(options: TaskOptions) {
    super(options);

    let defaultSettings: Record<string, unknown> = {
      stats: "errors-only",
    };

    // Babel configuration for Webpack.
    if (this._settings.settings.babel !== false) {
      defaultSettings = merge(defaultSettings, {
        module: {
          rules: [
            {
              exclude: /(node_modules|bower_components)/,
              test: /\.m?js$/,
              use: {
                loader: "babel-loader",
                options: this._settings.settings.babel,
              },
            },
          ],
        },
      });
    }

    // Force some of settings.
    this._settings.settings = merge(defaultSettings, this._settings.settings, {
      mode: "production",
      optimization: {
        minimize: false,
      },
      watch: false,
    });

    if (this._settings.sourcemaps) {
      this._settings.settings.devtool = "inline-source-map";
    }
  }

  /**
   * Display errors from Webpack.
   *
   * @param {Record<string, unknown>} error
   * @protected
   */
  protected _displayError(error: Record<string, unknown>): void {
    const cliEngine: CLIEngine = new CLIEngine({});
    const formatter: CLIEngine.Formatter = cliEngine.getFormatter("stylish");

    if (error.plugin === "webpack-stream") {
      // Message from webpack
      const formattedMessage: CLIEngine.LintResult[] = [
        {
          errorCount: 1,
          filePath: "",
          fixableErrorCount: 0,
          fixableWarningCount: 0,
          messages: [
            {
              column: 0,
              line: 0,
              message: (error.message as string) || "",
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
    } else {
      super._displayError(error);
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
    stream = stream
      .pipe(named())
      .pipe(
        webpackStream(omit(this._settings.settings, ["babel", "eslint"])),
        webpack as any // eslint-disable-line @typescript-eslint/no-explicit-any
      )
      .pipe(
        rename({
          basename: path.basename(this._settings.filename, path.extname(this._settings.filename)),
        })
      );

    stream = this._sourceMapsAndMinification(stream);

    return stream;
  }

  /**
   * Method to change default source for lint task.
   *
   * @returns {NodeJS.ReadableStream}
   * @protected
   */
  protected _hookLintSrc(): NodeJS.ReadableStream {
    const srcLint: string[] = [
      ...(Array.isArray(this._settings.src) ? this._settings.src : [this._settings.src]),
      ...(this._settings.watch || []),
    ];

    return src(srcLint, { cwd: this._settings.cwd });
  }
}
