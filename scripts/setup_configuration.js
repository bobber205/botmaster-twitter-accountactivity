const redisHelpers = require("../lib/helpers/redisHelpers");
const redis = require("redis");

const redisClient = redis.createClient(process.env.REDIS_URL);

var config_object = {
  wrong_media_assets: ["985992963271479296"],
  right_media_assets: ["985993017864601600"]
};

redisClient.on("connect", function(err) {
  redisClient.set(redisHelpers.getConfigurationKey(), JSON.stringify(config_object), (result) => {
      console.log("Configuration Set", config_object, result);
  });
});
