console.log(`Running Prepare Script for ${process.env.BOT_HANDLE}`);
var prompt = require('prompt');

const dl_images = require("./download_images_from_s3");
prompt.start('Press Any Key To Continue');

prompt.get(['username'], function (err, result) {
    console.log(result)
    const image_uploader = require("./upload_images");
    prompt.start('Press Any Key To Continue');
    prompt.get(['username'], function (err, result) {
        const iq_uploader = require("./upload_iq_score");
    });
});