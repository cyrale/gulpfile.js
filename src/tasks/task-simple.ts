import Task from "./task";

/**
 * Task class to define gulp tasks.
 */
export default abstract class TaskSimple extends Task {
  public abstract start(): string;
}
