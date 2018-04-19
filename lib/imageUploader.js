'use strict';

const find = require("lodash").find;
const inRange = require("lodash").inRange;
const compact = require("lodash").compact;
const sample = require("lodash").sample;
const chain = require("lodash").chain;
const each = require("lodash").each;
const map = require("lodash").map;
const first = require("lodash").first;
const reject = require("lodash").reject;

const Promise = require("bluebird");
const join = Promise.join;

const fs = Promise.promisifyAll(require("fs"));

const base_path = "images";

var Twitter = require("twitter");

var config = {
  consumer_key: process.env.CHRP_TWITTER_CONSUMER_KEY,
  consumer_secret: process.env.CHRP_TWITTER_CONSUMER_SECRET,
  access_token_key: process.env.CHRP_TWITTER_ACCESS,
  access_token_secret: process.env.CHRP_TWITTER_SECRET
};

var client = new Twitter(config);

module.exports.getImages = (folder_name) => {
    var dir = `${base_path}/${folder_name}`;
    // console.log(`Getting ${dir}`);
    var files_read_def = fs.readdirAsync(dir).then((files) => {
        files = reject(files, (file) => {return file == ".DS_Store";});
        // console.log(folder_name, 'files are', files);
        var result =  map(files, (file) => {
            var full_path = `${dir}/${file}`;
            return this.startUpload(full_path).then((some_media_id) => {
                // console.log(`Final Media ID is ==> ${some_media_id}`);
                return some_media_id;
            });
        });
        return join(...result).then((data) => {
            return data;
        });
    });
    return files_read_def;
}

module.exports.uploadImages = (image_dir) => {
    var images_list_def = this.getImages(image_dir);
    // console.log("TYPEOF", typeof images_list_def)
    return join(images_list_def).then((all_ids, error) => {
        all_ids = first(all_ids);
        return all_ids;
    });
}

module.exports.startUpload = (full_file_path) => {
    var mediaData = require("fs").readFileSync(full_file_path);
    var mediaSize = require("fs").statSync(full_file_path).size;
    var mediaType = "image/gif";
    var payload = {
        command: "INIT",
        total_bytes: mediaSize,
        media_type: mediaType,
        media_category: "dm_gif", 
        shared: true,
    };
    return this.postToTwitter("media/upload", payload).then(data => {
      return data.media_id_string;
    }).then((media_id) => {
        return this.appendUpload(media_id, mediaData);
    }).then((media_id) => {
        // console.log(`Finish Media ID ${media_id}`);
        return this.finalizeUpload(media_id);
    });
}

module.exports.appendUpload = (media_id, mediaData) => {
    var payload = {
        command: "APPEND",
        media_id: media_id,
        media: mediaData,
        segment_index: 0
    };
    return this.postToTwitter("media/upload", payload).then((data)=> {
        // console.log("Done with Finalizing...", data);
        return media_id;
    });
};

module.exports.finalizeUpload = (media_id) => {
    var payload = {
        command: "FINALIZE",
        media_id: media_id,
    };
    return this.postToTwitter("media/upload", payload).then((data)=> {
        // console.log("Done with Uploading...");
        return data.media_id_string;
    });
};

module.exports.sendDM = (payload) => {
    return this.postToTwitter("direct_messages/events/new", {json_body: payload}).then((data) => {
        console.log("done with dm");
    });
}



module.exports.postToTwitter = (endpoint, params) => {
    return new Promise((resolve, reject) => {
        client.post(endpoint, params, (error, data, response) => {
            if (error) {
                // console.log(`Error Occurred on Post`, error);
                reject(error);
            } else {
                // console.log("Done with a post -- full arguments");
                // console.log(error)
                // console.log(data)
                // console.log(response)
                console.log(endpoint, params.command)
                console.log(response)
                console.log(`====================`)
                resolve(data);
            }
        });
    });
}