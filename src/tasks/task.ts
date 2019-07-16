import process from "process";

import { series, task as gulpTask, watch } from "gulp";

import { IGenericSettings } from "../modules/config";

export type TDefaultCallback = () => void;

export default abstract class Task {
  protected task: string = "";
  protected name: string = "";
  protected settings: IGenericSettings = {};

  protected withLinter: boolean = true;
  protected lintError: boolean = false;

  protected constructor(name: string, settings: object) {
    this.name = name;
    this.settings = settings;
  }

  public abstract build(): string;

  public abstract lint(): string | false;

  public watch(): string {
    const taskName = this.taskName("watch");

    gulpTask(taskName, () => {
      const src = this.settings.src.concat(this.settings.watch || []);
      const tasks = [this.taskName("build")];

      if (this.withLinter) {
        tasks.unshift(this.taskName("lint"));
      }

      return watch(src, { cwd: this.settings.cwd }, series(tasks));
    });

    return taskName;
  }

  protected chdir() {
    try {
      process.chdir(this.settings.cwd);
    } catch (err) {
      console.error(`chdir: ${err}`);
    }
  }

  protected taskName(step: string): string {
    return `${this.task}:${this.name}:${step}`;
  }
}
