import merge from "merge-stream";
import path from "path";
import { Transform } from "stream";
import through from "through2";

import { dest } from "gulp";

import Autoprefixer from "autoprefixer";
import CSSMQPacker from "css-mqpacker";
import CSSNano from "cssnano";
import GulpCriticalCSS from "gulp-critical-css";
import GulpExtractMediaQueries from "gulp-extract-media-queries";
import GulpPostCSS from "gulp-postcss";
import GulpRename from "gulp-rename";
import GulpSass from "gulp-sass";
import GulpSassLint from "gulp-sass-lint";
import PostCSSAssets from "postcss-assets";
import PostCSSInlineSVG from "postcss-inline-svg";
import PostCSSSVGO from "postcss-svgo";
import RucksackCSS from "rucksack-css";
import SassLint from "sass-lint";
import SortCSSMediaQueries from "sort-css-media-queries";

import Browsersync from "./browsersync";
import Task, { IGulpOptions } from "./task";

export default class Sass extends Task {
  public static readonly taskName: string = "sass";

  constructor(name: string, settings: object) {
    super(name, settings);

    this.withSourcemaps = true;

    this.defaultDest = false;
    this.browserSyncSettings = { match: "**/*.css" };
  }

  public buildSpecific(stream: NodeJS.ReadWriteStream, options: IGulpOptions): NodeJS.ReadWriteStream {
    const defaultSettings = {
      SVGO: {},
      assets: {
        cachebuster: true,
        relative: true,
      },
      autoprefixer: {
        grid: true,
        overrideBrowserslist: ["defaults"],
      },
      critical: false,
      cssnano: {
        preset: [
          "default",
          {
            cssDeclarationSorter: false,
            svgo: false,
          },
        ],
      },
      extractMQ: false,
      inlineSVG: {
        path: false,
      },
      mqpacker: {
        sort: "mobile",
      },
      rucksack: {
        fallbacks: true,
      },
      sass: {
        outputStyle: "nested",
      },
    };

    const settings: {
      SVGO?: {};
      assets?: {};
      autoprefixer?: {};
      critical?: boolean | {};
      cssnano?: {};
      extractMQ?: boolean;
      inlineSVG?: {};
      mqpacker?: {};
      rucksack?: {};
      sass?: {};
    } = this.settings.settings || {};

    const mqPackerSettings: {
      sort: any;
    } = { ...defaultSettings.mqpacker, ...(this.settings.mqpacker || {}) };
    mqPackerSettings.sort = mqPackerSettings.sort === "mobile" ? SortCSSMediaQueries : SortCSSMediaQueries.desktopFirst;

    stream = stream
      .pipe(GulpSass({ ...defaultSettings.sass, ...(this.settings.sass || {}) }))
      .pipe(
        GulpPostCSS([
          PostCSSAssets({ ...defaultSettings.assets, ...(settings.assets || {}) }),
          RucksackCSS({ ...defaultSettings.rucksack, ...(settings.rucksack || {}) }),
          Autoprefixer({ ...defaultSettings.autoprefixer, ...(settings.autoprefixer || {}) } as {}),
          PostCSSInlineSVG({ ...defaultSettings.inlineSVG, ...(settings.inlineSVG || {}) }),
          PostCSSSVGO({ ...defaultSettings.SVGO, ...(settings.SVGO || {}) }),
        ])
      );

    const criticalCSSActive =
      typeof settings.critical === "object" ||
      (typeof settings.critical === "boolean" && (settings.critical || defaultSettings.critical));
    const criticalCSSSettings: string[] = typeof settings.critical === "object" ? (settings.critical as string[]) : [];

    const streams: NodeJS.ReadWriteStream[] = [];

    if (settings.extractMQ || defaultSettings.extractMQ) {
      let mainFilename: string = "";

      let streamExtractMQ = stream
        .pipe(
          GulpRename(
            (pPath: GulpRename.ParsedPath): GulpRename.ParsedPath => {
              mainFilename = pPath.basename as string;

              return pPath;
            }
          )
        )
        .pipe(GulpExtractMediaQueries())
        .pipe(
          GulpRename(
            (pPath: GulpRename.ParsedPath): GulpRename.ParsedPath => {
              if (pPath.basename !== mainFilename) {
                pPath.basename = `${mainFilename}.${pPath.basename}`;
              }

              return pPath;
            }
          )
        );

      if (criticalCSSActive) {
        streamExtractMQ = streamExtractMQ.pipe(
          GulpPostCSS([
            (css: any): void => {
              // Remove critical properties.
              css.walkDecls((decl: any): void => {
                if (decl.prop === "critical") {
                  decl.remove();
                }
              });
            },
          ])
        );
      }

      streams.push(streamExtractMQ);
    }

    if (criticalCSSActive) {
      const streamCriticalCSS = stream.pipe(GulpCriticalCSS(criticalCSSSettings));

      streams.push(streamCriticalCSS);
    }

    if (streams.length === 0) {
      streams.push(stream);
    }

    stream = merge(streams)
      .pipe(dest(this.settings.dst, options))
      .pipe(Browsersync.getInstance().sync(this.browserSyncSettings) as NodeJS.ReadWriteStream)
      .pipe(
        GulpPostCSS([
          CSSNano({ ...defaultSettings.cssnano, ...(settings.cssnano || {}) } as {}),
          CSSMQPacker(mqPackerSettings),
        ])
      )
      .pipe(GulpRename({ suffix: ".min" }))
      .pipe(dest(this.settings.dst, options));

    return stream;
  }

  public lintSpecific(stream: NodeJS.ReadWriteStream): NodeJS.ReadWriteStream {
    stream
      .pipe(GulpSassLint({ configFile: path.join(this.settings.cwd, ".sass-lint.yml") }))
      .pipe(GulpSassLint.format())
      .pipe(this.lintNotifier());

    return stream;
  }

  protected displayError(error: any): void {
    console.log(
      SassLint.format([
        {
          errorCount: 1,
          filePath: error.relativePath || error.file,
          messages: [
            {
              column: error.column,
              line: error.line,
              message: error.messageOriginal || error.message,
              severity: 2,
            },
          ],
          warningCount: 0,
        },
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
