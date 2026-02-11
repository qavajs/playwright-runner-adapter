const { defineConfig } = require("../adapter/js");

module.exports = defineConfig({
    paths: ['test/features/*.feature'],
    require: ['test/step_definitions/*.ts']
})