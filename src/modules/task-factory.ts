import process from "process";
import * as Undertaker from "undertaker";

import { parallel, series, task as gulpTask, watch } from "gulp";

import Browserify from "../tasks/browserify";
import Browsersync from "../tasks/browsersync";
import Images from "../tasks/images";
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

interface ITaskList {
  [name: string]: string[];
}

interface IGlobalTaskList {
  [name: string]: ITaskList;
}

export default class TaskFactory {
  private static sortOrder = ["lint", "build", "watch"];

  private tasks: string[] = [];

  private superGlobalTasks: ITaskList = {};
  private orderedSuperGlobalTasks: {
    [name: string]: string[][];
  } = {};

  private globalTasks: IGlobalTaskList = {};
  private orderedGlobalTasks: string[][] = [];

  private availableTasks: IGenericSettings = {
    [Browserify.taskName]: Browserify,
    [Javascript.taskName]: Javascript,
    [Images.taskName]: Images,
    [Pug.taskName]: Pug,
    [Sass.taskName]: Sass,
  };

  private tasksGroupAndOrder: string[][] = [
    // ["fonts", "sprites", "svgstore"],
    [Images.taskName],
    [Browserify.taskName],
    [Sass.taskName, Javascript.taskName, Pug.taskName],
    [Browsersync.taskName],
  ];

  public createAllTasks(): void {
    const conf = Config.getInstance();

    // Initialize BrowserSync.
    const browserSync = Browsersync.getInstance();

    if (conf.settings.browsersync) {
      this.stackTask(browserSync.start());
      this.stackTask(browserSync.watch());
    }

    // Initialize other tasks.
    Object.keys(conf.settings).forEach((task: string) => {
      const confTasks = conf.settings[task] as object;

      if (this.isValidTask(task)) {
        this.createTasks(task, confTasks);
      }
    });

    if (this.tasks.length > 0) {
      this.createGlobalTasks();
      this.createSuperGlobalTasks();

      gulpTask(
        "default",
        series(this.orderedGlobalTasks.map((tasks: string[]) => (tasks.length === 1 ? tasks[0] : parallel(tasks))))
      );
    }
  }

  public createTask(task: string, name: string, settings: object): Javascript | Pug | Sass {
    if (this.availableTaskNames().indexOf(task) < 0) {
      throw new Error(`Unsupported task: ${task}.`);
    }

    return new this.availableTasks[task](name, settings);
  }

  public availableTaskNames(): string[] {
    return Object.keys(this.availableTasks);
  }

  public isValidTask(task: string): boolean {
    return this.availableTaskNames().indexOf(task) >= 0;
  }

  private createGlobalTasks(): void {
    // Sort tasks.
    this.tasks.forEach((task: string): void => {
      const { type, name, step } = this.explodeTaskName(task);

      if (type === Browsersync.taskName) {
        this.pushGlobalTask("byTypeOnly", type, task);
      } else {
        // Sort tasks by name.
        const sortedByName = `${type}:${name}`;
        this.pushGlobalTask("byName", sortedByName, task);

        // Sort tasks by step.
        const sortedByStep = `${type}:${step}`;
        this.pushGlobalTask("byStep", sortedByStep, task);

        // Sort tasks by type only.
        this.pushGlobalTask("byTypeOnly", type, sortedByName);
      }
    });

    // Create tasks sorted by type and name.
    if (this.globalTasks.byName) {
      Object.keys(this.globalTasks.byName).forEach((taskName: string) => {
        this.globalTasks.byName[taskName].sort((itemA: string, itemB: string) => {
          const { step: stepA } = this.explodeTaskName(itemA);
          const { step: stepB } = this.explodeTaskName(itemB);

          return TaskFactory.sortOrder.indexOf(stepA) - TaskFactory.sortOrder.indexOf(stepB);
        });

        this.defineTask(taskName, this.globalTasks.byName[taskName]);
      });
    }

    // Create tasks sorted by type and step.
    if (this.globalTasks.byStep) {
      Object.keys(this.globalTasks.byStep).forEach((taskName: string) => {
        this.defineTask(taskName, this.globalTasks.byStep[taskName], "parallel");
      });
    }

    // Create tasks sorted by type only.
    if (this.globalTasks.byTypeOnly) {
      Object.keys(this.globalTasks.byTypeOnly).forEach((taskName: string) => {
        this.defineTask(taskName, this.globalTasks.byTypeOnly[taskName], "parallel");
      });

      // Sort and order global tasks.
      this.orderedGlobalTasks = this.tasksGroupAndOrder
        .map((taskNames: string[]) =>
          taskNames.filter((taskName: string) => typeof this.globalTasks.byTypeOnly[taskName] !== "undefined")
        )
        .filter(this.removeEmptyArrays);
    }
  }

