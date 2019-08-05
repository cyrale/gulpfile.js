import changeCase from "change-case";
import consolidate from "consolidate";
import fs from "fs";
import path from "path";

import { dest } from "gulp";

import GulpFile from "gulp-file";
import GulpIconfont from "gulp-iconfont";

import Task, { IGulpOptions } from "./task";

export default class Fonts extends Task {
  public static readonly taskName: string = "fonts";

  constructor(name: string, settings: object) {
    super(name, settings);

    this.withLinter = false;
  }

  protected buildSpecific(stream: NodeJS.ReadWriteStream, options?: IGulpOptions): NodeJS.ReadWriteStream {
    const prefix = this.settings.settings.prefix
      ? this.settings.settings.prefix === ""
        ? ""
        : `${this.settings.settings.prefix}-`
      : "font-";

    delete this.settings.settings.prefix;

    const sanitizedTaskName = changeCase.paramCase(this.taskName().replace("fonts:", prefix));

    const sassSettings = this.settings.settings.sass;
    delete this.settings.settings.sass;

    const defaultSettings: {} = {
      prefix: "",
      template: "fontawesome",
    };
    const settings = { ...defaultSettings, ...(this.settings.settings || {}) };

    stream = stream
      .pipe(
        GulpIconfont({
          centerHorizontally: true,
          fontName: sanitizedTaskName,
          formats: ["ttf", "eot", "woff", "woff2", "svg"],
          normalize: true,
          timestamp: Math.round(Date.now() / 1000).toString(),
        })
      )
      .on("glyphs", (glyphs: any[]): void => {
        const file = path.resolve(__dirname, `../../src/templates/${settings.template}.lodash`);

        fs.readFile(file, (err: NodeJS.ErrnoException | null, data: Buffer): void => {
          if (err) {
            throw err;
          }

          const templateVars = {
            className: sanitizedTaskName,
            fontName: sanitizedTaskName,
            fontPath: path.normalize(`${sassSettings.rel}/`),
            glyphs: glyphs.map((glyph: any): any => ({ codepoint: glyph.unicode[0].charCodeAt(0), name: glyph.name })),
          };

          consolidate.lodash.render(data.toString(), templateVars).then((stylesheet: string): void => {
            stylesheet = `// sass-lint:disable-all\n\n${stylesheet}`;

            GulpFile(`_${sanitizedTaskName}.scss`, stylesheet, { src: true }).pipe(dest(sassSettings.dst, options));
          });
        });
      });

    return stream;
  }
}
