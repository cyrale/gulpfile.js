import merge from "merge-stream";
import path from "path";
import { Transform } from "stream";
import through from "through2";

import { dest } from "gulp";

import PostCSSPurgeCSS from "@fullhuman/postcss-purgecss";
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
import PurgeCSSWithWordPress from "purgecss-with-wordpress";
import RucksackCSS from "rucksack-css";
import SassLint from "sass-lint";
import SortCSSMediaQueries from "sort-css-media-queries";

import Browsersync from "./browsersync";
import Task, { IGulpOptions } from "./task";

type TPurgeCSSOptions = any[] | boolean;

interface IPurgeCSSOptions {
  content: TPurgeCSSOptions;
  css: TPurgeCSSOptions;
  extractors?: TPurgeCSSOptions;
  whitelist?: TPurgeCSSOptions;
  whitelistPatterns?: TPurgeCSSOptions;
  whitelistPatternsChildren?: TPurgeCSSOptions;
  keyframes?: TPurgeCSSOptions;
  fontFace?: TPurgeCSSOptions;
  rejected?: TPurgeCSSOptions;
}

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
      purgeCSS: false,
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
      purgeCSS?: boolean | string | {};
      rucksack?: {};
      sass?: {};
    } = this.settings.settings || {};

    const criticalCSSActive: boolean =
      typeof settings.critical === "object" ||
      (typeof settings.critical === "boolean" && (settings.critical || defaultSettings.critical));
    const criticalCSSSettings: string[] = typeof settings.critical === "object" ? (settings.critical as string[]) : [];

    const mqPackerSettings: {
      sort: any;
    } = { ...defaultSettings.mqpacker, ...(this.settings.mqpacker || {}) };
    mqPackerSettings.sort = mqPackerSettings.sort === "mobile" ? SortCSSMediaQueries : SortCSSMediaQueries.desktopFirst;

    const purgeCSSActive: boolean =
      typeof settings.purgeCSS === "object" ||
      typeof settings.purgeCSS === "string" ||
      (typeof settings.purgeCSS === "boolean" && (settings.purgeCSS || defaultSettings.purgeCSS));
    const purgeCSSDefaultSettings: IPurgeCSSOptions = {
      content: ["**/*.html", "**/*.php", "**/*.twig"],
      css: ["**/*.css"],
      extractors: [],
      fontFace: true,
      keyframes: true,
      rejected: false,
      whitelist: PurgeCSSWithWordPress.whitelist,
      whitelistPatterns: PurgeCSSWithWordPress.whitelistPatterns,
      whitelistPatternsChildren: [],
    };
    let purgeCSSSettings: string | IPurgeCSSOptions | undefined;

    if (purgeCSSActive) {
      if (typeof settings.purgeCSS === "object") {
        purgeCSSSettings = {
          content: purgeCSSDefaultSettings.content,
          css: purgeCSSDefaultSettings.css,
        };

        Object.keys(purgeCSSDefaultSettings).forEach((key: string): void => {
          const value: TPurgeCSSOptions = (settings.purgeCSS as any)[key];
          const defaultValue: TPurgeCSSOptions = (purgeCSSDefaultSettings as any)[key];

          let currentValue: TPurgeCSSOptions;

          if (Array.isArray(defaultValue) || Array.isArray(typeof value)) {
            currentValue = [...((defaultValue as any[]) || []), ...((value as any[]) || [])];
          } else {
            currentValue = typeof value !== "undefined" ? value : defaultValue;
          }

          (purgeCSSSettings as any)[key] = currentValue;
        });
      } else if (typeof settings.purgeCSS === "string") {
        purgeCSSSettings = path.resolve(this.settings.cwd, settings.purgeCSS);
      } else {
        purgeCSSSettings = purgeCSSDefaultSettings;
      }
    }

    const streams: NodeJS.ReadWriteStream[] = [];

    const postCSSPluginsBefore: any[] = [
      PostCSSAssets({ ...defaultSettings.assets, ...(settings.assets || {}) }),
      RucksackCSS({ ...defaultSettings.rucksack, ...(settings.rucksack || {}) }),
      Autoprefixer({ ...defaultSettings.autoprefixer, ...(settings.autoprefixer || {}) } as {}),
      PostCSSInlineSVG({ ...defaultSettings.inlineSVG, ...(settings.inlineSVG || {}) }),
      PostCSSSVGO({ ...defaultSettings.SVGO, ...(settings.SVGO || {}) }),
    ];

    if (purgeCSSActive) {
      postCSSPluginsBefore.push(PostCSSPurgeCSS(purgeCSSSettings));
    }

    const postCSSPluginsAfter: any[] = [
      CSSNano({ ...defaultSettings.cssnano, ...(settings.cssnano || {}) } as {}),
      CSSMQPacker(mqPackerSettings),
    ];

    stream = stream
      .pipe(GulpSass({ ...defaultSettings.sass, ...(this.settings.sass || {}) }))
      .pipe(GulpPostCSS(postCSSPluginsBefore));

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
      .pipe(GulpPostCSS(postCSSPluginsAfter))
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
