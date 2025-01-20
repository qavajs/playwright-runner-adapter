const { PlaywrightWorld } = require('./adapter/PlaywrightWorld');
const { defineCucumber } = require('./adapter/defineCucumber');
const { tags } = require('./adapter/tags');

module.exports = {
    PlaywrightWorld,
    defineCucumber,
    tags
}
