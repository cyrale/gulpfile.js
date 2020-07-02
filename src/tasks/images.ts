import chalk from "chalk";
import del from "del";
import log from "fancy-log";
import fs from "fs";
import filter from "gulp-filter";
import imageMin from "gulp-imagemin";
import newer from "gulp-newer";
import rename from "gulp-rename";
import imageMinWebP from "imagemin-webp";
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

    const defaultSettings: Record<string, unknown> = {
      gifsicle: {
        interlaced: true,
        optimizationLevel: 3,
      },
      mozjpeg: {
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

    const webpDefaultSettings: Record<string, unknown> = {};

    if (typeof this._settings.settings.webp === "object") {
      this._settings.settings.webp = merge(webpDefaultSettings, this._settings.settings.webp);
    } else {
      this._settings.settings.webp = !!this._settings.settings.webp ? webpDefaultSettings : false;
    }
  }

  /**
   * Bind events to file watcher.
   * Delete destination file when a file was deleted in source.
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
      imageMin(
        [
          imageMin.mozjpeg(this._settings.settings.mozjpeg || {}),
          imageMin.optipng(this._settings.settings.optipng || {}),
          imageMin.gifsicle(this._settings.settings.gifsicle || {}),
          imageMin.svgo(this._settings.settings.svgo || {}),
        ],
        { verbose: true }
      )
    );

    streams.push(streamImageMin);

    if (this._settings.settings.webp) {
      const streamWebP = stream
        .pipe(filter(this._webPSupportedExtension))
        .pipe(imageMin([imageMinWebP(this._settings.settings.webp)]))
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
    return this._webPSupportedExtension.reduce(
      (acc: boolean, ext: string): boolean => acc || minimatch(filename, ext),
      false
    );
  }
}
