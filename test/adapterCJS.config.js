const { defineConfig } = require("../adapter/js");

module.exports = defineConfig({
    paths: ['test/features/*.feature'],
    require: ['test/step_definitions/*.ts'],
    requireModules: ['./test/support/setup.ts'],
    worldParameters: { baseUrl: 'https://example.com' },
    tags: 'not @excludedByConfig',
    strict: true
})