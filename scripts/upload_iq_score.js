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

var bot_handle = process.env.BOT_HANDLE;

imageUploader.onEnvReady().then(() => {
    var defs = _.map(['iq_score'], (dir_name) => {return imageUploader.uploadImages(dir_name)});
    join(...defs).then((all_ids) => {
        all_ids = Object.assign.apply(Object, _.flatten(all_ids));
        var iq_media_assets = all_ids.iq_score;
        console.log("IQ Ids", iq_media_assets);
        if (iq_media_assets) console.log("IQ Media Asset Length", iq_media_assets.length);
        redisClient.set(redisHelpers.getConfigurationKeyForIQScores(bot_handle), JSON.stringify(iq_media_assets), redis.print);
    });
});