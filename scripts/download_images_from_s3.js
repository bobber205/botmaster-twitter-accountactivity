const s3 = require('s3');
const Promise = require("bluebird");
const _ = require('lodash');

var args = _.drop(process.argv, 2);

if (!args.length) args = ['late', 'right', 'wait', 'wrong', 'iq_score'];

_.each(args, (folder_name)=> {
    console.log(`Starting ${folder_name}`)
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
        },
    });

    // console.log(process.env.AWS_ACCESS_KEY_ID)

    var params = {
        localDir: `images/${folder_name}`,
        deleteRemoved: true, // default false, whether to remove s3 objects
        // that have no corresponding local file.
        s3Params: {
            Bucket: "iqtrivia",
            Prefix: `${folder_name}`,
        },
    };

    var my_promise = new Promise((resolve, reject) => {
        console.log("PARAMS", params)
        var uploader = client.downloadDir(params);
        uploader.on('error', function (err) {
            console.error("unable to sync: ", err.stack);
            resolve()
        });
        uploader.on('progress', function () {
            console.log("progress", uploader.progressAmount, uploader.progressTotal);
        });
        uploader.on('end', function () {
            console.log("done uploading");
            resolve()
        });
    });

    async function uploadFile() {
        console.log("Downloading Image Files...");
        await my_promise;
        console.log("Done!")
    }

    uploadFile();
});
