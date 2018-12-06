"use strict";

const _ = require("lodash");

const path = require("path");

const gulp = require("gulp");
const plumber = require("gulp-plumber");
const rename = require("gulp-rename");
const svgstore = require("gulp-svgstore");
const svgmin = require("gulp-svgmin");
const cheerio = require("gulp-cheerio");
const newer = require("gulp-newer");

const bsync = require("./browsersync");

const notify = require("../notify");

const Task = require("../task");

class SVGStore extends Task {
  constructor(name, options) {
    super(name, options);

    this.options.settings = _.merge(
      {
        plugins: [
          {
            inlineStyles: {
              onlyMatchedOnce: true,
              removeMatchedSelectors: true
            }
          },
          {
            removeDoctype: true
          },
          {
            removeComments: true
          },
          {
            removeMetadata: true
          },
          {
            removeTitle: true
          },
          {
            removeDesc: true
          },
          {
            removeViewBox: false
          },
          {
            removeDimensions: true
          }
        ]
      },
      this.options.settings || {}
    );
  }

  build() {
    return gulp
      .src(this.options.src, { cwd: this.options.cwd })
      .pipe(newer(path.join(this.options.cwd, this.options.dst)))
      .pipe(
        plumber(error => {
          notify.onError(error, this.name);
        })
      )
      .pipe(
        svgmin(file => {
          return _.merge(this.options.settings, {
            plugins: [
              {
                cleanupIDs: {
                  prefix: path.basename(file.relative, path.extname(file.relative)) + "-",
                  minify: true,
                  force: true
                }
              }
            ]
          });
        })
      )
      .pipe(svgstore({ inlineSvg: true }))
      .pipe(
        cheerio({
          run: ($, file, done) => {
            let offsetY = 0;
            let maxWidth = 0;

            const views = $("<views />");
            const uses = $("<uses />");

            $("symbol")
              .filter((index, symbol) => !!symbol.attribs.id && !!symbol.attribs.viewBox)
              .each((index, symbol) => {
                if (this.options.settings.prefix) {
                  symbol.attribs.id = `${this.options.settings.prefix}-${symbol.attribs.id}`;
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
              .attr({
                "xmlns:xlink": "http://www.w3.org/1999/xlink",
                viewBox: `0 0 ${maxWidth} ${offsetY}`
              })
              .append(views[0].children)
              .append(uses[0].children);

            done();
          },
          parserOptions: { xmlMode: true }
        })
      )
      .pipe(
        rename({
          basename: path.basename(this.options.filename, path.extname(this.options.filename)),
          extname: ".svg"
        })
      )
      .pipe(gulp.dest(this.options.dst, { cwd: this.options.cwd }))
      .pipe(bsync.sync());
  }
}

module.exports = SVGStore;
