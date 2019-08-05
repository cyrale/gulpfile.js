import Task, { IGulpOptions } from "./task";

export default class SVGStore extends Task {
  public static readonly taskName: string = "svgstore";

  constructor(name: string, settings: object) {
    super(name, settings);

    this.withLinter = false;
  }

  protected buildSpecific(stream: NodeJS.ReadWriteStream, options?: IGulpOptions): NodeJS.ReadWriteStream {
    return stream;
  }
}
