const redisHelpers = require("../lib/helpers/redisHelpers");
const redis = require("redis");
const _ = require('lodash');

const redisClient = redis.createClient(process.env.REDIS_URL);

var config_object = {
  wrong_media_assets: ["985992963271479296"],
  right_media_assets: ["985993017864601600"]
};

var quiz_handle = process.env.QUIZ_HANDLE || "IQtrivia";

var handles_with_extra_lives = ["bobber205", "ChrisTeso"];

redisClient.on("connect", function(err) {
  redisClient.set(redisHelpers.getConfigurationKey(), JSON.stringify(config_object), (result) => {
      console.log("Configuration Set", config_object, result);
  });
  _.each(handles_with_extra_lives, (handle) => {
    redisClient.hmset(redisHelpers.getExtraLifeHashKey(quiz_handle), handle, "1", redis.print);
  });
});

