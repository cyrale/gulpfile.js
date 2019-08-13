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

export default class Fonts extends Task {
  public static readonly taskName: string = "fonts";

  constructor(name: string, settings: object) {
    super(name, settings);

    this._withLinter = false;
    this._defaultDest = false;
    this._defaultRevision = false;

    const defaultSettings: {} = {
      prefix: "font",
      template: "fontawesome",
    };

    this._settings.settings = merge(defaultSettings, this._settings.settings || {});
  }

  protected _buildSpecific(stream: NodeJS.ReadWriteStream, buildSettings: IBuildSettings): NodeJS.ReadWriteStream {
    const prefix: string = this._settings.settings.prefix === "" ? "" : `${this._settings.settings.prefix}-`;
    const sanitizedTaskName: string = changeCase.paramCase(this._taskName().replace("fonts:", prefix));

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
          iconfontStream
            .pipe(dest(this._settings.dst, buildSettings.options))
            .pipe(gulpIf(Revision.isActive(), buffer()))
            .pipe(gulpIf(Revision.isActive(), Revision.manifest(buildSettings.revision)))
            .pipe(gulpIf(Revision.isActive(), dest(".", buildSettings.options)))
            .on("finish", cb);
        },
        glyphs: (cb: any): void => {
          iconfontStream.on("glyphs", (glyphs: any[]): void => {
            cb(null, glyphs);
          });
        },
      },
      (error: any, results: async.Dictionary<any>): void => {
        if (error) {
          throw error;
        }

        const file: string = path.resolve(__dirname, `../../src/templates/${this._settings.settings.template}.lodash`);

        fs.readFile(file, (err: NodeJS.ErrnoException | null, data: Buffer): void => {
          if (err) {
            throw err;
          }

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
