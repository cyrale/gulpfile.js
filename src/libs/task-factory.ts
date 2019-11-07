import { parallel, series, task as gulpTask } from "gulp";
import map from "lodash/map";
import uniq from "lodash/uniq";
import process from "process";
import Undertaker from "undertaker";

import Task, { TaskCallback, TaskOptions } from "../tasks/task";
import TaskExtended from "../tasks/task-extended";
import Config, { Options } from "./config";
import { module as taskModule, modules as taskModules, names as availableTaskNames } from "./modules";

export interface TaskNameElements {
  type: string;
  name: string;
  step: string;
}

interface TaskList {
  [name: string]: string[];
}

interface GlobalTaskList {
  [name: string]: TaskList;
}

interface ModuleInstances {
  [name: string]: unknown;
}

/**
 * Factory that create all tasks.
 */
export default class TaskFactory {
  /**
   * Explode name separated by two points in 3 elements.
   *
   * @param {string} task
   * @return {TaskNameElements}
   */
  public static explodeTaskName(task: string): TaskNameElements {
    let [type = "", name = "", step = ""] = task.split(":");

    if (TaskFactory._sortOrder.indexOf(type) >= 0 || type === "start") {
      step = type;
      type = "";
    } else if (TaskFactory._sortOrder.indexOf(name) >= 0 || name === "start") {
      step = name;
      name = "";
    }

    return {
      name,
      step,
      type,
    };
  }

  /**
   * Get unique instance of simple module.
   *
   * @param {string} name
   * @return {any}
   */
  public static getUniqueInstanceOf(name: string): unknown {
    return TaskFactory._uniqueInstances[name];
  }

  /**
   * List of used modules.
   * @type {ModuleInstances}
   * @private
   */
  private static _modules: ModuleInstances = {};

  /**
   * Sort order for tasks.
   * @type {string[]}
   * @private
   */
  private static readonly _sortOrder: string[] = ["lint", "build", "watch"];

  /**
   * List of unique instance for simple modules.
   * @type {{}}
   * @private
   */
  private static _uniqueInstances: ModuleInstances = {};

  /**
   * Check if current task is a global task.
   *
   * @return {boolean}
   * @private
   */
  private static _isGlobalTask(): boolean {
    const conf: Config = Config.getInstance();
    const { type, step } = TaskFactory.explodeTaskName(conf.currentRun);

    return type === "default" || (type === "" && TaskFactory._sortOrder.indexOf(step) >= 0);
  }

