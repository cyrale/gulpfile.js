[![npm version](https://badge.fury.io/js/gulpfile.js.svg)](https://badge.fury.io/js/gulpfile.js)
[![Dependency Status](https://david-dm.org/cyrale/gulpfile.js.svg?theme=shields.io)](https://david-dm.org/cyrale/gulpfile.js)
[![devDependency Status](https://david-dm.org/cyrale/gulpfile.js/dev-status.svg?theme=shields.io)](https://david-dm.org/cyrale/gulpfile.js#info=devDependencies)

Because I spent too much time redoing my gulp tasks, I make this to work
with a unique configuration file written in YAML.

The project is inspired by [**Blendid** _(formerly known as Gulp Starter)_](https://github.com/vigetlabs/blendid).

## Quick start on a fresh project (empty directory)

Install **gulpfile.js**:

```bash
npm init
npm install gulpfile.js --save-dev --save-exact
npx gulpfile
```

Create configuration files:

```bash
touch gulpconfig.yml
touch .eslintrc
```

Start **gulpfile.js**:

```bash
npx gulpfile
```

## Commands

```bash
npx gulpfile
```

This is where the magic happens. The perfect front-end workflow. This runs the
development task, which starts compiling, watching, and live updating all our
files as we change them. Browsersync will start a server on port 3000, or do
whatever you've configured it to do. You'll be able to see live changes in all
connected browsers.

```bash
npx gulpfile build
```

Compiles files to your destination directory.

It's a good idea to add aliases for these commands to your package.json scripts object.

package.json:

```json
{
  "scripts": {
    "start": "npx gulpfile",
    "build": "npx gulpfile build"
  }
}
```

Command line:

```bash
npm start
npm run build
```

## Configuring tasks

Except for browsersync, all section define a set of tasks build on the same
template. Each section define 2 entries:

- tasks: list of tasks
- settings: global override of task settings

For each tasks, you can override settings globally or for the task only. All
options is detailed below.

### Browsersync

Override default settings and watch files not watched by other tasks.

**Template:**

```yaml
browsersync:
  settings:
    server:
      baseDir: "build/"
  watch:
    - "**/*.html"
```

In this configuration, files in `build` directory will by served at
http://localhost:3000 and all changes on HTML file will reload the browser. You
can proxy an existing website as written below:

```yaml
browsersync:
  settings:
    proxy: "http://website.dev"
```

Related documentation:

- [Browsersync options](https://www.browsersync.io/docs/options)

### Pug

Build PUG files into HTML. In the template below, one task called `public` is
defined and compile all PUG files in directory `assets/views` in HTML file
stored in `build`. You can pass data to PUG with `data` settings.

**Template:**

```yaml
pug:
  tasks:
    public:
      src:
        - "assets/views/**/*.pug"
      dst: "build"
      settings:
        data: "pugdata-task.yml"
  settings:
    data: "pugdata.yml"
```

### SASS

Build SASS files into CSS. In the template below, one task called `public` is
defined and compile all SASS files in directory `assets/sass` in HTML file
stored in `build/css`. You can override settings of SASS and autoprefixer. It's
also possible to extract media queries and critical styles into separate files.

**Template:**

```yaml
sass:
  tasks:
    public:
      src:
        - "assets/sass/**/*.scss"
      dst: "build/css"
  settings:
    sass:
      errLogToConsole: true
    autoprefixer:
      browsers:
        - "> 1%"
        - "IE >= 9"
      cascade: false
    mqpacker:
      sort: "mobile"
    inlineSVG:
      path: "assets/"
    extractMQ: true
    critical: true
```

Related documentation:

- [SASS](https://github.com/sass/node-sass#options)
- [Autoprefixer](https://github.com/postcss/autoprefixer#options)
- [postcss-assets](https://github.com/borodean/postcss-assets/blob/develop/README.md)
- [postcss-inline-svg](https://github.com/TrySound/postcss-inline-svg/blob/master/README.md)
- [rucksack](https://www.rucksackcss.org/)
- [CSS MQPacker](https://github.com/hail2u/node-css-mqpacker/blob/master/README.md)
- [gulp-critical-css](https://github.com/mscharl/gulp-critical-css/blob/master/readme.md)
- [gulp-extract-media-queries](https://github.com/unlight/gulp-extract-media-queries/blob/master/README.md)

### JavaScript

Build javascript files into two files: one with all scripts and the other
minified. In the template below, one task called `public` is defined and
compile all javascript files in directory `assets/js` in two files (app.js and
app.min.js) stored in `build/js`. You can override settings of browserify and
babel.

**Template:**

```yaml
javascript:
  tasks:
    public:
      src:
        - "assets/js/*.js"
      dst: "build/js"
      filename: "app.js"
```

Related documentation:

- [Browserify](https://github.com/browserify/browserify#browserifyfiles--opts)
- [Babel](https://babeljs.io/docs/core-packages/#options)

### Images

Minify images with [imagemin](https://www.npmjs.com/package/gulp-imagemin). In
the template below, one task called `public` is defined and optimize all images
in directory `assets/images` and store them in `build/images`. You can override
settings of imagemin.

**Template:**

```yaml
images:
  tasks:
    public:
      src:
        - "assets/images/**/*.png"
        - "assets/images/**/*.jpg"
        - "assets/images/**/*.jpeg"
        - "assets/images/**/*.gif"
        - "assets/images/**/*.svg"
      dst: "build/images"
  settings:
    optimizationLevel: 4
```

Related documentation:

- [imagemin](https://github.com/sindresorhus/gulp-imagemin#options)

### Sprites

Convert a set of images into a spritesheet and CSS variables. The two templates
below show the two way to define sprites: first one is normal method, the second
is for retina configuration. All images in `assets/sprites` will be converted in
a sprite stored in `build/images`. The name of the task define the name of the
sprite file but you can add a prefix. SASS file is build in `assets/sass/sprites`.
You can override settings of imagemin.

**Template:**

```yaml
sprites:
  tasks:
    icon:
      src:
        - "assets/sprites/*.png"
        - "assets/sprites/*.jpg"
      dst: "build/images"
      settings:
        sass:
          dst: "assets/sass/sprites"
          rel: "../images"
        prefix: "icon"
  settings:
    imagemin:
      optimizationLevel: 4
```

```yaml
sprites:
  tasks:
    icon:
      src-1x:
        - "assets/sprites/*.png"
        - "assets/sprites/*.jpg"
      src-2x:
        - "assets/sprites/*@2x.png"
        - "assets/sprites/*@2x.jpg"
      dst: "build/images"
      settings:
        sass:
          dst: "assets/sass/sprites"
          rel: "../images"
        prefix: "icon"
  settings:
    imagemin:
      optimizationLevel: 4
```

Related documentation:

- [imagemin](https://github.com/sindresorhus/gulp-imagemin#options)

### Fonts

Convert a set of SVG file in font files like FontAwesome or Foundation. In the
template below, one task called `custom` is defined and convert all SVG in
directory `assets/svg` and store font files in `build/fonts` and SASS file in
`assets/sass/fonts`. In default behavior, the icons was named
`icon-custom-{name-of-svg}`. You can change the default prefix and name by any
value in settings. In this case, the name of each icon is
`{prefix}-{name}-{name-of-svg}`.

**Template:**

```yaml
fonts:
  tasks:
    custom:
      src:
        - "assets/svg/*.svg"
      dst: "build/fonts"
      settings:
        sass:
          dst: "assets/sass/fonts"
          rel: "../fonts"
        prefix: "font"
        name: "icon"
  settings:
    template: "fontawesome"
```

Related documentation:

- [spritesmith](https://github.com/Ensighten/spritesmith)

## What's under the hood?

Gulp tasks! Built combining the following:

| Feature           | Packages Used                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Live Updating** | [Browsersync](http://www.browsersync.io/)                                                                                                                                                                                                                                                                                                                                                                                        |
| **Pug**           | [gulp-pug](https://github.com/pugjs/gulp-pug), [gulp-data](https://github.com/colynb/gulp-data)                                                                                                                                                                                                                                                                                                                                  |
| **SASS**          | [Sass](http://sass-lang.com/) ([Libsass](http://sass-lang.com/libsass) via [node-sass](https://github.com/sass/node-sass)), [Autoprefixer](https://github.com/postcss/autoprefixer), [css-mqpacker](https://github.com/hail2u/node-css-mqpacker), [rucksack](https://www.rucksackcss.org/), [CSSNano](https://github.com/ben-eb/cssnano), [rucksack](https://www.rucksackcss.org/), [CSSNano](https://github.com/ben-eb/cssnano) |
| **JavaScript**    | [Browserify](http://browserify.org), [Babel](http://babeljs.io/)                                                                                                                                                                                                                                                                                                                                                                 |
| **Images**        | [imagemin](https://www.npmjs.com/package/gulp-imagemin)                                                                                                                                                                                                                                                                                                                                                                          |
| **Sprites**       | [spritesmith](https://github.com/Ensighten/spritesmith)                                                                                                                                                                                                                                                                                                                                                                          |
| **Fonts**         | [iconfont](https://github.com/nfroidure/gulp-iconfont)                                                                                                                                                                                                                                                                                                                                                                           |
