import path from "path";
import { Transform } from "stream";
import through from "through2";

import { dest } from "gulp";

import CSSNano from "cssnano";
import GulpPostCSS from "gulp-postcss";
import GulpRename from "gulp-rename";
import GulpSass from "gulp-sass";
import GulpSassLint from "gulp-sass-lint";

import Task from "./task";

export default class Sass extends Task {
  public static readonly taskName: string = "sass";

  constructor(name: string, settings: object) {
    super(name, settings);

    this.defaultDest = false;
    this.browserSyncSettings = { match: "**/*.css" };
  }

  public buildSpecific(stream: NodeJS.ReadWriteStream): void {
    const settings = this.getSettings();

    stream
      .pipe(GulpSass(settings.sass))
      .pipe(dest(this.settings.dst, { cwd: this.settings.cwd }))
      .pipe(GulpPostCSS([CSSNano(settings.cssnano)]))
      .pipe(GulpRename({ suffix: ".min" }))
      .pipe(dest(this.settings.dst, { cwd: this.settings.cwd }));
  }

  public lintSpecific(stream: NodeJS.ReadWriteStream): void {
    stream
      .pipe(GulpSassLint({ configFile: path.join(this.settings.cwd, ".sass-lint.yml") }))
      .pipe(GulpSassLint.format())
      .pipe(this.lintNotifier());
  }

  private getSettings() {
    return Object.assign(
      {
        autoprefixer: {
          browsers: ["> 1%", "IE >= 9"],
          grid: true
        },
        cssnano: {
          preset: [
            "default",
            {
              cssDeclarationSorter: false
            }
          ]
        },
        rucksack: {
          fallbacks: true
        },
        sass: {
          outputStyle: "nested"
        }
      },
      this.settings.settings || {}
    );
  }

  private lintNotifier(): Transform {
    return through(
      { objectMode: true },
      (file, encoding, cb): void => {
        if (!file.isNull() && !file.isStream() && file.sassLint[0].errorCount > 0) {
          this.lintError = true;
        }

        cb();
      },
      (cb): void => cb()
    );
  }
}
