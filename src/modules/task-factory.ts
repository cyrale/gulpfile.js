import process from "process";
import * as Undertaker from "undertaker";

import { parallel, series, task as gulpTask, watch } from "gulp";

import Browsersync from "../tasks/browsersync";
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
  private browserSync: Browsersync | undefined;
  private tasks: string[] = [];

  private superGlobalTasks: ITaskList = {};
  private orderedSuperGlobalTasks: {
    [name: string]: string[][];
  } = {};

  private globalTasks: IGlobalTaskList = {};
  private orderedGlobalTasks: string[][] = [];

  private availableTasks: IGenericSettings = {
    javascript: Javascript,
    pug: Pug,
    sass: Sass
  };

  private tasksGroupAndOrder: string[][] = [
    ["fonts", "sprites", "svgstore"],
    ["images"],
    ["sass", "javascript", "pug"],
    ["browsersync"]
  ];

  public createAllTasks(): void {
    const conf = Config.getInstance();

    // Initialize BrowserSync
    if (conf.settings.browsersync) {
      this.browserSync = new Browsersync(conf.settings.browsersync);

      this.stackTask(this.browserSync.start());
      this.stackTask(this.browserSync.watch());
    }

    Object.keys(conf.settings).forEach((task: string) => {
      const confTasks = conf.settings[task] as object;

      if (this.isValidTask(task)) {
        this.createTasks(task, confTasks);
      }
    });

    // TODO: initialize browserify first.

    this.createGlobalTasks();
    this.createSuperGlobalTasks();

    gulpTask(
      "default",
      series(
        this.orderedGlobalTasks.map((tasks: string[]) => {
          return parallel(tasks);
        })
      )
    );
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

  private createGlobalTasks(): void {
    // Sort tasks.
    this.tasks.forEach((task: string) => {
      const { type, name, step } = this.explodeTaskName(task);

      // Sort tasks by name.
      const sortedByName = `${type}:${name}`;
      this.pushGlobalTask("byName", sortedByName, task);

      // Sort tasks by step.
      const sortedByStep = `${type}:${step}`;
      this.pushGlobalTask("byStep", sortedByStep, task);

      // Sort tasks by type only.
      this.pushGlobalTask("byTypeOnly", type, sortedByName);
    });

    // Create tasks sorted by type and name.
    Object.keys(this.globalTasks.byName).forEach((taskName: string) => {
      this.globalTasks.byName[taskName].sort((itemA: string, itemB: string) => {
        const sortOrder = ["lint", "build", "watch"];
        const { step: stepA } = this.explodeTaskName(itemA);
        const { step: stepB } = this.explodeTaskName(itemB);

        return sortOrder.indexOf(stepA) - sortOrder.indexOf(stepB);
      });

      this.defineTask(taskName, this.globalTasks.byName[taskName]);
    });

    // Create tasks sorted by type and step.
    Object.keys(this.globalTasks.byStep).forEach((taskName: string) => {
      this.defineTask(taskName, this.globalTasks.byStep[taskName], "parallel");
    });

    // Create tasks sorted by type only.
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

  private createSuperGlobalTasks(): void {
    this.tasks.forEach((task: string) => {
      const { step } = this.explodeTaskName(task);

      this.pushTask(this.superGlobalTasks, step, task);
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
