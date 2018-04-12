// var Twit = require("twit");
// const Twitter = require("twitter");

// var twitterSettings = settings = {
//     credentials: {
//     consumerKey: process.env.CHRP_TWITTER_CONSUMER_KEY,
//     consumerSecret: process.env.CHRP_TWITTER_CONSUMER_SECRET,
//     accessToken: process.env.CHRP_TWITTER_ACCESS,
//     accessTokenSecret: process.env.CHRP_TWITTER_SECRET
// },
// webhookEndpoint: '/'
// };


// var twitCredentials = {
//     consumer_key: settings.credentials.consumerKey,
//     consumer_secret: settings.credentials.consumerSecret,
//     access_token: settings.credentials.accessToken,
//     access_token_secret: settings.credentials.accessTokenSecret,
// };



// require('./scripts/test_upload.js');

const Twitter = require("twitter");
var client = new Twitter({
  consumerKey: process.env.CHRP_TWITTER_CONSUMER_KEY,
  consumerSecret: process.env.CHRP_TWITTER_CONSUMER_SECRET,
  accessToken: process.env.CHRP_TWITTER_ACCESS,
  accessTokenSecret: process.env.CHRP_TWITTER_SECRET
});

console.log(client);


var pathToMovie = "./correct.gif"
var mediaType = "image/gif";
var mediaData = require("fs").readFileSync(pathToMovie);
var mediaSize = require("fs").statSync(pathToMovie).size;

console.log(pathToMovie, mediaType, mediaSize);


  function initUpload() {
    console.log("IN INIT");
    return makePost("https://upload.twitter.com/1.1/media/upload.json", {
      command: "INIT",
      total_bytes: mediaSize,
      media_type: mediaType
    }).then(data => data.media_id_string)
    .catch(() => {console.log(arguments)});
  }



    function appendUpload(mediaId) {
      return makePost("media/upload", {
        command: "APPEND",
        media_id: mediaId,
        media: mediaData,
        segment_index: 0
      })
        .then(data => mediaId)
        .catch(() => {
          console.log(arguments);
        });
    }



      function finalizeUpload(mediaId) {
        return makePost("media/upload", {
          command: "FINALIZE",
          media_id: mediaId
        })
          .then(data => mediaId)
          .catch(() => {
            console.log(arguments);
          });
      }


  function makePost(endpoint, params) {
    return new Promise((resolve, reject) => {
      client.post(endpoint, params, (error, data, response) => {
        if (error) {
          console.log("ERROR ON POST", error);
          reject(error);
        } else {
          resolve(data);
        }
      });
    });
  }


  initUpload() 
    // .then(appendUpload) 
    // .then(finalizeUpload) 
    // .then(mediaId => {
    // });