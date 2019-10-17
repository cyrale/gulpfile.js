import chalk from "chalk";
import del from "del";
import log from "fancy-log";
import fs from "fs";
import imagemin from "gulp-imagemin";
import newer from "gulp-newer";
import merge from "lodash/merge";
import path from "path";

import TaskExtended from "./task-extended";

/**
 * Minify images.
 */
export default class Images extends TaskExtended {
  /**
   * Global task name.
   * @type {string}
   * @readonly
   */
  public static readonly taskName: string = "images";

  /**
   * Level to order task in execution pipeline.
   * @type {number}
   * @readonly
   */
  public static readonly taskOrder: number = 30;

  /**
   * Task constructor.
   *
   * @param {string} name
   * @param {object} settings
   */
  constructor(name: string, settings: object) {
    super(name, settings);

    // No need of linter.
    this._withLinter = false;

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

    this._settings.settings = merge(defaultSettings, this._settings.settings || {});
  }

  /**
   * Method to add specific steps for the build.
   *
   * @param {NodeJS.ReadWriteStream} stream
   * @return {NodeJS.ReadWriteStream}
   * @protected
   */
  protected _buildSpecific(stream: NodeJS.ReadWriteStream): NodeJS.ReadWriteStream {
    return stream
      .pipe(newer(path.resolve(this._settings.cwd, this._settings.dst)))
      .pipe(
        imagemin(
          [
            imagemin.jpegtran(this._settings.settings.jpegtran || {}),
            imagemin.optipng(this._settings.settings.optipng || {}),
            imagemin.gifsicle(this._settings.settings.gifsicle || {}),
            imagemin.svgo(this._settings.settings.svgo || {}),
          ],
          { verbose: true }
        )
      );
  }

  /**
   * Bind events to file watcher.
   *
   * @param {fs.FSWatcher} watcher
   * @protected
   */
  protected _bindEventsToWatcher(watcher: fs.FSWatcher): void {
    // Watch if files were deleted to delete in destination directory.
    watcher.on("unlink", (filename: string): void => {
      const srcFilename: string = path.resolve(this._settings.cwd, filename);
      const srcParts: string[] = srcFilename.split("/");

      const dstFilename: string = path.resolve(this._settings.cwd, this._settings.dst);
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

      log("gulp-imagemin: Deleted image: " + chalk.blue(path.relative(this._settings.cwd, newFilename)));

      del.sync(newFilename, {
        force: true,
      });
    });
  }
}
