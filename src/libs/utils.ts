export interface TaskNameElements {
  type: string;
  name: string;
  step: string;
}

export const modules: string[] = [
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
 * Different steps in tasks (ordered).
 * @type {string[]}
 */
export const steps: string[] = ["lint", "build", "watch"];

/**
 * Explode name separated by two points in 3 elements.
 *
 * @param {string} task
 * @return {TaskNameElements}
 */
export const explodeTaskName = (task: string): TaskNameElements => {
  let [type = "", name = "", step = ""] = task.split(":");

  if (steps.indexOf(type) >= 0 || type === "start") {
    step = type;
    type = "";
  } else if (steps.indexOf(name) >= 0 || name === "start") {
    step = name;
    name = "";
  }

  return {
    type,
    name,
    step,
  };
};

export const filterObject = (obj: {}, predicate: (o: unknown, key: string) => boolean): {} => {
  return Object.keys(obj)
    .filter(key => predicate((obj as any)[key], key)) // eslint-disable-line @typescript-eslint/no-explicit-any
    .reduce((res, key) => Object.assign(res, { [key]: (obj as any)[key] }), {}); // eslint-disable-line @typescript-eslint/no-explicit-any
};
