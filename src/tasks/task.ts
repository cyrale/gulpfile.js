import { task as gulpTask, TaskFunction } from "gulp";

import Config, { Options as ConfigOptions } from "../libs/config";

interface TaskErrorDefinition {
  taskName: string;
  error: unknown;
  done?: TaskCallback;
}

export interface Options {
  name?: string;
  settings: ConfigOptions;
}

export type TaskCallback = (error?: unknown) => void;

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
   * Level to order task in execution pipeline.
   * @type {number}
   * @readonly
   */
  public static readonly taskOrder: number = 0;

  /**
   * List of errors.
   * @type {TaskErrorDefinition[]}
   */
  public static taskErrors: TaskErrorDefinition[] = [];

  /**
   * Check if current run is a build run.
   *
   * @return {boolean}
   * @protected
   */
  protected static _isBuildRun(): boolean {
    return Config.getInstance().isBuildRun();
  }

  /**
   * Check if a task is the current run.
   *
   * @param {string} taskName
   * @return {boolean}
   * @protected
   */
  protected static _isCurrentRun(taskName: string): boolean {
    return Config.getInstance().isCurrentRun(taskName);
  }

  /**
   * Name of the current task.
   * @type {string}
   * @protected
   */
  protected _name = "";

  /**
   * Current task settings.
   * @type {Options}
   * @protected
   */
  protected _settings: ConfigOptions = {};

  /**
   * Task constructor.
   *
   * @param {Options} options
   */
  public constructor(options: Options) {
    this._name = options.name || "";
    this._settings = options.settings || {};
  }

  protected _defineTask(step: string, task: TaskFunction): string {
    const taskName: string = this._taskName(step);

    gulpTask(taskName, task);

    return taskName;
  }

  /**
   * Build complete task name based on current task, name and step.
   *
   * @param {string} step
   * @return {string}
   * @protected
   */
  protected _taskName(step?: string): string {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const base: string = (this.constructor as any).taskName + (this._name ? `:${this._name}` : "");

    if (!step) {
      return base;
    }

    return `${base}:${step}`;
  }
}
