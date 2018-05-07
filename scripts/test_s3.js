var s3 = require('s3');

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

console.log(process.env.AWS_S3_REGION)

var params = {
    localFile: "config/accounts.json",

    s3Params: {
        Bucket: "iqtrivia",
        Key: "accounts.json",
        // other options supported by putObject, except Body and ContentLength.
        // See: http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#putObject-property
    },
}

console.log(params);


var uploader = client.uploadFile(params);
uploader.on('error', function (err) {
    console.error("unable to upload:", err.stack);
});
uploader.on('progress', function () {
    console.log("progress", uploader.progressMd5Amount,
        uploader.progressAmount, uploader.progressTotal);
});
uploader.on('end', function () {
    console.log("done uploading");
});
