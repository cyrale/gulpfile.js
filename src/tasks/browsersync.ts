import BrowserSync, { BrowserSyncInstance, StreamOptions } from "browser-sync";
import chalk from "chalk";
import { watch } from "gulp";
import merge from "lodash/merge";
import through from "through2";

import Config from "../libs/config";
import { Options as TaskOptions, TaskCallback } from "./task";
import TaskSimple from "./task-simple";

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
   * @type {BrowserSyncInstance}
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
   * Trigger sync.
   *
   * @param {string} taskName
   * @param {StreamOptions} settings
   * @return {NodeJS.ReadWriteStream}
   */
  public sync(taskName: string, settings?: StreamOptions): NodeJS.ReadWriteStream {
    if (!this._started) {
      return through.obj();
    }

    return this._browserSync.stream(settings || {});
  }

  /**
   * Start task.
   *
   * @param {TaskCallback} done
   * @protected
   */
  protected _start(done: TaskCallback): void {
    Config.chdir(this._settings.cwd);

    // Initialize Browsersync.
    this._browserSync.init(this._settings.settings, (): void => {
      this._started = true;
      done();
    });
  }

  /**
   * Watch task.
   *
   * @param {TaskCallback} done
   * @protected
   */
  protected _watch(done: TaskCallback): void {
    watch(this._settings.watch || [], { cwd: this._settings.cwd }).on("change", (path: string): void => {
      const coloredTaskName: string = chalk.blue(Browsersync.taskName);
      const coloredStatus: string = chalk.cyan("1 file changed");
      const coloredPath: string = chalk.magenta(path);

      console.log(`[${coloredTaskName}] ${coloredStatus} (${coloredPath})`);

      if (this._started) {
        this._browserSync.reload();
      }

      done();
    });

    done();
  }
}
