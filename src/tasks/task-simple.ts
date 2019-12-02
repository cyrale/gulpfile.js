import Task, { Options as TaskOptions, TaskCallback } from "./task";

/**
 * Task class to define simple Gulp tasks that run once and globally.
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

  /**
   * Register start task that run once.
   *
   * @returns {string}
   */
  public taskStart(): string {
    return this._defineTask("start", this._start.bind(this));
  }

  /**
   * Register watch task that watch change on files and run lint and build tasks.
   *
   * @return {string}
   */
  public taskWatch(): string {
    if (!this._watch) {
      return "";
    }

    return this._defineTask("watch", this._watch.bind(this));
  }

  /**
   * Start task.
   *
   * @param {TaskCallback} done
   * @protected
   */
  protected abstract _start(done: TaskCallback): void;

  /**
   * Watch task.
   *
   * @param {TaskCallback} done
   * @protected
   */
  protected _watch?(done: TaskCallback): void;
}
