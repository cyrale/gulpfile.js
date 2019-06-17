export default class Task {
  readonly name: string = "";
  readonly settings: object = {};

  constructor(name: string, settings: object) {
    this.name = name;
    this.settings = settings;
  }
}
