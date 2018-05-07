const s3 = require('s3');
const Promise = require("bluebird");

var client = s3.createClient({
    maxAsyncS3: 20, // this is the default
    s3RetryCount: 3, // this is the default
    s3RetryDelay: 1000, // this is the default
    multipartUploadThreshold: 20971520, // this is the default (20 MB)
    multipartUploadSize: 15728640, // this is the default (15 MB)
    s3Options: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        region: process.env.AWS_S3_REGION,
        // endpoint: 's3.yourdomain.com',
        // sslEnabled: false
        // any other options are passed to new AWS.S3()
        // See: http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/Config.html#constructor-property
    },
});

var params = {
    localFile: "config/accounts.json",

    s3Params: {
        Bucket: "iqtrivia",
        Key: "environment/accounts.json",
    },
}

var my_promise = new Promise((resolve, reject) => {
        var uploader = client.downloadFile(params);
        uploader.on('error', function (err) {
            console.error("unable to download:", err.stack);
        });
        uploader.on('progress', function () {
            console.log("progress", uploader.progressMd5Amount,
                uploader.progressAmount, uploader.progressTotal);
        });
        uploader.on('end', function () {
            resolve();
        });
    });

async function uploadFile() {
    console.log("Downloading Environment File...");
    await my_promise;
    console.log("Done!")
}

uploadFile();

