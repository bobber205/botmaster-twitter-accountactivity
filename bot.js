const Botmaster = require("botmaster");
const TwitterAccountActivityBot = require("./lib/twitter_account_activity_bot");

const twitter_bot_port = process.env.PORT | 3005;
console.log(process.env.WEBHOOK_URL)
const bot_config = { port: twitter_bot_port, useDefaultMountPathPrepend: false };
const botmaster = new Botmaster(bot_config);
console.log("Bot Config", bot_config);
console.log(process.env.WEBHOOK_URL);

const _ = require('lodash');

const twitterSettings = {
  credentials: {
    consumerKey: process.env.CHRP_TWITTER_CONSUMER_KEY,
    consumerSecret: process.env.CHRP_TWITTER_CONSUMER_SECRET,
    accessToken: process.env.CHRP_TWITTER_ACCESS,
    accessTokenSecret: process.env.CHRP_TWITTER_SECRET
  },
  webhookEndpoint: 'webhook/'
};

const twitterBot = new TwitterAccountActivityBot(twitterSettings);

botmaster.addBot(twitterBot);

botmaster.use({
  type: "incoming",
  name: "my-middleware",
  controller: (bot, update) => {
    console.log('Message Received ==>', update);
  }
});
