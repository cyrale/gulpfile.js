import { paramCase } from "change-case";
import consolidate from "consolidate";
import fs from "fs";
import { dest } from "gulp";
import gulpFile from "gulp-file";
import iconfont from "gulp-iconfont";
import merge from "lodash/merge";
import path from "path";
import buffer from "vinyl-buffer";

import { getHashRevision } from "../gulp-plugins/revision";
import { Options as TaskOptions } from "./task";
import TaskExtended from "./task-extended";

/**
 * Build fonts based on SVG files.
 */
export default class Fonts extends TaskExtended {
  /**
   * Global task name.
   * @type {string}
   * @readonly
   */
  public static readonly taskName: string = "fonts";

  /**
   * Level to order task in execution pipeline.
   * @type {number}
   * @readonly
   */
  public static readonly taskOrder: number = 20;

  /**
   * Sanitize name of the task to use it in font name.
   * @type {string}
   * @private
   */
  private readonly _sanitizedTaskName: string = "";

  /**
   * List of glyphs in current font.
   * @type {any[]}
   * @private
   */
  private _glyphs: object[] = [];

  /**
   * Task constructor.
   *
   * @param {TaskOptions} options
   */
  constructor(options: TaskOptions) {
    super(options);

    const defaultSettings: {} = {
      prefix: "font",
      template: "fontawesome",
    };

    this._settings.settings = merge(defaultSettings, this._settings.settings || {});

    const prefix: string = this._settings.settings.prefix === "" ? "" : `${this._settings.settings.prefix}-`;
    this._sanitizedTaskName = paramCase(this._taskName().replace("fonts:", prefix));
  }

  /**
   * Bind events to build tasks.
   * Generate and save a SASS files with all stuff to use this font and its glyphs.
   *
   * @param {NodeJS.ReadableStream} builder
   * @protected
   */
  protected _bindEventsToBuilder(builder: NodeJS.ReadableStream): void {
    builder.on("finish", () => {
      const file: string = path.resolve(__dirname, `../../src/templates/${this._settings.settings.template}.lodash`);

      // Load template file to build SASS file.
      fs.readFile(file, (err: NodeJS.ErrnoException | null, data: Buffer): void => {
        if (err) {
          throw err;
        }

        const taskName: string = this._taskName("build");

        // Get all variables used in template.
        const templateVars: {} = {
          className: this._sanitizedTaskName,
          fontName: this._sanitizedTaskName,
          fontPath: path.normalize(`${this._settings.settings.sass.rel}/`),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          glyphs: this._glyphs.map((glyph: any): {} => ({
            codepoint: glyph.unicode[0].charCodeAt(0),
            name: glyph.name,
          })),
          hash: {
            eot: getHashRevision(taskName, `${this._sanitizedTaskName}.eot`),
            svg: getHashRevision(taskName, `${this._sanitizedTaskName}.svg`),
            ttf: getHashRevision(taskName, `${this._sanitizedTaskName}.ttf`),
            woff: getHashRevision(taskName, `${this._sanitizedTaskName}.woff`),
            woff2: getHashRevision(taskName, `${this._sanitizedTaskName}.woff2`),
          },
        };

        // Generate and save SASS file.
        consolidate.lodash.render(data.toString(), templateVars).then((stylesheet: string): void => {
          stylesheet = `// sass-lint:disable-all\n\n${stylesheet}`;

          gulpFile(`_${this._sanitizedTaskName}.scss`, stylesheet, { src: true }).pipe(
            dest(this._settings.settings.sass.dst, { cwd: this._settings.cwd })
          );
        });
      });
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
    // Build font based on SVG files.
    return stream
      .pipe(
        iconfont({
          centerHorizontally: true,
          fontName: this._sanitizedTaskName,
          formats: ["ttf", "eot", "woff", "woff2", "svg"],
          normalize: true,
        })
      )
      .pipe(buffer())
      .on("glyphs", (glyphs: object[]): void => {
        this._glyphs = glyphs;
      });
  }
}
