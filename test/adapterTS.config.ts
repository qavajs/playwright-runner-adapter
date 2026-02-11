import { defineConfig } from "../adapter";

export default defineConfig({
    paths: ['test/features/*.feature'],
    require: ['test/step_definitions/*.ts']
})