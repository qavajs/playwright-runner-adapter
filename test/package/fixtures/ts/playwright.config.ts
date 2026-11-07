import { defineConfig } from '@playwright/test';

export default defineConfig({ testMatch: 'cucumber.config.ts', fullyParallel: true });
