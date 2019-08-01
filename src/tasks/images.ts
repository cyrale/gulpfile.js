import fs from "fs";
import path from "path";

import chalk from "chalk";
import del from "del";
import log from "fancy-log";

import GulpImagemin from "gulp-imagemin";
import GulpNewer from "gulp-newer";

import Task, { IGulpOptions } from "./task";

export default class Images extends Task {
  public static readonly taskName: string = "images";

  constructor(name: string, settings: object) {
    super(name, settings);

    this.withLinter = false;
  }

  public buildSpecific(stream: NodeJS.ReadWriteStream, options: IGulpOptions): NodeJS.ReadWriteStream {
    const defaultSettings: {
      gifsicle: {};
      jpegtran: {};
      optipng: {};
      svgo: {};
    } = {
      gifsicle: {
        interlaced: true,
        optimizationLevel: 3,
      },
      jpegtran: {
        progressive: true,
      },
      optipng: {
        optimizationLevel: 5,
      },
      svgo: {
        plugins: [{ removeViewBox: true }, { cleanupIDs: false }],
      },
    };

    stream
      .pipe(GulpNewer(path.resolve(this.settings.cwd, this.settings.dst)))
      .pipe(
        GulpImagemin(
          [
            GulpImagemin.jpegtran({ ...defaultSettings.jpegtran, ...(this.settings.settings.jpegtran || {}) }),
            GulpImagemin.optipng({ ...defaultSettings.optipng, ...(this.settings.settings.optipng || {}) }),
            GulpImagemin.gifsicle({ ...defaultSettings.gifsicle, ...(this.settings.settings.gifsicle || {}) }),
            GulpImagemin.svgo({ ...defaultSettings.svgo, ...(this.settings.settings.svgo || {}) }),
          ],
          { verbose: true }
        )
      );

    return stream;
  }

  protected bindEventsToWatcher(watcher: fs.FSWatcher): void {
    watcher.on("unlink", (filename: string): void => {
      const srcFilename = path.resolve(this.settings.cwd, filename);
      const srcParts = srcFilename.split("/");

      const dstFilename = path.resolve(this.settings.cwd, this.settings.dst);
      const dstParts = dstFilename.split("/");

      let newFilename = "/";
      let index = 0;

      while (srcParts[index] === dstParts[index] && (index < srcParts.length || index < dstParts.length)) {
        newFilename = path.join(newFilename, srcParts[index]);
        index++;
      }

      for (let i = index; i < dstParts.length; i++) {
        newFilename = path.join(newFilename, dstParts[i]);
      }

      newFilename = path.join(newFilename, path.basename(filename));

      log("gulp-imagemin: Deleted image: " + chalk.blue(path.relative(this.settings.cwd, newFilename)));

      del.sync(newFilename, {
        force: true,
      });
    });
  }
}
