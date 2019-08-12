import fs from "fs";
import favicon from "gulp-real-favicon";
import merge from "lodash/merge";
import path from "path";

import Task, { IBuildSettings, TaskCallback } from "./task";

export default class Favicon extends Task {
  public static readonly taskName: string = "favicon";

  constructor(name: string, settings: object) {
    super(name, settings);

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

  protected _buildSpecific(
    stream: NodeJS.ReadWriteStream,
    buildSettings?: IBuildSettings,
    done?: TaskCallback
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

      if (done) {
        done();
      }
    });

    return stream;
  }
}
