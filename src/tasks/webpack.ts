import { CLIEngine, Linter } from "eslint";
import log from "fancy-log";
import rename from "gulp-rename";
import uglify from "gulp-uglify";
import merge from "lodash/merge";
import path from "path";
import named from "vinyl-named";
import webpack from "webpack";
import webpackStream from "webpack-stream";

import Browsersync from "./browsersync";
import Javascript from "./javascript";

/**
 * Package Javascript using Webpack.
 */
export default class Webpack extends Javascript {
  /**
   * Global task name.
   * @type {string}
   * @readonly
   */
  public static readonly taskName: string = "webpack";

  /**
   * Task constructor.
   * @param {string} name
   * @param {object} settings
   */
  constructor(name: string, settings: object) {
    super(name, settings);

    const defaultSettings: {} = {
      module: {
        rules: [
          {
            exclude: /(node_modules|bower_components)/,
            test: /\.m?js$/,
            use: {
              loader: "babel-loader",
              options: Webpack._babelDefaultSettings,
            },
          },
        ],
      },
    };

    this._settings.settings =
      typeof this._settings.settings === "string"
        ? require(path.resolve(this._settings.cwd, this._settings.settings))
        : merge(defaultSettings, this._settings.settings || {}, {
            mode: "development",
          });
  }

  /**
   * Method to add specific steps for the build.
   *
   * @param {NodeJS.ReadWriteStream} stream
   * @return {NodeJS.ReadWriteStream}
   * @protected
   */
  protected _buildSpecific(stream: NodeJS.ReadWriteStream): NodeJS.ReadWriteStream {
    const browserSync = Browsersync.getInstance();
    const taskName = this._taskName("build");

    return stream
      .pipe(named())
      .pipe(webpackStream(this._settings.settings, webpack as any))
      .pipe(
        rename({
          basename: path.basename(this._settings.filename, path.extname(this._settings.filename)),
        })
      )
      .pipe(browserSync.memorize(taskName))
      .pipe(uglify())
      .pipe(rename({ suffix: ".min" }));
  }

  /**
   * Display errors from Webpack.
   *
   * @param error
   * @protected
   */
  protected _displayError(error: any): void {
    const cliEngine: CLIEngine = new CLIEngine({});
    const formatter: CLIEngine.Formatter = cliEngine.getFormatter("stylish");

    if (error.plugin === "webpack-steam") {
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
