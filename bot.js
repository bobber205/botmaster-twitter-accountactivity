const Botmaster = require("botmaster");
const TwitterAccountActivityBot = require("./lib/twitter_account_activity_bot");

const twitter_bot_port = process.env.PORT | 3005;

const bot_config = { useDefaultMountPathPrepend: false };
// const bot_config = { port: twitter_bot_port, useDefaultMountPathPrepend: false };

// const botmaster = new Botmaster(bot_config);

console.log("Bot Config", bot_config);
console.log('WEBHOOK_URL', process.env.WEBHOOK_URL);

const _ = require('lodash');

const twitterSettings = {
  credentials: {
    consumerKey: process.env.CHRP_TWITTER_CONSUMER_KEY,
    consumerSecret: process.env.CHRP_TWITTER_CONSUMER_SECRET,
    accessToken: process.env.CHRP_TWITTER_ACCESS,
    accessTokenSecret: process.env.CHRP_TWITTER_SECRET
  },
  webhookEndpoint: '/'
};

const express = require("express");
const app = express();

const startServer = async() => {
  app.get("/", (req, res) => res.send("Hello World!"));

  app.listen(twitter_bot_port, () =>
    console.log(`Express is listening on ${twitter_bot_port}`)
  );
}

startServer();

// const twitterBot = new TwitterAccountActivityBot(twitterSettings, app);

// botmaster.addBot(twitterBot);

// botmaster.use({
//   type: "incoming",
//   name: "my-middleware",
//   controller: (bot, update) => {
//     console.log('Message Received ==>', update);
//   }
// });
console.log("Started up bot")