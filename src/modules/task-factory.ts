import process from "process";

import { parallel, series, task as gulpTask } from "gulp";

import * as Undertaker from "undertaker";
import Javascript from "../tasks/javascript";
import Pug from "../tasks/pug";
import Sass from "../tasks/sass";
import Task, { TaskCallback } from "../tasks/task";
import Config, { IGenericSettings } from "./config";

interface ITaskNameElements {
  type: string;
  name: string;
  step: string;
}

type TaskErrorCallback = (done: TaskCallback) => void;

export default class TaskFactory {
  private tasks: string[] = [];

  private tasksByName: IGenericSettings = {};
  private tasksByStep: IGenericSettings = {};
  private tasksByTypeOnly: IGenericSettings = {};

  private availableTasks: IGenericSettings = {
    javascript: Javascript,
    pug: Pug,
    sass: Sass
  };

  private tasksGroupAndOrder = [
    ["fonts", "sprites", "svgstore"],
    ["images"],
    ["sass", "javascript", "pug"],
    ["browsersync"]
  ];

  public createTasks(task: string, tasks: IGenericSettings): string[] {
    Object.keys(tasks).forEach((name: string) => {
      const taskInstance = this.createTask(task, name, tasks[name]);

      this.stackTask(taskInstance.lint());
      this.stackTask(taskInstance.build());
      this.stackTask(taskInstance.watch());
    });

    return this.tasks;
  }

  public createGlobalTasks(tasks: string[]) {
    // Sort tasks.
    tasks.forEach((task: string) => {
      const { type, name, step } = this.explodeTaskName(task);

      // Sort tasks by name.
      const sortedByName = `${type}:${name}`;
      this.tasksByName[sortedByName] = this.tasksByName[sortedByName] || [];
      if (this.tasksByName[sortedByName].indexOf(task) < 0) {
        this.tasksByName[sortedByName].push(task);
      }

      // Sort tasks by step.
      const sortedByStep = `${type}:${step}`;
      this.tasksByStep[sortedByStep] = this.tasksByStep[sortedByStep] || [];
      if (this.tasksByStep[sortedByStep].indexOf(task) < 0) {
        this.tasksByStep[sortedByStep].push(task);
      }

      // Sort tasks by type only.
      this.tasksByTypeOnly[type] = this.tasksByTypeOnly[type] || [];
      if (this.tasksByTypeOnly[type].indexOf(sortedByName) < 0) {
        this.tasksByTypeOnly[type].push(sortedByName);
      }
    });

    // Create tasks sorted by type and name.
    Object.keys(this.tasksByName).forEach((taskName: string) => {
      this.tasksByName[taskName].sort((itemA: string, itemB: string) => {
        const sortOrder = ["lint", "build", "watch"];
        const { step: stepA } = this.explodeTaskName(itemA);
        const { step: stepB } = this.explodeTaskName(itemB);

        return sortOrder.indexOf(stepA) - sortOrder.indexOf(stepB);
      });

      this.defineTask(taskName, this.tasksByName[taskName]);
    });

    // Create tasks sorted by type and step.
    Object.keys(this.tasksByStep).forEach((taskName: string) => {
      this.defineTask(taskName, this.tasksByStep[taskName], "parallel");
    });

    // Create tasks sorted by type only.
    Object.keys(this.tasksByTypeOnly).forEach((taskName: string) => {
      this.defineTask(taskName, this.tasksByTypeOnly[taskName], "parallel");
    });

    // Sort and order global tasks.
    return this.tasksGroupAndOrder
      .map((taskNames: string[]) => {
        return taskNames
          .filter((taskName: string) => this.tasksByTypeOnly[taskName])
          .map((taskName: string) => {
            return taskName;
          });
      })
      .filter((taskNames: string[]) => taskNames.length > 0);
  }

  public createTask(task: string, name: string, settings: object): Sass | Pug | Javascript {
    if (this.availableTaskNames().indexOf(task) < 0) {
      throw new Error(`Unsupported task: ${task}.`);
    }

    const instance = Object.create(this.availableTasks[task].prototype);
    instance.constructor.apply(instance, [name, settings]);

    return instance;
  }

  public availableTaskNames() {
    return Object.keys(this.availableTasks);
  }

  public isValidTask(task: string) {
    return this.availableTaskNames().indexOf(task) >= 0;
  }

  protected stackTask(name: string | false): string[] {
    if (name !== false) {
      this.tasks.push(name);
    }

    return this.tasks;
  }

  private defineTask(taskName: string, tasks: Undertaker.Task[], type: string = "series") {
    const errorHandler = `${taskName}:error`;

    if (Config.getInstance().isBuildRun() && Config.getInstance().isCurrentRun(taskName)) {
      gulpTask(errorHandler, (done: TaskCallback): void => {
        done();

        if (Task.taskErrors.length > 0) {
          process.exit(1);
        }
      });
    }

    let task: Undertaker.TaskFunction = (done: TaskCallback) => done();

    if (type === "series" && Config.getInstance().isBuildRun() && Config.getInstance().isCurrentRun(taskName)) {
      task = series([...tasks, errorHandler]);
    } else if (type === "series") {
      task = series(tasks);
    } else if (
      type === "parallel" &&
      Config.getInstance().isBuildRun() &&
      Config.getInstance().isCurrentRun(taskName)
    ) {
      task = series(parallel(tasks), errorHandler);
    } else if (type === "parallel") {
      task = parallel(tasks);
    }

    if (task.name === "series" || task.name === "parallel") {
      gulpTask(taskName, task);
    }
  }

  private explodeTaskName(task: string): ITaskNameElements {
    const [type, name, step] = task.split(":");

    return {
      name,
      step,
      type
    };
  }
}
