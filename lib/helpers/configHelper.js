const readlines = require("readlines");
var fs = require('fs');

var master_config_object = JSON.parse(fs.readFileSync('config/accounts.json', 'utf8'));

module.exports.getTwitterConfigurationObjectForHandle = (handle) => {
  return master_config_object[handle.toLowerCase()];
};