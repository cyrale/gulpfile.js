import log from "fancy-log";
import { parallel, series, task as gulpTask } from "gulp";
import map from "lodash/map";
import uniq from "lodash/uniq";
import process from "process";
import Undertaker from "undertaker";

import Task, { TaskCallback, Options as TaskOptions } from "../tasks/task";
import TaskExtended from "../tasks/task-extended";
import TaskSimple from "../tasks/task-simple";
import Config, { Options as ConfigOptions } from "./config";

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

interface ModuleClasses {
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
   * @return {unknown | undefined}
   */
  private _getUniqueInstanceOf(name: string): unknown | undefined {
    return this._uniqueInstances[name];
  }

  /**
   * List of used modules.
   * @type {ModuleClasses}
   * @private
   */
  private _modules: ModuleClasses = {};

  public static readonly moduleNames: string[] = [
    "browserify",
    "browsersync",
    "clean",
    "favicon",
    "fonts",
    "images",
    "javascript",
    "pug",
    "sass",
    "sprites",
    "svgstore",
    "typescript",
    "webpack",
  ];

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
  private _uniqueInstances: ModuleClasses = {};

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
   * @param {(string | string[])[]} tasks
   * @return {boolean}
   * @private
   */
  private static _removeEmptyArrays(tasks: (string | string[])[]): boolean {
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
    [name: string]: (string | string[])[][];
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

    // Load all modules.
    this._loadModules(conf.settings);

    // Sort tasks to always have simple ones on top.
    const allTasks: string[] = Object.keys(conf.settings).sort((taskA: string, taskB: string): number => {
      const isSimpleA: boolean = this._isTaskSimple(taskA);
      const isSimpleB: boolean = this._isTaskSimple(taskB);

      if (isSimpleA !== isSimpleB) {
        return isSimpleA && !isSimpleB ? -1 : 1;
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
   * @param {TaskOptions} settings
   * @return {Task}
   */
  public createTask(task: string, name: string, settings: TaskOptions): Task {
    if (!TaskFactory._isValidTask(task)) {
      throw new Error(`Unsupported task: ${task}.`);
    }

    const module: unknown = this._loadModule(task);

    let instance: Task;

    if (this._isTaskSimple(task)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      instance = new (module as any)({
        settings,
      });

      if (!this._uniqueInstances[task]) {
        this._uniqueInstances[task] = instance;
      }
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      instance = new (module as any)({
        name,
        settings,
        browsersync: this._getUniqueInstanceOf("browsersync"),
      });
    }
    return instance;
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

      if (this._isTaskSimple(type)) {
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
        this._defineTask(
          taskName,
          this._globalTasks.byStep[taskName],
          this._runInParallel(taskName) ? "parallel" : "series"
        );
      });
    }

    // Create tasks sorted by type only.
    if (this._globalTasks.byTypeOnly) {
      Object.keys(this._globalTasks.byTypeOnly).forEach((taskName: string): void => {
        this._defineTask(
          taskName,
          this._globalTasks.byTypeOnly[taskName],
          this._runInParallel(taskName) ? "parallel" : "series"
        );
      });

      // Sort and order global tasks.
      this._orderedGlobalTasks = this._tasksGroupAndOrder()
        .map((taskNames: string[]): string[] =>
          taskNames.filter((taskName: string): boolean => !!this._globalTasks.byTypeOnly[taskName])
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

    // Create super global tasks.
    Object.keys(this._superGlobalTasks).forEach((step: string): void => {
      console.log(step);
      // Sort and order super global tasks.
      this._orderedSuperGlobalTasks[step] = this._tasksGroupAndOrder()
        .map((taskNames: string[]): (string | string[])[] => {
          return taskNames
            .map((type: string): (string | string[])[] => {
              // Extract arrays of tasks of the type `type`.
              const currentTasks: string[] = this._superGlobalTasks[step].filter((taskName: string): boolean => {
                const { type: currentType } = TaskFactory.explodeTaskName(taskName);
                return type === currentType;
              });

              if (!this._isTaskSimple(type) && !this._runInParallel(type)) {
                return [currentTasks];
              }

              return currentTasks;
            })
            .reduce(
              // Merge all arrays.
              (acc: (string | string[])[], value: (string | string[])[]): (string | string[])[] => [...acc, ...value],
              []
            );
        })
        .filter(TaskFactory._removeEmptyArrays);

      // Define super global task.
      if (this._orderedSuperGlobalTasks[step].length > 0) {
        this._defineTask(
          step,
          this._orderedSuperGlobalTasks[step].map(
            (groups: (string | string[])[]): Undertaker.TaskFunction => {
              const tasks: Undertaker.Task[] = groups.map(
                (task: string | string[]): Undertaker.Task => {
                  if (typeof task === "string") {
                    return task;
                  }

                  return series(task);
                }
              );

              return parallel(tasks);
            }
          )
        );
      }
    });
  }

  /**
   * Create all tasks: lint, build and watch.
   *
   * @param {string} task
   * @param {ConfigOptions} tasks
   * @private
   */
  private _createTasks(task: string, tasks: ConfigOptions): void {
    const isSimple: boolean = this._isTaskSimple(task);
    const conf: Config = Config.getInstance();
    const { type: currentType, name: currentName, step: currentStep } = TaskFactory.explodeTaskName(conf.currentRun);

    // Keep only valid and current tasks (useless to initialize unused tasks).
    if (!TaskFactory._isValidTask(task) || (!TaskFactory._isGlobalTask() && task !== currentType)) {
      return;
    }

    if (isSimple && (currentStep === "" || currentStep === "watch")) {
      // Add simple tasks only for global or watch call.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const taskInstance: any = this.createTask(task, "", tasks as TaskOptions);

      this._pushTask(taskInstance.taskStart());
      this._pushTask(taskInstance.taskWatch());
    } else if (!isSimple) {
      // Add classic tasks.
      Object.keys(tasks).forEach((name: string): void => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const taskInstance: any = this.createTask(task, name, tasks[name] as TaskOptions);

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
    const orders: number[] = map(this._modules, (module: any): number => module.taskOrder);

    return uniq(orders.sort()).map((order: number): string[] =>
      Object.keys(this._modules).filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (task: string): boolean => (this._modules[task] as any).taskOrder === order
      )
    );
  }

  /**
   * Check if a task is a simple one.
   *
   * @param {string} taskName
   * @return {boolean}
   */
  private _isTaskSimple(taskName: string): boolean {
    const module: unknown = this._loadModule(taskName);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (module as any).prototype instanceof TaskSimple;
  }

  /**
   * Check if a task is valid (exists in supported tasks).
   *
   * @param {string} taskName
   * @return {boolean}
   */
  private static _isValidTask(taskName: string): boolean {
    return TaskFactory.moduleNames.indexOf(taskName) >= 0;
  }

  private _loadModules(settings: ConfigOptions): ModuleClasses {
    log("Loading modules...");

    Object.keys(settings).forEach((task: string): void => {
      this._loadModule(task);
    });

    log("Modules loaded");

    return this._modules;
  }

  private _loadModule(taskName: string): unknown | void {
    if (!this._modules[taskName]) {
      const module: unknown = TaskFactory._requireModule(taskName);

      if (!module) {
        return;
      }

      this._modules[taskName] = module;
    }

    return this._modules[taskName];
  }

  private static _requireModule(taskName: string): unknown | void {
    if (!TaskFactory._isValidTask(taskName)) {
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { default: module } = require(`../tasks/${taskName}`);

    return module;
  }

  private _runInParallel(taskName: string): boolean {
    const { type } = TaskFactory.explodeTaskName(taskName);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const module: any = this._loadModule(type);

    return module.runInParallel;
  }
}
