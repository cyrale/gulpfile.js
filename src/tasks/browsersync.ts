import BrowserSync, { BrowserSyncInstance } from "browser-sync";
import { task as gulpTask, watch } from "gulp";
import GulpIf from "gulp-if";

import { IGenericSettings } from "../modules/config";

export default class Browsersync {
  protected _task: string = "";
  protected settings: IGenericSettings = {};

  private browserSync: BrowserSyncInstance = BrowserSync.create();
  private started: boolean = false;

  public get task(): string {
    return this._task;
  }

  constructor(settings: object) {
    this._task = "browsersync";
    this.settings = settings;
  }

  public start(): string {
    const taskName = `${this._task}:start`;

    gulpTask(taskName, done => {
      this.browserSync.init(
        Object.assign(
          {
            open: false,
            ui: false
          },
          this.settings.settings || {}
        ),
        (): void => {
          this.started = true;
        }
      );
    });

    return taskName;
  }

  public sync(settings?: {}): NodeJS.ReadWriteStream {
    const reloadSettings = Object.assign({ stream: true }, this.started ? settings || {} : {});
    return GulpIf(this.started, this.browserSync.reload(reloadSettings));
  }

  public watch(): string | false {
    const taskName = `${this._task}:watch`;

    if (this.settings.watch) {
      gulpTask(taskName, () => {
        watch(this.settings.watch, this.browserSync.reload);
      });

      return taskName;
    }

    return false;
  }
}
