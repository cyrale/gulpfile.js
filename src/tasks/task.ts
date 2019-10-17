import { IGenericSettings } from "../modules/config";
import { IRevisionOptions } from "../modules/revision";
import Size from "../modules/size";

export interface IGulpOptions {
  cwd: string;
  read?: boolean;
  sourcemaps?: true | string;
}

export interface IBuildSettings {
  options: IGulpOptions;
  revision: IRevisionOptions;
  size: Size;
  taskName: string;
}

export type TaskCallback = (error?: any) => void;

/**
 * Task class to define gulp tasks.
 */
export default abstract class Task {
  /**
   * Global task name.
   * @type {string}
   * @readonly
   */
  public static readonly taskName: string = "";

  /**
   * Current task settings.
   * @type {IGenericSettings}
   * @protected
   */
  protected _settings: IGenericSettings = {};

  /**
   * Task constructor.
   *
   * @param {object} settings
   */
  public constructor(settings: object) {
    this._settings = settings;
  }

  /**
   * Build complete task name based on current task, name and step.
   *
   * @param {string} step
   * @return {string}
   * @protected
   */
  protected _taskName(step?: string): string {
    if (!step) {
      return (this.constructor as any).taskName;
    }

    return `${(this.constructor as any).taskName}:${step}`;
  }
}
