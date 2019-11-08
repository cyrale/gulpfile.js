import BrowserSync, { BrowserSyncInstance, StreamOptions } from "browser-sync";
import { watch } from "gulp";
import isEmpty from "lodash/isEmpty";
import merge from "lodash/merge";
import { Transform } from "stream";
import through, { TransformCallback } from "through2";
import File from "vinyl";

import Config from "../libs/config";
import { Options as TaskOptions, TaskCallback } from "./task";
import TaskSimple from "./task-simple";

type BrowserSyncTransform = ((taskName: string) => Transform) | (() => Transform);

export interface BrowserSyncMethods {
  memorize: BrowserSyncTransform;
  remember: BrowserSyncTransform;
  sync: ((taskName: string, settings?: StreamOptions) => NodeJS.ReadWriteStream) | (() => Transform);
}

/**
 * Use Browsersync to reload browser on file modification.
 */
export default class Browsersync extends TaskSimple {
  /**
   * Global task name.
   * @type {string}
   * @readonly
   */
  public static readonly taskName: string = "browsersync";

  /**
   * Level to order task in execution pipeline.
   * @type {number}
   * @readonly
   */
  public static readonly taskOrder: number = 60;

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
  private _started = false;

  /**
   * List of modified files to sync.
   * @type {{}}
   * @private
   */
  private _syncedFiles: {
    [taskName: string]: {
      [filename: string]: unknown;
    };
  } = {};

  /**
   * Browsersync constructor.
   *
   * @param {TaskOptions} options
   */
  public constructor(options: TaskOptions) {
    super(options);

    const defaultSetting: {} = {
      open: false,
      ui: false,
    };

    this._settings.settings = merge(defaultSetting, this._settings.settings || {});
  }

  /**
   * Memorize (keep files in memory) files to trigger sync.
   *
   * @param {string} taskName
   * @return {Transform}
   */
  public memorize(taskName: string): Transform {
    return through.obj(
      (file: File, encoding: string, cb: TransformCallback): void => {
        if (file.isNull() || file.isStream()) {
          return cb(null, file);
        }

        this._syncedFiles = merge(this._syncedFiles, {
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
    const self = this;

    return through.obj((file: unknown, encoding: string, cb: TransformCallback): void => cb(null, file), function(
      cb: TransformCallback
    ): void {
      if (isEmpty(self._syncedFiles[taskName])) {
        return cb();
      }

      Object.keys(self._syncedFiles[taskName]).forEach((filename: string): void => {
        this.push(self._syncedFiles[taskName][filename]);
      });

      delete self._syncedFiles[taskName];

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
    if (!this._started) {
      return through.obj();
    }

    return this._browserSync.stream(settings || {});
  }

  protected _start(): void {
    Config.chdir(this._settings.cwd);

    // Initialize Browsersync.
    this._browserSync.init(this._settings.settings, (): void => {
      this._started = true;
    });
  }

  protected _watch(done: TaskCallback): void {
    watch(this._settings.watch || [], { cwd: this._settings.cwd }).on("change", (): void => {
      if (this._started) {
        this._browserSync.reload();
      }

      done();
    });
  }
}
