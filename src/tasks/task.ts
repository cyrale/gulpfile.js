import log from "fancy-log";
import fs from "fs";
import { dest, series, src, task as gulpTask, watch } from "gulp";
import gulpIf from "gulp-if";
import plumber from "gulp-plumber";
// import size from "gulp-size";
import process from "process";

import Config, { IGenericSettings } from "../modules/config";
import Revision, { IRevisionOptions } from "../modules/revision";
import Size from "../modules/size";
import Browsersync from "./browsersync";

interface ITaskErrorDefinition {
  taskName: string;
  error: any;
  done: TaskCallback;
}

export interface IGulpOptions {
  cwd: string;
  read?: boolean;
  sourcemaps?: true | string;
}

export interface IBuildSettings {
  options: IGulpOptions;
  revision: IRevisionOptions;
  size: Size;
  taskName: string;
}

export type TaskCallback = (error?: any) => void;

/**
 * Task class to define gulp tasks.
 */
export default abstract class Task {
  /**
   * Global task name.
   * @type {string}
   * @readonly
   */
  public static readonly taskName: string = "";

  /**
   * List of errors.
   * @type {ITaskErrorDefinition[]}
   */
  public static taskErrors: ITaskErrorDefinition[] = [];

  /**
   * Check if current run is a build run.
   *
   * @return {boolean}
   * @protected
   */
  protected static _isBuildRun(): boolean {
    return Config.getInstance().isBuildRun();
  }

  /**
   * Check if a task is the current run.
   *
   * @param {string} taskName
   * @return {boolean}
   * @protected
   */
  protected static _isCurrentRun(taskName: string): boolean {
    return Config.getInstance().isCurrentRun(taskName);
  }

  /**
   * Name of the current task.
   * @type {string}
   * @protected
   */
  protected _name: string = "";

  /**
   * Current task settings.
   * @type {IGenericSettings}
   * @protected
   */
  protected _settings: IGenericSettings = {};

  /**
   * Flag to define if task use the default dest to save files.
   * @type {boolean}
   * @protected
   */
  protected _defaultDest: boolean = true;

  /**
   * Flag to define if task use the default revision system.
   * @type {boolean}
   * @protected
   */
  protected _defaultRevision: boolean = true;

  /**
   * List of files to watch in addition to the working files.
   * @type {string[]}
   * @protected
   */
  protected _watchingFiles: string[] = [];

  /**
   * Browsersync settings.
   * @type {{}}
   * @protected
   */
  protected _browserSyncSettings: {} = {};

  /**
   * Flag to define if task use a linter or not.
   * @type {boolean}
   * @protected
   */
  protected _withLinter: boolean = true;

  /**
   * Flag to define if there is a lint error or not to block build.
   * @type {boolean}
   * @protected
   */
  protected _lintError: boolean = false;

  /**
   * Flag to avoid read of file on load of gulp task.
   * @type {boolean}
   * @protected
   */
  protected _gulpRead: boolean = true;

  /**
   * Flag to define if task could build sourcemaps.
   * @type {boolean}
   * @protected
   */
  protected _gulpSourcemaps: boolean = false;

  /**
   * Flag to display sizes or not.
   * @type {boolean}
   * @protected
   */
  protected _activeSizes: boolean = true;

  /**
   * Flag to init sizes anyway.
   * @type {boolean}
   * @protected
   */
  protected _activeInitSizesAnyway: boolean = true;

  /**
   * Force to hide gzipped size.
   * @type {boolean}
   * @protected
   */
  protected _hideGzippedSize: boolean = true;

  /**
   * Suffix of the minified file.
   * @type {string}
   * @protected
   */
  protected _minifySuffix: string = "";

  /**
   * Task constructor.
   *
   * @param {string} name
   * @param {object} settings
   */
  protected constructor(name: string, settings: object) {
    this._name = name;
    this._settings = settings;
  }

