import changeCase from "change-case";
import { dest } from "gulp";
import header from "gulp-header";
import gulpIf from "gulp-if";
import sort from "gulp-sort";
import spriteSmith from "gulp.spritesmith";
import merge from "lodash/merge";
import omit from "lodash/omit";
import mergeStream from "merge-stream";
import minimatch from "minimatch";
import path from "path";
import buffer from "vinyl-buffer";

import Revision from "../modules/revision";
import Task, { IBuildSettings } from "./task";

/**
 * Convert a set of images into a spritesheet.
 */
export default class Sprites extends Task {
  /**
   * Global task name.
   * @readonly
   */
  public static readonly taskName: string = "sprites";

  /**
   * Task constructor.
   *
   * @param {string} name
   * @param {object} settings
   */
  constructor(name: string, settings: object) {
    super(name, settings);

    // No need of linter, default save method and revision.
    this._withLinter = false;
    this._defaultDest = false;
    this._defaultRevision = false;

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
   * @param {NodeJS.ReadWriteStream} stream
   * @param {IBuildSettings} buildSettings
   * @return {NodeJS.ReadWriteStream}
   * @protected
   */
  protected _buildSpecific(stream: NodeJS.ReadWriteStream, buildSettings: IBuildSettings): NodeJS.ReadWriteStream {
    const prefix: string = this._settings.settings.prefix === "" ? "" : `${this._settings.settings.prefix}-`;
    const sanitizedTaskName: string = changeCase.paramCase(this._taskName().replace("sprites:", prefix));

    const imgName: string = sanitizedTaskName + ".png";
    const imgNameRetina: string = sanitizedTaskName + "@2x.png";

    // Normal spritesmith settings.
    const spritesmithDefaultSettings: {} = {
      cssName: "_" + sanitizedTaskName + ".scss",
      cssSpritesheetName: "spritesheet-" + sanitizedTaskName,
      cssVarMap: (spriteImg: any): void => {
        spriteImg.name = `${sanitizedTaskName}-${spriteImg.name}`;

        if (this._settings["src-2x"]) {
          let match: boolean = false;

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
      css: NodeJS.ReadWriteStream;
      img: NodeJS.ReadWriteStream;
    } = stream.pipe(gulpIf(sortFiles, sort())).pipe(spriteSmith(spritesmithSettings));

    return mergeStream(
      sprite.img
        .pipe(dest(this._settings.dst, buildSettings.options))
        .pipe(gulpIf(Revision.isActive(), buffer()))
        .pipe(gulpIf(Revision.isActive(), Revision.manifest(buildSettings.revision)))
        .pipe(gulpIf(Revision.isActive(), dest(".", buildSettings.options))),
      sprite.css
        .pipe(header("// sass-lint:disable-all\n\n"))
        .pipe(dest(this._settings.settings.sass.dst, buildSettings.options))
    );
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
