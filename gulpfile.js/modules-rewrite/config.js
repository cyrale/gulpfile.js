const path = require("path");
const fs = require("fs");
const minimist = require("minimist");
const yaml = require("js-yaml");

// Merge default options with command line arguments
const options = minimist(process.argv.slice(2), {
  string: ["env", "config"],
  boolean: ["sourcemaps"],
  default: {
    env: process.env.NODE_ENV || "production",
    config: process.env.CONFIG_FILE || "gulpconfig.yml",
    sourcemaps: process.env.SOURCEMAPS || false
  }
});

if (!path.isAbsolute(options.config)) {
  options.config = path.resolve(process.env.PWD, options.config);
}

// Get settings from configuration file
let settings = {};
try {
  settings = yaml.safeLoad(fs.readFileSync(options.config, "utf8"));
} catch (e) {}

if (undefined === settings.cwd) {
  settings.cwd = path.dirname(options.config);
} else if (!path.isAbsolute(settings.cwd)) {
  settings.cwd = path.resolve(path.dirname(options.config), settings.cwd);
}

// Export data
module.exports = { options, settings };
