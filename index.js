const worlds = require('./adapter/PlaywrightWorld');
const { defineCucumber } = require('./adapter/defineCucumber');
const { tags } = require('./adapter/tags');
const cucumber = require('@cucumber/cucumber');
module.exports = {
    ...worlds,
    defineCucumber,
    tags,
    ...cucumber
}
