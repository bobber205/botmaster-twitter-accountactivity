'use strict';

const find = require("lodash").find;
const compact = require("lodash").compact;
const chain = require("lodash").chain;
const each = require("lodash").each;
const map = require("lodash").map;
const first = require("lodash").first;
const reject = require("lodash").reject;

const configHelpers = require('./helpers/configHelper');

const _ = require("lodash");

const Promise = require("bluebird");
const join = Promise.join;

const fs = Promise.promisifyAll(require("fs"));

const base_path = "images";

var Twitter = require("twitter");

var bot_handle = process.env.BOT_HANDLE;

console.log(`Loading Image Config for ${bot_handle}`);

var accounts_config = configHelpers.getTwitterConfigurationObjectForHandle(bot_handle);

var twitCredentials = {
    consumer_key: accounts_config.twitter_consumer_key,
    consumer_secret: accounts_config.twitter_consumer_secret,
    access_token: accounts_config.twitter_bot_access_token,
    access_token_secret: accounts_config.twitter_bot_access_token_secret,
}

var client = new Twitter(twitCredentials);

module.exports.getImages = (folder_name, image_type = 'image/gif') => {
    var dir = `${base_path}/${folder_name}`;
    var files_read_def = fs.readdirAsync(dir).then((files) => {
        files = reject(files, (file) => {return file == ".DS_Store" || file == ".gitkeep";});
        var result =  _.chain(files).take(200).map((file, index) => {
            var full_path = `${dir}/${file}`;
            return this.startUpload(full_path, image_type).then((some_media_id) => {
                return some_media_id;
            });
        }).value();
        return join(...result).then((data) => {
            var result = {[folder_name]: data};
            return [result];
        });
    });
    return files_read_def;
}

module.exports.uploadImages = (image_dir, image_type) => {
    var images_list_def = this.getImages(image_dir, image_type);
    return join(images_list_def).then((all_ids, error) => {
        all_ids = chain(all_ids).first().value();
        return all_ids;
    });
}

module.exports.startUpload = (full_file_path, image_type) => {
    var mediaData = require("fs").readFileSync(full_file_path);
    var mediaSize = require("fs").statSync(full_file_path).size;
    // var mediaType = "image/gif";
    var payload = {
        command: "INIT",
        total_bytes: mediaSize,
        media_type: image_type,
    };
    if (image_type == "image/gif") {
        payload.media_category = "dm_gif";
    } else {
        payload.media_category = "dm_image";
    }
    payload.shared = true;

    return new Promise((resolve, reject) => {
        this.postToTwitter("media/upload", payload)
        .then((data) => {
            if (data == 0) resolve(null);
            else return this.appendUpload(data.media_id_string, mediaData);
        })
        .then(media_id => {
            if (media_id == 0) resolve(null);
            else {
                this.finalizeUpload(media_id, image_type).then(
                    media_id => {
                        resolve(media_id);
                    }
                );
            }
        });
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
        return media_id;
    });
};

module.exports.finalizeUpload = (media_id, media_type) => {
    if (media_type != "image/gif") return media_id;
    var payload = {
        command: "FINALIZE",
        media_id: media_id,
    };
    return this.postToTwitter("media/upload", payload).then((data)=> {
        console.log("Done with ", media_id)
        return data.media_id_string;
    });
};

module.exports.sendDM = (payload) => {
    return this.postToTwitter("direct_messages/events/new", {json_body: payload}).then((data) => {
    });
}

module.exports.shortCircuit = (value) => {
    return new Promise((resolve, reject) => {
        resolve(value);
    });
}

module.exports.postToTwitter = (endpoint, params) => {
    return new Promise((resolve, reject) => {
        client.post(endpoint, params, (error, data, response) => {
            if (error) {
                console.log("was error")
                resolve(0);
            } else {
                console.log(data)
                resolve(data);
            }
        });
    });
}