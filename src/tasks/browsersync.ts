import process from "process";

import BrowserSync, { BrowserSyncInstance } from "browser-sync";
import { task as gulpTask, watch } from "gulp";
import GulpIf from "gulp-if";

import { IGenericSettings } from "../modules/config";
import { TaskCallback } from "./task";

export default class Browsersync {
  public static readonly taskName = "browsersync";

  public readonly _task: string;
  public readonly _settings: IGenericSettings;

  private browserSync: BrowserSyncInstance = BrowserSync.create();
  private started: boolean = false;

  public get task(): string {
    return this._task;
  }

  constructor(settings: {}) {
    this._task = Browsersync.taskName;
    this._settings = settings;
  }

  public start(): string {
    const taskName = `${this._task}:start`;

    gulpTask(taskName, (done: TaskCallback): void => {
      this.chdir();

      this.browserSync.init(
        Object.assign(
          {
            open: false,
            ui: false
          },
          this._settings.settings || {}
        ),
        (): void => {
          this.started = true;
        }
      );
    });

    return taskName;
  }

  public sync(settings?: {}): NodeJS.ReadWriteStream {
    const reloadSettings = Object.assign({ stream: true }, settings || {});
    return GulpIf(this.started, this.browserSync.reload(reloadSettings));
  }

  public watch(): string | false {
    const taskName = `${this._task}:watch`;

    if (this._settings.watch) {
      gulpTask(taskName, () => {
        watch(this._settings.watch, this.sync);
      });

      return taskName;
    }

    return false;
  }

  private chdir(): void {
    try {
      process.chdir(this._settings.cwd);
    } catch (err) {
      console.error(`chdir: ${err}`);
    }
  }
}
