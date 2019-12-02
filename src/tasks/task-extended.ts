import log from "fancy-log";
import fs from "fs";
import { dest, series, src, watch } from "gulp";
import plumber from "gulp-plumber";
import process from "process";
import Undertaker from "undertaker";

import revision, { isActive } from "../gulp-plugins/revision";
import Size from "../gulp-plugins/size";
import Config from "../libs/config";
import Browsersync from "./browsersync";
import Task, { TaskCallback, Options as TaskOptions } from "./task";

export interface Options extends TaskOptions {
  browsersync?: Browsersync;
}

/**
 * Task class to define complex Gulp tasks with lint, build and watch sub-tasks.
 */
export default abstract class TaskExtended extends Task {
  public static readonly runInParallel: boolean = true;

  /**
   * Flag to init sizes anyway.
   * @type {boolean}
   * @protected
   */
  protected _activeInitSizesAnyway = true;

  /**
   * Flag to display sizes or not.
   * @type {boolean}
   * @protected
   */
  protected _activeSizes = true;

  /**
   * Browsersync instance.
   * @type {Browsersync | undefined}
   * @protected
   */
  protected _browserSync: Browsersync | undefined;

  /**
   * Browsersync settings.
   * @type {{}}
   * @protected
   */
  protected _browserSyncSettings: {} = {};

  /**
   * Flag to define if task could build sourcemaps.
   * @type {boolean}
   * @protected
   */
  protected _gulpSourcemaps = false;

  /**
   * Force to hide gzipped size.
   * @type {boolean}
   * @protected
   */
  protected _hideGzippedSize = true;

  /**
   * Flag to define if there is a lint error or not to block build.
   * @type {boolean}
   * @protected
   */
  protected _lintError = false;

  /**
   * Suffix of the minified file.
   * @type {string}
   * @protected
   */
  protected _minifySuffix = "";

  /**
   * List of files to watch in addition to the working files.
   * @type {string[]}
   * @protected
   */
  protected _watchingFiles: string[] = [];

  /**
   * Task constructor.
   *
   * @param {Options} options
   */
  public constructor(options: Options) {
    super(options);

    this._browserSync = options.browsersync;
  }

  /**
   * Check if current task have linter.
   *
   * @returns {boolean}
   * @protected
   */
  protected get _haveLinter(): boolean {
    const config: Config = Config.getInstance();
    return !!this._hookLint && config.options.lint;
  }

  /**
   * Register build task in Gulp.
   *
   * @return {string}
   */
  public taskBuild(): string {
    return this._defineTask("build", this._build.bind(this));
  }

  /**
   * Register lint task that run before build to check files validity.
   *
   * @return {string}
   */
  public taskLint(): string | false {
    if (!this._haveLinter) {
      return "";
    }

    this._lintError = false;

    return this._defineTask("lint", this._lint.bind(this));
  }

  /**
   * Register watch task that watch change on files and run lint and build tasks.
   *
   * @return {string}
   */
  public taskWatch(): string {
    return this._defineTask("watch", this._watch.bind(this));
  }

  /**
   * Bind events to build tasks.
   *
   * @param {NodeJS.ReadableStream} builder
   * @protected
   */
  protected _bindEventsToBuilder?(builder: NodeJS.ReadableStream): void;

  /**
   * Bind events to lint tasks.
   *
   * @param {NodeJS.ReadableStream} linter
   * @protected
   */
  protected _bindEventsToLinter?(linter: NodeJS.ReadableStream): void;

  /**
   * Bind events to file watcher.
   *
   * @param {fs.FSWatcher} watcher
   * @protected
   */
  protected _bindEventsToWatcher?(watcher: fs.FSWatcher): void;

  /**
   * Display error.
   *
   * @param {unknown} error
   * @protected
   */
  protected _displayError(error: unknown): void {
    log.error(error);
  }

  /**
   * Display error and exit if current task is a build task.
   *
   * @param {string} taskName
   * @param {unknown} error
   * @param {TaskCallback} done
   * @protected
   */
  protected _displayOrExitOnError(taskName: string, error: unknown, done?: TaskCallback): void {
    const config: Config = Config.getInstance();

    this._displayError(error);

    TaskExtended.taskErrors.push({
      done,
      error,
      taskName,
    });

    if ((config.isLintRun() || config.isBuildRun()) && config.isCurrentRun(taskName)) {
      if (!!done) done();

      process.exit(1);
    }
  }

