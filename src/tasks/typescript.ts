import browserify, { BrowserifyObject, Options } from "browserify";
import fs from "fs";
import ignore, { Ignore } from "ignore";
import merge from "lodash/merge";
import omit from "lodash/omit";
import path from "path";

import Browserify from "./browserify";
import { Options as TaskOptions } from "./task";

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

  protected _esLintIgnore: Ignore | undefined;

  /**
   * Task constructor.
   *
   * @param {TaskOptions} options
   */
  constructor(options: TaskOptions) {
    super(options);

    // Babel configuration for TypeScript.
    if (
      typeof this._settings.settings.babel === "undefined" ||
      (typeof this._settings.settings.babel === "object" && !this._settings.settings.babel.extensions)
    ) {
      this._settings.settings.babel = merge(this._settings.settings.babel || {}, { extensions: [".ts", ".tsx"] });
    }

    // TypeScript configuration.
    if (typeof this._settings.settings.typescript === "string") {
      this._settings.settings.typescript = {
        project: this._settings.settings.typescript,
      };
    }

    // Determine name of the .eslintignore file.
    let esLintIgnoreFilename: string = path.resolve(this._settings.cwd, ".eslintignore");
    if (this._settings.settings.eslint.ignorePath) {
      esLintIgnoreFilename = path.isAbsolute(this._settings.settings.eslint.ignorePath)
        ? this._settings.settings.eslint.ignorePath
        : path.resolve(this._settings.cwd, this._settings.settings.eslint.ignorePath);
    }

    // Read ignore file.
    if (fs.existsSync(esLintIgnoreFilename)) {
      this._esLintIgnore = ignore().add(fs.readFileSync(esLintIgnoreFilename).toString());
    }
  }

  protected get bundlerOnly(): BrowserifyObject {
    // Initialize Browserify bundler only.
    if (!this._bundlerOnly) {
      const browserifyOptions: Options = omit(this._settings.settings, ["babel", "eslint", "typescript"]);

      this._bundlerOnly = browserify(browserifyOptions).plugin("tsify", this._settings.settings.typescript);
    }

    return this._bundlerOnly;
  }

  protected _collectFilesForLint(absolute: string, relative: string): void {
    let ignored = true;

    if (!this._esLintIgnore) {
      this._bundleFiles.push(absolute);
    } else {
      try {
        ignored = this._esLintIgnore.ignores(relative);
      } catch (e) {}

      if (!ignored && this._bundleFiles.indexOf(absolute) < 0) this._bundleFiles.push(absolute);
    }
  }
}
