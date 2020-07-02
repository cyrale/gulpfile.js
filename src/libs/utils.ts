export interface TaskNameElements {
  type: string;
  name: string;
  step: string;
}

/**
 * List of supported modules.
 * @type {string[]}
 */
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
export function explodeTaskName(task: string): TaskNameElements {
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
}

/**
 * Filter object with all elements that pass the test.
 *
 * @param {Record<string, unknown>} obj
 * @param {(o: unknown, key: string) => boolean} predicate
 * @returns {Record<string, unknown>}
 */
export function filterObject(
  obj: Record<string, unknown>,
  predicate: (o: unknown, key: string) => boolean
): Record<string, unknown> {
  return Object.keys(obj)
    .filter((key) => predicate((obj as any)[key], key)) // eslint-disable-line @typescript-eslint/no-explicit-any
    .reduce((res, key) => Object.assign(res, { [key]: (obj as any)[key] }), {}); // eslint-disable-line @typescript-eslint/no-explicit-any
}
