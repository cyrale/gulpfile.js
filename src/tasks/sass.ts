import purgeCSS from "@fullhuman/postcss-purgecss";
import autoprefixer from "autoprefixer";
import CSSMQPacker from "css-mqpacker";
import CSSNano from "cssnano";
import log from "fancy-log";
import Fiber from "fibers";
import clone, { sink } from "gulp-clone";
import gulpPostCSS from "gulp-postcss";
import rename from "gulp-rename";
import sass from "gulp-sass";
import gulpSassLint from "gulp-sass-lint";
import sourcemaps from "gulp-sourcemaps";
import merge from "lodash/merge";
import mergeStream from "merge-stream";
import path from "path";
import perfectionist from "perfectionist";
import { AcceptedPlugin } from "postcss";
import assets from "postcss-assets";
import discardComments from "postcss-discard-comments";
import discardEmpty from "postcss-discard-empty";
import inlineSVG from "postcss-inline-svg";
import svgo from "postcss-svgo";
import purgeCSSWithWordPress from "purgecss-with-wordpress";
import rucksackCSS from "rucksack-css";
import sassCompiler from "sass";
import sassLint from "sass-lint";
import sortCSSMediaQueries from "sort-css-media-queries";
import { Transform } from "stream";
import through, { TransformCallback } from "through2";
import File from "vinyl";

import extractMediaQueries from "../gulp-plugins/media-queries-extractor";
import Revision, { DefaultObject } from "../gulp-plugins/revision";
import Config from "../libs/config";
import criticalClean from "../postcss/critical-clean";
import criticalExtract from "../postcss/critical-extract";
import mediaQueriesClean from "../postcss/media-queries-clean";
import normalizeRevision from "../postcss/normalize-revision";
import { Options as TaskOptions, TaskCallback } from "./task";
import TaskExtended from "./task-extended";

type PurgeCSSParam = unknown[] | boolean;

interface PurgeCSSOptions {
  content: PurgeCSSParam;
  css: PurgeCSSParam;
  extractors?: PurgeCSSParam;
  whitelist?: PurgeCSSParam;
  whitelistPatterns?: PurgeCSSParam;
  whitelistPatternsChildren?: PurgeCSSParam;
  keyframes?: PurgeCSSParam;
  fontFace?: PurgeCSSParam;
  rejected?: PurgeCSSParam;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(sass as any).compiler = sassCompiler;

/**
 * Build SASS files to CSS.
 */
export default class Sass extends TaskExtended {
  /**
   * Global task name.
   * @type {string}
   * @readonly
   */
  public static readonly taskName: string = "sass";

  /**
   * Level to order task in execution pipeline.
   * @type {number}
   * @readonly
   */
  public static readonly taskOrder: number = 50;

  /**
   * Flag to define if critical rule is active.
   * @type {boolean}
   * @private
   * @readonly
   */
  private readonly _criticalActive: boolean = false;

  /**
   * Flag to define if purgeCSS is active.
   * @type {boolean}
   * @private
   * @readonly
   */
  private readonly _purgeCSSActive: boolean = false;

  /**
   * Task constructor.
   *
   * @param {TaskOptions} options
   */
  constructor(options: TaskOptions) {
    super(options);

    // This task could build sourcemaps and sync browser with filter.
    this._gulpSourcemaps = true;
    this._browserSyncSettings = { match: "**/*.css" };

    this._minifySuffix = ".min";
    this._hideGzippedSize = false;

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
        fiber: Fiber,
        outputStyle: "expanded",
      },
    };

    this._settings.settings = merge(defaultSettings, this._settings.settings || {});

    // Determine media queries order.
    this._settings.settings.mqpacker.sort =
      this._settings.settings.mqpacker.sort === "mobile" ? sortCSSMediaQueries : sortCSSMediaQueries.desktopFirst;

    // Settings to extract critical CSS.
    this._criticalActive =
      typeof this._settings.settings.critical === "object" ||
      (typeof this._settings.settings.critical === "boolean" && this._settings.settings.critical);
    this._settings.settings.critical =
      typeof this._settings.settings.critical === "object" ? (this._settings.settings.critical as string[]) : [];

    // Settings to purge CSS (preconfigured for WordPress).
    this._purgeCSSActive =
      typeof this._settings.settings.purgeCSS === "object" ||
      typeof this._settings.settings.purgeCSS === "string" ||
      (typeof this._settings.settings.purgeCSS === "boolean" && this._settings.settings.purgeCSS);

