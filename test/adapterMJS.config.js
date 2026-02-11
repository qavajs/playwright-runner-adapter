import { defineConfig } from '../adapter/js';

export default defineConfig({
    paths: ['test/features/*.feature'],
    require: ['test/step_definitions/*.ts']
})