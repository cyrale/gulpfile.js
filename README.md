[![NPM version][npm-image]][npm-url]

Because I spent too much time redoing my gulp tasks, I make this to work 
with a unique configuration file written in YAML.

The project is inspired by https://github.com/vigetlabs/gulp-starter.

## Quick start on a fresh project (empty directory)

```bash
yarn init
yarn add gulpfile.js
yarn run gulpfile
```

## Commands

All commands should be run through yarn run. If you haven't switched to [yarn](https://yarnpkg.com/)
yet, now's a great time!

```bash
yarn run gulpfile
```

This is where the magic happens. The perfect front-end workflow. This runs the
development task, which starts compiling, watching, and live updating all our 
files as we change them. Browsersync will start a server on port 3000, or do 
whatever you've configured it to do. You'll be able to see live changes in all
connected browsers.

```bash
yarn run gulpfile build
```

Compiles files to your destination directory.

It's a good idea to add aliases for these commands to your package.json scripts object.

package.json:
```json
{
  "scripts": {
    "start": "yarn run gulpfile",
    "build": "yarn run gulpfile build"
  }
}
```

Command line:
```bash
yarn start
yarn run build
```

## Configuring tasks

### Browsersync

### Pug

### SASS

### JavaScript

### Images

### Sprites

### Fonts

## What's under the hood?
   
Gulp tasks! Built combining the following:

Feature | Packages Used
--------|--------------
**Live Updating** | [Browsersync](http://www.browsersync.io/)
**Pug** | [gulp-pug](https://github.com/pugjs/gulp-pug), [gulp-data](https://github.com/colynb/gulp-data)
**SASS** | [Sass](http://sass-lang.com/) ([Libsass](http://sass-lang.com/libsass) via [node-sass](https://github.com/sass/node-sass)), [Autoprefixer](https://github.com/postcss/autoprefixer), [css-mqpacker](https://github.com/hail2u/node-css-mqpacker), [rucksack](https://www.rucksackcss.org/), [CSSNano](https://github.com/ben-eb/cssnano), [rucksack](https://www.rucksackcss.org/), [CSSNano](https://github.com/ben-eb/cssnano)
**JavaScript** | [Browserify](http://browserify.org), [Babel](http://babeljs.io/)
**Images** | [imagemin](https://www.npmjs.com/package/gulp-imagemin)
**Sprites** | [spritesmith](https://github.com/Ensighten/spritesmith)
**Fonts** | [iconfont](https://github.com/nfroidure/gulp-iconfont)
