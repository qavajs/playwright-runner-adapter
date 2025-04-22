const { PlaywrightWorld } = require('./adapter/PlaywrightWorld');
const { defineCucumber } = require('./adapter/defineCucumber');
const { tags } = require('./adapter/tags');
const cucumber = require('@cucumber/cucumber');
module.exports = {
    PlaywrightWorld,
    defineCucumber,
    tags,
    ...cucumber
}
