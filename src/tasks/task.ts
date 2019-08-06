import fs from "fs";
import process from "process";

import { dest, series, src, task as gulpTask, watch } from "gulp";
import GulpPlumber from "gulp-plumber";

import Config, { IGenericSettings } from "../modules/config";
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

  protected static isBuildRun(): boolean {
    return Config.getInstance().isBuildRun();
  }

  protected static isCurrentRun(task: string): boolean {
    return Config.getInstance().isCurrentRun(task);
  }

  protected task: string = "";
  protected name: string = "";
  protected settings: IGenericSettings = {};

  protected defaultDest: boolean = true;

  protected watchingFiles: string[] = [];

  protected browserSyncSettings: {} = {};

  protected withLinter: boolean = true;
  protected lintError: boolean = false;

  protected gulpRead: boolean = true;
  protected gulpSourcemaps: boolean = false;

  protected constructor(name: string, settings: object) {
    this.name = name;
    this.settings = settings;
  }

  public build(): string {
    const taskName: string = this.taskName("build");

    gulpTask(
      taskName,
      (done: TaskCallback): NodeJS.ReadWriteStream => {
        this.chdir();

        const options: IGulpOptions = {
          cwd: this.settings.cwd,
          read: this.gulpRead,
          sourcemaps: this.gulpSourcemaps && this.settings.settings.sourcemaps,
        };

        let stream: NodeJS.ReadWriteStream = src(this.settings.src, options as {}).pipe(
          GulpPlumber((error: any): void => this.displayOrExitOnError(taskName, error, done))
        );

        if (!this.withLinter || !this.lintError) {
          console.log(this);
          stream = this.buildSpecific(stream, options);

          stream.pipe(GulpPlumber.stop());

          if (this.defaultDest) {
            stream.pipe(dest(this.settings.dst, options));
          }

          stream.pipe(Browsersync.getInstance().sync(this.browserSyncSettings) as NodeJS.ReadWriteStream);
        }

        return stream;
      }
    );

    return taskName;
  }

  public lint(): string | false {
    const taskName: string = this.taskName("lint");

    if (!this.withLinter) {
      return false;
    }

    this.lintError = false;

    gulpTask(
      taskName,
      (): NodeJS.ReadWriteStream => {
        this.chdir();

        let stream: NodeJS.ReadWriteStream = src(this.settings.src, { cwd: this.settings.cwd });
        stream = this.lintSpecific(stream);

        return stream;
      }
    );

    return taskName;
  }

  public watch(): string {
    const taskName: string = this.taskName("watch");

    gulpTask(taskName, (done: TaskCallback): void => {
      const srcWatch: string[] = [...this.settings.src, ...(this.settings.watch || []), ...this.watchingFiles];
      const tasks: string[] = [this.taskName("build")];

      if (this.withLinter) {
        tasks.unshift(this.taskName("lint"));
      }

      const watcher: fs.FSWatcher = watch(srcWatch, { cwd: this.settings.cwd }, series(tasks));
      this.bindEventsToWatcher(watcher);

      done();
    });

    return taskName;
  }

  // tslint:disable-next-line:no-empty
  protected bindEventsToWatcher(watcher: fs.FSWatcher): void {}

  protected abstract buildSpecific(stream: NodeJS.ReadWriteStream, options?: IGulpOptions): NodeJS.ReadWriteStream;

  protected chdir(): void {
    try {
      process.chdir(this.settings.cwd);
    } catch (err) {
      console.error(`chdir: ${err}`);
    }
  }

  protected displayError(error: any): void {
    console.log(error);
  }

  protected displayOrExitOnError(taskName: string, error: any, done: TaskCallback): void {
    this.displayError(error);

    Task.taskErrors.push({
      done,
      error,
      taskName,
    });

    if (Task.isBuildRun() && Task.isCurrentRun(taskName)) {
      done();
      process.exit(1);
    }
  }

  protected lintSpecific(stream: NodeJS.ReadWriteStream): NodeJS.ReadWriteStream {
    return stream;
  }

  protected taskName(step?: string): string {
    if (!step) {
      return `${(this.constructor as any).taskName}:${this.name}`;
    }

    return `${(this.constructor as any).taskName}:${this.name}:${step}`;
  }
}
