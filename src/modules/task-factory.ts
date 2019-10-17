import log from "fancy-log";
import { parallel, series, task as gulpTask, watch } from "gulp";
import process from "process";
import Undertaker from "undertaker";

import { TaskCallback } from "../tasks/task";
import TaskExtended from "../tasks/task-extended";
import Config, { IGenericSettings } from "./config";
import { module as taskModule, modules as taskModules, names as availableTaskNames } from "./modules";

export interface ITaskNameElements {
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

const modules: {
  [name: string]: any;
} = {};

const uniqueInstances: {
  [name: string]: any;
} = {};

/**
 * Factory that create all tasks.
 */
export default class TaskFactory {
  /**
   * Explode name separated by two points in 3 elements.
   *
   * @param {string} task
   * @return {ITaskNameElements}
   */
  public static explodeTaskName(task: string): ITaskNameElements {
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

  public static getUniqueInstanceOf(name: string): any {
    return uniqueInstances[name];
  }

  /**
   * Sort order for tasks.
   * @type {string[]}
   * @private
   */
  private static readonly _sortOrder: string[] = ["lint", "build", "watch"];

  /**
   * Add a task in a list.
   *
   * @param {ITaskList} list
   * @param {string} key
   * @param {string} task
   * @return {ITaskList}
   * @private
   */
  private static _pushTask(list: ITaskList, key: string, task: string): ITaskList {
    list[key] = list[key] || [];
    if (list[key].indexOf(task) < 0) {
      list[key].push(task);
    }

    return list;
  }

  /**
   * Check if an array is empty. Used in filters.
   *
   * @param {string[]} tasks
   * @return {boolean}
   * @private
   */
  private static _removeEmptyArrays(tasks: string[]): boolean {
    return tasks.length > 0;
  }

  /**
   * List of final tasks.
   * @type {string[]}
   * @private
   */
  private _tasks: string[] = [];

  /**
   * List of super global tasks (lint, build, watch).
   * @type {ITaskList}
   * @private
   */
  private _superGlobalTasks: ITaskList = {};

  /**
   * Ordered super global tasks group by step (lint, build, watch).
   * @type {{}}
   * @private
   */
  private _orderedSuperGlobalTasks: {
    [name: string]: string[][];
  } = {};

  /**
   * Global tasks grouped by step, name and type.
   * @type {IGlobalTaskList}
   * @private
   */
  private _globalTasks: IGlobalTaskList = {};

  /**
   * Existing tasks grouped by steps of execution.
   * @type {string[][]}
   * @private
   */
  private _orderedGlobalTasks: string[][] = [];

  /**
   * Tasks grouped by steps of execution.
   * @type {string[][]}
   * @private
   */
  private _tasksGroupAndOrder: string[][] = [
    ["clean"],
    ["favicon", "fonts", "sprites", "svgstore"],
    ["browserify", "images", "webpack"],
    ["javascript", "pug", "sass"],
    ["browsersync"],
  ];

  /**
   * Create all tasks.
   */
  public createAllTasks(): void {
    const conf: Config = Config.getInstance();

    // Initialize other tasks.
    Object.keys(conf.settings).forEach((task: string): void => {
      const confTasks: {} = conf.settings[task] as {};
      this._createTasks(task, confTasks);
    });

    if (this._tasks.length > 0) {
      // Create global and super global tasks.
      this._createGlobalTasks();
      this._createSuperGlobalTasks();

      // Default task.
      gulpTask(
        "default",
        series(
          this._orderedGlobalTasks.map((tasks: string[]): string | Undertaker.TaskFunction =>
            tasks.length === 1 ? tasks[0] : parallel(tasks)
          )
        )
      );
    }
  }

  /**
   * Create a task.
   *
   * @param {string} task
   * @param {string} name
   * @param {object} settings
   * @return {any}
   */
  public createTask(task: string, name: string, settings: object): any {
    if (availableTaskNames.indexOf(task) < 0) {
      throw new Error(`Unsupported task: ${task}.`);
    }

    if (typeof modules[task] === "undefined") {
      const { default: module } = require(taskModule(task));
      modules[task] = module;
    }

    if (task === "browsersync" || task === "clean") {
      if (typeof uniqueInstances[task] === "undefined") {
        uniqueInstances[task] = new modules[task](settings);
      }

      return uniqueInstances[task];
    }

    return new modules[task](name, settings);
  }

  /**
   * Check if a task is valid (exists in supported tasks).
   *
   * @param {string} taskName
   * @return {boolean}
   */
  public isValidTask(taskName: string): boolean {
    return availableTaskNames.indexOf(taskName) >= 0;
  }

  /**
   * Create global tasks grouped by step, name and type.
   *
   * @private
   */
  private _createGlobalTasks(): void {
    // Group tasks by step, name and type.
    this._tasks.forEach((task: string): void => {
      const { type, name, step } = TaskFactory.explodeTaskName(task);

      if (type === "browsersync" || type === "clean") {
        this._pushGlobalTask("byTypeOnly", type, task);
      } else {
        // Sort tasks by name.
        const sortedByName: string = `${type}:${name}`;
        this._pushGlobalTask("byName", sortedByName, task);

        // Sort tasks by step.
        const sortedByStep: string = `${type}:${step}`;
        this._pushGlobalTask("byStep", sortedByStep, task);

        // Sort tasks by type only.
        this._pushGlobalTask("byTypeOnly", type, sortedByName);
      }
    });

    // Create tasks sorted by type and name.
    if (this._globalTasks.byName) {
      Object.keys(this._globalTasks.byName).forEach((taskName: string): void => {
        this._globalTasks.byName[taskName].sort((itemA: string, itemB: string): number => {
          const { step: stepA } = TaskFactory.explodeTaskName(itemA);
          const { step: stepB } = TaskFactory.explodeTaskName(itemB);

          return TaskFactory._sortOrder.indexOf(stepA) - TaskFactory._sortOrder.indexOf(stepB);
        });

        this._defineTask(taskName, this._globalTasks.byName[taskName]);
      });
    }

    // Create tasks sorted by type and step.
    if (this._globalTasks.byStep) {
      Object.keys(this._globalTasks.byStep).forEach((taskName: string): void => {
        this._defineTask(taskName, this._globalTasks.byStep[taskName], "parallel");
      });
    }

    // Create tasks sorted by type only.
    if (this._globalTasks.byTypeOnly) {
      Object.keys(this._globalTasks.byTypeOnly).forEach((taskName: string): void => {
        this._defineTask(taskName, this._globalTasks.byTypeOnly[taskName], "parallel");
      });

      // Sort and order global tasks.
      this._orderedGlobalTasks = this._tasksGroupAndOrder
        .map((taskNames: string[]): string[] =>
          taskNames.filter((taskName: string): boolean => typeof this._globalTasks.byTypeOnly[taskName] !== "undefined")
        )
        .filter(TaskFactory._removeEmptyArrays);
    }
  }

  /**
   * Create super global tasks (lint, build, watch).
   *
   * @private
   */
  private _createSuperGlobalTasks(): void {
    // Collect and group tasks.
    this._tasks.forEach((task: string): void => {
      const { step } = TaskFactory.explodeTaskName(task);

      if (TaskFactory._sortOrder.indexOf(step) >= 0) {
        TaskFactory._pushTask(this._superGlobalTasks, step, task);
      } else if (step === "start") {
        TaskFactory._pushTask(this._superGlobalTasks, "watch", task);
      }
    });

    Object.keys(this._superGlobalTasks).forEach((step: string): void => {
      // Sort and order super global tasks.
      this._orderedSuperGlobalTasks[step] = this._tasksGroupAndOrder
        .map((taskNames: string[]): string[] =>
          taskNames
            .map((taskName: string): string[] =>
              this._superGlobalTasks[step].filter((task: string): boolean => {
                const { type } = TaskFactory.explodeTaskName(task);
                return type === taskName;
              })
            )
            .reduce((acc: string[] = [], value: string[]) => [...acc, ...value])
        )
        .filter(TaskFactory._removeEmptyArrays);

      // Define super global task.
      this._defineTask(
        step,
        this._orderedSuperGlobalTasks[step].map(
          (taskNames: string[]): Undertaker.TaskFunction => {
            return parallel(taskNames);
          }
        )
      );
    });
  }

  /**
   * Create all tasks: lint, build and watch.
   *
   * @param {string} task
   * @param {IGenericSettings} tasks
   * @private
   */
  private _createTasks(task: string, tasks: IGenericSettings): void {
    if (!this.isValidTask(task)) {
      return;
    }

    if ((taskModules[task] as any).simple) {
      const taskInstance: any = this.createTask(task, "", tasks);

      this._pushTask(taskInstance.start());

      if (typeof (taskInstance as any).watch === "function") {
        this._pushTask((taskInstance as any).watch());
      }
    } else {
      Object.keys(tasks).forEach((name: string): void => {
        const taskInstance: any = this.createTask(task, name, tasks[name]);

        this._pushTask(taskInstance.lint());
        this._pushTask(taskInstance.build());
        this._pushTask(taskInstance.watch());
      });
    }
  }

  /**
   * Create gulp task.
   *
   * @param {string} taskName
   * @param {Undertaker.Task[]} tasks
   * @param {string} type
   * @private
   */
  private _defineTask(taskName: string, tasks: Undertaker.Task[], type: string = "series"): void {
    const errorHandler: string = `${taskName}:error`;

    // Define gulp task to catch error in build run to exit with error code.
    if (Config.getInstance().isBuildRun() && Config.getInstance().isCurrentRun(taskName)) {
      gulpTask(errorHandler, (done: TaskCallback): void => {
        done();

        if (TaskExtended.taskErrors.length > 0) {
          process.exit(1);
        }
      });
    }

    let task: Undertaker.TaskFunction = (done: TaskCallback) => done();

    if (Config.getInstance().isBuildRun() && Config.getInstance().isCurrentRun(taskName)) {
      // Add error handler to the tasks.
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

    // Define gulp task.
    if (task.name === "series" || task.name === "parallel") {
      gulpTask(taskName, task);
    }
  }

  /**
   * Add task to list of global tasks.
   *
   * @param {string} sort
   * @param {string} key
   * @param {string} task
   * @return {IGlobalTaskList}
   * @private
   */
  private _pushGlobalTask(sort: string, key: string, task: string): IGlobalTaskList {
    this._globalTasks[sort] = this._globalTasks[sort] || {};
    TaskFactory._pushTask(this._globalTasks[sort], key, task);

    return this._globalTasks;
  }

  /**
   * Add task to the list.
   *
   * @param {string | false} name
   * @return {string[]}
   * @private
   */
  private _pushTask(name: string | false): string[] {
    if (name !== false) {
      this._tasks.push(name);
    }

    return this._tasks;
  }
}
