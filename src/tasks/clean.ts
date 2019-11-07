import del from "del";

import Config from "../libs/config";
import TaskSimple from "./task-simple";
import { TaskCallback } from "./task";

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
   *
   * @return {string}
   */
  protected _start(done: TaskCallback): void {
    Config.chdir(this._settings.cwd);
    del(this._settings.files as string[]).then(() => {
      done();
    });
  }
}
