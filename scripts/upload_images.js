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

// join(imageUploader.uploadImages('late')).then((all_ids) => {
// join(imageUploader.uploadImages('iq_score')).then((all_ids) => {
// join(imageUploader.uploadImages('wrong'), imageUploader.uploadImages('right'), imageUploader.uploadImages('wait'), imageUploader.uploadImages('late'), imageUploader.uploadImages('iq_score')).then((all_ids) => {
// join(imageUploader.uploadImages('wrong'), imageUploader.uploadImages('right'), imageUploader.uploadImages('wait'), imageUploader.uploadImages('late')).then((all_ids) => {

var args = _.drop(process.argv, 2);


if (args.length == 0) args = ['wrong','right','wait','late', 'iq_score'];

var defs = _.map(args, (dir_name) => {return imageUploader.uploadImages(dir_name)});

console.log("DEFS", defs);

join(...defs).then((all_ids) => {
    console.log("all ids", all_ids)
    var wrong_ids = all_ids[0];
    var right_ids = all_ids[1];
    var wait_ids = all_ids[2];
    var late_ids = all_ids[3];
    var iq_media_assets = all_ids[4];
    console.log("Wrong ids", wrong_ids);
    console.log("Right Ids", right_ids);
    console.log("Wait Ids", wait_ids);
    console.log("IQ Ids", iq_media_assets);
    redisClient.getAsync(redisHelpers.getConfigurationKey()).then((config) => {
        if (!config) config = "{}";
        config = JSON.parse(config);
        if (right_ids && right_ids.length)
            config.right_media_assets = right_ids;
        if (wrong_ids && wrong_ids.length)
            config.wrong_media_assets = wrong_ids;
        if (wait_ids && wait_ids.length)
            config.wait_media_assets = wait_ids;
        if (late_ids && late_ids.length)
            config.late_media_assets = late_ids;
        if (iq_media_assets && iq_media_assets.length)
            config.iq_media_assets = iq_media_assets;
        redisClient.set(redisHelpers.getConfigurationKey(), JSON.stringify(config), redis.print);
    });
});