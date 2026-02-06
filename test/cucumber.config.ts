import { defineConfig } from "../src";

export default defineConfig({
    paths: ['test/features/*.feature'],
    require: ['test/step_definitions/*.ts']
})