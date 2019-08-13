import purgeCSS from "@fullhuman/postcss-purgecss";
import autoprefixer from "autoprefixer";
import CSSMQPacker from "css-mqpacker";
import CSSNano from "cssnano";
import log from "fancy-log";
import criticalCSS from "gulp-critical-css";
import extractMediaQueries from "gulp-extract-media-queries";
import postCSS from "gulp-postcss";
import rename from "gulp-rename";
import sass from "gulp-sass";
import gulpSassLint from "gulp-sass-lint";
import merge from "lodash/merge";
import mergeStream from "merge-stream";
import path from "path";
import assets from "postcss-assets";
import inlineSVG from "postcss-inline-svg";
import svgo from "postcss-svgo";
import purgeCSSWithWordPress from "purgecss-with-wordpress";
import rucksackCSS from "rucksack-css";
import sassLint from "sass-lint";
import sortCSSMediaQueries from "sort-css-media-queries";
import { Transform } from "stream";
import through, { TransformCallback } from "through2";

import Revision from "../modules/revision";
import Browsersync from "./browsersync";
import Task from "./task";

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

  private readonly _criticalActive: boolean;
  private readonly _purgeCSSActive: boolean;

  constructor(name: string, settings: object) {
    super(name, settings);

    this._gulpSourcemaps = true;
    this._browserSyncSettings = { match: "**/*.css" };

    const defaultSettings: {} = {
      SVGO: {},
      assets: {
        cachebuster: Revision.isActive(),
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

    this._settings.settings = merge(defaultSettings, this._settings.settings || {});
    this._settings.settings.mqpacker.sort =
      this._settings.settings.mqpacker.sort === "mobile" ? sortCSSMediaQueries : sortCSSMediaQueries.desktopFirst;

    this._criticalActive =
      typeof this._settings.settings.critical === "object" ||
      (typeof this._settings.settings.critical === "boolean" && this._settings.settings.critical);
    this._settings.settings.critical =
      typeof this._settings.settings.critical === "object" ? (this._settings.settings.critical as string[]) : [];

    this._purgeCSSActive =
      typeof this._settings.settings.purgeCSS === "object" ||
      typeof this._settings.settings.purgeCSS === "string" ||
      (typeof this._settings.settings.purgeCSS === "boolean" && this._settings.settings.purgeCSS);

    const purgeCSSDefaultSettings: IPurgeCSSOptions = {
      content: ["**/*.html", "**/*.php", "**/*.twig"],
      css: ["**/*.css"],
      extractors: [],
      fontFace: true,
      keyframes: true,
      rejected: false,
      whitelist: purgeCSSWithWordPress.whitelist,
      whitelistPatterns: purgeCSSWithWordPress.whitelistPatterns,
      whitelistPatternsChildren: [],
    };

    if (typeof this._settings.settings.purgeCSS === "object") {
      this._settings.settings.purgeCSS = merge(
        purgeCSSDefaultSettings,
        {
          content: purgeCSSDefaultSettings.content,
          css: purgeCSSDefaultSettings.css,
        },
        this._settings.settings.purgeCSS
      );
    } else if (typeof this._settings.settings.purgeCSS === "string") {
      this._settings.settings.purgeCSS = path.resolve(this._settings.cwd, this._settings.settings.purgeCSS);
    } else {
      this._settings.settings.purgeCSS = purgeCSSDefaultSettings;
    }
  }

  protected _buildSpecific(stream: NodeJS.ReadWriteStream): NodeJS.ReadWriteStream {
    const browserSync = Browsersync.getInstance();
    const taskName = this._taskName("build");
    const streams: NodeJS.ReadWriteStream[] = [];

    const postCSSPluginsBefore: any[] = [
      assets(this._settings.settings.assets),
      (css: any): void => {
        // Normalize revision parameter
        css.walkDecls((decl: any): void => {
          decl.value = decl.value.replace(/(url\('[^\?]+\?)([0-9a-f]+)('\))/, "$1rev=$2$3");
        });
      },
      rucksackCSS(this._settings.settings.rucksack),
      autoprefixer(this._settings.settings.autoprefixer),
      inlineSVG(this._settings.settings.inlineSVG),
      svgo(this._settings.settings.SVGO),
    ];

    if (this._purgeCSSActive) {
      postCSSPluginsBefore.push(purgeCSS(this._settings.settings.purgeCSS));
    }

    const postCSSPluginsAfter: any[] = [
      CSSNano(this._settings.settings.cssnano),
      CSSMQPacker(this._settings.settings.mqpacker),
    ];

    stream = stream
      .pipe(sass(this._settings.sass || {}))
      .pipe(postCSS(postCSSPluginsBefore) as NodeJS.WritableStream) as NodeJS.ReadWriteStream;

    if (this._settings.settings.extractMQ) {
      let mainFilename: string = "";

      let streamExtractMQ: NodeJS.ReadWriteStream = stream
        .pipe(
          rename(
            (pPath: rename.ParsedPath): rename.ParsedPath => {
              mainFilename = pPath.basename as string;

              return pPath;
            }
          )
        )
        .pipe(extractMediaQueries())
        .pipe(rename(
          (pPath: rename.ParsedPath): rename.ParsedPath => {
            if (pPath.basename !== mainFilename) {
              pPath.basename = `${mainFilename}.${pPath.basename}`;
            }

            return pPath;
          }
        ) as NodeJS.WritableStream);

      if (this._criticalActive) {
        streamExtractMQ = streamExtractMQ.pipe(
          postCSS([
            (css: any): void => {
              // Remove critical properties.
              css.walkDecls("critical", (decl: any): void => {
                // if (decl.prop === "critical") {
                decl.remove();
                // }
              });
            },
          ])
        );
      }

      streams.push(streamExtractMQ);
    }

    if (this._criticalActive) {
      const streamCriticalCSS: NodeJS.ReadWriteStream = stream.pipe(criticalCSS(this._settings.settings.critical));

      streams.push(streamCriticalCSS);
    }

    if (streams.length === 0) {
      streams.push(stream);
    }

    return mergeStream(streams)
      .pipe(browserSync.memorize(taskName))
      .pipe(postCSS(postCSSPluginsAfter))
      .pipe(rename({ suffix: ".min" }));
  }

  protected _lintSpecific(stream: NodeJS.ReadWriteStream): NodeJS.ReadWriteStream {
    stream
      .pipe(gulpSassLint({ configFile: path.join(this._settings.cwd, ".sass-lint.yml") }))
      .pipe(gulpSassLint.format())
      .pipe(this._lintNotifier());

    return stream;
  }

  protected _displayError(error: any): void {
    log.error(
      sassLint.format([
        {
          errorCount: 1,
          filePath: error.relativePath || path.relative(this._settings.cwd, error.file || error.path),
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
    if (Task._isBuildRun() && error.code !== "ENOENT") {
      process.exit(1);
    }
  }

  private _lintNotifier(): Transform {
    const that = this;

    return through.obj(
      (file: any, encoding: string, cb: TransformCallback): void => {
        if (!file.isNull() && !file.isStream() && file.sassLint[0].errorCount > 0) {
          that._lintError = true;
        }

        cb();
      },
      (cb: TransformCallback): void => cb()
    );
  }
}
