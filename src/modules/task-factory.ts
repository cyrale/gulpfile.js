import Javascript from "../tasks/javascript";
import Sass from "../tasks/sass";

export default class TaskFactory {
  readonly availableTasks: {
    [name: string]: any;
  };

  constructor() {
    this.availableTasks = {
      javascript: Javascript,
      sass: Sass
    };
  }

  public createTask(task: string, name: string, settings: object): Sass | Javascript {
    if (this.availableTaskNames().indexOf(task) < 0) {
      throw new Error(`Unsupported task: ${task}.`);
    }

    let instance = Object.create(this.availableTasks[task].prototype);
    instance.constructor.apply(instance, [name, settings]);

    return instance;
  }

  public availableTaskNames() {
    return Object.keys(this.availableTasks);
  }
}
