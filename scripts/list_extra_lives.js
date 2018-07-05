"use strict";

const redisHelpers = require("../lib/helpers/redisHelpers");
const redis = require("redis");
const _ = require('lodash');
const util = require('util');

const bluebird = require('bluebird');
bluebird.promisifyAll(redis.RedisClient.prototype);
bluebird.promisifyAll(redis.Multi.prototype);

const redisClient = redis.createClient(process.env.REDIS_URL);
// const redisClient = redis.createClient();

var quiz_handle = process.env.BOT_HANDLE;

var options = _.drop(process.argv, 2);

var do_full = options[0] == 'full' ? true: false;


redisClient.on("connect", (error) => {
    redisClient.hgetallAsync(redisHelpers.getExtraLifeHashKey(quiz_handle.toLowerCase())).then(result => {
        console.log("Extra Lives Are:")
        result = _.chain(result).map((current, index) => {
            if (do_full) return { [current]: index};
            if (current == '1') return {
                [current]: index
            };
            return null;
        }).compact().value();
        console.log(util.inspect(result, false, null))
        console.log(`There are ${result.length} total extra lives set`);
    });
});