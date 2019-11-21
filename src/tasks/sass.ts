import purgeCSS from "@fullhuman/postcss-purgecss";
import autoprefixer from "autoprefixer";
import CSSMQPacker from "css-mqpacker";
import CSSNano from "cssnano";
import log from "fancy-log";
import Fiber from "fibers";
import { sink } from "gulp-clone";
import criticalCSS from "gulp-critical-css";
import extractMediaQueries from "gulp-extract-media-queries";
import filter from "gulp-filter";
import gulpPostCSS from "gulp-postcss";
import rename from "gulp-rename";
import sass from "gulp-sass";
import gulpSassLint from "gulp-sass-lint";
import merge from "lodash/merge";
import uniq from "lodash/uniq";
import mergeStream from "merge-stream";
import path from "path";
import postcss from "postcss";
import assets from "postcss-assets";
import discardComments from "postcss-discard-comments";
import discardEmpty from "postcss-discard-empty";
import inlineSVG from "postcss-inline-svg";
import scssParser from "postcss-scss";
import svgo from "postcss-svgo";
import purgeCSSWithWordPress from "purgecss-with-wordpress";
import rucksackCSS from "rucksack-css";
import sassCompiler from "sass";
import sassLint from "sass-lint";
import sortCSSMediaQueries from "sort-css-media-queries";
import { Transform } from "stream";
import through, { TransformCallback } from "through2";
import File from "vinyl";

import MediaQueries from "../gulp-plugins/media-queries";
import Revision, { DefaultObject } from "../gulp-plugins/revision";
import Config from "../libs/config";
import hierarchicalCriticalCSS from "../postcss/hierarchical-critical-css";
import normalizeRevision from "../postcss/normalize-revision";
import removeCriticalProperties from "../postcss/remove-critical-properties";
import removeCriticalRules from "../postcss/remove-critical-rules";
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

    this._manifestCallback = (data, additionalInformation): {} => {
      const media: string = MediaQueries.mediaQuery(
        data.origRelFile.replace(this._minifySuffix, ""),
        (additionalInformation.media as string[]) || []
      );

      return {
        media: media === "" ? "all" : media,
      };
    };
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

    // Collect PostCSS plugins to run on global CSS file, before media queries or critical extraction.
    const postCSSPluginsBefore: postcss.AcceptedPlugin[] = [
      discardComments(),
      assets(this._settings.settings.assets),
      normalizeRevision(),
      rucksackCSS(this._settings.settings.rucksack),
      autoprefixer(this._settings.settings.autoprefixer),
      inlineSVG(this._settings.settings.inlineSVG),
      svgo(this._settings.settings.SVGO),
    ];

    if (this._purgeCSSActive) {
      postCSSPluginsBefore.push(purgeCSS(this._settings.settings.purgeCSS));
    }

    // Collect PostCSS plugins to run before first save.
    const postCSSPluginsIntermediate: postcss.AcceptedPlugin[] = [removeCriticalProperties(), discardEmpty()];

    // Collect PostCSS pluging to run after first save, for minification process.
    const postCSSPluginsAfter: postcss.AcceptedPlugin[][] = [
      CSSNano(this._settings.settings.cssnano),
      CSSMQPacker(this._settings.settings.mqpacker),
    ];

    // Start SASS process.
    if (this._criticalActive) {
      stream = stream.pipe(gulpPostCSS([hierarchicalCriticalCSS()], { parser: scssParser }));
    }

    stream = stream.pipe(sass(this._settings.settings.sass || {})).pipe(gulpPostCSS(postCSSPluginsBefore));

    // Extract media queries to saves it to separated files.
    if (this._settings.settings.extractMQ) {
      let mainFilename = "";

      let streamExtractMQ: NodeJS.ReadWriteStream = stream
        .pipe(
          rename((pPath: rename.ParsedPath): void => {
            mainFilename = pPath.basename as string;
          })
        )
        .pipe(
          Revision.additionalData((file: unknown, additionalData: DefaultObject): void => {
            additionalData.media = uniq([
              ...((additionalData.media as string[]) || []),
              ...MediaQueries.extractMediaQueries(file as File),
            ]);
          })
        )
        .pipe(extractMediaQueries())
        .pipe(
          rename((pPath: rename.ParsedPath): void => {
            if (pPath.basename !== mainFilename) {
              pPath.basename = `${mainFilename}.${pPath.basename}`;
            }
          })
        );

      // Remove critical rules from original file.
      if (this._criticalActive) {
        streamExtractMQ = streamExtractMQ.pipe(gulpPostCSS([removeCriticalRules()]));
      }

      streams.push(streamExtractMQ);
    }

    // Extract critical rules to saves it to separated files.
    if (this._criticalActive) {
      let streamCriticalCSS: NodeJS.ReadableStream = stream
        .pipe(criticalCSS(this._settings.settings.critical))
        .pipe(filter(["**/*.critical.css"]));

      // Remove critical rules from original file.
      if (!this._settings.settings.extractMQ) {
        streamCriticalCSS = mergeStream(streamCriticalCSS, stream.pipe(gulpPostCSS([removeCriticalRules()])));
      }

      streams.push(streamCriticalCSS);
    }

    if (streams.length === 0) {
      streams.push(stream);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cloneSink: any = sink();

    return mergeStream(streams)
      .pipe(gulpPostCSS(postCSSPluginsIntermediate))
      .pipe(cloneSink)
      .pipe(gulpPostCSS(postCSSPluginsAfter))
      .pipe(rename({ suffix: this._minifySuffix }))
      .pipe(cloneSink.tap());
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
