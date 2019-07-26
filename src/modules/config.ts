import fs from "fs";
import minimist from "minimist";
import path from "path";
import process from "process";

import * as yaml from "js-yaml";
import Browsersync from "../tasks/browsersync";
import TaskFactory from "./task-factory";

export interface IGenericSettings {
  [index: string]: any;
}

/**
 * Get configuration of the application from command line and settings file.
 */
export default class Config {
  get currentRun(): string {
    const options = this.options;

    if (options._.length === 0) {
      return "default";
    }

    return options._[0];
  }

  /**
   * Get options.
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
   * Get Config instance.
   */
  public static getInstance() {
    if (!Config._instance) {
      console.log("Loading configuration file...");

      Config._instance = new Config();
      Config._instance.refreshOptions();

      Config._instance.refreshSettings();
    }

    return Config._instance;
  }

  private static _instance: Config;

  private _options: IGenericSettings;

  private _settings: IGenericSettings;

  /**
   * Config constructor.
   */
  private constructor() {
    this._options = {};
    this._settings = {};
  }

  public isBuildRun(): boolean {
    const search = "build";

    return (
      this.currentRun !== "default" && this.currentRun.lastIndexOf(search) === this.currentRun.length - search.length
    );
  }

  public isCurrentRun(task: string): boolean {
    return this.currentRun === task;
  }

  /**
   * Read options for application from command line.
   */
  private refreshOptions() {
    // Merge default options with command line arguments
    this._options = minimist(process.argv.slice(2), {
      boolean: ["sourcemaps"],
      default: {
        configfile: process.env.CONFIG_FILE || "gulpconfig.yml",
        cwd: "",
        env: process.env.NODE_ENV || "production",
        sourcemaps: process.env.SOURCEMAPS || false
      },
      string: ["env", "configfile", "cwd"]
    }) as object;

    if (!path.isAbsolute(this._options.configfile)) {
      this._options.configfile = path.resolve(process.env.PWD || "", this._options.configfile);
    }
  }

  /**
   * Read settings from configuration file.
   */
  private refreshSettings() {
    // Read configuration file.
    try {
      this._settings = yaml.safeLoad(fs.readFileSync(this._options.configfile, "utf8"));
    } catch (e) {
      console.log(e.stack || String(e));
    }

    // Normalize current working directory.
    if (!this._settings.cwd) {
      this._options.cwd = path.dirname(this._options.configfile);
    } else if (!path.isAbsolute(this._settings.cwd)) {
      this._options.cwd = path.resolve(path.dirname(this._options.configfile), this._settings.cwd);
    }

    delete this._settings.cwd;

    // Merge global and local settings in each tasks.
    if (this._settings[Browsersync.taskName]) {
      this._settings[Browsersync.taskName].cwd = this._options.cwd;
    }

    const factory = new TaskFactory();
    factory.availableTaskNames().forEach((name: string): void | true => {
      if (!this._settings[name] || !this._settings[name].tasks) {
        return true;
      }

      const globalSettings = this._settings[name].settings || {};

      Object.keys(this._settings[name].tasks).forEach(taskName => {
        const task = this._settings[name].tasks[taskName];

        task.settings = Object.assign({}, globalSettings, task.settings || {});
        if (!task.cwd) {
          task.cwd = this._options.cwd;
        }

        this._settings[name][taskName] = task;
      });

      delete this._settings[name].tasks;
      delete this._settings[name].settings;
    });
  }
}
