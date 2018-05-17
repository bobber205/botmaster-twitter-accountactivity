var Twitter = require("twitter");

var config = {
  consumer_key: process.env.CHRP_TWITTER_CONSUMER_KEY,
  consumer_secret: process.env.CHRP_TWITTER_CONSUMER_SECRET,
  access_token_key: process.env.CHRP_TWITTER_ACCESS,
  access_token_secret: process.env.CHRP_TWITTER_SECRET
};


console.log(config)



var client = new Twitter(config);
    function checkStatus(mediaId) {
      console.log("checkStatus mediaID is", mediaId);
      return makeGet("media/upload", {
        command: "STATUS",
        media_id: mediaId
      })
        .then(data => {
          console.log("status data", data);
          return mediaId;
        })
        .catch((error) => {
          console.log('error???', error)
          console.log(arguments);
        });
    }


  function makeGet(endpoint, params) {
    return new Promise((resolve, reject) => {
      client.get(endpoint, params, (error, data, response) => {
        if (error) {
          console.log("ERROR ON POST", error);
          reject(error);
        } else {
          resolve(data);
        }
      });
    });
  }


imageUploader.onEnvReady().then(() => {

});

  console.log(process.argv[2])
  global.media_id = process.argv[2];

  console.log(`checking status of ${global.media_id}`);
  checkStatus(global.media_id);