  /**
   * Add a task in a list.
   *
   * @param {TaskList} list
   * @param {string} key
   * @param {string} task
   * @return {TaskList}
   * @private
   */
  private static _pushTask(list: TaskList, key: string, task: string): TaskList {
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
   * @type {TaskList}
   * @private
   */
  private _superGlobalTasks: TaskList = {};

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
   * @type {GlobalTaskList}
   * @private
   */
  private _globalTasks: GlobalTaskList = {};

  /**
   * Existing tasks grouped by steps of execution.
   * @type {string[][]}
   * @private
   */
  private _orderedGlobalTasks: string[][] = [];

  /**
   * Create all tasks.
   */
  public createAllTasks(): void {
    const conf: Config = Config.getInstance();

    // Sort tasks to always have simple ones on top.
    const allTasks: string[] = Object.keys(conf.settings).sort((taskA: string, taskB: string): number => {
      if (taskModules[taskA].simple !== taskModules[taskB].simple) {
        return taskModules[taskA].simple && !taskModules[taskB].simple ? -1 : 1;
      }

      return taskA < taskB ? -1 : taskA > taskB ? 1 : 0;
    });

    // Initialize all tasks.
    allTasks.forEach((task: string): void => {
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
   * @return {Task}
   */
  public createTask(task: string, name: string, settings: Options): Task {
    if (!this.isValidTask(task)) {
      throw new Error(`Unsupported task: ${task}.`);
    }

    if (typeof TaskFactory._modules[task] === "undefined") {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { default: module } = require(taskModule(task));
      TaskFactory._modules[task] = module;
    }

    const options: TaskOptions = {
      name,
      settings,
    };

    if (this.isSimpleTask(task)) {
      delete options.name;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const instance: any = new (TaskFactory._modules[task] as any)(options);

    if (this.isSimpleTask(task) && typeof TaskFactory._uniqueInstances[task] === "undefined") {
      TaskFactory._uniqueInstances[task] = instance;
    }

    return instance;
  }

  /**
   * Check if a task is a simple task.
   *
   * @param {string} taskName
   * @return {boolean}
   */
  public isSimpleTask(taskName: string): boolean {
    return this.isValidTask(taskName) && taskModules[taskName].simple;
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

      if (this.isSimpleTask(type)) {
        this._pushGlobalTask("byTypeOnly", type, task);
      } else {
        // Sort tasks by name.
        const sortedByName = `${type}:${name}`;
        this._pushGlobalTask("byName", sortedByName, task);

        // Sort tasks by step.
        const sortedByStep = `${type}:${step}`;
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
      this._orderedGlobalTasks = this._tasksGroupAndOrder()
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
      const { type, step } = TaskFactory.explodeTaskName(task);

      if (TaskFactory._sortOrder.indexOf(step) >= 0) {
        TaskFactory._pushTask(this._superGlobalTasks, step, task);
      } else if (step === "start" && type === "clean") {
        TaskFactory._pushTask(this._superGlobalTasks, "build", task);
      } else if (step === "start") {
        TaskFactory._pushTask(this._superGlobalTasks, "watch", task);
      }
    });

    Object.keys(this._superGlobalTasks).forEach((step: string): void => {
      // Sort and order super global tasks.
      this._orderedSuperGlobalTasks[step] = this._tasksGroupAndOrder()
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
   * @param {Options} tasks
   * @private
   */
  private _createTasks(task: string, tasks: Options): void {
    const simpleModule: boolean = this.isSimpleTask(task);
    const conf: Config = Config.getInstance();
    const { type: currentType, name: currentName, step: currentStep } = TaskFactory.explodeTaskName(conf.currentRun);

    // Keep only valid and current tasks (useless to initialize unused tasks).
    if (!this.isValidTask(task) || (!TaskFactory._isGlobalTask() && task !== currentType)) {
      return;
    }

    if (simpleModule && (currentStep === "" || currentStep === "watch")) {
      // Add simple tasks only for global or watch call.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const taskInstance: any = this.createTask(task, "", tasks);

      this._pushTask(taskInstance.taskStart());
      this._pushTask(taskInstance.taskWatch());
    } else if (!simpleModule) {
      // Add classic tasks.
      Object.keys(tasks).forEach((name: string): void => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const taskInstance: any = this.createTask(task, name, tasks[name] as Options);

        // Keep only current tasks (useless to initialize unused tasks).
        if (currentName !== "" && currentName !== name) {
          return;
        }

        // Add lint tasks only for global, lint or watch call.
        if (currentStep === "" || currentStep === "lint" || currentStep === "watch") {
          this._pushTask(taskInstance.taskLint());
        }

        // Add lint tasks only for global, build or watch call.
        if (currentStep === "" || currentStep === "build" || currentStep === "watch") {
          this._pushTask(taskInstance.taskBuild());
        }

        // Add lint tasks only for global or watch call.
        if (currentStep === "" || currentStep === "watch") {
          this._pushTask(taskInstance.taskWatch());
        }
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
  private _defineTask(taskName: string, tasks: Undertaker.Task[], type = "series"): void {
    const errorHandler = `${taskName}:error`;

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
      let tasksWithHandler: Undertaker.Task[] = [];

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
   * @return {GlobalTaskList}
   * @private
   */
  private _pushGlobalTask(sort: string, key: string, task: string): GlobalTaskList {
    this._globalTasks[sort] = this._globalTasks[sort] || {};
    TaskFactory._pushTask(this._globalTasks[sort], key, task);

    return this._globalTasks;
  }

  /**
   * Add task to the list.
   *
   * @param {string} name
   * @return {string[]}
   * @private
   */
  private _pushTask(name: string): string[] {
    if (name !== "") {
      this._tasks.push(name);
    }

    return this._tasks;
  }

  /**
   * Tasks grouped by steps of execution.
   *
   * @return {string[][]}
   * @private
   */
  private _tasksGroupAndOrder(): string[][] {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orders: number[] = map(TaskFactory._modules, (module: any): number => module.taskOrder);

    return uniq(orders.sort()).map((order: number): string[] =>
      Object.keys(TaskFactory._modules).filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (task: string): boolean => (TaskFactory._modules[task] as any).taskOrder === order
      )
    );
  }
}
