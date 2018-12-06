"use strict";

const _ = require("lodash");

const glob = require("glob");
const path = require("path");
const buffer = require("vinyl-buffer");

const crypto = require("crypto");
const minimatch = require("minimatch");
const merge = require("merge-stream");

const gulp = require("gulp");
const plumber = require("gulp-plumber");
const spritesmith = require("gulp.spritesmith");
const imagemin = require("gulp-imagemin");
const header = require("gulp-header");

const bsync = require("./browsersync");

const notify = require("../notify");

const Task = require("../task");

class Sprites extends Task {
  constructor(name, options) {
    super(name, options);

    this.options.settings = _.merge(
      {
        imagemin: {
          progressive: true,
          svgoPlugins: [{ removeViewBox: false }]
        }
      },
      this.options.settings || {}
    );

    this.options.src = Sprites.globs(options);
  }

  build() {
    let files;

    let hash = crypto
      .createHash("md5")
      .update(Math.round(Date.now() / 1000).toString())
      .digest("hex")
      .substr(0, 10);
    let prefix =
      undefined === this.options.settings.prefix
        ? "sprite-"
        : "" === this.options.settings.prefix
        ? ""
        : this.options.settings.prefix + "-";

    let sanitizedTaskName = this.name.replace(":", "-").replace("sprites-", prefix);

    let imgName = sanitizedTaskName + ".png";
    let imgNameRetina = sanitizedTaskName + "@2x.png";
    let imgNameAbs = (this.options.dst + "/" + imgName).replace("//", "/");
    let imgNameAbsRetina = (this.options.dst + "/" + imgNameRetina).replace("//", "/");

    let taskSettings = _.merge(
      {
        imgName: imgNameAbs,
        imgPath: (this.options.settings.sass.rel + "/" + imgName).replace("//", "/") + "?hash=" + hash,
        cssName: "_" + sanitizedTaskName + ".scss",
        cssVarMap: sprite => {
          sprite.name = sanitizedTaskName + "-" + sprite.name;

          if (undefined !== this.options["src-2x"]) {
            let match = false;
            _.forEach(this.options["src-2x"].map(Sprites.mapMatchPatterns), pattern => {
              match = match || minimatch(sprite.source_image, pattern);
            });

            if (match) {
              sprite.name += "-retina";
            }
          }
        },
        cssSpritesheetName: "spritesheet-" + sanitizedTaskName,
        padding: 4
      },
      this.options.settings || {}
    );

    if (undefined !== this.options["src-1x"] && undefined !== this.options["src-2x"]) {
      taskSettings = _.merge(taskSettings, {
        retinaSrcFilter: this.options["src-2x"],
        retinaImgName: imgNameAbsRetina,
        retinaImgPath: (this.options.settings.sass.rel + "/" + imgNameRetina).replace("//", "/") + "?rev=" + hash,
        cssRetinaSpritesheetName: "spritesheet-" + sanitizedTaskName + "-retina",
        cssRetinaGroupsName: sanitizedTaskName + "-retina"
      });
    }

    files = this.options.src;
    if (
      (undefined === taskSettings.algorithm || "binary-tree" !== taskSettings.algorithm) &&
      undefined !== taskSettings.algorithmOpts &&
      false !== taskSettings.algorithmOpts.sort
    ) {
      files = _.each(files, item => {
        glob.sync(item).sort(Sprites.basenameSort);
      });
    }

    let sprite = gulp
      .src(files, { cwd: this.options.cwd })
      .pipe(
        plumber(error => {
          notify.onError(error, this.name);
        })
      )
      .pipe(spritesmith(taskSettings));

    return merge(
      sprite.img
        .pipe(buffer())
        .pipe(imagemin(this.options.settings.imagemin))
        .pipe(gulp.dest(".", { cwd: this.options.cwd })),
      sprite.css
        .pipe(header("// sass-lint:disable-all\n\n"))
        .pipe(gulp.dest(this.options.settings.sass.dst, { cwd: this.options.cwd }))
    ).pipe(bsync.sync());
  }

  static globs(options) {
    let globs = options.src;

    if (undefined !== options["src-1x"] && undefined !== options["src-2x"]) {
      globs = _.concat(options["src-1x"], options["src-2x"]);
    }

    return globs;
  }

  static basenameSort(a, b) {
    return path.basename(a, path.extname(a)) - path.basename(b, path.extname(b));
  }

  static mapMatchPatterns(pattern) {
    return ("**/" + pattern).replace("//", "/");
  }
}

module.exports = Sprites;
