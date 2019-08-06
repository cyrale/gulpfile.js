import BrowserSync, { BrowserSyncInstance } from "browser-sync";
import { task as gulpTask, watch } from "gulp";
import gulpIf from "gulp-if";
import merge from "lodash/merge";
import process from "process";

import Config, { IGenericSettings } from "../modules/config";
import { TaskCallback } from "./task";

export default class Browsersync {
  public static readonly taskName: string = "browsersync";

  public static getInstance(): Browsersync {
    if (!Browsersync._instance) {
      const conf: Config = Config.getInstance();
      Browsersync._instance = new Browsersync(conf.settings.browsersync);
    }

    return Browsersync._instance;
  }

  private static _instance: Browsersync;

  private readonly _task: string;
  private readonly _settings: IGenericSettings;

  private _browserSync: BrowserSyncInstance = BrowserSync.create();
  private _started: boolean = false;

  public get task(): string {
    return this._task;
  }

  private constructor(settings: {}) {
    this._task = Browsersync.taskName;
    this._settings = settings;
  }

  public start(): string {
    const taskName: string = `${this._task}:start`;

    gulpTask(taskName, (): void => {
      this.chdir();

      this._browserSync.init(
        Object.assign(
          {
            open: false,
            ui: false,
          },
          this._settings.settings || {}
        ),
        (): void => {
          this._started = true;
        }
      );
    });

    return taskName;
  }

  public sync(settings?: {}): NodeJS.WritableStream {
    return gulpIf(this._started, this._browserSync.reload(merge({ stream: true }, settings || {})));
  }

  public watch(): string | false {
    const taskName: string = `${this._task}:watch`;

    if (this._settings.watch) {
      gulpTask(taskName, (done: TaskCallback): void => {
        watch(this._settings.watch).on("change", (): void => {
          if (this._started) {
            this._browserSync.reload();
          }
        });
        done();
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
