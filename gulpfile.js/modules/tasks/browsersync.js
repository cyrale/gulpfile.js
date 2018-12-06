"use strict";

const _ = require("lodash");

const gulp = require("gulp");
const gulpif = require("gulp-if");
const bsync = require("browser-sync").create();

const Config = require("../config");
const conf = new Config();

let options = conf.load();
let started = false;

module.exports = {
  start: function(done) {
    if (undefined !== options.browsersync) {
      bsync.init(
        _.merge(
          {
            open: false,
            ui: false
          },
          options.browsersync.settings || {}
        ),
        () => {
          started = true;
        }
      );
    }

    done();
  },
  sync: function() {
    let settings = _.merge({ stream: true }, started ? options.browsersync.settings || {} : {});
    return gulpif(started, bsync.reload(settings));
  },
  watch: function(done) {
    gulp.watch(options.browsersync.watch).on("change", function() {
      if (started) {
        bsync.reload();
      }
    });

    done();
  }
};
