module.exports = {
  "root": true,
  "env": {
    "browser": true,
    "es6": true,
    "node": true
  },
  "parser": "@typescript-eslint/parser",
  "parserOptions": {
    "sourceType": "module"
  },
  "extends": [
    "plugin:@typescript-eslint/recommended",
    "prettier/@typescript-eslint",
    "plugin:prettier/recommended"
  ],
  "rules": {
    "@typescript-eslint/no-this-alias": [
      "error",
      {
        allowDestructuring: true, // Allow `const { props, state } = this`; false by default
        allowedNames: ["self"],   // Allow `const self = this`; `[]` by default
      },
    ],
    "prettier/prettier": "warn"
  },
};
