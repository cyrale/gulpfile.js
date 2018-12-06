"use strict";

const path = require("path");

const notify = require("gulp-notify");
const notifier = require("node-notifier");

module.exports = {
  onError: (error, title) => {
    title = title || "";

    notify.onError({
      title: "Gulp" + ("" !== title ? ": " + title : ""),
      message: "Error: <%= error.message %>",
      sound: "Frog",
      group: "gulp"
    })(error);
  },
  notify: (message, title) => {
    title = title || "";

    notifier.notify({
      title: "Gulp" + ("" !== title ? ": " + title : ""),
      message: message,
      sound: "Frog",
      group: "gulp",
      icon: path.join(__dirname, "../assets/gulp-error.png"),
      wait: true
    });
  }
};
