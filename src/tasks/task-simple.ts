import Task, { TaskOptions, TaskCallback } from "./task";

/**
 * Task class to define gulp tasks.
 */
export default abstract class TaskSimple extends Task {
  /**
   * Task constructor.
   *
   * @param {TaskOptions} options
   */
  public constructor(options: TaskOptions) {
    super(options);
  }

  public taskStart(): string {
    return this._defineTask("start", this._start.bind(this));
  }

  public taskWatch(): string {
    if (!this._watch) {
      return "";
    }

    return this._defineTask("watch", this._watch.bind(this));
  }

  protected abstract _start(done: TaskCallback): void;

  protected _watch?(done: TaskCallback): void;
}
