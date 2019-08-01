import { dest } from "gulp";

import browserify from "browserify";
import Buffer from "vinyl-buffer";
import Source from "vinyl-source-stream";
import watchify from "watchify";

import GulpRename from "gulp-rename";
import GulpUglify from "gulp-uglify";

import Browsersync from "./browsersync";
import Javascript from "./javascript";
import { IGulpOptions } from "./task";

export default class Browserify extends Javascript {
  public static readonly taskName: string = "browserify";

  constructor(name: string, settings: object) {
    super(name, settings);

    this.gulpRead = false;
  }

  protected buildSpecific(stream: NodeJS.ReadWriteStream, options?: IGulpOptions): NodeJS.ReadWriteStream {
    const babelSettings: {} =
      typeof this.settings.settings.babel === "object"
        ? { ...Browserify.babelDefaultSettings, ...this.settings.settings.babel }
        : {};

    delete this.settings.settings.babel;

    const browserifyDefaultSettings = {
      debug: false,
      entries: this.settings.src,
      insertGlobals: true,
    };

    const browserifySettings = { ...watchify.args, ...browserifyDefaultSettings, ...(this.settings.settings || {}) };

    stream = watchify(browserify(browserifySettings))
      .transform("babelify", babelSettings)
      .bundle()
      .pipe(Source(this.settings.filename))
      .pipe(Buffer())
      .pipe(dest(this.settings.dst, options))
      .pipe(Browsersync.getInstance().sync(this.browserSyncSettings) as NodeJS.ReadWriteStream)
      .pipe(GulpUglify())
      .pipe(GulpRename({ suffix: ".min" }))
      .pipe(dest(this.settings.dst, options));

    return stream;
  }
}
