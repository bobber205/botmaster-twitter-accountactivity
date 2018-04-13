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

var Twitter = require("twitter");

var config = {
  consumer_key: process.env.CHRP_TWITTER_CONSUMER_KEY,
  consumer_secret: process.env.CHRP_TWITTER_CONSUMER_SECRET,
  access_token_key: process.env.CHRP_TWITTER_ACCESS,
  access_token_secret: process.env.CHRP_TWITTER_SECRET
  // bearer_token: process.env.BEARER_TOKEN
};

console.log("Config ==>", config);

var client = new Twitter(config);

console.log('twitter client', client);


var pathToMovie = "./wrong.gif"
var mediaType = "image/gif";
var mediaData = require("fs").readFileSync(pathToMovie);
var mediaSize = require("fs").statSync(pathToMovie).size;

console.log('File Parameters', pathToMovie, mediaType, mediaSize);


  function initUpload() {
    console.log("IN INIT");
    return makePost("media/upload", {
      command: "INIT",
      total_bytes: mediaSize,
      media_type: mediaType,
      media_category: "dm_gif"
      // shared: true,
    })
      .then(data => {
        console.log("data is!!!", data);
        global.media_id = data.media_id_string;
        return data.media_id_string;
      })
      .catch(() => {
        console.log(arguments);
      });
  }



    function appendUpload(mediaId) {
      console.log("append mediaID is", mediaId)
      return makePost("media/upload", {
        command: "APPEND",
        media_id: mediaId,
        media: mediaData,
        segment_index: 0
      })
        .then(data => {
          console.log("append data", data);
          return mediaId;
        })
        .catch(() => {
          console.log(arguments);
        });
    }


      function finalizeUpload(mediaId) {
        console.log(`in finalizeUploader ${mediaId}`);
        return makePost("media/upload", {
          command: "FINALIZE",
          media_id: mediaId
        })
          .then(data => {
            console.log('data in finalize is', data);
          })
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


  // client.post("statuses/update", { status: "I Love Twitter" }, function(
  //   error,
  //   tweet,
  //   response
  // ) {
  //   // if (error) throw error;
  //   console.log(tweet); // Tweet body.
  //   // console.log(response); // Raw response object.
  // });


  initUpload() 
    .then(appendUpload) 
    .then(finalizeUpload) 
    .then(mediaId => {
    });

setTimeout(function() {
  console.log(`checking status of ${global.media_id}`);
  checkStatus(global.media_id)
},3000);