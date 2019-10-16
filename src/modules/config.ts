import log from "fancy-log";
import fs from "fs";
import * as yaml from "js-yaml";
import merge from "lodash/merge";
import minimist from "minimist";
import path from "path";
import process from "process";

import Browsersync from "../tasks/browsersync";
import TaskFactory from "./task-factory";

export interface IGenericSettings {
  [index: string]: any;
}

/**
 * Get configuration of the application from command line and settings file.
 */
export default class Config {
  /**
   * Get name of the current run.
   *
   * @return {string}
   */
  get currentRun(): string {
    if (this.options._.length === 0) {
      return "default";
    }

    return this.options._[0];
  }

  /**
   * Get options.
   *
   * @return {IGenericSettings}
   */
  get options(): IGenericSettings {
    return this._options;
  }

  /**
   * Get settings.
   */
  get settings(): IGenericSettings {
    return this._settings;
  }

  /**
   * Change the current working directory.
   *
   * @param directory
   */
  public static chdir(directory: string): void {
    try {
      process.chdir(directory);
    } catch (err) {
      log.error(`chdir: ${err}`);
    }
  }

  /**
   * Get Config instance.
   *
   * @return Unique instance of Config.
   */
  public static getInstance(): Config {
    if (!Config._instance) {
      log("Loading configuration file...");

      Config._instance = new Config();
      Config._instance.refreshOptions();
      Config._instance.refreshSettings();

      log("Configuration file loaded.");
    }

    return Config._instance;
  }

  /**
   * Config instance.
   * @type {Config}
   * @private
   */
  private static _instance: Config;

  /**
   * Global options passed in command line.
   * @type {IGenericSettings}
   * @private
   */
  private _options: IGenericSettings = {};

  /**
   * All settings in YAML file that define tasks.
   * @type {IGenericSettings}
   * @private
   */
  private _settings: IGenericSettings = {};

  /**
   * Config constructor.
   */
  private constructor() {}

  /**
   * Check if current run is a build run.
   *
   * @return {boolean}
   */
  public isBuildRun(): boolean {
    const search: string = "build";

    return (
      this.currentRun !== "default" &&
      this.currentRun.lastIndexOf(search) >= 0 &&
      this.currentRun.lastIndexOf(search) === this.currentRun.length - search.length
    );
  }

  /**
   * Check if a task is the current run.
   *
   * @param {string} taskName
   * @return {boolean}
   */
  public isCurrentRun(taskName: string): boolean {
    return this.currentRun === taskName;
  }

  /**
   * Read options for application from command line.
   */
  private refreshOptions(): void {
    // Merge default options with command line arguments
    this._options = minimist(process.argv.slice(2), {
      boolean: ["sourcemaps"],
      default: {
        configfile: process.env.CONFIG_FILE || "gulpconfig.yml",
        cwd: "",
        env: process.env.NODE_ENV || "production",
        revision: false,
        sourcemaps: process.env.SOURCEMAPS || false,
      },
      string: ["configfile", "cwd", "env", "revision"],
    }) as object;

    if (!path.isAbsolute(this._options.configfile)) {
      this._options.configfile = path.resolve(process.env.PWD || "", this._options.configfile);
    }
  }

  /**
   * Read settings from configuration file.
   */
  private refreshSettings(): void {
    // Read configuration file.
    try {
      this._settings = yaml.safeLoad(fs.readFileSync(this._options.configfile, "utf8"));
    } catch (e) {
      log.error(e.stack || String(e));
    }

    // Normalize current working directory.
    if (!this._options.cwd) {
      if (!this._settings.cwd) {
        this._options.cwd = path.dirname(this._options.configfile);
      } else if (!path.isAbsolute(this._settings.cwd)) {
        this._options.cwd = path.resolve(path.dirname(this._options.configfile), this._settings.cwd);
      }

      delete this._settings.cwd;
    }

    // Get revision settings.
    if (!this._options.revision && this._settings.revision) {
      this._options.revision = this._settings.revision;
      delete this._settings.revision;
    }

    // Get sizes settings.
    const defaultSizes: any = { gzipped: true, normal: true };
    let sizes: any =
      typeof this._settings.sizes !== "undefined" ? merge(defaultSizes, this._settings.sizes) : defaultSizes;
    if (typeof sizes === "boolean") {
      sizes = {
        gzipped: sizes,
        normal: sizes,
      };
    }

    delete this._settings.sizes;

    // Merge global and local settings in each tasks.
    if (this._settings[Browsersync.taskName]) {
      this._settings[Browsersync.taskName].cwd = this._options.cwd;
    }

    const factory: TaskFactory = new TaskFactory();
    factory.availableTaskNames().forEach((name: string): void | true => {
      if (!this._settings[name] || !this._settings[name].tasks) {
        return true;
      }

      const globalSettings: {} = this._settings[name].settings || {};

      Object.keys(this._settings[name].tasks).forEach((taskName: string): void => {
        const task: {
          cwd?: string;
          settings?: {};
          sizes?: boolean;
        } = this._settings[name].tasks[taskName];

        task.settings = merge(globalSettings, task.settings || {});
        if (!task.cwd) {
          task.cwd = this._options.cwd;
        }

        if (!task.sizes) {
          task.sizes = sizes;
        }

        this._settings[name][taskName] = task;
      });

      delete this._settings[name].tasks;
      delete this._settings[name].settings;
    });
  }
}
