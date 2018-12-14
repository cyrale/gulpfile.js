const gulp = require("gulp");
const minimist = require("minimist");

let errorCount = 0;
let primaryTask = "";
let currentTask = "";

const setCurrentTask = e => {
  if (primaryTask === "") {
    primaryTask = e.name;
  }

  currentTask = e.name;
};

module.exports = {
  gulp: gulp.on("start", setCurrentTask).on("stop", setCurrentTask),
  check: done => {
    done();

    const argv = minimist(process.argv.slice(2));

    if (errorCount > 0 && (_.indexOf(argv._, primaryTask) >= 0 || currentTask === "default")) {
      console.log(`Errors ${currentTask}: ${errorCount}`);
      process.exit(1);
    }
  }
};
