import changeCase from "change-case";
import { dest } from "gulp";
import header from "gulp-header";
import gulpIf from "gulp-if";
import sort from "gulp-sort";
import spriteSmith from "gulp.spritesmith";
import merge from "lodash/merge";
import omit from "lodash/omit";
import minimatch from "minimatch";
import path from "path";
import buffer from "vinyl-buffer";

import { BuildSettings, TaskOptions } from "./task";
import TaskExtended from "./task-extended";

/**
 * Convert a set of images into a spritesheet.
 */
export default class Sprites extends TaskExtended {
  /**
   * Global task name.
   * @readonly
   */
  public static readonly taskName: string = "sprites";

  /**
   * Level to order task in execution pipeline.
   * @type {number}
   * @readonly
   */
  public static readonly taskOrder: number = 20;

  /**
   * Task constructor.
   *
   * @param {TaskOptions} options
   */
  constructor(options: TaskOptions) {
    super(options);

    // Merge normal and retina image.
    this._settings.src = this._srcGlobs();

    const defaultSettings: {} = {
      prefix: "sprite",
    };

    this._settings.settings = merge(defaultSettings, this._settings.settings || {});
  }

  /**
   * Method to add specific steps for the build.
   *
   * @param {NodeJS.ReadableStream} stream
   * @param {BuildSettings} buildSettings
   * @return {NodeJS.ReadableStream}
   * @protected
   */
  protected _hookBuildBefore(stream: NodeJS.ReadableStream, buildSettings: BuildSettings): NodeJS.ReadableStream {
    const prefix: string = this._settings.settings.prefix === "" ? "" : `${this._settings.settings.prefix}-`;
    const sanitizedTaskName: string = changeCase.paramCase(this._taskName().replace("sprites:", prefix));

    const imgName: string = sanitizedTaskName + ".png";
    const imgNameRetina: string = sanitizedTaskName + "@2x.png";

    // Normal spritesmith settings.
    const spritesmithDefaultSettings: {} = {
      cssName: "_" + sanitizedTaskName + ".scss",
      cssSpritesheetName: "spritesheet-" + sanitizedTaskName,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cssVarMap: (spriteImg: any): void => {
        spriteImg.name = `${sanitizedTaskName}-${spriteImg.name}`;

        if (this._settings["src-2x"]) {
          let match = false;

          this._settings["src-2x"]
            .map((pattern: string): string => `**/${pattern}`.replace("//", "/"))
            .forEach((pattern: string): void => {
              match = match || minimatch(spriteImg.source_image, pattern);
            });

          if (match) {
            spriteImg.name += "-retina";
          }
        }
      },
      imgName,
      imgPath: path.join(this._settings.settings.sass.rel, imgName),
      padding: 4,
    };

    let spritesmithSettings: {} = merge(spritesmithDefaultSettings, omit(this._settings.settings, ["prefix", "sass"]));

    // Add retina treatment to settings.
    if (this._settings["src-1x"] && this._settings["src-2x"]) {
      spritesmithSettings = merge(spritesmithSettings, {
        cssRetinaGroupsName: `${sanitizedTaskName}-retina`,
        cssRetinaSpritesheetName: `spritesheet-${sanitizedTaskName}-retina`,
        retinaImgName: imgNameRetina,
        retinaImgPath: path.join(this._settings.settings.sass.rel, imgNameRetina),
        retinaSrcFilter: this._settings["src-2x"],
      });
    }

    // Sort file in certain condition to make that it's the same order in normal and retina sprites.
    const sortFiles: boolean =
      (typeof this._settings.algorithm === "undefined" || this._settings.algorithm !== "binary-tree") &&
      typeof this._settings.algorithmOpts !== "undefined" &&
      this._settings.algorithmOpts.sort !== false;

    const sprite: {
      css: NodeJS.ReadableStream;
      img: NodeJS.ReadableStream;
    } = stream.pipe(gulpIf(sortFiles, sort())).pipe(spriteSmith(spritesmithSettings));

    // Write SASS file
    sprite.css
      .pipe(header("// sass-lint:disable-all\n\n"))
      .pipe(dest(this._settings.settings.sass.dst, buildSettings.options));

    return sprite.img.pipe(buffer());
  }

  /**
   * Merge normal and retina sources.
   *
   * @return {string[]}
   * @private
   */
  private _srcGlobs(): string[] {
    if (this._settings["src-1x"] && this._settings["src-2x"]) {
      return [...this._settings["src-1x"], ...this._settings["src-2x"]];
    }

    return this._settings.src;
  }
}
