import fs from "fs";
import favicon from "gulp-real-favicon";
import merge from "lodash/merge";
import path from "path";

import Task, { IBuildSettings, TaskCallback } from "./task";

/**
 * Get all needs for the favicon (different sizes, manifest... Based on https://realfavicongenerator.net).
 */
export default class Favicon extends Task {
  /**
   * Global task name.
   * @type {string}
   * @readonly
   */
  public static readonly taskName: string = "favicon";

  /**
   * Task constructor.
   *
   * @param {string} name
   * @param {object} settings
   */
  constructor(name: string, settings: object) {
    super(name, settings);

    // No need of linter.
    this._withLinter = false;

    const defaultSettings: {} = {
      design: {
        androidChrome: {
          assets: {
            legacyIcon: false,
            lowResolutionIcons: false,
          },
          manifest: {
            declared: true,
            display: "standalone",
            name: "",
            onConflict: "override",
            orientation: "notSet",
          },
          pictureAspect: "backgroundAndMargin",
          themeColor: "#ffffff",
        },
        desktopBrowser: {},
        ios: {
          assets: {
            declareOnlyDefaultIcon: true,
            ios6AndPriorIcons: false,
            ios7AndLaterIcons: false,
            precomposedIcons: false,
          },
          backgroundColor: "#ffffff",
          margin: "18%",
          pictureAspect: "backgroundAndMargin",
        },
        safariPinnedTab: {
          pictureAspect: "silhouette",
          themeColor: "#ffffff",
        },
        windows: {
          assets: {
            windows10Ie11EdgeTiles: {
              big: true,
              medium: true,
              rectangle: false,
              small: true,
            },
            windows80Ie10Tile: true,
          },
          backgroundColor: "#ffffff",
          onConflict: "override",
          pictureAspect: "noChange",
        },
      },
      iconsPath: "/",
      settings: {
        errorOnImageTooSmall: false,
        htmlCodeFile: false,
        readmeFile: false,
        scalingAlgorithm: "Mitchell",
        usePathAsIs: false,
      },
    };

    // 2 methods to define settings:
    // - simple: choose basic settings, there will be merged in all settings.
    // - complete: choose all settings used by https://realfavicongenerator.net
    if (
      this._settings.settings.name ||
      this._settings.settings.backgroundColor ||
      this._settings.settings.themeColor ||
      this._settings.settings.margin ||
      this._settings.settings.iconsPath
    ) {
      this._settings.settings = merge(defaultSettings, {
        design: {
          androidChrome: {
            manifest: {
              name: this._settings.settings.name || "",
            },
            themeColor: this._settings.settings.themeColor || "#ffffff",
          },
          ios: {
            backgroundColor: this._settings.settings.backgroundColor || "#ffffff",
            margin: this._settings.settings.margin || "18%",
          },
          safariPinnedTab: {
            themeColor: this._settings.settings.themeColor || "#ffffff",
          },
          windows: {
            backgroundColor: this._settings.settings.backgroundColor || "#ffffff",
          },
        },
        iconsPath: this._settings.settings.iconsPath || "/",
      });
    } else {
      this._settings.settings = merge(defaultSettings, this._settings.settings || {});
    }

    this._settings.settings.masterPicture = path.resolve(this._settings.cwd, this._settings.src);
    this._settings.settings.dest = path.resolve(this._settings.cwd, this._settings.dst);
    this._settings.settings.markupFile = path.join(this._settings.dst, "favicon-data.json");
  }

  /**
   * Method to add specific steps for the build.
   *
   * @param {NodeJS.ReadWriteStream} stream
   * @param {IBuildSettings} buildSettings
   * @param {TaskCallback} done
   * @return {NodeJS.ReadWriteStream}
   * @protected
   */
  protected _buildSpecific(
    stream: NodeJS.ReadWriteStream,
    buildSettings: IBuildSettings,
    done: TaskCallback
  ): NodeJS.ReadWriteStream {
    favicon.generateFavicon(this._settings.settings, () => {
      const markupFile = path.resolve(this._settings.cwd, this._settings.settings.markupFile);

      fs.readFile(markupFile, (err: NodeJS.ErrnoException | null, data: Buffer): void => {
        if (err) {
          throw err;
        }

        const decodedData = JSON.parse(data.toString());

        favicon.checkForUpdates(decodedData.version, (error: any): void => {
          if (error) {
            throw error;
          }
        });
      });

      done();
    });

    return stream;
  }
}
