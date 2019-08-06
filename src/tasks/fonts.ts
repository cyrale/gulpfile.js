import changeCase from "change-case";
import consolidate from "consolidate";
import fs from "fs";
import { dest } from "gulp";
import gulpFile from "gulp-file";
import iconfont from "gulp-iconfont";
import merge from "lodash/merge";
import path from "path";

import Task, { IGulpOptions } from "./task";

export default class Fonts extends Task {
  public static readonly taskName: string = "fonts";

  constructor(name: string, settings: object) {
    super(name, settings);

    this._withLinter = false;

    const defaultSettings: {} = {
      prefix: "font",
      template: "fontawesome",
    };

    this._settings.settings = merge(defaultSettings, this._settings.settings || {});
  }

  protected _buildSpecific(stream: NodeJS.ReadWriteStream, options?: IGulpOptions): NodeJS.ReadWriteStream {
    const prefix: string = this._settings.settings.prefix === "" ? "" : `${this._settings.settings.prefix}-`;
    const sanitizedTaskName: string = changeCase.paramCase(this._taskName().replace("fonts:", prefix));

    stream = stream
      .pipe(
        iconfont({
          centerHorizontally: true,
          fontName: sanitizedTaskName,
          formats: ["ttf", "eot", "woff", "woff2", "svg"],
          normalize: true,
          timestamp: Math.round(Date.now() / 1000).toString(),
        })
      )
      .on("glyphs", (glyphs: any[]): void => {
        const file: string = path.resolve(__dirname, `../../src/templates/${this._settings.settings.template}.lodash`);

        fs.readFile(file, (err: NodeJS.ErrnoException | null, data: Buffer): void => {
          if (err) {
            throw err;
          }

          const templateVars: {} = {
            className: sanitizedTaskName,
            fontName: sanitizedTaskName,
            fontPath: path.normalize(`${this._settings.settings.sass.rel}/`),
            glyphs: glyphs.map((glyph: any): any => ({ codepoint: glyph.unicode[0].charCodeAt(0), name: glyph.name })),
          };

          consolidate.lodash.render(data.toString(), templateVars).then((stylesheet: string): void => {
            stylesheet = `// sass-lint:disable-all\n\n${stylesheet}`;

            gulpFile(`_${sanitizedTaskName}.scss`, stylesheet, { src: true }).pipe(dest(
              this._settings.settings.sass.dst,
              options
            ) as NodeJS.WritableStream);
          });
        });
      });

    return stream;
  }
}
