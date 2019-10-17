interface IModuleDefinition {
  simple: boolean;
}

interface IModuleList {
  [name: string]: IModuleDefinition;
}

export const modules: IModuleList = {
  browserify: { simple: false },
  browsersync: { simple: true },
  clean: { simple: true },
  favicon: { simple: false },
  fonts: { simple: false },
  images: { simple: false },
  javascript: { simple: false },
  pug: { simple: false },
  sass: { simple: false },
  sprites: { simple: false },
  svgstore: { simple: false },
  webpack: { simple: false },
};

export const names: string[] = Object.keys(modules);

export function module(task: string): string {
  if (typeof modules[task] === "undefined") {
    return "";
  }

  return `../tasks/${task}`;
}
