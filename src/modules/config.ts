import path from "path";
import fs from "fs";
import minimist from "minimist";
import yaml from "js-yaml";

// Merge default options with command line arguments
const options = minimist(process.argv.slice(2), {
  string: ["env", "config"],
  boolean: ["sourcemaps"],
  default: {
    env: process.env.NODE_ENV || "production",
    configfile: process.env.CONFIG_FILE || "gulpconfig.yml",
    sourcemaps: process.env.SOURCEMAPS || false
  }
});

if (!path.isAbsolute(options.configfile)) {
  options.configfile = path.resolve(process.env.PWD || "", options.configfile);
}

// Get settings from configuration file
let settings = {
  cwd: ""
};

try {
  settings = yaml.safeLoad(fs.readFileSync(options.configfile, "utf8"));
} catch (e) {}

if (undefined === settings.cwd) {
  settings.cwd = path.dirname(options.configfile);
} else if (!path.isAbsolute(settings.cwd)) {
  settings.cwd = path.resolve(path.dirname(options.configfile), settings.cwd);
}

// TODO: import global settings in each tasks

// Export data
export { options, settings };
