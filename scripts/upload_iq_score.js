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

var defs = _.map(['iq_score'], (dir_name) => {return imageUploader.uploadImages(dir_name)});

console.log("DEFS", defs);

join(...defs).then((all_ids) => {
    all_ids = Object.assign.apply(Object, _.flatten(all_ids));
    var iq_media_assets = all_ids.iq_score;

    console.log("IQ Ids", iq_media_assets);
    if (iq_media_assets)
        console.log("IQ Media Asset Length", iq_media_assets.length)
    redisClient.getAsync(redisHelpers.getConfigurationKey()).then((config) => {
        if (!config) config = "{}";
        config = JSON.parse(config);
        if (iq_media_assets && iq_media_assets.length)
            config.iq_media_assets = iq_media_assets;
        redisClient.set(redisHelpers.getConfigurationKey(), JSON.stringify(config), redis.print);
    });
});