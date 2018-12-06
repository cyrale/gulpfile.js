"use strict";

const _ = require("lodash");

const path = require("path");
const crypto = require("crypto");

const gulp = require("gulp");
const iconfont = require("gulp-iconfont");
const plumber = require("gulp-plumber");
const header = require("gulp-header");
const file = require("gulp-file");
const consolidate = require("gulp-consolidate");

const notify = require("../notify");

const bsync = require("./browsersync");

const templates = {
  foundation:
    "" +
    "@font-face {\n" +
    '  font-family: "<%= fontName %>";\n' +
    "  src: url('<%= fontPath %><%= fontName %>.eot?rev=<%= hash %>');\n" +
    "  src: url('<%= fontPath %><%= fontName %>.eot?rev=<%= hash %>#iefix') format('eot'),\n" +
    "       url('<%= fontPath %><%= fontName %>.woff2?rev=<%= hash %>') format('woff2'),\n" +
    "       url('<%= fontPath %><%= fontName %>.woff?rev=<%= hash %>') format('woff'),\n" +
    "       url('<%= fontPath %><%= fontName %>.ttf?rev=<%= hash %>') format('truetype'),\n" +
    "       url('<%= fontPath %><%= fontName %>.svg?rev=<%= hash %>#<%= fontName %>') format('svg');\n" +
    "  font-weight: normal;\n" +
    "  font-style: normal;\n" +
    "}\n" +
    "\n" +
    "<%= glyphs.map(function(glyph){ return '.' + className + '-' + glyph.name + ':before' }).join(',\\n') %> {\n" +
    '    font-family: "<%= fontName %>";\n' +
    "    font-style: normal;\n" +
    "    font-weight: normal;\n" +
    "    font-variant: normal;\n" +
    "    text-transform: none;\n" +
    "    line-height: 1;\n" +
    "    -webkit-font-smoothing: antialiased;\n" +
    "    display: inline-block;\n" +
    "    text-decoration: inherit;\n" +
    "}\n" +
    "\n" +
    '<% _.each(glyphs, function(glyph) { %>.<%= className %>-<%= glyph.name %>:before { content: "\\<%= glyph.codepoint.toString(16).toUpperCase() %>" }\n' +
    "<% }); %>\n" +
    '<% _.each(glyphs, function(glyph) { %>$<%= className %>-<%= glyph.name %>: "\\<%= glyph.codepoint.toString(16).toUpperCase() %>";\n' +
    "<% }); %>\n",
  fontawesome:
    "" +
    "@font-face {\n" +
    '    font-family: "<%= fontName %>";\n' +
    "    src: url('<%= fontPath %><%= fontName %>.eot?rev=<%= hash %>');\n" +
    "    src: url('<%= fontPath %><%= fontName %>.eot?rev=<%= hash %>#iefix') format('eot'),\n" +
    "        url('<%= fontPath %><%= fontName %>.woff2?rev=<%= hash %>') format('woff2'),\n" +
    "        url('<%= fontPath %><%= fontName %>.woff?rev=<%= hash %>') format('woff'),\n" +
    "        url('<%= fontPath %><%= fontName %>.ttf?rev=<%= hash %>') format('truetype'),\n" +
    "        url('<%= fontPath %><%= fontName %>.svg?rev=<%= hash %>#<%= fontName %>') format('svg');\n" +
    "    font-weight: normal;\n" +
    "    font-style: normal;\n" +
    "}\n" +
    "\n" +
    ".<%= className %>:before {\n" +
    "    display: inline-block;\n" +
    '    font-family: "<%= fontName %>";\n' +
    "    font-style: normal;\n" +
    "    font-weight: normal;\n" +
    "    line-height: 1;\n" +
    "    -webkit-font-smoothing: antialiased;\n" +
    "    -moz-osx-font-smoothing: grayscale;\n" +
    "}\n" +
    "\n" +
    ".<%= className %>-lg {\n" +
    "    font-size: 1.3333333333333333em;\n" +
    "    line-height: 0.75em;\n" +
    "    vertical-align: -15%;\n" +
    "}\n" +
    ".<%= className %>-2x { font-size: 2em; }\n" +
    ".<%= className %>-3x { font-size: 3em; }\n" +
    ".<%= className %>-4x { font-size: 4em; }\n" +
    ".<%= className %>-5x { font-size: 5em; }\n" +
    ".<%= className %>-fw {\n" +
    "    width: 1.2857142857142858em;\n" +
    "    text-align: center;\n" +
    "}\n" +
    "\n" +
    '<% _.each(glyphs, function(glyph) { %>.<%= className %>-<%= glyph.name %>:before { content: "\\<%= glyph.codepoint.toString(16).toUpperCase() %>" }\n' +
    "<% }); %>\n" +
    '<% _.each(glyphs, function(glyph) { %>$<%= className %>-<%= glyph.name %>: "\\<%= glyph.codepoint.toString(16).toUpperCase() %>";\n' +
    "<% }); %>\n"
};

const Task = require("../task");

class Fonts extends Task {
  constructor(name, options) {
    super(name, options);

    this.options.settings = _.merge(
      {
        template: "fontawesome",
        prefix: ""
      },
      this.options.settings || {}
    );
  }

  build() {
    let prefix =
      undefined === this.options.settings.prefix
        ? "font-"
        : "" === this.options.settings.prefix
        ? ""
        : this.options.settings.prefix + "-";

    let sanitizedTaskName = prefix + (this.options.settings.name || this.name.replace(":", "-").replace("fonts-", ""));

    return gulp
      .src(this.options.src, { cwd: this.options.cwd })
      .pipe(
        plumber(error => {
          notify.onError(error, this.name);
        })
      )
      .pipe(
        iconfont({
          fontName: sanitizedTaskName,
          centerHorizontally: true,
          normalize: true,
          formats: ["ttf", "eot", "woff", "woff2", "svg"],
          timestamp: Math.round(Date.now() / 1000).toString()
        })
      )
      .on("glyphs", glyphs => {
        let templateVars = {
          glyphs: glyphs.map(Fonts.mapGlyphs),
          fontName: sanitizedTaskName,
          fontPath: (this.options.settings.sass.rel + "/").replace("//", "/"),
          className: sanitizedTaskName,
          hash: crypto
            .createHash("md5")
            .update(Math.round(Date.now() / 1000).toString())
            .digest("hex")
            .substr(0, 10)
        };

        if (undefined !== templates[this.options.settings.template]) {
          file("_" + sanitizedTaskName + ".scss", templates[this.options.settings.template], { src: true })
            .pipe(header("// sass-lint:disable-all\n\n"))
            .pipe(gulp.dest(this.options.settings.sass.dst, { cwd: this.options.cwd }))
            .pipe(consolidate("lodash", templateVars))
            .pipe(gulp.dest(this.options.settings.sass.dst, { cwd: this.options.cwd }));
        }
      })
      .pipe(gulp.dest(this.options.dst, { cwd: this.options.cwd }))
      .pipe(bsync.sync());
  }

  static mapGlyphs(glyph) {
    return { name: glyph.name, codepoint: glyph.unicode[0].charCodeAt(0) };
  }
}

module.exports = Fonts;
