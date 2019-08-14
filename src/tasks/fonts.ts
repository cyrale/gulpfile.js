import async from "async";
import changeCase from "change-case";
import consolidate from "consolidate";
import fs from "fs";
import { dest } from "gulp";
import gulpFile from "gulp-file";
import iconfont from "gulp-iconfont";
import gulpIf from "gulp-if";
import merge from "lodash/merge";
import path from "path";
import buffer from "vinyl-buffer";

import Revision from "../modules/revision";
import Task, { IBuildSettings } from "./task";

/**
 * Build fonts based on SVG files.
 */
export default class Fonts extends Task {
  /**
   * Global task name.
   * @type {string}
   * @readonly
   */
  public static readonly taskName: string = "fonts";

  /**
   * Task constructor.
   *
   * @param {string} name
   * @param {object} settings
   */
  constructor(name: string, settings: object) {
    super(name, settings);

    // No need of linter, default save method and revision.
    this._withLinter = false;
    this._defaultDest = false;
    this._defaultRevision = false;

    const defaultSettings: {} = {
      prefix: "font",
      template: "fontawesome",
    };

    this._settings.settings = merge(defaultSettings, this._settings.settings || {});
  }

  /**
   * Method to add specific steps for the build.
   *
   * @param {NodeJS.ReadWriteStream} stream
   * @param {IBuildSettings} buildSettings
   * @return {NodeJS.ReadWriteStream}
   * @protected
   */
  protected _buildSpecific(stream: NodeJS.ReadWriteStream, buildSettings: IBuildSettings): NodeJS.ReadWriteStream {
    const prefix: string = this._settings.settings.prefix === "" ? "" : `${this._settings.settings.prefix}-`;
    const sanitizedTaskName: string = changeCase.paramCase(this._taskName().replace("fonts:", prefix));

    // Build font based on SVG files.
    const iconfontStream = stream.pipe(
      iconfont({
        centerHorizontally: true,
        fontName: sanitizedTaskName,
        formats: ["ttf", "eot", "woff", "woff2", "svg"],
        normalize: true,
      })
    );

    async.parallel(
      {
        fonts: (cb: any): void => {
          // Save fonts and revision.
          iconfontStream
            .pipe(dest(this._settings.dst, buildSettings.options))
            .pipe(gulpIf(Revision.isActive(), buffer()))
            .pipe(gulpIf(Revision.isActive(), Revision.manifest(buildSettings.revision)))
            .pipe(gulpIf(Revision.isActive(), dest(".", buildSettings.options)))
            .on("finish", cb);
        },
        glyphs: (cb: any): void => {
          // Memorize glyphs to generate SASS file.
          iconfontStream.on("glyphs", (glyphs: any[]): void => {
            cb(null, glyphs);
          });
        },
      },
      (error: any, results: async.Dictionary<any>): void => {
        // Generate SASS file with all glyphs.
        if (error) {
          throw error;
        }

        const file: string = path.resolve(__dirname, `../../src/templates/${this._settings.settings.template}.lodash`);

        // Load template file to build SASS file.
        fs.readFile(file, (err: NodeJS.ErrnoException | null, data: Buffer): void => {
          if (err) {
            throw err;
          }

          // Get all variables used in template.
          const templateVars: {} = {
            className: sanitizedTaskName,
            fontName: sanitizedTaskName,
            fontPath: path.normalize(`${this._settings.settings.sass.rel}/`),
            glyphs: results.glyphs.map((glyph: any): any => ({
              codepoint: glyph.unicode[0].charCodeAt(0),
              name: glyph.name,
            })),
            hash: {
              eot: Revision.getHashRevision(buildSettings.taskName, `${sanitizedTaskName}.eot`),
              svg: Revision.getHashRevision(buildSettings.taskName, `${sanitizedTaskName}.svg`),
              ttf: Revision.getHashRevision(buildSettings.taskName, `${sanitizedTaskName}.ttf`),
              woff: Revision.getHashRevision(buildSettings.taskName, `${sanitizedTaskName}.woff`),
              woff2: Revision.getHashRevision(buildSettings.taskName, `${sanitizedTaskName}.woff2`),
            },
          };

          // Generate and save SASS file.
          consolidate.lodash.render(data.toString(), templateVars).then((stylesheet: string): void => {
            stylesheet = `// sass-lint:disable-all\n\n${stylesheet}`;

            gulpFile(`_${sanitizedTaskName}.scss`, stylesheet, { src: true }).pipe(
              dest(this._settings.settings.sass.dst, buildSettings.options)
            );
          });
        });
      }
    );

    return iconfontStream;
  }
}
