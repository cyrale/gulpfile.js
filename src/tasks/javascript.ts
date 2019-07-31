import Task from "./task";

export default class Javascript extends Task {
  public static readonly taskName: string = "javascript";

  constructor(name: string, settings: object) {
    super(name, settings);

    this.withSourcemaps = true;

    this.defaultDest = false;
    this.browserSyncSettings = { match: "**/*.js" };
  }

  public buildSpecific(stream: NodeJS.ReadWriteStream, options: IGulpOptions): NodeJS.ReadWriteStream {
    return stream;
  }

  public lintSpecific(stream: NodeJS.ReadWriteStream): NodeJS.ReadWriteStream {
    return stream;
  }
}