  /**
   * Basic task that run all tasks.
   *
   * @return {string}
   */
  public build(): string {
    const browserSync = Browsersync.getInstance();
    const config = Config.getInstance();
    const taskName: string = this._taskName("build");

    gulpTask(
      taskName,
      (done: TaskCallback): NodeJS.ReadWriteStream => {
        Config.chdir(this._settings.cwd);

        // All the build settings in a unique object.
        const buildSettings: IBuildSettings = {
          options: {
            cwd: this._settings.cwd,
            read: this._gulpRead,
            sourcemaps: this._gulpSourcemaps && this._settings.settings.sourcemaps,
          },
          revision: {
            cwd: config.options.cwd,
            dst: this._settings.dst,
            manifest: typeof config.settings.revision === "string" ? config.settings.revision : "rev-manifest.json",
            taskName,
          },
          size: new Size({
            gzip: !this._hideGzippedSize && this._settings.sizes.gzipped,
            minifySuffix: this._minifySuffix,
            taskName,
          }),
          taskName,
        };

        // Start new stream with the files of the task.
        let stream: NodeJS.ReadWriteStream = src(this._settings.src, buildSettings.options as {})
          .pipe(
            gulpIf(
              (this._activeSizes || this._activeInitSizesAnyway) && this._settings.sizes.normal,
              buildSettings.size.init()
            )
          )
          .pipe(plumber((error: any): void => this._displayOrExitOnError(taskName, error, done)));

        // If there is no linter or no error, start specific logic of each task.
        if (!this._withLinter || !this._lintError) {
          stream = this._buildSpecific(stream, buildSettings, done)
            .pipe(gulpIf(this._activeSizes && this._settings.sizes.normal, buildSettings.size.collect()))
            .pipe(plumber.stop())
            .pipe(browserSync.remember(taskName))
            .pipe(gulpIf(this._defaultDest, dest(this._settings.dst, buildSettings.options)))
            .pipe(gulpIf(this._defaultRevision && Revision.isActive(), Revision.manifest(buildSettings.revision)))
            .pipe(gulpIf(this._defaultRevision && Revision.isActive(), dest(".", buildSettings.options)))
            .pipe(browserSync.sync(taskName, this._browserSyncSettings));
        }

        return stream;
      }
    );

    return taskName;
  }

  /**
   * Lint task run after build to check files validity.
   *
   * @return {string | false}
   */
  public lint(): string | false {
    const taskName: string = this._taskName("lint");

    if (!this._withLinter) {
      return false;
    }

    this._lintError = false;

    gulpTask(
      taskName,
      (): NodeJS.ReadWriteStream => {
        Config.chdir(this._settings.cwd);

        return this._lintSpecific(src(this._settings.src, { cwd: this._settings.cwd }));
      }
    );

    return taskName;
  }

  /**
   * Run lint and build on each change of watching files.
   *
   * @return {string}
   */
  public watch(): string {
    const taskName: string = this._taskName("watch");

    gulpTask(taskName, (done: TaskCallback): void => {
      const srcWatch: string[] = [
        ...(typeof this._settings.src === "object" ? this._settings.src : [this._settings.src]),
        ...(this._settings.watch || []),
        ...this._watchingFiles,
      ];
      const tasks: string[] = [this._taskName("build")];

      if (this._withLinter) {
        tasks.unshift(this._taskName("lint"));
      }

      const watcher: fs.FSWatcher = watch(srcWatch, { cwd: this._settings.cwd }, series(tasks));
      this._bindEventsToWatcher(watcher);

      done();
    });

    return taskName;
  }

  /**
   * Bind events to file watcher.
   *
   * @param {fs.FSWatcher} watcher
   * @protected
   */
  // tslint:disable-next-line:no-empty
  protected _bindEventsToWatcher(watcher: fs.FSWatcher): void {}

  /**
   * Method to add specific steps for the build.
   *
   * @param {NodeJS.ReadWriteStream} stream
   * @param {IBuildSettings} buildSettings
   * @param {TaskCallback} done
   * @return {NodeJS.ReadWriteStream}
   * @protected
   */
  protected abstract _buildSpecific(
    stream: NodeJS.ReadWriteStream,
    buildSettings?: IBuildSettings,
    done?: TaskCallback
  ): NodeJS.ReadWriteStream;

  /**
   * Display error.
   *
   * @param {any} error
   * @protected
   */
  protected _displayError(error: any): void {
    log.error(error);
  }

  /**
   * Display error and exit if current task is a build task.
   *
   * @param {string} taskName
   * @param error
   * @param {TaskCallback} done
   * @protected
   */
  protected _displayOrExitOnError(taskName: string, error: any, done: TaskCallback): void {
    this._displayError(error);

    Task.taskErrors.push({
      done,
      error,
      taskName,
    });

    if (Task._isBuildRun() && Task._isCurrentRun(taskName)) {
      done();
      process.exit(1);
    }
  }

  /**
   * Method to add specific steps for the lint.
   *
   * @param {NodeJS.ReadWriteStream} stream
   * @return {NodeJS.ReadWriteStream}
   * @protected
   */
  protected _lintSpecific(stream: NodeJS.ReadWriteStream): NodeJS.ReadWriteStream {
    return stream;
  }

  /**
   * Build complete task name based on current task, name and step.
   *
   * @param {string} step
   * @return {string}
   * @protected
   */
  protected _taskName(step?: string): string {
    if (!step) {
      return `${(this.constructor as any).taskName}:${this._name}`;
    }

    return `${(this.constructor as any).taskName}:${this._name}:${step}`;
  }
}
