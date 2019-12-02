import { CLIEngine, Linter } from "eslint";
import log from "fancy-log";
import { src } from "gulp";
import rename from "gulp-rename";
import sourcemaps from "gulp-sourcemaps";
import merge from "lodash/merge";
import omit from "lodash/omit";
import path from "path";
import named from "vinyl-named";
import webpack from "webpack";
import webpackStream from "webpack-stream";

import sourcemapExtractor from "../gulp-plugins/sourcemap-extractor";
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

    let defaultSettings: {} = {
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

  protected _hookLintSrc(): NodeJS.ReadableStream {
    const srcLint: string[] = [
      ...(Array.isArray(this._settings.src) ? this._settings.src : [this._settings.src]),
      ...(this._settings.watch || []),
    ];

    return src(srcLint, { cwd: this._settings.cwd });
  }

  /**
   * Display errors from Webpack.
   *
   * @param {any} error
   * @protected
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected _displayError(error: any): void {
    const cliEngine: CLIEngine = new CLIEngine({});
    const formatter: CLIEngine.Formatter = cliEngine.getFormatter("stylish");

    if (error.plugin === "webpack-stream") {
      // Message from webpack
      const formattedMessage = [
        {
          errorCount: 1,
          filePath: "",
          fixableErrorCount: 0,
          fixableWarningCount: 0,
          messages: [
            {
              column: 0,
              line: 0,
              message: error.message,
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
      super._displayError(error);
    }
  }
}
