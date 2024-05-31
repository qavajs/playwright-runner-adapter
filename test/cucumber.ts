export default {
    paths: ['test/features/*.feature'],
    require: [
        'test/step_definitions/*.ts',
        'test/step_definitions/stepsCJS.js'
    ],
    import: [
        'test/step_definitions/stepsESM.js'
    ]
}