  private createSuperGlobalTasks(): void {
    this.tasks.forEach((task: string) => {
      const { step } = this.explodeTaskName(task);

      if (TaskFactory.sortOrder.indexOf(step) >= 0) {
        this.pushTask(this.superGlobalTasks, step, task);
      } else if (step === "start") {
        this.pushTask(this.superGlobalTasks, "watch", task);
      }
    });

    // Sort and order super global tasks.
    Object.keys(this.superGlobalTasks).forEach((step: string): void => {
      this.orderedSuperGlobalTasks[step] = this.tasksGroupAndOrder
        .map((taskNames: string[]): string[] =>
          taskNames
            .map(taskName =>
              this.superGlobalTasks[step].filter((task: string): boolean => {
                const { type } = this.explodeTaskName(task);
                return type === taskName;
              })
            )
            .reduce(this.mergeArrays)
        )
        .filter(this.removeEmptyArrays);

      this.defineTask(
        step,
        this.orderedSuperGlobalTasks[step].map((taskNames: string[]) => {
          return parallel(taskNames);
        })
      );
    });
  }

  private createTasks(task: string, tasks: IGenericSettings): void {
    Object.keys(tasks).forEach((name: string) => {
      const taskInstance = this.createTask(task, name, tasks[name]);

      this.stackTask(taskInstance.lint());
      this.stackTask(taskInstance.build());
      this.stackTask(taskInstance.watch());
    });
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

    if (Config.getInstance().isBuildRun() && Config.getInstance().isCurrentRun(taskName)) {
      let tasksWithHandler: any[] = [];

      if (type === "series") {
        tasksWithHandler = [...tasks, errorHandler];
      } else if (type === "parallel") {
        tasksWithHandler = [parallel(tasks), errorHandler];
      }

      if (tasksWithHandler.length) {
        task = series(tasksWithHandler);
      }
    } else if (type === "series") {
      task = series(tasks);
    } else if (type === "parallel") {
      task = parallel(tasks);
    }

    if (task.name === "series" || task.name === "parallel") {
      gulpTask(taskName, task);
    }
  }

  private explodeTaskName(task: string): ITaskNameElements {
    const [type] = task.split(":");
    let [, name, step] = task.split(":");

    if (typeof step === "undefined") {
      step = name;
      name = "";
    }

    return {
      name,
      step,
      type,
    };
  }

  private mergeArrays(acc: string[] = [], tasks: string[]): string[] {
    return [...acc, ...tasks];
  }

  private pushGlobalTask(sort: string, key: string, task: string): IGlobalTaskList {
    this.globalTasks[sort] = this.globalTasks[sort] || {};
    this.pushTask(this.globalTasks[sort], key, task);

    return this.globalTasks;
  }

  private pushTask(list: ITaskList, key: string, task: string): ITaskList {
    list[key] = list[key] || [];
    if (list[key].indexOf(task) < 0) {
      list[key].push(task);
    }

    return list;
  }

  private removeEmptyArrays(tasks: string[]): boolean {
    return tasks.length > 0;
  }

  private stackTask(name: string | false): string[] {
    if (name !== false) {
      this.tasks.push(name);
    }

    return this.tasks;
  }
}
