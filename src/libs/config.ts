import log from "fancy-log";
import fs from "fs";
import * as yaml from "js-yaml";
import merge from "lodash/merge";
import minimist, { ParsedArgs } from "minimist";
import path from "path";
import process from "process";

import TaskFactory from "./task-factory";

export interface Options {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [name: string]: any;
}

interface SizesOptions {
  gzipped: boolean;
  normal: boolean;
}

interface TaskOptions {
  cwd?: string;
  settings?: Options;
  sizes?: boolean | Options | SizesOptions;
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
   * @return {ParsedArgs}
   */
  get options(): ParsedArgs {
    return this._options;
  }

  /**
   * Get settings.
   */
  get settings(): Options {
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

      log("Configuration file loaded");
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
   * @type {ParsedArgs}
   * @private
   */
  private _options: ParsedArgs = {
    _: [],
  };

  /**
   * All settings in YAML file that define tasks.
   * @type {Options}
   * @private
   */
  private _settings: Options = {};

  /**
   * Check if current run is a build run.
   *
   * @return {boolean}
   */
  public isBuildRun(): boolean {
    const search = "build";

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
    });

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
      } else if (!path.isAbsolute(this._settings.cwd as string)) {
        this._options.cwd = path.resolve(path.dirname(this._options.configfile), this._settings.cwd as string);
      }

      delete this._settings.cwd;
    }

    // Get revision settings.
    if (!this._options.revision && this._settings.revision) {
      this._options.revision = this._settings.revision;
      delete this._settings.revision;
    }

    // Get sizes settings.
    const defaultSizes: SizesOptions = { gzipped: true, normal: true };
    let sizes: SizesOptions = defaultSizes;

    if (typeof this._settings.sizes === "boolean") {
      sizes = { gzipped: this._settings.sizes, normal: this._settings.sizes };
    } else if (typeof this._settings.sizes === "object") {
      sizes = merge(defaultSizes, this._settings.sizes);
    }

    delete this._settings.sizes;

    // Merge global and local settings in each tasks.
    TaskFactory.moduleNames.forEach((name: string): void => {
      const settings: Options = this._settings[name] as Options;

      if (settings && !settings.tasks) {
        settings.cwd = this._options.cwd;
      } else if (this._settings[name] && settings.tasks) {
        const globalSettings: {} = settings.settings || {};

        Object.keys(settings.tasks).forEach((taskName: string): void => {
          const task: TaskOptions = (settings.tasks as Options)[taskName] as TaskOptions;

          task.settings = merge(globalSettings, task.settings || {});
          if (!task.cwd) {
            task.cwd = this._options.cwd;
          }

          if (!task.sizes) {
            task.sizes = sizes;
          }

          settings[taskName] = task;
        });

        delete settings.tasks;
        delete settings.settings;
      }
    });
  }
}
