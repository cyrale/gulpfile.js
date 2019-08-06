import merge from "lodash/merge";
import mergeStream from "merge-stream";
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

  private readonly criticalActive: boolean;
  private readonly purgeCSSActive: boolean;

  constructor(name: string, settings: object) {
    super(name, settings);

    this.gulpSourcemaps = true;

    this.defaultDest = false;
    this.browserSyncSettings = { match: "**/*.css" };

    const defaultSettings: {} = {
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

    this.settings.settings = merge(defaultSettings, this.settings.settings || {});
    this.settings.settings.mqpacker.sort =
      this.settings.settings.mqpacker.sort === "mobile" ? SortCSSMediaQueries : SortCSSMediaQueries.desktopFirst;

    this.criticalActive =
      typeof this.settings.settings.critical === "object" ||
      (typeof this.settings.settings.critical === "boolean" && this.settings.settings.critical);
    this.settings.settings.critical =
      typeof this.settings.settings.critical === "object" ? (this.settings.settings.critical as string[]) : [];

    this.purgeCSSActive =
      typeof this.settings.settings.purgeCSS === "object" ||
      typeof this.settings.settings.purgeCSS === "string" ||
      (typeof this.settings.settings.purgeCSS === "boolean" && this.settings.settings.purgeCSS);

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

    if (typeof this.settings.settings.purgeCSS === "object") {
      this.settings.settings.purgeCSS = merge(
        purgeCSSDefaultSettings,
        {
          content: purgeCSSDefaultSettings.content,
          css: purgeCSSDefaultSettings.css,
        },
        this.settings.settings.purgeCSS
      );
    } else if (typeof this.settings.settings.purgeCSS === "string") {
      this.settings.settings.purgeCSS = path.resolve(this.settings.cwd, this.settings.settings.purgeCSS);
    } else {
      this.settings.settings.purgeCSS = purgeCSSDefaultSettings;
    }
  }

  protected buildSpecific(stream: NodeJS.ReadWriteStream, options?: IGulpOptions): NodeJS.ReadWriteStream {
    const streams: NodeJS.ReadWriteStream[] = [];

    const postCSSPluginsBefore: any[] = [
      PostCSSAssets(this.settings.settings.assets),
      RucksackCSS(this.settings.settings.rucksack),
      Autoprefixer(this.settings.settings.autoprefixer),
      PostCSSInlineSVG(this.settings.settings.inlineSVG),
      PostCSSSVGO(this.settings.settings.SVGO),
    ];

    if (this.purgeCSSActive) {
      postCSSPluginsBefore.push(PostCSSPurgeCSS(this.settings.settings.purgeCSS));
    }

    const postCSSPluginsAfter: any[] = [
      CSSNano(this.settings.settings.cssnano),
      CSSMQPacker(this.settings.settings.mqpacker),
    ];

    stream = stream.pipe(GulpSass(this.settings.sass || {})).pipe(GulpPostCSS(postCSSPluginsBefore));

    if (this.settings.settings.extractMQ) {
      let mainFilename: string = "";

      let streamExtractMQ: NodeJS.ReadWriteStream = stream
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

      if (this.criticalActive) {
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

    if (this.criticalActive) {
      const streamCriticalCSS: NodeJS.ReadWriteStream = stream.pipe(GulpCriticalCSS(this.settings.settings.critical));

      streams.push(streamCriticalCSS);
    }

    if (streams.length === 0) {
      streams.push(stream);
    }

    stream = mergeStream(streams)
      .pipe(dest(this.settings.dst, options))
      .pipe(Browsersync.getInstance().sync(this.browserSyncSettings) as NodeJS.ReadWriteStream)
      .pipe(GulpPostCSS(postCSSPluginsAfter))
      .pipe(GulpRename({ suffix: ".min" }))
      .pipe(dest(this.settings.dst, options));

    return stream;
  }

  protected lintSpecific(stream: NodeJS.ReadWriteStream): NodeJS.ReadWriteStream {
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
          filePath: error.relativePath || path.relative(this.settings.cwd, error.file || error.path),
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
    if (Task.isBuildRun() && error.code !== "ENOENT") {
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
