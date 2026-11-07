const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({ testMatch: 'cucumber.config.js', fullyParallel: true });
