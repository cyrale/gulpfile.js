import cheerio from "gulp-cheerio";
import rename from "gulp-rename";
import svgMin from "gulp-svgmin";
import svgStore from "gulp-svgstore";
import merge from "lodash/merge";
import path from "path";
import svgo from "svgo";
import Vinyl from "vinyl";

import Task, { IGulpOptions } from "./task";

export default class SVGStore extends Task {
  public static readonly taskName: string = "svgstore";

  constructor(name: string, settings: object) {
    super(name, settings);

    this.withLinter = false;

    const defaultSettings: {} = {
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

    this.settings.settings = merge(defaultSettings, this.settings.settings);
  }

  protected buildSpecific(stream: NodeJS.ReadWriteStream, options?: IGulpOptions): NodeJS.ReadWriteStream {
    stream = stream
      .pipe(
        svgMin(
          (file: Vinyl): svgo.Options =>
            merge(this.settings.settings.svgmin, {
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
      .pipe(svgStore(this.settings.settings.svgstore))
      .pipe(cheerio({
        parserOptions: {
          xmlMode: true,
        },
        // tslint:disable-next-line:ban-types
        run: ($: CheerioStatic, file: Vinyl, done?: Function): void => {
          let offsetY: number = 0;
          let maxWidth: number = 0;

          const views: Cheerio = $("<views />");
          const uses: Cheerio = $("<uses />");

          $("symbol")
            .filter((index: number, symbol: CheerioElement): boolean => !!symbol.attribs.id && !!symbol.attribs.viewBox)
            .each((index: number, symbol: CheerioElement): void => {
              if (this.settings.settings.prefix) {
                symbol.attribs.id = `${this.settings.settings.prefix}-${symbol.attribs.id}`;
              }

              const [originX, , width, height] = symbol.attribs.viewBox
                .split(" ")
                .map((i: string): number => Number(i));
              const name: string = `${symbol.attribs.id}-icon`;

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
      .pipe(rename({
        basename: path.basename(this.settings.filename, path.extname(this.settings.filename)),
        extname: ".svg",
      }) as NodeJS.WritableStream);

    return stream;
  }
}
