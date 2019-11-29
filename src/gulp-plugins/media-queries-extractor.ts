import cleanUpString from "clean-up-string";
import CSSMQPacker from "css-mqpacker";
import path from "path";
import perfectionist from "perfectionist";
import PluginError from "plugin-error";
import postcss, { AtRule, ContainerBase, LazyResult, Result } from "postcss";
import { Transform } from "stream";
import through, { TransformCallback } from "through2";
import File, { BufferFile } from "vinyl";
import applySourceMap from "vinyl-sourcemaps-apply";

import mediaQueriesExtract from "../postcss/media-queries-extract";

const listMediaQueries = (file: BufferFile): LazyResult => {
  file.mediaQueriesList = [];

  // Extract all media queries.
  return postcss([
    CSSMQPacker(),
    mediaQueriesExtract(),
    postcss.plugin("media-queries-list", (): ((css: ContainerBase) => void) => {
      return (css: ContainerBase): void => {
        css.walkAtRules("media", (node: AtRule): void => {
          file.mediaQueriesList.push(node.params);
        });
      };
    }),
  ]).process(file.contents.toString(), {
    from: file.path,
    to: file.path,
    // Generate a separate source map for gulp-sourcemaps
    map: file.sourceMap ? { annotation: false } : false,
  });
};

const splitMediaQueries = (file: BufferFile, stream: Transform): void => {
  const extname: string = path.extname(file.basename);
  const basename: string = path.basename(file.basename, extname);

  for (const query of file.mediaQueriesList) {
    postcss([mediaQueriesExtract({ query }), perfectionist({ indentSize: 2 })])
      .process(file.contents.toString(), {
        from: file.path,
        to: file.path,
        // Generate a separate source map for gulp-sourcemaps
        map: file.sourceMap ? { annotation: false } : false,
      })
      .then((result: Result): void => {
        const mediaFile: BufferFile = file.clone();
        const mediaBasename: string = basename + "." + cleanUpString(query) + extname;
        const mediaPath: string = path.join(path.dirname(mediaFile.path), mediaBasename);

        mediaFile.contents = Buffer.from(result.css);

        // Apply source map to the chain.
        if (mediaFile.sourceMap) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const map: any = result.map.toJSON();

          map.file = mediaFile.relative;
          map.sources = [].map.call(map.sources, (source: string): string =>
            path.join(path.dirname(mediaFile.relative), source)
          );

          applySourceMap(mediaFile, map);
        }

        // Rename file.
        mediaFile.basename = mediaBasename;
        mediaFile.path = mediaPath;

        if (mediaFile.sourceMap) {
          mediaFile.sourceMap.file = mediaFile.relative;
        }

        stream.push(mediaFile);
      });
  }

  delete file.mediaQueriesList;
};

export default (): Transform => {
  return through.obj(function(file: File, encoding: string, cb: TransformCallback): void {
    if (file.isNull()) {
      return cb(null, file);
    }

    if (file.isStream()) {
      return cb(new PluginError("media-queries-extractor", "Stream not supported"));
    }

    if (!file.contents) {
      return cb(null, file);
    }

    listMediaQueries(file as BufferFile).then(() => {
      splitMediaQueries(file as BufferFile, this);
      cb();
    });
  });
};
