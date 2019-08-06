import chalk from "chalk";
import del from "del";
import log from "fancy-log";
import fs from "fs";
import merge from "lodash/merge";
import path from "path";

import GulpImagemin from "gulp-imagemin";
import GulpNewer from "gulp-newer";

import Task, { IGulpOptions } from "./task";

export default class Images extends Task {
  public static readonly taskName: string = "images";

  constructor(name: string, settings: object) {
    super(name, settings);

    this.withLinter = false;

    const defaultSettings: {} = {
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

    this.settings.settings = merge(defaultSettings, this.settings.settings || {});
  }

  protected buildSpecific(stream: NodeJS.ReadWriteStream, options?: IGulpOptions): NodeJS.ReadWriteStream {
    stream
      .pipe(GulpNewer(path.resolve(this.settings.cwd, this.settings.dst)))
      .pipe(
        GulpImagemin(
          [
            GulpImagemin.jpegtran(this.settings.settings.jpegtran || {}),
            GulpImagemin.optipng(this.settings.settings.optipng || {}),
            GulpImagemin.gifsicle(this.settings.settings.gifsicle || {}),
            GulpImagemin.svgo(this.settings.settings.svgo || {}),
          ],
          { verbose: true }
        )
      );

    return stream;
  }

  protected bindEventsToWatcher(watcher: fs.FSWatcher): void {
    watcher.on("unlink", (filename: string): void => {
      const srcFilename: string = path.resolve(this.settings.cwd, filename);
      const srcParts: string[] = srcFilename.split("/");

      const dstFilename: string = path.resolve(this.settings.cwd, this.settings.dst);
      const dstParts: string[] = dstFilename.split("/");

      let newFilename: string = "/";
      let index: number = 0;

      while (srcParts[index] === dstParts[index] && (index < srcParts.length || index < dstParts.length)) {
        newFilename = path.join(newFilename, srcParts[index]);
        index++;
      }

      for (let i: number = index; i < dstParts.length; i++) {
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
