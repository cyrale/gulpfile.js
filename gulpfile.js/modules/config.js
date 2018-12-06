"use strict";

const _ = require("lodash");
_.mixin(require("lodash-deep"));

const path = require("path");

const fs = require("fs");
const minimist = require("minimist");
const yaml = require("js-yaml");

class Config {
  constructor() {
    this.options = {
      string: ["env", "config"],
      boolean: ["sourcemaps"],
      default: {
        env: process.env.NODE_ENV || "production",
        config: process.env.CONFIG_FILE || "gulpconfig.yml",
        sourcemaps: process.env.SOURCEMAPS || false
      }
    };

    this.settings = {};
  }

  load() {
    if (!_.isEmpty(this.settings)) {
      return this.settings;
    }

    this.options = minimist(process.argv.slice(2), this.options);

    if (!path.isAbsolute(this.options.config)) {
      this.options.config = path.resolve(process.env.PWD, this.options.config);
    }
    this.settings = Config.loadYAML(this.options.config);

    if (undefined === this.settings.cwd) {
      this.settings.cwd = path.dirname(this.options.config);
    } else if (!path.isAbsolute(this.settings.cwd)) {
      this.settings.cwd = path.resolve(path.dirname(this.options.config), this.settings.cwd);
    }

    // Change working directory
    process.chdir(this.settings.cwd);

    return this.settings;
  }

  static loadYAML(filename) {
    let settings = {};

    try {
      settings = yaml.safeLoad(fs.readFileSync(filename, "utf8"));
    } catch (e) {
      settings = {};
    }

    return settings || {};
  }
}

module.exports = Config;
