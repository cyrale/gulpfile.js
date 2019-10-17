import del from "del";
import { task as gulpTask } from "gulp";

import Config from "../modules/config";
import TaskSimple from "./task-simple";

/**
 * Clean task to delete files and directories.
 */
export default class Clean extends TaskSimple {
  /**
   * Global task name.
   * @type {string}
   * @readonly
   */
  public static readonly taskName: string = "clean";

  /**
   * Level to order task in execution pipeline.
   * @type {number}
   * @readonly
   */
  public static readonly taskOrder: number = 10;

  /**
   * Start clean. Delete files and directories.
   * @return {string}
   */
  public start(): string {
    const taskName: string = this._taskName("start");

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
