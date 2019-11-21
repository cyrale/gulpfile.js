import fs from "fs";
import gulpData from "gulp-data";
import pug from "gulp-pug";
import pugLinter from "gulp-pug-linter";
import * as yaml from "js-yaml";
import merge from "lodash/merge";
import pugLintStylish from "puglint-stylish";

import { Options as TaskOptions } from "./task";
import TaskExtended from "./task-extended";

/**
 * Build PUG files into HTML.
 */
export default class Pug extends TaskExtended {
  /**
   * Global task name.
   * @type {string}
   * @readonly
   */
  public static readonly taskName: string = "pug";

  /**
   * Level to order task in execution pipeline.
   * @type {number}
   * @readonly
   */
  public static readonly taskOrder: number = 50;

  /**
   * Task constructor.
   *
   * @param {TaskOptions} options
   */
  constructor(options: TaskOptions) {
    super(options);

    // Add data files to files to watch.
    if (typeof this._settings.settings.data === "string") {
      this._watchingFiles = [this._settings.settings.data];
    } else if (typeof this._settings.settings.data === "object") {
      this._watchingFiles = this._settings.settings.data as string[];
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
    let data: unknown[] = [];

    // Load data from YAML files.
    if (typeof this._settings.settings.data === "string") {
      data = yaml.safeLoad(fs.readFileSync(this._settings.settings.data, "utf8"));
    } else if (typeof this._settings.settings.data === "object") {
      for (const filename of this._settings.settings.data as string[]) {
        data = merge(data, yaml.safeLoad(fs.readFileSync(filename, "utf8")));
      }
    }

    return stream.pipe(gulpData(data)).pipe(pug());
  }

  /**
   * Method to add specific steps for the lint.
   *
   * @param {NodeJS.ReadWriteStream} stream
   * @return {NodeJS.ReadWriteStream}
   * @protected
   */
  protected _hookLint(stream: NodeJS.ReadWriteStream): NodeJS.ReadWriteStream {
    return stream.pipe(
      pugLinter({
        reporter: (errors: unknown[]): void => {
          if (errors.length > 0) {
            this._lintError = true;
            pugLintStylish(errors);
          }
        },
      })
    );
  }

  /**
   * Display error from Pug.
   *
   * @param error
   * @protected
   */
  protected _displayError(error: unknown): void {
    pugLintStylish([error]);
  }
}
