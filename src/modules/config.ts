import path from "path";
import fs from "fs";
import minimist from "minimist";

import * as yaml from "js-yaml";

/**
 * Get configuration of the application from command line and settings file.
 */
export default class Config {
  private static _instance: Config;

  private _options: any;
  private _settings: {
    cwd: string;
  };

  /**
   * Get options.
   */
  get options(): object {
    return this._options;
  }

  /**
   * Get settings.
   */
  get settings(): object {
    return this._settings;
  }

  /**
   * Config constructor.
   */
  private constructor() {
    this._settings = {
      cwd: ""
    };
  }

  /**
   * Get Config instance.
   */
  public static getInstance() {
    if (!Config._instance) {
      Config._instance = new Config();
      Config._instance.refreshOptions();

      Config._instance.refreshSettings();
    }

    return Config._instance;
  }

  /**
   * Read options for application from command line.
   */
  private refreshOptions() {
    // Merge default options with command line arguments
    this._options = minimist(process.argv.slice(2), {
      string: ["env", "configfile"],
      boolean: ["sourcemaps"],
      default: {
        env: process.env.NODE_ENV || "production",
        configfile: process.env.CONFIG_FILE || "gulpconfig.yml",
        sourcemaps: process.env.SOURCEMAPS || false
      }
    });

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
    } catch (e) {}

    // Normalize current working directory.
    if (!this._settings.cwd) {
      this._settings.cwd = path.dirname(this._options.configfile);
    } else if (!path.isAbsolute(this._settings.cwd)) {
      this._settings.cwd = path.resolve(path.dirname(this._options.configfile), this._settings.cwd);
    }

    // TODO: import global settings in each tasks
  }
}
