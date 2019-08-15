import { parallel, series, task as gulpTask, watch } from "gulp";
import process from "process";
import Undertaker from "undertaker";

import Browserify from "../tasks/browserify";
import Browsersync from "../tasks/browsersync";
import Clean from "../tasks/clean";
import Favicon from "../tasks/favicon";
import Fonts from "../tasks/fonts";
import Images from "../tasks/images";
import Javascript from "../tasks/javascript";
import Pug from "../tasks/pug";
import Sass from "../tasks/sass";
import Sprites from "../tasks/sprites";
import SVGStore from "../tasks/svgstore";
import Task, { TaskCallback } from "../tasks/task";
import Webpack from "../tasks/webpack";
import Config, { IGenericSettings } from "./config";

type TaskRunner = Browserify | Fonts | Images | Javascript | Pug | Sass | Sprites | SVGStore | Webpack;

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
   * List of available and supported tasks.
   * @type {{[p: string]: Browserify | Favicon | Fonts | Images | Javascript | Pug | Sass | Sprites | SVGStore | Webpack}}
   * @private
   */
  private _availableTasks: IGenericSettings = {
    [Browserify.taskName]: Browserify,
    [Favicon.taskName]: Favicon,
    [Fonts.taskName]: Fonts,
    [Images.taskName]: Images,
    [Javascript.taskName]: Javascript,
    [Pug.taskName]: Pug,
    [Sass.taskName]: Sass,
    [Sprites.taskName]: Sprites,
    [SVGStore.taskName]: SVGStore,
    [Webpack.taskName]: Webpack,
  };

  /**
   * Tasks grouped by steps of execution.
   * @type {string[][]}
   * @private
   */
  private _tasksGroupAndOrder: string[][] = [
    [Clean.taskName],
    [Favicon.taskName, Fonts.taskName, Sprites.taskName, SVGStore.taskName],
    [Browserify.taskName, Images.taskName, Webpack.taskName],
    [Javascript.taskName, Pug.taskName, Sass.taskName],
    [Browsersync.taskName],
  ];

  /**
   * Create all tasks.
   */
  public createAllTasks(): void {
    const conf: Config = Config.getInstance();

    // Initialize BrowserSync.
    if (conf.settings.browsersync) {
      const browserSync: Browsersync = Browsersync.getInstance();

      this._pushTask(browserSync.start());
      this._pushTask(browserSync.watch());
    }

    // Initialize clean task.
    if (conf.settings.clean) {
      const clean: Clean = Clean.getInstance();

      this._pushTask(clean.start());
    }

    // Initialize other tasks.
    Object.keys(conf.settings).forEach((task: string): void => {
      const confTasks: {} = conf.settings[task] as {};

      if (this.isValidTask(task)) {
        this._createTasks(task, confTasks);
      }
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
   * @return {TaskRunner}
   */
  public createTask(task: string, name: string, settings: object): TaskRunner {
    if (this.availableTaskNames().indexOf(task) < 0) {
      throw new Error(`Unsupported task: ${task}.`);
    }

    return new this._availableTasks[task](name, settings);
  }

  /**
   * Get supported task names.
   *
   * @return {string[]}
   */
  public availableTaskNames(): string[] {
    return Object.keys(this._availableTasks);
  }

  /**
   * Check if a task is valid (exists in supported tasks).
   *
   * @param {string} taskName
   * @return {boolean}
   */
  public isValidTask(taskName: string): boolean {
    return this.availableTaskNames().indexOf(taskName) >= 0;
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

      if (type === Browsersync.taskName || type === Clean.taskName) {
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
    Object.keys(tasks).forEach((name: string): void => {
      const taskInstance: TaskRunner = this.createTask(task, name, tasks[name]);

      this._pushTask(taskInstance.lint());
      this._pushTask(taskInstance.build());
      this._pushTask(taskInstance.watch());
    });
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

        if (Task.taskErrors.length > 0) {
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
