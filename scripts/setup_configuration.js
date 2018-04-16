const redisHelpers = require("../lib/helpers/redisHelpers");
const redis = require("redis");

const redisClient = redis.createClient(process.env.REDIS_URL);

var config_object = {
    test: 'b'
};

redisClient.on("connect", function(err) {
  redisClient.set(redisHelpers.getConfigurationKey(), JSON.stringify(config_object), (result) => {
      console.log("Configuration Set", config_object, result);
  });
});
