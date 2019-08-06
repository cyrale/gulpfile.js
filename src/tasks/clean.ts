import del from "del";
import { task as gulpTask } from "gulp";
import merge from "lodash/merge";

import Config, { IGenericSettings } from "../modules/config";

export default class Clean {
  public static readonly taskName: string = "clean";

  public static getInstance(): Clean {
    if (!Clean._instance) {
      const conf: Config = Config.getInstance();
      Clean._instance = new Clean(merge({ cwd: conf.options.cwd }, conf.settings.clean));
    }

    return Clean._instance;
  }

  private static _instance: Clean;

  private readonly _task: string;
  private readonly _settings: IGenericSettings;

  private constructor(settings: {}) {
    this._task = Clean.taskName;
    this._settings = settings;
  }

  public start(): string {
    const taskName: string = `${this._task}:start`;

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
