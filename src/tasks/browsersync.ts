import process from "process";

import BrowserSync, { BrowserSyncInstance } from "browser-sync";
import { task as gulpTask, watch } from "gulp";
import GulpIf from "gulp-if";

import Config, { IGenericSettings } from "../modules/config";
import { TaskCallback } from "./task";

export default class Browsersync {
  public static readonly taskName: string = "browsersync";

  public static getInstance() {
    if (!Browsersync._instance) {
      const conf = Config.getInstance();
      Browsersync._instance = new Browsersync(conf.settings.browsersync);
    }

    return Browsersync._instance;
  }

  private static _instance: Browsersync;

  private readonly _task: string;
  private readonly _settings: IGenericSettings;

  private _browserSync: BrowserSyncInstance = BrowserSync.create();
  private _started: boolean = false;

  public get browserSync(): BrowserSyncInstance {
    return this._browserSync;
  }

  public get task(): string {
    return this._task;
  }

  private constructor(settings: {}) {
    this._task = Browsersync.taskName;
    this._settings = settings;
  }

  public start(): string {
    const taskName = `${this._task}:start`;

    gulpTask(taskName, (done: TaskCallback): void => {
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
    const reloadSettings = Object.assign({ stream: true }, settings || {});
    return GulpIf(this._started, this._browserSync.reload(reloadSettings));
  }

  public watch(): string | false {
    const taskName = `${this._task}:watch`;

    if (this._settings.watch) {
      gulpTask(taskName, (done: TaskCallback): void => {
        watch(this._settings.watch).on("change", () => {
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
