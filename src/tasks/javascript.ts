import Task from "./task";

export default class Javascript extends Task {
  public static readonly taskName: string = "javascript";

  public buildSpecific(stream: NodeJS.ReadWriteStream): NodeJS.ReadWriteStream {
    return stream;
  }

  public lintSpecific(stream: NodeJS.ReadWriteStream): NodeJS.ReadWriteStream {
    return stream;
  }
}
