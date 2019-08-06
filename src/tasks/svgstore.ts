import path from "path";
import Vinyl from "vinyl";

import merge from "lodash/merge";

import GulpCheerio, { Cheerio } from "gulp-cheerio";
import GulpRename from "gulp-rename";
import GulpSVGMin from "gulp-svgmin";
import GulpSVGStore from "gulp-svgstore";
import SVGO from "svgo";

import Task, { IGulpOptions } from "./task";

export default class SVGStore extends Task {
  public static readonly taskName: string = "svgstore";

  constructor(name: string, settings: object) {
    super(name, settings);

    this.withLinter = false;
  }

  protected buildSpecific(stream: NodeJS.ReadWriteStream, options?: IGulpOptions): NodeJS.ReadWriteStream {
    const defaultSettings = {
      svgmin: {
        plugins: [
          {
            inlineStyles: {
              onlyMatchedOnce: true,
              removeMatchedSelectors: true,
            },
          },
          {
            removeDoctype: true,
          },
          {
            removeComments: true,
          },
          {
            removeMetadata: true,
          },
          {
            removeTitle: true,
          },
          {
            removeDesc: true,
          },
          {
            removeViewBox: false,
          },
          {
            removeDimensions: true,
          },
        ],
      },
      svgstore: {
        inlineSvg: true,
      },
    };

    const settings = merge(defaultSettings, this.settings.settings);

    stream = stream
      .pipe(
        GulpSVGMin(
          (file: Vinyl): SVGO.Options =>
            merge(settings.svgmin, {
              plugins: [
                {
                  cleanupIDs: {
                    force: true,
                    minify: true,
                    prefix: path.basename(file.relative, path.extname(file.relative)) + "-",
                  },
                },
              ],
            })
        )
      )
      .pipe(GulpSVGStore(settings.svgstore))
      .pipe(GulpCheerio({
        parserOptions: {
          xmlMode: true,
        },
        // tslint:disable-next-line:ban-types
        run: ($: CheerioStatic, file: Vinyl, done?: Function): void => {
          let offsetY = 0;
          let maxWidth = 0;

          const views = $("<views />");
          const uses = $("<uses />");

          $("symbol")
            .filter((index, symbol) => !!symbol.attribs.id && !!symbol.attribs.viewBox)
            .each((index, symbol) => {
              if (this.settings.settings.prefix) {
                symbol.attribs.id = `${this.settings.settings.prefix}-${symbol.attribs.id}`;
              }

              const [originX, originY, width, height] = symbol.attribs.viewBox.split(" ").map(i => Number(i));
              const name = `${symbol.attribs.id}-icon`;

              views.append(`<view id="${name}" viewBox="${originX} ${offsetY} ${width} ${height}" />`);

              uses.append(
                `<use
                     xlink:href="#${symbol.attribs.id}"
                     width="${width}"
                     height="${height}"
                     x="${originX}"
                     y="${offsetY}" />`
              );

              offsetY += height;
              maxWidth = Math.max(maxWidth, width);
            });

          $("svg")
            .attr("xmlns:xlink", "http://www.w3.org/1999/xlink")
            .attr("viewBox", `0 0 ${maxWidth} ${offsetY}`)
            // @ts-ignore
            .append(views[0].children)
            .append(uses[0].children);

          if (done) {
            done();
          }
        },
      }) as NodeJS.WritableStream)
      .pipe(GulpRename({
        basename: path.basename(this.settings.filename, path.extname(this.settings.filename)),
        extname: ".svg",
      }) as NodeJS.WritableStream);

    return stream;
  }
}
