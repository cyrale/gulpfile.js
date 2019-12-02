import crypto from "crypto";
import fs from "fs";
import isEmpty from "lodash/isEmpty";
import merge from "lodash/merge";
import path from "path";
import PluginError from "plugin-error";
import { Transform } from "stream";
import through, { TransformCallback } from "through2";
import File from "vinyl";
import vinylFile from "vinyl-file";

import Config from "../libs/config";
import { explodeTaskName } from "../libs/utils";

enum Hash {
  MD5 = "md5",
  SHA1 = "sha1",
  SHA256 = "sha256",
}

export interface DefaultObject {
  [name: string]: unknown;
}

interface DefaultOption {
  dst: string;
}

interface HashData {
  taskName: string;
  origRelFile: string;
  revRelFile: string;
  contents: string | Buffer;
  data?: DefaultObject;
}

interface Options extends DefaultOption {
  cwd: string;
  taskName: string;
}

interface RevisionManifest {
  [type: string]: {
    [name: string]: {
      [origRelFile: string]: {
        revRelFile: string;
        [Hash.MD5]: string;
        [Hash.SHA1]: string;
        [Hash.SHA256]: string;
      };
    };
  };
}

/**
 * Collection of hashes.
 * @type {RevisionManifest}
 * @private
 */
let _manifest: RevisionManifest = {};

/**
 * Calculate the hash from a string or a Buffer.
 *
 * @param {string | Buffer} contents
 * @param {Hash} hash
 * @return {string}
 * @private
 */
function _hash(contents: string | Buffer, hash: Hash): string {
  if (typeof contents !== "string" && !Buffer.isBuffer(contents)) {
    throw new PluginError("revision", "Expected a Buffer or string");
  }

  return crypto
    .createHash(hash)
    .update(contents)
    .digest("hex");
}

/**
 * Calculate the hash from a file with its name.
 *
 * @param {string} fileName
 * @param {Hash} hash
 * @return {string}
 * @private
 */
function _hashFile(fileName: string, hash: Hash): string {
  return _hash(fs.readFileSync(fileName), hash);
}

/**
 * Push a new file in manifest and calculate the hash of this file.
 *
 * @param {HashData} data
 * @private
 */
