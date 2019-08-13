import crypto from "crypto";
import merge from "lodash/merge";
import path from "path";
import PluginError from "plugin-error";
import { Transform } from "stream";
import through, { TransformCallback } from "through2";
import Vinyl from "vinyl";
import vinylFile from "vinyl-file";

import Config from "./config";
import TaskFactory from "./task-factory";

enum Hash {
  MD5 = "md5",
  SHA1 = "sha1",
  SHA256 = "sha256",
}

interface IRevisionManifest {
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

interface IRevisionDefaultOption {
  manifest?: string;
}

export interface IRevisionOptions extends IRevisionDefaultOption {
  cwd: string;
  taskName: string;
}

export default class Revision {
  public static getHash(taskName: string, fileName: string, hash: Hash = Hash.SHA1): string | false {
    const { type, name } = TaskFactory.explodeTaskName(taskName);

    if (!Revision.isActive()) {
      return false;
    }

    try {
      return Revision._manifest[type][name][fileName][hash];
    } catch (e) {
      // Do nothing!
    }

    return false;
  }

  public static getHashRevision(taskName: string, fileName: string, hash: Hash = Hash.SHA1): string | false {
    const hashStr = Revision.getHash(taskName, fileName, hash);
    return hashStr === false ? hashStr : hashStr.slice(0, 10);
  }

  public static isActive() {
    const config = Config.getInstance();
    return !!config.settings.revision;
  }

  public static manifest(options: IRevisionOptions): Transform {
    const defaultOptions: IRevisionDefaultOption = {
      manifest: "rev-manifest.json",
    };

    options = merge(defaultOptions, options);

    if (!Revision.isActive()) {
      return through.obj();
    }

    return through.obj(
      (file: any, encoding: string, cb: TransformCallback): void => {
        const { type, name } = TaskFactory.explodeTaskName(options.taskName);

        if (file.isNull() || file.isStream() || path.extname(file.path) === ".map") {
          return cb();
        }

        const origPath = file.path;
        const origBase = file.base;

        const revBase: string = path.resolve(file.cwd, origBase).replace(/\\/g, "/");
        const revPath: string = path.resolve(file.cwd, origPath).replace(/\\/g, "/");

        let revRelFile: string = "";

        if (!revPath.startsWith(revBase)) {
          revRelFile = revPath;
        } else {
          revRelFile = revPath.slice(revBase.length);

          if (revRelFile[0] === "/") {
            revRelFile = revRelFile.slice(1);
          }
        }

        const origRelFile = path.join(path.dirname(revRelFile), path.basename(file.path)).replace(/\\/g, "/");

        Revision._manifest = merge(Revision._manifest, {
          [type]: {
            [name]: {
              [origRelFile]: {
                md5: Revision._hash(file.contents, Hash.MD5),
                revRelFile,
                sha1: Revision._hash(file.contents, Hash.SHA1),
                sha256: Revision._hash(file.contents, Hash.SHA256),
              },
            },
          },
        });

        cb();
      },
      function(cb: TransformCallback): void {
        const manifestFile = options.manifest as string;

        vinylFile
          .read(manifestFile, options)
          .catch(
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

            try {
              if (manifest.contents !== null) {
                oldManifest = JSON.parse(manifest.contents.toString());
              }
            } catch (e) {
              // Do nothing!
            }

            Revision._manifest = merge(oldManifest, Revision._manifest);

            manifest.contents = Buffer.from(JSON.stringify(Revision._manifest, null, "  "));
            this.push(manifest);
            cb();
          })
          .catch(cb);
      }
    );
  }

  private static _manifest: IRevisionManifest = {};

  private static _hash(contents: string | Buffer, hash: Hash) {
    if (typeof contents !== "string" && !Buffer.isBuffer(contents)) {
      throw new PluginError("revision", "Expected a Buffer or string");
    }

    return crypto
      .createHash(hash)
      .update(contents)
      .digest("hex");
  }
}
