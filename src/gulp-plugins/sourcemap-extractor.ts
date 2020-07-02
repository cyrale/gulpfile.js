import parseDataURL from "data-urls";
import PluginError from "plugin-error";
import { Transform } from "stream";
import through, { TransformCallback } from "through2";
import File, { BufferFile } from "vinyl";

const commentSearch = /(?:\/\/[@#][\s]*sourceMappingURL=([^\s'"]+)[\s]*$)|(?:\/\*[@#][\s]*sourceMappingURL=([^\s*'"]+)[\s]*(?:\*\/)[\s]*$)/gm;

/**
 * Extract inline sourcemap and integrate to file definition.
 *
 * @returns {Transform}
 */
export default (): Transform => {
  return through.obj(function (file: File, encoding: string, cb: TransformCallback): void {
    if (file.isNull()) {
      return cb(null, file);
    }

    if (file.isStream()) {
      return cb(new PluginError("sourcemap-extractor", "Stream not supported"));
    }

    if (!file.contents) {
      return cb(null, file);
    }

    const contents: string = (file as BufferFile).contents.toString();

    // Search last sourcemap.
    let match: RegExpExecArray | null;
    let lastMatch: RegExpExecArray | null = null;

    while ((match = commentSearch.exec(contents))) lastMatch = match;

    if (lastMatch === null) {
      return cb(null, file);
    }

    // Remove inline sourcemap.
    file.contents = Buffer.from(contents.replace(lastMatch[0], ""));

    // Integrate sourcemap to file.
    if (!file.sourceMap) {
      file.sourceMap = JSON.parse(parseDataURL(lastMatch[1]).body.toString());
      file.sourceMap.file = file.relative;
    }

    cb(null, file);
  });
};