function _pushHash(data: HashData): void {
  const { type, name } = explodeTaskName(data.taskName);
  let newData = {
    [type]: {
      [name]: {
        [data.origRelFile]: {
          md5: _hash(data.contents, Hash.MD5),
          revRelFile: data.revRelFile,
          sha1: _hash(data.contents, Hash.SHA1),
          sha256: _hash(data.contents, Hash.SHA256),
        },
      },
    },
  };

  if (!isEmpty(data.data)) {
    newData = merge(newData, {
      [type]: {
        [name]: {
          [data.origRelFile]: {
            data: data.data,
          },
        },
      },
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-use-before-define
  _manifest = _sortObjectByKeys(merge(_manifest, newData)) as RevisionManifest;
}

/**
 * Sort object by keys.
 *
 * @param {DefaultObject} object
 * @return {DefaultObject}
 * @private
 */
function _sortObjectByKeys(object: DefaultObject): DefaultObject {
  const result: DefaultObject = {};

  for (const key of Object.keys(object).sort()) {
    result[key] = typeof object[key] === "object" ? _sortObjectByKeys(object[key] as DefaultObject) : object[key];
  }

  return result;
}

/**
 * Get hash for a file in a task.
 *
 * @param {string} taskName
 * @param {string} fileName
 * @param {Hash} hash
 * @return {string | boolean}
 */
export function getHash(taskName: string, fileName: string, hash: Hash = Hash.SHA1): string | false {
  const { type, name } = explodeTaskName(taskName);

  // If revision is deactivated, return false.
  // eslint-disable-next-line @typescript-eslint/no-use-before-define
  if (!isActive()) {
    return false;
  }

  if (path.isAbsolute(fileName)) {
    return _hashFile(fileName, hash);
  }

  // Try to search and return hash.
  try {
    return _manifest[type][name][fileName][hash];
  } catch (e) {
    // Do nothing!
  }

  return false;
}

/**
 * Get hash for a file in a task to use in URL parameters (only the first 10 characters).
 *
 * @param {string} taskName
 * @param {string} fileName
 * @param {Hash} hash
 * @return {string | boolean}
 */
export function getHashRevision(taskName: string, fileName: string, hash: Hash = Hash.SHA1): string | false {
  const hashStr = getHash(taskName, fileName, hash);
  return hashStr === false ? hashStr : hashStr.slice(0, 10);
}

/**
 * Check if revision is activated.
 *
 * @return {boolean}
 */
export function isActive(): boolean {
  const config = Config.getInstance();
  return !!config.options.revision;
}

/**
 * Push arbitrary file in manifest.
 *
 * @param {string} fileName
 * @param {Options} options
 */
export function pushAndWrite(fileName: string, options: Options): void {
  if (!isActive() || !path.isAbsolute(fileName)) {
    return;
  }

  // Get relative path and name of the file.
  const revPath: string = fileName.replace(/\\/g, "/");
  const revBase: string = path.dirname(fileName).replace(/\\/g, "/");

  // Get relative path between file and revision file.
  const origRelFile: string = path
    .join(path.relative(options.cwd, revBase), path.basename(revPath))
    .replace(/\\/g, "/");
  const revRelFile: string = path
    .relative(path.dirname(path.join(options.cwd, options.dst)), revPath)
    .replace(/\\/g, "/");

  fs.readFile(fileName, (error: NodeJS.ErrnoException | null, data: Buffer): void => {
    if (error) {
      throw error;
    }

    _pushHash({
      taskName: options.taskName,
      origRelFile,
      revRelFile,
      contents: data,
    });

    fs.writeFile(path.resolve(options.cwd, options.dst), JSON.stringify(_manifest, null, "  "), (): void => {});
  });
}

/**
 * Collect hashes from build files.
 *
 * @param {Options} options
 * @return {Transform}
 */
export default (options: Options): Transform => {
  const defaultOptions: DefaultOption = {
    dst: "rev-manifest.json",
  };

  options = merge(defaultOptions, options);

  // Do nothing if revision is deactivated.
  if (!isActive()) {
    return through.obj();
  }

  return through.obj(
    (file: File, encoding: string, cb: TransformCallback): void => {
      // Collect files and calculate hash from the stream.

      if (file.isNull()) {
        return cb();
      }

      if (file.isStream()) {
        return cb(new PluginError("revision", "Stream not supported"));
      }

      // Exclude MAP files.
      if (path.extname(file.path) === ".map") {
        return cb();
      }

      // Get relative path and name of the file.
      const revBase: string = path.resolve(file.cwd, file.base).replace(/\\/g, "/");
      const revPath: string = path.resolve(file.cwd, file.path).replace(/\\/g, "/");

      // Get relative path between file and revision file.
      const origRelFile: string = path
        .join(path.relative(file.cwd, revBase), path.basename(revPath))
        .replace(/\\/g, "/");
      const revRelFile: string = path
        .relative(path.dirname(path.join(options.cwd, options.dst)), revPath)
        .replace(/\\/g, "/");

      // Insert file and calculated hashes into the manifest.
      _pushHash({
        taskName: options.taskName,
        origRelFile,
        revRelFile,
        contents: file.contents ? file.contents.toString() : "",
        data: file.revisionData || {},
      });

      cb();
    },
    function(cb: TransformCallback): void {
      // Merge and write manifest.
      const manifestFile = options.dst;

      // Read manifest file.
      vinylFile
        .read(manifestFile, options)
        .catch(
          // File not exists, create new one.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (error: any): File => {
            if (error.code === "ENOENT") {
              return new File({
                path: manifestFile,
              });
            }

            throw error;
          }
        )
        .then((manifest: File): void => {
          let oldManifest = {};

          // Read manifest file.
          try {
            if (manifest.contents !== null) {
              oldManifest = JSON.parse(manifest.contents.toString());
            }
          } catch (e) {
            // Do nothing!
          }

          // Merge memory and file. Sort it by keys to improve reading and file versioning.
          _manifest = _sortObjectByKeys(merge(oldManifest, _manifest)) as RevisionManifest;

          // Send manifest in stream.
          manifest.contents = Buffer.from(JSON.stringify(_manifest, null, "  "));
          this.push(manifest);

          cb();
        })
        .catch(cb);
    }
  );
};
