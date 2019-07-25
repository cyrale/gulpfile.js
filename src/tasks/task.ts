import process from "process";

import { series, task as gulpTask, watch } from "gulp";

import Config, { IGenericSettings } from "../modules/config";
import Browsersync from "./browsersync";

interface ITaskErrorDefinition {
  taskName: string;
  error: any;
  done: TaskCallback;
}

export type TaskCallback = (error?: any) => void;

export default abstract class Task {
  public static taskErrors: ITaskErrorDefinition[] = [];

  protected task: string = "";
  protected name: string = "";
  protected settings: IGenericSettings = {};

  protected browserSync: Browsersync;

  protected withLinter: boolean = true;
  protected lintError: boolean = false;

  protected constructor(name: string, settings: object, browserSync: Browsersync) {
    this.name = name;
    this.settings = settings;

    this.browserSync = browserSync;
  }

  public abstract build(): string;

  public abstract lint(): string | false;

  public watch(): string {
    const taskName = this.taskName("watch");

    gulpTask(taskName, (done: TaskCallback): void => {
      const src = this.settings.src.concat(this.settings.watch || []);
      const tasks = [this.taskName("build")];

      if (this.withLinter) {
        tasks.unshift(this.taskName("lint"));
      }

      watch(src, { cwd: this.settings.cwd }, series(tasks));

      done();
    });

    return taskName;
  }

  protected displayError(error: any): void {
    console.log(error);
  }

  protected chdir(): void {
    try {
      process.chdir(this.settings.cwd);
    } catch (err) {
      console.error(`chdir: ${err}`);
    }
  }

  protected exitOnError(taskName: string, error: any, done: TaskCallback): void {
    this.displayError(error);

    Task.taskErrors.push({
      done,
      error,
      taskName
    });

    if (this.isBuildRun() && this.isCurrentRun(taskName)) {
      done();
      process.exit(1);
    }
  }

  protected isBuildRun(): boolean {
    return Config.getInstance().isBuildRun();
  }

  protected isCurrentRun(task: string): boolean {
    return Config.getInstance().isCurrentRun(task);
  }

  protected taskName(step: string): string {
    return `${this.task}:${this.name}:${step}`;
  }
}
