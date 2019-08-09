import BrowserSync, { BrowserSyncInstance, StreamOptions } from "browser-sync";
import { task as gulpTask, watch } from "gulp";
import gulpIf from "gulp-if";
import isEmpty from "lodash/isEmpty";
import merge from "lodash/merge";
import { Transform } from "stream";
import through, { TransformCallback } from "through2";

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

  private _syncedFiles: {
    [taskName: string]: {
      [filename: string]: any;
    };
  } = {};

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
      Config.chdir(this._settings.cwd);

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

  public memorize(taskName: string): Transform {
    const that = this;

    return through.obj(
      (file: any, encoding: string, cb: TransformCallback): void => {
        if (file.isNull() || file.isStream()) {
          return cb(null, file);
        }

        that._syncedFiles = merge(that._syncedFiles, {
          [taskName]: {
            [file.path]: file.clone(),
          },
        });

        cb(null, file);
      },
      (cb: TransformCallback): void => {
        cb();
      }
    );
  }

  public remember(taskName: string): Transform {
    const that = this;

    return through.obj((file: any, encoding: string, cb: TransformCallback): void => cb(null, file), function(
      cb: TransformCallback
    ): void {
      if (isEmpty(that._syncedFiles[taskName])) {
        return cb();
      }

      Object.keys(that._syncedFiles[taskName]).forEach((filename: string): void => {
        this.push(that._syncedFiles[taskName][filename]);
      });

      delete that._syncedFiles[taskName];

      cb();
    });
  }

  public sync(taskName: string, settings?: StreamOptions): NodeJS.ReadWriteStream {
    return gulpIf(this._started, this._browserSync.stream(settings || {}));
  }

  public watch(): string | false {
    const taskName: string = `${this._task}:watch`;

    if (this._settings.watch) {
      gulpTask(taskName, (done: TaskCallback): void => {
        watch(this._settings.watch).on("change", (): void => {
          if (this._started) {
            this._browserSync.stream();
          }
        });
        done();
      });

      return taskName;
    }

    return false;
  }
}
