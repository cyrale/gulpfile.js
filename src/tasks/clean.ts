import del from "del";
import { task as gulpTask } from "gulp";
import merge from "lodash/merge";

import Config, { IGenericSettings } from "../modules/config";

/**
 * Clean task to delete files and directories.
 */
export default class Clean {
  /**
   * Global task name.
   * @type {string}
   * @readonly
   */
  public static readonly taskName: string = "clean";

  /**
   * Get Clean instance.
   *
   * @return {Clean}
   */
  public static getInstance(): Clean {
    if (!Clean._instance) {
      const conf: Config = Config.getInstance();
      Clean._instance = new Clean(merge({ cwd: conf.options.cwd }, conf.settings.clean));
    }

    return Clean._instance;
  }

  /**
   * Clean instance.
   * @type {Clean}
   * @private
   */
  private static _instance: Clean;

  /**
   * Clean settings.
   * @type {IGenericSettings}
   * @private
   * @readonly
   */
  private readonly _settings: IGenericSettings;

  /**
   * Clean constructor.
   * @param {IGenericSettings} settings
   */
  private constructor(settings: IGenericSettings) {
    this._settings = settings;
  }

  /**
   * Start clean. Delete files and directories.
   * @return {string}
   */
  public start(): string {
    const taskName: string = `${Clean.taskName}:start`;

    gulpTask(
      taskName,
      (): Promise<string[]> => {
        Config.chdir(this._settings.cwd);
        return del(this._settings.files as string[]);
      }
    );

    return taskName;
  }
}
