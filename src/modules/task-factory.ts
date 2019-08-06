import { parallel, series, task as gulpTask, watch } from "gulp";
import process from "process";
import * as Undertaker from "undertaker";

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
import Config, { IGenericSettings } from "./config";

type TaskRunner = Browserify | Fonts | Images | Javascript | Pug | Sass | Sprites | SVGStore;

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
  private static readonly _sortOrder: string[] = ["lint", "build", "watch"];

  private static _explodeTaskName(task: string): ITaskNameElements {
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

  private static _mergeArrays(acc: string[] = [], tasks: string[]): string[] {
    return [...acc, ...tasks];
  }

  private static _pushTask(list: ITaskList, key: string, task: string): ITaskList {
    list[key] = list[key] || [];
    if (list[key].indexOf(task) < 0) {
      list[key].push(task);
    }

    return list;
  }

  private static _removeEmptyArrays(tasks: string[]): boolean {
    return tasks.length > 0;
  }

  private _tasks: string[] = [];

  private _superGlobalTasks: ITaskList = {};
  private _orderedSuperGlobalTasks: {
    [name: string]: string[][];
  } = {};

  private _globalTasks: IGlobalTaskList = {};
  private _orderedGlobalTasks: string[][] = [];

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
  };

  private _tasksGroupAndOrder: string[][] = [
    [Clean.taskName],
    [Favicon.taskName, Fonts.taskName, Sprites.taskName, SVGStore.taskName],
    [Images.taskName],
    [Browserify.taskName],
    [Sass.taskName, Javascript.taskName, Pug.taskName],
    [Browsersync.taskName],
  ];

  public createAllTasks(): void {
    const conf: Config = Config.getInstance();

    // Initialize BrowserSync.
    if (conf.settings.browsersync) {
      const browserSync: Browsersync = Browsersync.getInstance();

      this._stackTask(browserSync.start());
      this._stackTask(browserSync.watch());
    }

    // Initialize clean task.
    if (conf.settings.clean) {
      const clean: Clean = Clean.getInstance();

      this._stackTask(clean.start());
    }

    // Initialize other tasks.
    Object.keys(conf.settings).forEach((task: string): void => {
      const confTasks: {} = conf.settings[task] as {};

      if (this.isValidTask(task)) {
        this._createTasks(task, confTasks);
      }
    });

    if (this._tasks.length > 0) {
      this._createGlobalTasks();
      this._createSuperGlobalTasks();

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

  public createTask(task: string, name: string, settings: object): TaskRunner {
    if (this.availableTaskNames().indexOf(task) < 0) {
      throw new Error(`Unsupported task: ${task}.`);
    }

    return new this._availableTasks[task](name, settings);
  }

  public availableTaskNames(): string[] {
    return Object.keys(this._availableTasks);
  }

  public isValidTask(task: string): boolean {
    return this.availableTaskNames().indexOf(task) >= 0;
  }

  private _createGlobalTasks(): void {
    // Sort tasks.
    this._tasks.forEach((task: string): void => {
      const { type, name, step } = TaskFactory._explodeTaskName(task);

      if (type === Browsersync.taskName) {
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
          const { step: stepA } = TaskFactory._explodeTaskName(itemA);
          const { step: stepB } = TaskFactory._explodeTaskName(itemB);

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

  private _createSuperGlobalTasks(): void {
    this._tasks.forEach((task: string): void => {
      const { step } = TaskFactory._explodeTaskName(task);

      if (TaskFactory._sortOrder.indexOf(step) >= 0) {
        TaskFactory._pushTask(this._superGlobalTasks, step, task);
      } else if (step === "start") {
        TaskFactory._pushTask(this._superGlobalTasks, "watch", task);
      }
    });

    // Sort and order super global tasks.
    Object.keys(this._superGlobalTasks).forEach((step: string): void => {
      this._orderedSuperGlobalTasks[step] = this._tasksGroupAndOrder
        .map((taskNames: string[]): string[] =>
          taskNames
            .map((taskName: string): string[] =>
              this._superGlobalTasks[step].filter((task: string): boolean => {
                const { type } = TaskFactory._explodeTaskName(task);
                return type === taskName;
              })
            )
            .reduce(TaskFactory._mergeArrays)
        )
        .filter(TaskFactory._removeEmptyArrays);

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

  private _createTasks(task: string, tasks: IGenericSettings): void {
    Object.keys(tasks).forEach((name: string): void => {
      const taskInstance: TaskRunner = this.createTask(task, name, tasks[name]);

      this._stackTask(taskInstance.lint());
      this._stackTask(taskInstance.build());
      this._stackTask(taskInstance.watch());
    });
  }

  private _defineTask(taskName: string, tasks: Undertaker.Task[], type: string = "series"): void {
    const errorHandler: string = `${taskName}:error`;

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

  private _pushGlobalTask(sort: string, key: string, task: string): IGlobalTaskList {
    this._globalTasks[sort] = this._globalTasks[sort] || {};
    TaskFactory._pushTask(this._globalTasks[sort], key, task);

    return this._globalTasks;
  }

  private _stackTask(name: string | false): string[] {
    if (name !== false) {
      this._tasks.push(name);
    }

    return this._tasks;
  }
}
