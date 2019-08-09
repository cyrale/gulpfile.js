import log from "fancy-log";
import fs from "fs";
import { dest, series, src, task as gulpTask, watch } from "gulp";
import gulpIf from "gulp-if";
import plumber from "gulp-plumber";
import process from "process";

import Config, { IGenericSettings } from "../modules/config";
import Revision from "../modules/revision";
import TaskFactory from "../modules/task-factory";
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

export type TaskCallback = (error?: any) => void;

export default abstract class Task {
  public static readonly taskName: string = "";
  public static taskErrors: ITaskErrorDefinition[] = [];

  protected static _isBuildRun(): boolean {
    return Config.getInstance().isBuildRun();
  }

  protected static _isCurrentRun(task: string): boolean {
    return Config.getInstance().isCurrentRun(task);
  }

  protected _name: string = "";
  protected _settings: IGenericSettings = {};

  protected _defaultDest: boolean = true;

  protected _watchingFiles: string[] = [];

  protected _browserSyncSettings: {} = {};

  protected _withLinter: boolean = true;
  protected _lintError: boolean = false;

  protected _gulpRead: boolean = true;
  protected _gulpSourcemaps: boolean = false;

  protected constructor(name: string, settings: object) {
    this._name = name;
    this._settings = settings;
  }

  public build(): string {
    const browserSync = Browsersync.getInstance();
    const config = Config.getInstance();
    const taskName: string = this._taskName("build");

    gulpTask(
      taskName,
      (done: TaskCallback): NodeJS.ReadWriteStream => {
        Config.chdir(this._settings.cwd);

        const options: IGulpOptions = {
          cwd: this._settings.cwd,
          read: this._gulpRead,
          sourcemaps: this._gulpSourcemaps && this._settings.settings.sourcemaps,
        };

        let stream: NodeJS.ReadWriteStream = src(this._settings.src, options as {}).pipe(
          plumber((error: any): void => this._displayOrExitOnError(taskName, error, done))
        );

        if (!this._withLinter || !this._lintError) {
          stream = this._buildSpecific(stream, options, done)
            .pipe(plumber.stop())
            .pipe(browserSync.remember(taskName))
            .pipe(gulpIf(this._defaultDest, dest(this._settings.dst, options)))
            .pipe(browserSync.sync(taskName, this._browserSyncSettings))
            .pipe(
              Revision.manifest({
                active: !!config.settings.revision,
                cwd: config.options.cwd,
                manifest: typeof config.settings.revision === "string" ? config.settings.revision : "rev-manifest.json",
                task: TaskFactory.explodeTaskName(taskName),
              })
            )
            .pipe(dest(".", options));
        }

        return stream;
      }
    );

    return taskName;
  }

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

        let stream: NodeJS.ReadWriteStream = src(this._settings.src, { cwd: this._settings.cwd });
        stream = this._lintSpecific(stream);

        return stream;
      }
    );

    return taskName;
  }

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

  // tslint:disable-next-line:no-empty
  protected _bindEventsToWatcher(watcher: fs.FSWatcher): void {}

  protected abstract _buildSpecific(
    stream: NodeJS.ReadWriteStream,
    options?: IGulpOptions,
    done?: TaskCallback
  ): NodeJS.ReadWriteStream;

  protected _displayError(error: any): void {
    log.error(error);
  }

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

  protected _lintSpecific(stream: NodeJS.ReadWriteStream): NodeJS.ReadWriteStream {
    return stream;
  }

  protected _taskName(step?: string): string {
    if (!step) {
      return `${(this.constructor as any).taskName}:${this._name}`;
    }

    return `${(this.constructor as any).taskName}:${this._name}:${step}`;
  }
}
