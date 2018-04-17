const redisHelpers = require("../lib/helpers/redisHelpers");
const redis = require("redis");
const _ = require('lodash');

const redisClient = redis.createClient(process.env.REDIS_URL);

var config_object = {
  wrong_media_assets: ["985992963271479296", "986343146249310213"],
  right_media_assets: ["985993017864601600"]
};

var quiz_handle = process.env.QUIZ_HANDLE || "IQtrivia";

var handles_with_extra_lives = ["bobber205", "ChrisTeso"];

redisClient.on("connect", function(err) {
  redisClient.set(redisHelpers.getConfigurationKey(), JSON.stringify(config_object), (result) => {
      console.log("Configuration Set", config_object, result);
  });
  console.log(`Handles with Extra Lives Are!! ${handles_with_extra_lives}`)
  _.each(handles_with_extra_lives, (handle) => {
    console.log(`Setting ${handle} to 1`);
    redisClient.hmset(redisHelpers.getExtraLifeHashKey(quiz_handle), handle, "1", redis.print);
  });
});



