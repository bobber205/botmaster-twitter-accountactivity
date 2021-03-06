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

var args = _.drop(process.argv, 2);

if (args.length == 0) args = ['wrong','right','wait','late'];

var bot_handle = process.env.BOT_HANDLE;

imageUploader.onEnvReady().then(() => {
    var defs = _.map(args, (dir_name) => {return imageUploader.uploadImages(dir_name)});
    // console.log("DEFS", defs);
    join(...defs).then((all_ids) => {
        all_ids = Object.assign.apply(Object, _.flatten(all_ids));
        console.log("all ids", all_ids)
        var wrong_ids = _.compact(all_ids.wrong);
        var right_ids = _.compact(all_ids.right);
        var wait_ids = _.compact(all_ids.wait);
        var late_ids = _.compact(all_ids.late);
        // var iq_media_assets = all_ids.iq_score;
        console.log("Wrong ids", wrong_ids);
        console.log("Right Ids", right_ids);
        console.log("Wait Ids", wait_ids);
        console.log("Late Ids", late_ids);
        // console.log("IQ Ids", iq_media_assets);
        // if (iq_media_assets)
        //     console.log("IQ Media Asset Length", iq_media_assets.length)
        redisClient.getAsync(redisHelpers.getConfigurationKeyForHandle(bot_handle)).then((config) => {
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
            // if (iq_media_assets && iq_media_assets.length)
            //     config.iq_media_assets = iq_media_assets;
            redisClient.set(redisHelpers.getConfigurationKeyForHandle(bot_handle), JSON.stringify(config), 'EX', 86400, () => {
                console.log(`Done with Response Images for ${bot_handle}!`)
            });
        });
    });
});

