import changeCase from "change-case";
import consolidate from "consolidate";
import fs from "fs";
import { dest } from "gulp";
import gulpFile from "gulp-file";
import iconfont from "gulp-iconfont";
import merge from "lodash/merge";
import path from "path";
import buffer from "vinyl-buffer";

import Revision from "../gulp-plugins/revision";
import { BuildSettings, GulpOptions, TaskOptions } from "./task";
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

  private readonly _sanitizedTaskName: string = "";

  private _glyphs: object[] = [];

  private _savedBuildOptions: BuildSettings | undefined;

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
    this._sanitizedTaskName = changeCase.paramCase(this._taskName().replace("fonts:", prefix));
  }

  /**
   * Method to add specific steps for the build.
   *
   * @param {NodeJS.ReadableStream} stream
   * @param {BuildSettings} buildSettings
   * @return {NodeJS.ReadableStream}
   * @protected
   */
  protected _hookBuildBefore(stream: NodeJS.ReadableStream, buildSettings: BuildSettings): NodeJS.ReadableStream {
    this._savedBuildOptions = buildSettings;

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

  protected _bindEventsToBuilder(builder: NodeJS.ReadableStream): void {
    builder.on("finish", () => {
      if (this._savedBuildOptions) {
        return;
      }

      const file: string = path.resolve(__dirname, `../../src/templates/${this._settings.settings.template}.lodash`);

      // Load template file to build SASS file.
      fs.readFile(file, (err: NodeJS.ErrnoException | null, data: Buffer): void => {
        if (err) {
          throw err;
        }

        const taskName: string = this._savedBuildOptions ? this._savedBuildOptions.taskName : "";
        const options: GulpOptions = this._savedBuildOptions ? this._savedBuildOptions.options : {};

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
            eot: Revision.getHashRevision(taskName, `${this._sanitizedTaskName}.eot`),
            svg: Revision.getHashRevision(taskName, `${this._sanitizedTaskName}.svg`),
            ttf: Revision.getHashRevision(taskName, `${this._sanitizedTaskName}.ttf`),
            woff: Revision.getHashRevision(taskName, `${this._sanitizedTaskName}.woff`),
            woff2: Revision.getHashRevision(taskName, `${this._sanitizedTaskName}.woff2`),
          },
        };

        // Generate and save SASS file.
        consolidate.lodash.render(data.toString(), templateVars).then((stylesheet: string): void => {
          stylesheet = `// sass-lint:disable-all\n\n${stylesheet}`;

          gulpFile(`_${this._sanitizedTaskName}.scss`, stylesheet, { src: true }).pipe(
            dest(this._settings.settings.sass.dst, options)
          );
        });
      });
    });
  }
}