    const purgeCSSDefaultSettings: PurgeCSSOptions = {
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

  /**
   * Method to add specific steps for the build.
   *
   * @param {NodeJS.ReadableStream} stream
   * @return {NodeJS.ReadableStream}
   * @protected
   */
  protected _hookBuildBefore(stream: NodeJS.ReadableStream): NodeJS.ReadableStream {
    const streams: NodeJS.ReadableStream[] = [];

    const postCSSGlobal: AcceptedPlugin[] = [
      discardComments(),
      discardEmpty(),
      assets(this._settings.settings.assets),
      normalizeRevision(),
      rucksackCSS(this._settings.settings.rucksack),
      autoprefixer(this._settings.settings.autoprefixer),
      inlineSVG(this._settings.settings.inlineSVG),
      svgo(this._settings.settings.SVGO),
    ];

    if (this._purgeCSSActive) {
      postCSSGlobal.push(purgeCSS(this._settings.settings.purgeCSS));
    }

    if (this._settings.sourcemaps) {
      stream = stream.pipe(sourcemaps.init());
    }

    // Propagate critical rules to children properties.
    let mainStream: NodeJS.ReadableStream = stream
      .pipe(sass(this._settings.settings.sass || {}).on("error", sass.logError))
      .pipe(gulpPostCSS(postCSSGlobal));

    // Extract critical rules.
    if (this._criticalActive) {
      const criticalStream: NodeJS.ReadableStream = mainStream
        .pipe(clone())
        .pipe(gulpPostCSS([criticalExtract(), discardEmpty()]))
        .pipe(
          rename({
            suffix: ".critical",
          })
        );

      // Add critical stream to stack.
      streams.push(criticalStream);
    }

    // Remove critical rules.
    mainStream = mainStream.pipe(gulpPostCSS([criticalClean({ keepRules: !this._criticalActive })]));

    // Extract media queries.
    if (this._settings.settings.extractMQ) {
      const mediaQueriesStream: NodeJS.ReadableStream = mainStream.pipe(clone()).pipe(extractMediaQueries());

      // Add media queries stream to stack.
      streams.push(mediaQueriesStream);

      // Remove media queries.
      mainStream = mainStream.pipe(gulpPostCSS([mediaQueriesClean()]));
    }

    streams.unshift(mainStream);

    // Merge all streams and clean them.
    stream = mergeStream(streams).pipe(gulpPostCSS([discardEmpty(), perfectionist({ indentSize: 2 })]));

    // Generate minified file.
    const streamMin: NodeJS.ReadableStream = stream
      .pipe(clone())
      .pipe(gulpPostCSS([CSSNano(this._settings.settings.cssnano), CSSMQPacker(this._settings.settings.mqpacker)]))
      .pipe(rename({ suffix: this._minifySuffix }));

    let mergedStream: NodeJS.ReadableStream = mergeStream(stream, streamMin);

    if (this._settings.sourcemaps) {
      mergedStream = mergedStream.pipe(sourcemaps.write());
    }

    return mergedStream;
  }

  /**
   * Method to add specific steps for the lint.
   *
   * @param {NodeJS.ReadWriteStream} stream
   * @param {TaskCallback} done
   * @return {NodeJS.ReadWriteStream}
   * @protected
   */
  protected _hookLint(stream: NodeJS.ReadWriteStream, done?: TaskCallback): NodeJS.ReadWriteStream {
    return stream
      .pipe(gulpSassLint({ configFile: path.join(this._settings.cwd, ".sass-lint.yml") }))
      .pipe(gulpSassLint.format())
      .pipe(this._lintNotifier(done));
  }

  /**
   * Display error from SASS.
   *
   * @param {any} error
   * @protected
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected _displayError(error: any): void {
    const config: Config = Config.getInstance();

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
    if ((config.isLintRun() || config.isBuildRun()) && error.code !== "ENOENT") {
      process.exit(1);
    }
  }

  /**
   * Collect error from lint.
   *
   * @param {TaskCallback} done
   * @return {Transform}
   * @private
   */
  private _lintNotifier(done?: TaskCallback): Transform {
    const config: Config = Config.getInstance();

    return through.obj(
      (file: File, encoding: string, cb: TransformCallback): void => {
        if (
          !file.isNull() &&
          !file.isStream() &&
          file.sassLint.filter((error: { errorCount: number }) => error.errorCount > 0).length > 0
        ) {
          this._lintError = true;

          if (config.isLintRun()) {
            for (const error of file.sassLint) {
              if (error.errorCount > 0) {
                TaskExtended.taskErrors.push({
                  taskName: this._taskName("lint"),
                  error,
                  done,
                });
              }
            }
          }
        }

        cb();
      },
      (cb: TransformCallback): void => cb()
    );
  }
}
