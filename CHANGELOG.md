# gulpfile.js changelog

## 3.2.3

### Improvement

- Fix Browsersync to watch correctly external files.

## 3.2.2

### Improvement

- Update dependencies to the latest versions.

### Breaking changes

- `gulp-imagemin` replace jpegtran by mozjpeg.

## 3.2.1

- Update dependencies to the latest versions.

## 3.2.0

### New

- A block could be defined as critical in SASS files by using `@critical { ... }`.
- Image could be converted to WebP by adding `webp: true` to settings of tasks.
- Lint task exits now with error code, useful in CI/CD context.
- New flags to deactivate favicon and lint tasks: `--no-favicon` and `--no-lint`.
- Sourcemaps works now! Add `--sourcemaps` or `--sourcemap-files` to the command line.
- New `typescript` tasks to package TypeScript files.

### Improvement

- Update dependencies to the latest versions.
- Remove and replace packages to have the least possible.
- Load only necessary modules and display the progression.
- Replace `node-sass` by `dart-sass` to take advantage of the latest updates.
- Sort files when sizes were displayed.
- Replace deprecated UglifyJS by Terser.
- Replace deprecated TSLint by ESLint.
- Webpack works when more than one task is defined.

### Breaking changes

- `critical: this` is not longer propagate to its children (it works only in main file), it was replace by `@critical`
rule.

## 3.1.0

### New

- Display sizes of generated files in console. This could be deactivated by
adding the following to global settings or in each task:
```yaml
sizes:
  normal: false
  gzipped: false
```
- **Experimental**: Add media queries for CSS files in `revision`.

## 3.0.0

### New

- The directory where `gulpconfig.yml` is the current working directory where
you could put configuration files like `.babelrc`, `.browserslistrc`,
`.eslintrc`...
- Discreetly introduce in previous version, `svgstore` is officially in this
version. You could combine SVG files in One.
- Browserify is now manage by it's own tasks.
- New `webpack` tasks to package javascript files.
- New `clean` task to delete directories and files before other tasks run.
- **Experimental** `revision` that build a JSON file with all generated files
and some hashes (MD5, SHA1 and SHA256) sort by tasks. This could be used in URL
parameters as cache buster.
- Build tasks now exit on error with an error code equal to 1, that mean you
can use it in CI/CD process.

### Breaking changes

- `javascript` tasks **no longer use** `browserify`. It's only a concatenation
task with Babel.
- In `sass` tasks, default sort for media queries is "mobile" instead of desktop.
- Remove `name` settings on `fonts` tasks.
- Data for `pug` tasks is no longer merged between global and task settings.
