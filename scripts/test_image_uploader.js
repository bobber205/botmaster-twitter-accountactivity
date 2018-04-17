const redisHelpers = require("../lib/helpers/redisHelpers");
const imageUploader = require("../lib/imageUploader");
const Promise = require("bluebird");
const join = Promise.join;

const redis = require("redis");
const redisClient = redis.createClient(process.env.REDIS_URL);

const bluebird = require("bluebird");
bluebird.promisifyAll(redis.RedisClient.prototype);
bluebird.promisifyAll(redis.Multi.prototype);

const _ = require("lodash");

join(imageUploader.uploadImages('wrong'), imageUploader.uploadImages('right')).then((all_ids) => {
    var wrong_ids = all_ids[0];
    var right_ids = all_ids[1];
    console.log("Wrong ids", wrong_ids);
    console.log("Right Ids", right_ids);
    redisClient.getAsync(redisHelpers.getConfigurationKey()).then((config) => {
        if (!config) config = "{}";
        config = JSON.parse(config);
        config.right_media_assets = right_ids;
        config.wrong_media_assets = wrong_ids;
        redisClient.set(redisHelpers.getConfigurationKey(), JSON.stringify(config));
    });

});