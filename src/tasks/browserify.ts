import browserify from "browserify";
import { dest } from "gulp";
import gulpIf from "gulp-if";
import rename from "gulp-rename";
import terser from "gulp-terser";
import merge from "lodash/merge";
import omit from "lodash/omit";
import buffer from "vinyl-buffer";
import source from "vinyl-source-stream";

import Javascript from "./javascript";
import { IBuildSettings } from "./task";

/**
 * Package Javascript using Browserify.
 */
export default class Browserify extends Javascript {
  /**
   * Global task name.
   * @type {string}
   * @readonly
   */
  public static readonly taskName: string = "browserify";

  /**
   * Level to order task in execution pipeline.
   * @type {number}
   * @readonly
   */
  public static readonly taskOrder: number = 30;

  /**
   * Browserify constructor.
   *
   * @param {string} name
   * @param {object} settings
   */
  constructor(name: string, settings: object) {
    super(name, settings);

    // Improve performance.
    this._gulpRead = false;

    // Merge settings with default.
    const defaultSettings: {} = {
      debug: false,
      entries: this._settings.src,
      insertGlobals: true,
    };

    this._settings.settings = merge(defaultSettings, this._settings.settings || {});
    this._settings.settings.babel =
      typeof this._settings.settings.babel === "object"
        ? merge(Browserify._babelDefaultSettings, this._settings.settings.babel)
        : {};
  }

  /**
   * Method to add specific steps for the build.
   *
   * @param {NodeJS.ReadWriteStream} stream
   * @param {IBuildSettings} buildSettings
   * @return {NodeJS.ReadWriteStream}
   * @private
   */
  protected _buildSpecific(stream: NodeJS.ReadWriteStream, buildSettings: IBuildSettings): NodeJS.ReadWriteStream {
    return browserify(omit(this._settings.settings, ["babel"]))
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
}
