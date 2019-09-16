import chalk from "chalk";
import Table from "cli-table";
import EventEmitter from "events";
import log from "fancy-log";
import gzipSize from "gzip-size";
import merge from "lodash/merge";
import reduce from "lodash/reduce";
import PluginError from "plugin-error";
import prettyBytes from "pretty-bytes";
import { Transform } from "stream";
import StreamCounter from "stream-counter";
import through, { TransformCallback } from "through2";

export interface IOptions {
  gzip: boolean;
  minifySuffix: string;
  taskName: string;
}

interface IFile {
  calculated: boolean;
  sizes: ISizes;
}

interface IFiles {
  [filename: string]: IFile;
}

interface IPrettySizes {
  [size: string]: string;
}

interface ISizes {
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
   * @param {ISizes} sizes
   * @return {IPrettySizes}
   * @private
   */
  private static _prettyBytes(sizes: ISizes): IPrettySizes {
    const prettyBytess: IPrettySizes = {};

    Object.keys(sizes).forEach((key: string): void => {
      prettyBytess[key] = prettyBytes((sizes as any)[key]);
    });

    return prettyBytess;
  }

  /**
   * Options.
   * @type {IOptions}
   * @private
   */
  private readonly _options: IOptions = {
    gzip: true,
    minifySuffix: "",
    taskName: "",
  };

  /**
   * Event emitter to know when all sizes are calculated.
   * @type {IOptions}
   * @private
   */
  private readonly _emitter: EventEmitter;

  /**
   * List of generated files.
   * @type {IFiles}
   * @private
   */
  private _files: IFiles = {};

  /**
   * Check if all files are passed through the module.
   * @type {boolean}
   * @private
   */
  private _end: boolean = false;

  /**
   * Check if sizes are already displayed.
   * @type {boolean}
   * @private
   */
  private _displayed: boolean = false;

  /**
   * Calculate and display sizes of files in stream.
   *
   * @param {IOptions} options
   */
  public constructor(options: IOptions) {
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
   * Collect sizes of files in a stream.
   *
   * @return {Transform}
   */
  public collect(): Transform {
    return through.obj(
      (file: any, encoding: string, cb: TransformCallback): void => {
        if (file.isNull()) {
          cb(null, file);
          return;
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
        const finish = (error: any, size: number, keys: string[]): void => {
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
          const countSizes = (Object.keys(this._files[relFilename].sizes) as any[]).filter(
            (key: string): boolean => (this._files[relFilename].sizes as any)[key] >= 0
          ).length;

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
        const finishGzip = (error: any, size: number) => {
          finish(error, size, ["sizeGzipped", "minifiedGzipped"]);
        };

        // Collect normal sizes.
        const finishSize = (error: any, size: number) => {
          finish(error, size, ["size", "minified"]);
        };

        if (file.isStream()) {
          // Get file size from a stream.
          file.contents
            .pipe(new StreamCounter())
            .on("error", finishSize)
            .on("finish", function() {
              // @ts-ignore
              finishSize(null, this.bytes);
            });

          // Get gzipped file size from a stream.
          if (this._options.gzip) {
            file.contents
              .pipe(gzipSize.stream())
              .on("error", finishGzip)
              .on("end", function() {
                // @ts-ignore
                finishGzip(null, this.gzipSize);
              });
          }
        } else {
          // Get file size.
          finishSize(null, file.contents.length);

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
   * Reset files.
   *
   * @return {Transform}
   */
  public init(): Transform {
    this._files = {};
    this._end = false;
    this._displayed = false;

    return through.obj();
  }

  /**
   * Display collected sizes.
   *
   * @private
   */
  private _display(): void {
    if (!this._end || this._displayed) {
      return;
    }

    const calculatedCount = reduce(this._files, (count: number, file: IFile) => count + (file.calculated ? 1 : 0), 0);
    const filesCount = Object.keys(this._files).length;

    // Head of the table.
    const head: string[] = ["Filename".padEnd(35, " "), "Size".padStart(8, " ")];
    if (this._options.minifySuffix !== "") {
      head.push("Minified", "Saved".padStart(16, " "));
    }

    // If all sizes are calculated, display them.
    if (calculatedCount >= filesCount) {
      this._displayed = true;

      // Collect sizes in a simple array.
      const files: string[][] = Object.keys(this._files).map((filename: string): string[] => {
        const file: IFile = this._files[filename];
        const prettySizes: IPrettySizes = Size._prettyBytes(file.sizes);

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
        head: head.map((item: string, index: number): string => chalk.blue(item)),
      });

      // Add values to display.
      table.push(...files);

      // Display sizes.
      log(`Sizes from '${chalk.cyan(this._options.taskName)}':\n` + table.toString());
    }
  }
}
