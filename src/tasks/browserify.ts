import async from "async";
import browserify, { BrowserifyObject, Options } from "browserify";
import chalk from "chalk";
import log from "fancy-log";
import { src } from "gulp";
import esLint from "gulp-eslint";
import merge from "lodash/merge";
import omit from "lodash/omit";
import prettyHrTime from "pretty-hrtime";
import Undertaker from "undertaker";
import buffer from "vinyl-buffer";
import source from "vinyl-source-stream";
import watchify from "watchify";

import Config from "../libs/config";
import Javascript, { ESLintErrors } from "./javascript";
import { TaskCallback, Options as TaskOptions } from "./task";

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
  public static readonly taskOrder: number = 40;

  /**
   * List of files used by bundler.
   * @type {any[]}
   * @protected
   */
  protected _bundleFiles: string[] = [];

  /**
   * Bundler with transforms and plugins.
   * @type {BrowserifyObject | undefined}
   * @protected
   */
  protected _bundler: BrowserifyObject | undefined;

  /**
   * Bundler with basic settings.
   * @type {BrowserifyObject | undefined}
   * @protected
   */
  protected _bundlerOnly: BrowserifyObject | undefined;

  /**
   * Browserify constructor.
   *
   * @param {TaskOptions} options
   */
  constructor(options: TaskOptions) {
    super(options);

    // Merge settings with default.
    const defaultSettings: Record<string, unknown> = {
      basedir: this._settings.cwd,
      debug: this._settings.sourcemaps,
      entries: this._settings.src,
    };

    this._settings.settings = merge(defaultSettings, this._settings.settings, watchify.args);
  }

  /**
   * Get bundler with transforms and plugins.
   *
   * @returns {browserify.BrowserifyObject}
   * @protected
   */
  protected get bundler(): BrowserifyObject {
    const config: Config = Config.getInstance();

    // Initialize Browserify bundler.
    if (!this._bundler) {
      this._bundler = this.bundlerOnly;

      if (this._settings.settings.babel !== false) {
        this._bundler.transform("babelify", this._settings.settings.babel);
      }

      if (!config.isBuildRun()) {
        this._bundler.plugin("watchify");
      }
    }

    return this._bundler;
  }

  /**
   * Get bundler without transforms and plugins.
   *
   * @returns {browserify.BrowserifyObject}
   * @protected
   */
  protected get bundlerOnly(): BrowserifyObject {
    // Initialize Browserify bundler only.
    if (!this._bundlerOnly) {
      const browserifyOptions: Options = omit(this._settings.settings, ["babel", "eslint"]);

      this._bundlerOnly = browserify(browserifyOptions);
    }

    return this._bundlerOnly;
  }

  /**
   * Collect files used by bundler.
   *
   * @param {string} absolute
   * @param {string} relative
   * @protected
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected _collectFilesForLint(absolute: string, relative: string): void {
    if (this._bundleFiles.indexOf(absolute) < 0) this._bundleFiles.push(absolute);
  }

  /**
   * Pass files to ESLint.
   *
   * @param {string[]} files
   * @param {TaskCallback} done
   * @returns {NodeJS.ReadableStream}
   * @protected
   */
  protected _esLint(files: string[], done?: TaskCallback): NodeJS.ReadableStream {
    return src(files, { allowEmpty: true, cwd: this._settings.cwd })
      .pipe(esLint(this._settings.settings.eslint))
      .pipe(esLint.format())
      .pipe(
        esLint.results((filesWithErrors: ESLintErrors): void => {
          this._esLintResults(filesWithErrors, done);
        })
      )
      .on("finish", () => {
        if (done) done();
      });
  }

  /**
   * Fake Gulp logging used to provide unified feedback with watchify.
   *
   * @param {string} taskName
   * @param {Undertaker.TaskFunction} task
   * @param {TaskCallback} done
   * @protected
   */
  protected _fakeGulpTask(taskName: string, task: Undertaker.TaskFunction, done: TaskCallback): void {
    const coloredTaskName: string = chalk.cyan(taskName);
    const start = process.hrtime();

    log(`Starting '${coloredTaskName}'...`);

    const callback = (done: TaskCallback) => {
      return (): void => {
        const duration = process.hrtime(start);

        log(`Finished '${coloredTaskName}' after ` + chalk.magenta(prettyHrTime(duration)));
        done();
      };
    };

    task(callback(done));
  }

  /**
   * Method to add specific steps for the build.
   *
   * @param {NodeJS.ReadableStream} stream
   * @return {NodeJS.ReadableStream}
   * @protected
   */
  protected _hookBuildBefore(stream: NodeJS.ReadableStream): NodeJS.ReadableStream {
    stream = stream.pipe(source(this._settings.filename)).pipe(buffer());
    stream = this._sourceMapsAndMinification(stream);

    return stream;
  }

  /**
   * Method to change default source for build task.
   *
   * @returns {NodeJS.ReadableStream}
   * @protected
   */
  protected _hookBuildSrc(): NodeJS.ReadableStream {
    const self = this;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.bundler.bundle().on("error", function (this: any, err: Record<string, unknown>): void {
      self._displayError(err);
      this.emit("end");
    });
  }

  /**
   * Method to override lint task.
   *
   * @param {TaskCallback} done
   * @returns {NodeJS.ReadableStream | void}
   * @protected
   */
  protected _hookOverrideLint(done?: TaskCallback): void {
    if (this._settings.watch) {
      this._esLint(this._settings.watch, done);
      return;
    }

    async.series(
      {
        "collect-files": (cb: TaskCallback): void => {
          this.bundlerOnly.on("file", this._collectFilesForLint.bind(this)).bundle(cb);
        },
      },
      (): void => {
        this._esLint(this._bundleFiles, done);
      }
    );
  }

  /**
   * Method to override watch task.
   *
   * @param {TaskCallback} done
   * @returns {NodeJS.ReadableStream | void}
   * @protected
   */
  protected _hookOverrideWatch(done: TaskCallback): void {
    this.bundler.on("update", () => {
      async.series(
        {
          "0-lint": (cb: TaskCallback): void => {
            const task: Undertaker.TaskFunction = (cbt: TaskCallback): void => {
              this._lint(cbt);
            };

            this._fakeGulpTask(this._taskName("lint"), task, cb);
          },
          "1-build": (cb: TaskCallback): void => {
            if (this._haveLinter && this._lintError) {
              return cb();
            }

            const task: Undertaker.TaskFunction = (cbt: TaskCallback): void => {
              const stream: NodeJS.ReadableStream | void = this._build();

              if (stream) {
                stream.on("end", cbt);
              } else {
                cbt();
              }
            };

            this._fakeGulpTask(this._taskName("build"), task, cb);
          },
        },
        () => {
          done();
        }
      );
    });
  }
}
