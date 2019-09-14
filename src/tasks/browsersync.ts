import BrowserSync, { BrowserSyncInstance, StreamOptions } from "browser-sync";
import { task as gulpTask, watch } from "gulp";
import gulpIf from "gulp-if";
import isEmpty from "lodash/isEmpty";
import merge from "lodash/merge";
import { Transform } from "stream";
import through, { TransformCallback } from "through2";

import Config, { IGenericSettings } from "../modules/config";
import { TaskCallback } from "./task";

/**
 * Use Browsersync to reload browser on file modification.
 */
export default class Browsersync {
  /**
   * Global task name.
   * @type {string}
   * @readonly
   */
  public static readonly taskName: string = "browsersync";

  /**
   * Get Browsersync instance.
   *
   * @return {Browsersync}
   */
  public static getInstance(): Browsersync {
    if (!Browsersync._instance) {
      const conf: Config = Config.getInstance();
      Browsersync._instance = new Browsersync(conf.settings.browsersync || {});
    }

    return Browsersync._instance;
  }

  /**
   * Browsersync instance.
   * @type {Browsersync}
   * @private
   */
  private static _instance: Browsersync;

  /**
   * Browsersync settings.
   * @type {IGenericSettings}
   * @private
   * @readonly
   */
  private readonly _settings: IGenericSettings = {};

  /**
   * Real Browsersync instance.
   * @type {browserSync.BrowserSyncInstance}
   * @private
   */
  private _browserSync: BrowserSyncInstance = BrowserSync.create();

  /**
   * Flag to know status of browsersync start.
   * @type {boolean}
   * @private
   */
  private _started: boolean = false;

  /**
   * List of modified files to sync.
   * @type {{}}
   * @private
   */
  private _syncedFiles: {
    [taskName: string]: {
      [filename: string]: any;
    };
  } = {};

  /**
   * Browsersync constructor.
   *
   * @param {IGenericSettings} settings
   */
  private constructor(settings: IGenericSettings) {
    const defaultSetting: {} = {
      open: false,
      ui: false,
    };

    this._settings = settings;
    this._settings.settings = merge(defaultSetting, this._settings.settings || {});
  }

  /**
   * Start Browsersync.
   *
   * @return {string}
   */
  public start(): string {
    const taskName: string = `${Browsersync.taskName}:start`;

    gulpTask(taskName, (): void => {
      Config.chdir(this._settings.cwd);

      // Initialize Browsersync.
      this._browserSync.init(this._settings.settings, (): void => {
        this._started = true;
      });
    });

    return taskName;
  }

  /**
   * Memorize (keep files in memory) files to trigger sync.
   *
   * @param {string} taskName
   * @return {Transform}
   */
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

  /**
   * Remember (re-add files into the steam) files to trigger sync with all new files.
   *
   * @param {string} taskName
   * @return {Transform}
   */
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

  /**
   * Trigger sync.
   *
   * @param {string} taskName
   * @param {browserSync.StreamOptions} settings
   * @return {NodeJS.ReadWriteStream}
   */
  public sync(taskName: string, settings?: StreamOptions): NodeJS.ReadWriteStream {
    return gulpIf(this._started, this._browserSync.stream(settings || {}));
  }

  /**
   * Watch files to trigger sync.
   *
   * @return {string | false}
   */
  public watch(): string | false {
    const taskName: string = `${Browsersync.taskName}:watch`;

    if (this._settings.watch) {
      gulpTask(taskName, (done: TaskCallback): void => {
        watch(this._settings.watch, { cwd: this._settings.cwd }).on("change", (): void => {
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
}