  /**
   * Build task.
   *
   * @param {TaskCallback} done
   * @returns {NodeJS.ReadableStream | void}
   * @protected
   */
  protected _build(done?: TaskCallback): NodeJS.ReadableStream | void {
    Config.chdir(this._settings.cwd);

    const taskName: string = this._taskName("build");

    if (this._hookOverrideBuild) {
      return this._hookOverrideBuild(done);
    }

    // Start new stream with the files of the task.
    let stream: NodeJS.ReadableStream = this._hookBuildSrc
      ? this._hookBuildSrc()
      : src(this._settings.src, {
          cwd: this._settings.cwd,
        });

    // Add plumber to avoid exit on error.
    stream = stream.pipe(plumber((error: unknown): void => this._displayOrExitOnError(taskName, error, done)));

    // If there is no linter or no error, start specific logic of each task.
    if (!this._haveLinter || !this._lintError) {
      if (this._hookBuildBefore) {
        stream = this._hookBuildBefore(stream);
      }

      // Display file sizes.
      if ((this._activeSizes || this._activeInitSizesAnyway) && this._settings.sizes.normal) {
        const size: Size = new Size({
          gzip: !this._hideGzippedSize && this._settings.sizes.gzipped,
          minifySuffix: this._minifySuffix,
          taskName,
        });

        stream = stream.pipe(size.log());
      }

      stream = stream.pipe(plumber.stop()).pipe(dest(this._settings.dst, { cwd: this._settings.cwd }));

      if (this._browserSync) {
        stream = stream.pipe(this._browserSync.sync(taskName, this._browserSyncSettings));
      }

      if (isActive()) {
        stream = stream
          .pipe(
            revision({
              taskName,
              cwd: this._settings.cwd,
              dst: this._settings.revision,
            })
          )
          .pipe(dest(".", { cwd: this._settings.cwd }));
      }

      if (this._bindEventsToBuilder) {
        this._bindEventsToBuilder(stream);
      }
    }

    return stream;
  }

  /**
   * Lint task.
   *
   * @param {TaskCallback} done
   * @returns {NodeJS.ReadableStream | void}
   * @protected
   */
  protected _lint(done?: TaskCallback): NodeJS.ReadableStream | void {
    Config.chdir(this._settings.cwd);

    if (this._hookOverrideLint) {
      return this._hookOverrideLint(done);
    }

    let stream: NodeJS.ReadableStream = this._hookLintSrc
      ? this._hookLintSrc()
      : src(this._settings.src, { cwd: this._settings.cwd });

    if (this._hookLint) {
      stream = this._hookLint(stream, done);
    }

    if (this._bindEventsToLinter) {
      this._bindEventsToLinter(stream);
    }

    return stream;
  }

  /**
   * Method to add specific steps for the build.
   *
   * @param {NodeJS.ReadableStream} stream
   * @return {NodeJS.ReadableStream}
   * @protected
   */
  protected _hookBuildBefore?(stream: NodeJS.ReadableStream): NodeJS.ReadableStream;

  /**
   * Method to change default source for build task.
   *
   * @returns {NodeJS.ReadableStream}
   * @protected
   */
  protected _hookBuildSrc?(): NodeJS.ReadableStream;

  /**
   * Method to add specific steps for the lint.
   *
   * @param {NodeJS.ReadableStream} stream
   * @param {TaskCallback} done
   * @return {NodeJS.ReadableStream}
   * @protected
   */
  protected _hookLint?(stream: NodeJS.ReadableStream, done?: TaskCallback): NodeJS.ReadableStream;

  /**
   * Method to change default source for lint task.
   *
   * @returns {NodeJS.ReadableStream}
   * @protected
   */
  protected _hookLintSrc?(): NodeJS.ReadableStream;

  /**
   * Method to override build task.
   *
   * @param {TaskCallback} done
   * @returns {NodeJS.ReadableStream | void}
   * @protected
   */
  protected _hookOverrideBuild?(done?: TaskCallback): NodeJS.ReadableStream | void;

  /**
   * Method to override lint task.
   *
   * @param {TaskCallback} done
   * @returns {NodeJS.ReadableStream | void}
   * @protected
   */
  protected _hookOverrideLint?(done?: TaskCallback): NodeJS.ReadableStream | void;

  /**
   * Method to override watch task.
   *
   * @param {TaskCallback} done
   * @returns {NodeJS.ReadableStream | void}
   * @protected
   */
  protected _hookOverrideWatch?(done?: TaskCallback): NodeJS.ReadableStream | void;

  /**
   * Watch task.
   *
   * @param {TaskCallback} done
   * @protected
   */
  protected _watch(done?: TaskCallback): void {
    const tasks: Undertaker.Task[] = [];

    if (this._haveLinter) {
      tasks.push(this._taskName("lint"));
    }

    if (this._hookOverrideWatch) {
      this._hookOverrideWatch(done);
    } else {
      const srcWatch: string[] = [
        ...(typeof this._settings.src === "object" ? this._settings.src : [this._settings.src]),
        ...(this._settings.watch || []),
        ...this._watchingFiles,
      ];
      tasks.push(this._taskName("build"));

      const watcher: fs.FSWatcher = watch(srcWatch, { cwd: this._settings.cwd }, series(tasks));

      if (this._bindEventsToWatcher) {
        this._bindEventsToWatcher(watcher);
      }
    }

    if (done) done();
  }
}
