const redisHelpers = require("../lib/helpers/redisHelpers");
const redis = require("redis");
const _ = require('lodash');

const redisClient = redis.createClient(process.env.REDIS_URL);

var quiz_handle = process.env.BOT_HANDLE;

var handles_with_extra_lives = ["owlsfan954", "chrisbarnett01", "AkhilaMidde", "bobber205", "christeso", "jingwait", "Matty_J2912", "AwesomO17", "lizzypelton", "jsbllt"];

var args = _.drop(process.argv, 2);

if (args.length) {
  console.log(`Adding ${args.length} additional handles to the extra lives list`);
  handles_with_extra_lives = args;
}
  
redisClient.on("connect", function(err) {
  console.log(`Handles with Extra Lives Are!! ${handles_with_extra_lives}`)
  _.each(handles_with_extra_lives, (handle) => {
    console.log(`Setting ${handle} to 1`);
    redisClient.hmset(redisHelpers.getExtraLifeHashKey(quiz_handle.toLowerCase()), handle.toLowerCase(), "1", redis.print);
  });
});



