import chalk from "chalk";
import del from "del";
import log from "fancy-log";
import fs from "fs";
import filter from "gulp-filter";
import imagemin from "gulp-imagemin";
import newer from "gulp-newer";
import rename from "gulp-rename";
import imageminWebP from "imagemin-webp";
import merge from "lodash/merge";
import mergeStream from "merge-stream";
import minimatch from "minimatch";
import path from "path";

import { Options as TaskOptions } from "./task";
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
   * List of supported extension for WebP conversion.
   * @type {string[]}
   * @private
   * @readonly
   */
  private readonly _webPSupportedExtension: string[] = ["**/*.jpg", "**/*.jpeg", "**/*.png"];

  /**
   * Task constructor.
   *
   * @param {TaskOptions} options
   */
  constructor(options: TaskOptions) {
    super(options);

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

    const webpDefaultSettings: {} = {};

    if (typeof this._settings.settings.webp === "object") {
      this._settings.settings.webp = merge(webpDefaultSettings, this._settings.settings.webp);
    } else {
      this._settings.settings.webp = !!this._settings.settings.webp ? webpDefaultSettings : false;
    }
  }

  /**
   * Method to add specific steps for the build.
   *
   * @param {NodeJS.ReadableStream} stream
   * @return {NodeJS.ReadableStream}
   * @protected
   */
  protected _hookBuildBefore(stream: NodeJS.ReadableStream): NodeJS.ReadableStream {
    const streams: NodeJS.ReadWriteStream[] = [];

    stream = stream.pipe(newer(path.resolve(this._settings.cwd, this._settings.dst)));

    const streamImageMin = stream.pipe(
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

    streams.push(streamImageMin);

    if (this._settings.settings.webp) {
      const streamWebP = stream
        .pipe(filter(this._webPSupportedExtension))
        .pipe(imagemin([imageminWebP(this._settings.settings.webp)]))
        .pipe(
          rename((pPath: rename.ParsedPath): void => {
            pPath.extname += ".webp";
          })
        );

      streams.push(streamWebP);
    }

    return mergeStream(streams);
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

      let newFilename = "/";
      let index = 0;

      while (srcParts[index] === dstParts[index] && (index < srcParts.length || index < dstParts.length)) {
        newFilename = path.join(newFilename, srcParts[index]);
        index++;
      }

      for (let i: number = index; i < dstParts.length; i++) {
        newFilename = path.join(newFilename, dstParts[i]);
      }

      newFilename = path.join(newFilename, path.basename(filename));
      this._deleteFile(newFilename);

      if (this._settings.settings.webp && this._webPSupportedFile(newFilename)) {
        this._deleteFile(newFilename + ".webp");
      }
    });
  }

  /**
   * Simply delete a file.
   *
   * @param {string} filename
   * @private
   */
  private _deleteFile(filename: string): void {
    log("gulp-imagemin: Deleted image: " + chalk.blue(path.relative(this._settings.cwd, filename)));

    del.sync(filename, {
      force: true,
    });
  }

  /**
   * Check if a file is supported for WebP conversion.
   *
   * @param {string} filename
   * @return {boolean}
   * @private
   */
  private _webPSupportedFile(filename: string): boolean {
    return (this._webPSupportedExtension as unknown[]).reduce(
      (acc: boolean, ext: unknown): boolean => acc || minimatch(filename, ext as string),
      false
    );
  }
}
