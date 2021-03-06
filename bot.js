if (process.env.NODE_ENV != 'production' || true)
  require("util").inspect.defaultOptions.depth = null;

const Botmaster = require("botmaster");
const TwitterAccountActivityBot = require("./lib/twitterAccountActivityBot");

var twitter_bot_port = process.env.PORT || 3005;

const bot_config = { useDefaultMountPathPrepend: false };
// const bot_config = { port: twitter_bot_port, useDefaultMountPathPrepend: false };

const botmaster = new Botmaster(bot_config);

console.log(`Bot Config`, bot_config);

const twitterSettings  = {
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
  let port = process.env.PORT || 3005;
  app.listen( port, () =>
    console.log(`Express is listening on ${port}`)
  );
}

startServer();

const twitterBot = new TwitterAccountActivityBot(twitterSettings, app);