import crypto from "crypto";
import fs from "fs";
import isEmpty from "lodash/isEmpty";
import merge from "lodash/merge";
import path from "path";
import PluginError from "plugin-error";
import { Transform } from "stream";
import through, { TransformCallback } from "through2";
import Vinyl from "vinyl";
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

interface HashData {
  contents: string | Buffer;
  origRelFile: string;
  revRelFile: string;
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

interface RevisionDefaultOption {
  manifest?: string;
}

export interface RevisionOptions extends RevisionDefaultOption {
  callback?: SimpleRevisionCallback;
  cwd: string;
  dst: string;
  taskName: string;
}

export type SimpleRevisionCallback = (data: HashData, additionalInformation: DefaultObject) => DefaultObject;
export type RevisionCallback = (file: unknown, additionalData: DefaultObject) => void;

/**
 * Collect hashes from build files.
 */
export default class Revision {
  /**
   * Get hash for a file in a task.
   *
   * @param {string} taskName
   * @param {string} fileName
   * @param {Hash} hash
   * @return {string | false}
   */
  public static getHash(taskName: string, fileName: string, hash: Hash = Hash.SHA1): string | false {
    const { type, name } = explodeTaskName(taskName);

    // If revision is deactivated, return false.
    if (!Revision.isActive()) {
      return false;
    }

    if (path.isAbsolute(fileName)) {
      return Revision._hashFile(fileName, hash);
    }

    // Try to search and return hash.
    try {
      return Revision._manifest[type][name][fileName][hash];
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
   * @return {string | false}
   */
  public static getHashRevision(taskName: string, fileName: string, hash: Hash = Hash.SHA1): string | false {
    const hashStr = Revision.getHash(taskName, fileName, hash);
    return hashStr === false ? hashStr : hashStr.slice(0, 10);
  }

  /**
   * Check if revision is activated.
   *
   * @return {boolean}
   */
  public static isActive(): boolean {
    const config = Config.getInstance();
    return !!config.options.revision;
  }

  /**
   * Collect hashes from build files.
   *
   * @param {RevisionOptions} options
   * @param {SimpleRevisionCallback} callback
   * @return {Transform}
   */
  public static manifest(options: RevisionOptions, callback?: SimpleRevisionCallback): Transform {
    const defaultOptions: RevisionDefaultOption = {
      manifest: "rev-manifest.json",
    };

    options = merge(defaultOptions, options);

    // Do nothing if revision is deactivated.
    if (!Revision.isActive()) {
      return through.obj();
    }

    return through.obj(
      (file: Vinyl, encoding: string, cb: TransformCallback): void => {
        // Collect files and calculate hash from the stream.

        // Exclude null, stream and MAP files, only Buffer works.
        if (file.isNull() || file.isStream() || path.extname(file.path) === ".map") {
          return cb();
        }

        // Get relative path and name of the file.
        const revBase: string = path.resolve(file.cwd, file.base).replace(/\\/g, "/");
        const revPath: string = path.resolve(file.cwd, file.path).replace(/\\/g, "/");

        let revRelFile = "";

        if (!revPath.startsWith(revBase)) {
          revRelFile = revPath;
        } else {
          revRelFile = revPath.slice(revBase.length);

          if (revRelFile[0] === "/") {
            revRelFile = revRelFile.slice(1);
          }
        }

        const origRelFile = path.join(path.dirname(revRelFile), path.basename(file.path)).replace(/\\/g, "/");
        revRelFile = path.join(options.dst, revRelFile);

        // Insert file and calculated hashes into the manifest.
        Revision._pushHash(
          {
            contents: file.contents ? file.contents.toString() : "",
            origRelFile,
            revRelFile,
            taskName: options.taskName,
          },
          callback
        );

        cb();
      },
      function(cb: TransformCallback): void {
        // Merge and write manifest.
        const manifestFile = options.manifest as string;

        // Read manifest file.
        vinylFile
          .read(manifestFile, options)
          .catch(
            // File not exists, create new one.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (error: any): Vinyl => {
              if (error.code === "ENOENT") {
                return new Vinyl({
                  path: manifestFile,
                });
              }

              throw error;
            }
          )
          .then((manifest: Vinyl): void => {
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
            Revision._manifest = Revision._sortObjectByKeys(merge(oldManifest, Revision._manifest)) as RevisionManifest;

            // Send manifest in stream.
            manifest.contents = Buffer.from(JSON.stringify(Revision._manifest, null, "  "));
            this.push(manifest);

            cb();
          })
          .catch(cb);
      }
    );
  }

  /**
   * Collect data relative to files in stream.
   * @param {RevisionCallback} callback
   * @return {Transform}
   */
  public static additionalData(callback: RevisionCallback): Transform {
    return through.obj((file: unknown, encoding: string, cb: TransformCallback): void => {
      callback(file, Revision._additionalData);

      cb(null, file);
    });
  }

  /**
   * Push arbitrary file in manifest.
   *
   * @param {string} fileName
   * @param {RevisionOptions} options
   */
  public static pushAndWrite(fileName: string, options: RevisionOptions): void {
    if (!Revision.isActive() || !path.isAbsolute(fileName)) {
      return;
    }

    const origRelFile = path.basename(fileName);
    const revRelFile = path.join(options.dst, origRelFile);

    fs.readFile(fileName, (error: NodeJS.ErrnoException | null, data: Buffer): void => {
      if (error) {
        throw error;
      }

      Revision._pushHash({
        contents: data,
        origRelFile,
        revRelFile,
        taskName: options.taskName,
      });

      fs.writeFile(
        path.resolve(options.cwd, options.manifest as string),
        JSON.stringify(Revision._manifest, null, "  "),
        (): void => {}
      );
    });
  }

  /**
   * Collect data to add to manifest.
   * @type {DefaultObject}
   * @private
   */
  private static _additionalData: DefaultObject = {};

  /**
   * Collection of hashes.
   * @type {RevisionManifest}
   * @private
   */
  private static _manifest: RevisionManifest = {};

  /**
   * Calculate the hash from a string or a Buffer.
   *
   * @param {string | Buffer} contents
   * @param {Hash} hash
   * @return {string}
   * @private
   */
  private static _hash(contents: string | Buffer, hash: Hash): string {
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
  private static _hashFile(fileName: string, hash: Hash): string {
    return Revision._hash(fs.readFileSync(fileName), hash);
  }

  /**
   * Push a new file in manifest and calculate the hash of this file.
   * Optionally, add data relative to this file via callback.
   *
   * @param {HashData} data
   * @param {SimpleRevisionCallback} callback
   * @private
   */
  private static _pushHash(data: HashData, callback?: SimpleRevisionCallback): void {
    const { type, name } = explodeTaskName(data.taskName);
    let newData = {
      [type]: {
        [name]: {
          [data.origRelFile]: {
            md5: Revision._hash(data.contents, Hash.MD5),
            revRelFile: data.revRelFile,
            sha1: Revision._hash(data.contents, Hash.SHA1),
            sha256: Revision._hash(data.contents, Hash.SHA256),
          },
        },
      },
    };

    if (callback) {
      const additionalData = callback(data, this._additionalData);

      if (!isEmpty(additionalData)) {
        newData = merge(newData, {
          [type]: {
            [name]: {
              [data.origRelFile]: {
                data: additionalData,
              },
            },
          },
        });
      }
    }

    Revision._manifest = Revision._sortObjectByKeys(merge(Revision._manifest, newData)) as RevisionManifest;
  }

  /**
   * Sort object by keys.
   *
   * @param {DefaultObject} object
   * @return {DefaultObject}
   * @private
   */
  private static _sortObjectByKeys(object: DefaultObject): DefaultObject {
    const result: DefaultObject = {};

    Object.keys(object)
      .sort()
      .forEach((key: string) => {
        result[key] =
          typeof object[key] === "object" ? Revision._sortObjectByKeys(object[key] as DefaultObject) : object[key];
      });

    return result;
  }
}
