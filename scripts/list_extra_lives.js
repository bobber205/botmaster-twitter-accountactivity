const redisHelpers = require("../lib/helpers/redisHelpers");
const redis = require("redis");
const _ = require('lodash');

const bluebird = require('bluebird');
bluebird.promisifyAll(redis.RedisClient.prototype);
bluebird.promisifyAll(redis.Multi.prototype);

const redisClient = redis.createClient(process.env.REDIS_URL);
// const redisClient = redis.createClient();

var quiz_handle = process.env.BOT_HANDLE;

redisClient.on("connect", (error) => {
    redisClient.hgetallAsync(redisHelpers.getExtraLifeHashKey(quiz_handle.toLowerCase())).then(result => {
        console.log("Extra Lives Are:")
        console.log(result)
    });
});