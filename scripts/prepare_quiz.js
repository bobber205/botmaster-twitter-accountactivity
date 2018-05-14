 var prompt = require('prompt');

const dl_images = require("./download_images_from_s3");
prompt.start('Press Any Key To Continue');

prompt.get(['username'], function (err, result) {
    console.log(result)
    const iq_uploader = require("./upload_iq_score");
    prompt.start('Press Any Key To Continue');
    prompt.get(['username'], function (err, result) {
        const image_uploader = require("./upload_images");
    });
});