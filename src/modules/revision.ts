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

  // public static styleRevision(): Transform {
  //   const styleExtensions: string[] = [ "css", "sass", "scss" ];
  //   const imageExtensions: string[] = [ "png", "jpeg", "jpg", "svg", "gif" ];
  //
  //   const files: any[] = [];
  //   const renames: any[] = [];
  //
  //   return through.obj(
  //     function(file: any, encoding: string, cb: TransformCallback): void {
  //       if (file.isNull()) {
  //         this.push(file);
  //         return cb();
  //       }
  //
  //       const fileExt = path.extname(file.path).slice(1);
  //       let skip: boolean = false;
  //
  //       if (file.revOrigPath) {
  //         renames.push({
  //           newName: file.base,
  //           newPath: path.normalize(path.relative(file.base, file.path)),
  //           originalName: file.revOrigBase,
  //           originalPath: path.normalize(
  //             path.relative(file.revOrigBase, file.revOrigPath)
  //           ),
  //         });
  //
  //         skip = !styleExtensions.includes(fileExt);
  //       }
  //
  //       if(!skip && [...styleExtensions, ...imageExtensions].includes(fileExt)) {
  //         files.push(file);
  //       } else {
  //         this.push(file);
  //       }
  //
  //       cb();
  //     },
  //     function(cb: TransformCallback): void {
  //       // console.log(files);
  //
  //       const imageFiles = files.filter((file: any): boolean => imageExtensions.includes(path.extname(file.path).slice(1)));
  //       const styleFiles = files.filter((file: any): boolean => styleExtensions.includes(path.extname(file.path).slice(1)));
  //
  //       imageFiles.forEach((file: any): void => {
  //         const filePath: path.ParsedPath = path.parse(file.path);
  //         const hash: string = crypto
  //           .createHash("sha1")
  //           .update(file.isStream() ? file.contents.toString() : file.contents)
  //           .digest("hex")
  //           .slice(0, 10);
  //
  //         console.log(filePath);
  //         const newName: string = `${filePath.base}?rev=${hash}`;
  //         const originalName: string = filePath.base;
  //         filePath.base = newName;
  //         const newPath: string = path.normalize(path.format(filePath)).split(/[?#]/)[0];
  //         const originalPath: string = file.path.split(/[?#]/)[0];
  //
  //         renames.push({
  //           newName,
  //           newPath,
  //           originalName,
  //           originalPath
  //         });
  //
  //         this.push({
  //           ...file, ...{
  //             originalName,
  //             path: newPath
  //           }
  //         });
  //       });
  //
  //       styleFiles.forEach((file: any): void => {
  //         let contents: string = file.contents.toString();
  //
  //         renames.forEach((renamed: any): void => {
  //           contents = contents
  //             .split(renamed.originalPath)
  //             .join(renamed.newPath)
  //             .split(renamed.originalName)
  //             .join(renamed.newName);
  //         });
  //
  //         file.contents = Buffer.from(contents);
  //         this.push(file);
  //       });
  //
  //       cb();
  //     }
  //   );
  // }
}
