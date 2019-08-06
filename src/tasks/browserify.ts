import browserify from "browserify";
import merge from "lodash/merge";
import omit from "lodash/omit";
import Buffer from "vinyl-buffer";
import Source from "vinyl-source-stream";
import watchify from "watchify";

import { dest } from "gulp";

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

    const defaultSettings: {} = {
      debug: false,
      entries: this.settings.src,
      insertGlobals: true,
    };

    this.settings.settings = merge(watchify.args, defaultSettings, this.settings.settings || {});
    this.settings.settings.babel =
      typeof this.settings.settings.babel === "object"
        ? merge(Browserify.babelDefaultSettings, this.settings.settings.babel)
        : {};
  }

  protected buildSpecific(stream: NodeJS.ReadWriteStream, options?: IGulpOptions): NodeJS.ReadWriteStream {
    stream = watchify(browserify(omit(this.settings.settings, ["babel"])))
      .transform("babelify", this.settings.settings.babel)
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
