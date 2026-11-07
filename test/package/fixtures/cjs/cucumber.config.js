const { defineConfig } = require('@qavajs/playwright-runner-adapter/js');

module.exports = defineConfig({
    paths: ['features/*.feature'],
    require: ['steps/*.js']
});
