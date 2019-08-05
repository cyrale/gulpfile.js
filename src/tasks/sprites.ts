import changeCase from "change-case";
import merge from "merge-stream";
import minimatch from "minimatch";
import path from "path";
import buffer from "vinyl-buffer";

import { dest } from "gulp";

import GulpHeader from "gulp-header";
import GulpIf from "gulp-if";
import GulpImagemin from "gulp-imagemin";
import GulpSort from "gulp-sort";
import GulpSpriteSmith from "gulp.spritesmith";

import Images from "./images";
import Task, { IGulpOptions } from "./task";

export default class Sprites extends Task {
  public static readonly taskName: string = "sprites";

  private static mapMatchPatterns(pattern: string): string {
    return ("**/" + pattern).replace("//", "/");
  }

  constructor(name: string, settings: object) {
    super(name, settings);

    this.withLinter = false;
    this.defaultDest = false;

    this.settings.src = this.srcGlobs();
  }

  protected buildSpecific(stream: NodeJS.ReadWriteStream, options?: IGulpOptions): NodeJS.ReadWriteStream {
    const prefix = this.settings.settings.prefix
      ? this.settings.settings.prefix === ""
        ? ""
        : `${this.settings.settings.prefix}-`
      : "sprite-";

    delete this.settings.settings.prefix;

    const sanitizedTaskName = changeCase.paramCase(this.taskName().replace("sprites:", prefix));

    const sassSettings = this.settings.settings.sass;
    const imageminSettings = { ...Images.imageminDefaultSettings, ...(this.settings.settings.imagemin || {}) };

    delete this.settings.settings.sass;
    delete this.settings.settings.imagemin;

    const imgName = sanitizedTaskName + ".png";
    const imgNameRetina = sanitizedTaskName + "@2x.png";
    const imgNameAbs = path.join(this.settings.dst, imgName);
    const imgNameAbsRetina = path.join(this.settings.dst, imgNameRetina);

    const spritesmithDefaultSettings = {
      cssName: "_" + sanitizedTaskName + ".scss",
      cssSpritesheetName: "spritesheet-" + sanitizedTaskName,
      cssVarMap: (spriteImg: any): void => {
        spriteImg.name = `${sanitizedTaskName}-${spriteImg.name}`;

        if (this.settings["src-2x"]) {
          let match = false;

          this.settings["src-2x"].map(Sprites.mapMatchPatterns).forEach((pattern: string): void => {
            match = match || minimatch(spriteImg.source_image, pattern);
          });

          if (match) {
            spriteImg.name += "-retina";
          }
        }
      },
      imgName: imgNameAbs,
      imgPath: path.join(sassSettings.rel, imgName),
      padding: 4,
    };

    let spritesmithSettings = { ...spritesmithDefaultSettings, ...(this.settings.settings || {}) };

    if (this.settings["src-1x"] && this.settings["src-2x"]) {
      spritesmithSettings = {
        ...spritesmithSettings,
        ...{
          cssRetinaGroupsName: `${sanitizedTaskName}-retina`,
          cssRetinaSpritesheetName: `spritesheet-${sanitizedTaskName}-retina`,
          retinaImgName: imgNameAbsRetina,
          retinaImgPath: path.join(sassSettings.rel, imgNameRetina),
          retinaSrcFilter: this.settings["src-2x"],
        },
      };
    }

    const sortFiles =
      (typeof this.settings.algorithm === "undefined" || this.settings.algorithm !== "binary-tree") &&
      typeof this.settings.algorithmOpts !== "undefined" &&
      this.settings.algorithmOpts.sort !== false;

    const sprite = stream.pipe(GulpIf(sortFiles, GulpSort())).pipe(GulpSpriteSmith(spritesmithSettings));

    return merge(
      sprite.img
        .pipe(buffer())
        .pipe(GulpImagemin(imageminSettings))
        .pipe(dest(".", options)),
      sprite.css.pipe(GulpHeader("// sass-lint:disable-all\n\n")).pipe(dest(sassSettings.dst, options))
    );
  }

  private srcGlobs(): string[] {
    if (this.settings["src-1x"] && this.settings["src-2x"]) {
      return [...this.settings["src-1x"], ...this.settings["src-2x"]];
    }

    return this.settings.src;
  }
}
