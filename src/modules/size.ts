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

  private readonly _options: IOptions = {
    gzip: true,
    minifySuffix: "",
    taskName: "",
  };

  private _emitter: EventEmitter;

  private _files: IFiles = {};

  public constructor(options: IOptions) {
    this._options = merge(this._options, options);

    this._emitter = new EventEmitter();
    this._emitter.on("file-sizes-calculated", ({ relFilename }) => {
      const calculatedCount = reduce(this._files, (count: number, file: IFile) => count + (file.calculated ? 1 : 0), 0);
      const filesCount = Object.keys(this._files).length;

      const head: string[] = ["Filename", "Size"];

      if (this._options.minifySuffix !== "") {
        head.push("Minified", "Saved");
      }

      if (calculatedCount >= filesCount) {
        const files: string[][] = Object.keys(this._files).map((filename: string): string[] => {
          const file: IFile = this._files[filename];
          const prettySizes: IPrettySizes = Size._prettyBytes(file.sizes);

          const row = [
            chalk.cyan(filename),
            prettySizes.size + (this._options.gzip ? chalk.gray(`\n${prettySizes.sizeGzipped} gzipped`) : ""),
          ];

          if (this._options.minifySuffix !== "") {
            const saved = Math.max(0, file.sizes.size - file.sizes.minified);
            const savedPercent = file.sizes.size === 0 ? 0 : (saved * 100) / file.sizes.size;

            const formatPercent = ("    " + savedPercent.toFixed(1)).slice(-4);

            row.push(
              prettySizes.minified + (this._options.gzip ? chalk.gray(`\n${prettySizes.minifiedGzipped} gzipped`) : ""),
              `${prettyBytes(saved)} ${chalk.gray(`(${formatPercent}%)`)}`
            );
          }

          return row;
        });

        const table = new Table({
          colAligns: ["left", "right", "right", "right"],
          head: head.map((item: string): string => chalk.blue(item)),
        });

        table.push(...files);

        log(`Sizes from '${chalk.cyan(this._options.taskName)}':\n` + table.toString());
      }
    });
  }

  public collect(): Transform {
    this._files = {};

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

        // Get file size.
        const finish = (error: any, size: number, keys: string[]): void => {
          if (error) {
            cb(new PluginError("size", error));
            return;
          }

          this._files[relFilename].sizes = merge(this._files[relFilename].sizes, {
            [file.relative.indexOf(this._options.minifySuffix) >= 0 ? keys[1] : keys[0]]: size,
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

          if (!calculated && this._files[relFilename].calculated) {
            this._emitter.emit("file-sizes-calculated", { relFilename });
          }
        };

        const finishGzip = (error: any, size: number) => {
          finish(error, size, ["sizeGzipped", "minifiedGzipped"]);
        };

        const finishSize = (error: any, size: number) => {
          finish(error, size, ["size", "minified"]);
        };

        if (file.isStream()) {
          file.contents
            .pipe(new StreamCounter())
            .on("error", finishSize)
            .on("finish", function() {
              // @ts-ignore
              finishSize(null, this.bytes);
            });

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
          finishSize(null, file.contents.length);

          if (this._options.gzip) {
            gzipSize(file.contents).then((size: number): void => {
              finishGzip(null, size);
            });
          }
        }

        cb(null, file);
      },
      (cb: TransformCallback): void => {
        cb();
      }
    );
  }
}
