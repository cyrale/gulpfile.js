import chalk from "chalk";
import Table from "cli-table";
import { EventEmitter } from "events";
import log from "fancy-log";
import gzipSize from "gzip-size";
import filter from "lodash/filter";
import mapValues from "lodash/mapValues";
import merge from "lodash/merge";
import reduce from "lodash/reduce";
import path from "path";
import PluginError from "plugin-error";
import prettyBytes from "pretty-bytes";
import { Transform } from "stream";
import StreamCounter from "stream-counter";
import through, { TransformCallback } from "through2";
import File from "vinyl";

interface FileSize {
  calculated: boolean;
  sizes: Sizes;
}

interface FileSizes {
  [filename: string]: FileSize;
}

export interface Options {
  gzip: boolean;
  minifySuffix: string;
  taskName: string;
}

interface PrettySizes {
  [size: string]: string;
}

interface Sizes {
  minified: number;
  minifiedGzipped: number;
  size: number;
  sizeGzipped: number;
}

/**
 * Collect sizes of build files and display it.
 */
export default class Size {
  /**
   * Format sizes in human readable form.
   *
   * @param {Sizes} sizes
   * @return {PrettySizes}
   * @private
   */
  private static _prettyBytes(sizes: Sizes): PrettySizes {
    return mapValues(sizes, (size: number): string => prettyBytes(size));
  }

  /**
   * Options.
   * @type {Options}
   * @private
   */
  private readonly _options: Options = {
    gzip: true,
    minifySuffix: "",
    taskName: "",
  };

  /**
   * Event emitter to know when all sizes are calculated.
   * @type {Options}
   * @private
   */
  private readonly _emitter: EventEmitter;

  /**
   * List of generated files.
   * @type {FileSizes}
   * @private
   */
  private _files: FileSizes = {};

  /**
   * Check if all files are passed through the module.
   * @type {boolean}
   * @private
   */
  private _end = false;

  /**
   * Check if sizes are already displayed.
   * @type {boolean}
   * @private
   */
  private _displayed = false;

  /**
   * Calculate and display sizes of files in stream.
   *
   * @param {Options} options
   */
  public constructor(options: Options) {
    this._options = merge(this._options, options);

    // Event emitter to know when all sizes are calculated.
    this._emitter = new EventEmitter();
    this._emitter.on("sizes-calculated", (): void => this._display());
    this._emitter.on("sizes-end", (): void => {
      this._end = true;
      this._display();
    });
  }

