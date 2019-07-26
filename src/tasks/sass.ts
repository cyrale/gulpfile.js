import path from "path";
import { Transform } from "stream";
import through from "through2";

import { dest } from "gulp";

import Autoprefixer from "autoprefixer";
import CSSNano from "cssnano";
import GulpPostCSS from "gulp-postcss";
import GulpRename from "gulp-rename";
import GulpSass from "gulp-sass";
import GulpSassLint from "gulp-sass-lint";
import PostCSSAssets from "postcss-assets";
import PostCSSInlineSVG from "postcss-inline-svg";
import PostCSSSVGO from "postcss-svgo";
import RucksackCSS from "rucksack-css";
import SassLint from "sass-lint";

import Task from "./task";

export default class Sass extends Task {
  public static readonly taskName: string = "sass";

  constructor(name: string, settings: object) {
    super(name, settings);

    this.defaultDest = false;
    this.browserSyncSettings = { match: "**/*.css" };
  }

  public buildSpecific(stream: NodeJS.ReadWriteStream): void {
    const defaultSettings = {
      SVGO: {},
      assets: {
        cachebuster: true,
        relative: true
      },
      autoprefixer: {
        grid: true,
        overrideBrowserslist: ["defaults"]
      },
      cssnano: {
        preset: [
          "default",
          {
            cssDeclarationSorter: false
          }
        ]
      },
      inlineSVG: {
        path: false
      },
      rucksack: {
        fallbacks: true
      },
      sass: {
        outputStyle: "nested"
      }
    };

    stream
      .pipe(GulpSass({ ...defaultSettings.sass, ...(this.settings.sass || {}) }))
      .pipe(
        GulpPostCSS([
          PostCSSAssets({ ...defaultSettings.assets, ...(this.settings.assets || {}) }),
          RucksackCSS({ ...defaultSettings.rucksack, ...(this.settings.rucksack || {}) }),
          Autoprefixer({ ...defaultSettings.autoprefixer, ...(this.settings.autoprefixer || {}) }),
          PostCSSInlineSVG({ ...defaultSettings.inlineSVG, ...(this.settings.inlineSVG || {}) }),
          PostCSSSVGO({ ...defaultSettings.SVGO, ...(this.settings.SVGO || {}) })
        ])
      )
      .pipe(dest(this.settings.dst, { cwd: this.settings.cwd }))
      .pipe(GulpPostCSS([CSSNano({ ...defaultSettings.cssnano, ...(this.settings.cssnano || {}) })]))
      .pipe(GulpRename({ suffix: ".min" }))
      .pipe(dest(this.settings.dst, { cwd: this.settings.cwd }));
  }

  public lintSpecific(stream: NodeJS.ReadWriteStream): void {
    stream
      .pipe(GulpSassLint({ configFile: path.join(this.settings.cwd, ".sass-lint.yml") }))
      .pipe(GulpSassLint.format())
      .pipe(this.lintNotifier());
  }

  protected displayError(error: any): void {
    console.log(
      SassLint.format([
        {
          errorCount: 1,
          filePath: error.relativePath,
          messages: [
            {
              column: error.column,
              line: error.line,
              message: error.messageOriginal,
              severity: 2
            }
          ],
          warningCount: 0
        }
      ])
    );

    // Particular exit due to the comportment of Sass.
    if (this.isBuildRun()) {
      process.exit(1);
    }
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
