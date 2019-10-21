import browserify from "browserify";
import { dest } from "gulp";
import gulpIf from "gulp-if";
import rename from "gulp-rename";
import terser from "gulp-terser";
import tslint from "gulp-tslint";
import merge from "lodash/merge";
import omit from "lodash/omit";
import tsify from "tsify";
import buffer from "vinyl-buffer";
import source from "vinyl-source-stream";

import Browserify from "./browserify";
import { IBuildSettings } from "./task";

/**
 * Build TypeScript files.
 */
export default class Typescript extends Browserify {
  /**
   * Global task name.
   * @type {string}
   * @readonly
   */
  public static readonly taskName: string = "typescript";

  /**
   * Level to order task in execution pipeline.
   * @type {number}
   * @readonly
   */
  public static readonly taskOrder: number = 30;

  /**
   * Task constructor.
   *
   * @param {string} name
   * @param {object} settings
   */
  constructor(name: string, settings: object) {
    super(name, settings);

    this._settings.settings.babel = merge(this._settings.settings.babel, { extensions: [".ts", ".tsx"] });
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
    return browserify(omit(this._settings.settings, ["babel"]))
      .plugin(tsify, { typescript: require("typescript") })
      .transform("babelify", this._settings.settings.babel)
      .bundle()
      .pipe(source(this._settings.filename))
      .pipe(gulpIf(this._settings.sizes.normal, buildSettings.size.collect()))
      .pipe(buffer())
      .pipe(dest(this._settings.dst, buildSettings.options))
      .pipe(buildSettings.browserSync.memorize(buildSettings.taskName))
      .pipe(terser())
      .pipe(rename({ suffix: this._minifySuffix }))
      .pipe(dest(this._settings.dst, buildSettings.options));
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
      .pipe(
        tslint({
          formatter: "verbose",
          tslint: require("tslint"),
        })
      )
      .pipe(
        tslint.report({
          emitError: false,
        })
      );

    return stream;
  }
}