  /**
   * Log sizes of files in a stream.
   *
   * @return {Transform}
   */
  public log(): Transform {
    this._files = {};
    this._end = false;
    this._displayed = false;

    return through.obj(
      (file: File, encoding: string, cb: TransformCallback): void => {
        if (file.isNull()) {
          cb(null, file);
          return;
        }

        // Exclude MAP files.
        if (path.extname(file.path) === ".map") {
          return cb(null, file);
        }

        // Get relative filename regardless of its suffix.
        const relFilename = file.relative.replace(`${this._options.minifySuffix}${file.extname}`, file.extname);

        // Initialize sizes aggregator.
        if (typeof this._files[relFilename] === "undefined") {
          this._files[relFilename] = {
            calculated: false,
            sizes: {
              minified: -1,
              minifiedGzipped: -1,
              size: -1,
              sizeGzipped: -1,
            },
          };
        }

        // Collect sizes.
        const finish = (error: Error | null, size: number, keys: string[]): void => {
          if (error) {
            cb(new PluginError("size", error));
            return;
          }

          // Collect size.
          const keySize: string =
            this._options.minifySuffix !== "" && file.relative.indexOf(this._options.minifySuffix) >= 0
              ? keys[1]
              : keys[0];
          this._files[relFilename].sizes = merge(this._files[relFilename].sizes, {
            [keySize]: size,
          });

          // Count calculated sizes.
          const countSizes: number = filter(this._files[relFilename].sizes, (size: number): boolean => size >= 0)
            .length;

          // Determine if all sizes is here.
          const calculated = this._files[relFilename].calculated;
          this._files[relFilename].calculated =
            (this._options.minifySuffix === "" && !this._options.gzip && countSizes === 1) ||
            (this._options.minifySuffix !== "" && !this._options.gzip && countSizes === 2) ||
            (this._options.minifySuffix === "" && this._options.gzip && countSizes === 2) ||
            (this._options.minifySuffix !== "" && this._options.gzip && countSizes === 4);

          // Emit event if all sizes are calculated.
          if (!calculated && this._files[relFilename].calculated) {
            this._emitter.emit("sizes-calculated", { relFilename });
          }
        };

        // Collect gzipped sizes.
        const finishGzip = (error: Error | null, size: number): void => {
          finish(error, size, ["sizeGzipped", "minifiedGzipped"]);
        };

        // Collect normal sizes.
        const finishSize = (error: Error | null, size: number): void => {
          finish(error, size, ["size", "minified"]);
        };

        if (file.isStream()) {
          // Get file size from a stream.
          file.contents
            .pipe(new StreamCounter())
            .on("error", finishSize)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .on("finish", function (this: any) {
              finishSize(null, this.bytes);
            });

          // Get gzipped file size from a stream.
          if (this._options.gzip) {
            file.contents
              .pipe(gzipSize.stream())
              .on("error", finishGzip)
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .on("end", function (this: any) {
                finishGzip(null, this.gzipSize);
              });
          }
        } else if (file.isBuffer()) {
          // Get file size.
          finishSize(null, file.contents ? file.contents.length : 0);

          // Get gzipped file size.
          if (this._options.gzip) {
            gzipSize(file.contents).then((size: number): void => {
              finishGzip(null, size);
            });
          }
        }

        cb(null, file);
      },
      (cb: TransformCallback): void => {
        this._emitter.emit("sizes-end");
        cb();
      }
    );
  }

  /**
   * Display collected sizes.
   *
   * @private
   */
  private _display(): void {
    const calculatedCount = reduce(
      this._files,
      (count: number, file: FileSize) => count + (file.calculated ? 1 : 0),
      0
    );
    const filesCount = Object.keys(this._files).length;

    if (!this._end || this._displayed || filesCount === 0) {
      return;
    }

    // Head of the table.
    const head: string[] = ["Filename".padEnd(35, " "), "Size".padStart(8, " ")];
    if (this._options.minifySuffix !== "") {
      head.push("Minified", "Saved".padStart(16, " "));
    }

    // If all sizes are calculated, display them.
    if (calculatedCount >= filesCount) {
      this._displayed = true;

      // Collect sizes in a simple array.
      const files: string[][] = Object.keys(this._files)
        .sort()
        .map((filename: string): string[] => {
          const file: FileSize = this._files[filename];
          const prettySizes: PrettySizes = Size._prettyBytes(file.sizes);

          const row = [
            chalk.cyan(filename),
            prettySizes.size + (this._options.gzip ? chalk.gray(`\n${prettySizes.sizeGzipped} gzipped`) : ""),
          ];

          // Add minified information and differential value.
          if (this._options.minifySuffix !== "") {
            const saved = Math.max(0, file.sizes.size - file.sizes.minified);
            const savedPercent = file.sizes.size === 0 ? 0 : (saved * 100) / file.sizes.size;

            const formatPercent = savedPercent.toFixed(1).padStart(4, " ");

            row.push(
              prettySizes.minified + (this._options.gzip ? chalk.gray(`\n${prettySizes.minifiedGzipped} gzipped`) : ""),
              `${prettyBytes(saved)} ${chalk.gray(`(${formatPercent}%)`)}`
            );
          }

          return row;
        });

      // Create table to display.
      const table = new Table({
        colAligns: ["left", "right", "right", "right"],
        head: head.map((item: string): string => chalk.blue(item)),
      });

      // Add values to display.
      table.push(...files);

      // Display sizes.
      log(`Sizes from '${chalk.cyan(this._options.taskName)}':\n` + table.toString());
    }
  }
}
