import fs from "fs";
import gulpData from "gulp-data";
import pug from "gulp-pug";
import pugLinter from "gulp-pug-linter";
import * as yaml from "js-yaml";
import merge from "lodash/merge";
import pugLintStylish from "puglint-stylish";

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
   * Task constructor.
   *
   * @param {string} name
   * @param {object} settings
   */
  constructor(name: string, settings: object) {
    super(name, settings);

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
   * @param {NodeJS.ReadWriteStream} stream
   * @return {NodeJS.ReadWriteStream}
   * @protected
   */
  protected _buildSpecific(stream: NodeJS.ReadWriteStream): NodeJS.ReadWriteStream {
    let data: any[] = [];

    // Load data from YAML files.
    if (typeof this._settings.settings.data === "string") {
      data = yaml.safeLoad(fs.readFileSync(this._settings.settings.data, "utf8"));
    } else if (typeof this._settings.settings.data === "object") {
      (this._settings.settings.data as string[]).forEach((filename: string): void => {
        data = merge(data, yaml.safeLoad(fs.readFileSync(filename, "utf8")));
      });
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
  protected _lintSpecific(stream: NodeJS.ReadWriteStream): NodeJS.ReadWriteStream {
    return stream.pipe(
      pugLinter({
        reporter: (errors: any[]): void => {
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
  protected _displayError(error: any): void {
    pugLintStylish([error]);
  }
}
