export default class Task {
  private name: string = "";
  private settings: object = {};

  constructor(name: string, settings: object) {
    this.name = name;
    this.settings = settings;
  }
}
