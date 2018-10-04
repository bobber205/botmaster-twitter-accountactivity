const Twitter = require('twitter');
const Twit = require('twit');
const _ = require('lodash');
const readlines = require('readlines');
const moment = require('moment');
const fs = require('fs');
var twitter_text_file_users = _.compact(readlines.readlinesSync("./scripts/responses/users.txt"));
var do_not_reply = _.compact(readlines.readlinesSync("./scripts/responses/donotreply.txt"));
// var celebs = _.compact(readlines.readlinesSync("./donotreply.txt"));
// var inactives_messaged = _.compact(readlines.readlinesSync("./inactives_messaged.txt"));
// var user_question_responses = _.compact(readlines.readlinesSync("./user_question_responses.txt"));
// var hashtag_responses = _.compact(readlines.readlinesSync("./hashtag.txt"));
// var inactive_users_responses = _.compact(readlines.readlinesSync("./inactives.txt"));
// var retweet_responses = _.compact(readlines.readlinesSync("./retweet_responses.txt"));
var like_count = 1;
var invite_count = 1;
var follower_count_array = [];
var mysql = require('mysql');
const redis = require('redis');
const redisClient = redis.createClient(process.env.REDIS_URL);
const bluebird = require('bluebird');
bluebird.promisifyAll(redis.RedisClient.prototype);
bluebird.promisifyAll(redis.Multi.prototype);

// var con = mysql.createConnection({
//     host: ""
//     user: ""
//     password: ""
//     database: ""
// });

//console.log(twitter_text_file_users.length+" on the do not message list");

var client = new Twitter({
    consumer_key: process.env.CHRP_TWITTER_CONSUMER_KEY,
    consumer_secret: process.env.CHRP_TWITTER_CONSUMER_SECRET,
    access_token_key: "136023366-K3lSVtHpKjZeWxpw80goSlkguVjp1S94RPWBfWhy",
    access_token_secret: "VZyzXNIdpGgnlAN41tIzdObgf4MWPpX44V9JRJOc8VoQ3"
});
var twit = new Twit({
    consumer_key: process.env.CHRP_TWITTER_CONSUMER_KEY,
    consumer_secret: process.env.CHRP_TWITTER_CONSUMER_SECRET,
    access_token: "136023366-K3lSVtHpKjZeWxpw80goSlkguVjp1S94RPWBfWhy",
    access_token_secret: "VZyzXNIdpGgnlAN41tIzdObgf4MWPpX44V9JRJOc8VoQ3"
});

function stream(keywords) {
    var stream = client.stream('statuses/filter', {
        track: keywords
    });
    //var stream = client.stream('statuses/filter', {track: 'I’m playing a game called @hqtrivia!'});
    stream.on('data', function (event) {

        // console.log(event);
        // debugger;

        if (event.user.screen_name.includes("trivia")) {
            logthis("Not liking or tweeting. Their username contains trivia.", event);
            return;
        }

        if (twitter_text_file_users.includes(event.user.screen_name)) {
            logthis("Not liking or tweeting. On the do not message list.", event);
            return;
        }


        like(event);
        invite(event, true);
    });

    stream.on('error', function (error) {
        throw error;
    });
}

function mentions(event) {
    var mentioned = event.entities.user_mentions;
    if (mentioned.length > 1) logthis("Mentioned more than one person", event);
}

function logthis(message, tweetobj) {
    if (tweetobj.user) {
        console.log("@" + tweetobj.user.screen_name + " - Followers: " + tweetobj.user.followers_count);
    }
    console.log(message);
    console.log("==========================");
}

function like(event) {
    // console.log("Liking " + id_in);

    if (event.user.followers_count < min_follower_count_for_like || event.user.followers_count > max_follower_count_for_like) {
        logthis("Not liking follower count needs to be between " + min_follower_count_for_like + " and " + max_follower_count_for_like, event);
        return;
    }

    client.post('favorites/create', {
        id: event.id_str
    }, function (err, response) {
        if (err) {
            logthis("User blocked us or we already liked.", response);
        } else {
            logthis("Liked their Tweet. " + like_count + " done so far.", response);
            twitter_text_file_users.push(event.user.screen_name);
            //setTimeout(invite, 60000, response, true);
            if (like_count > max_likes) throw "Quitting too many likes!";
            like_count++;
        }
    });
}

function invite(event, as_reply) {

    if (event.user.followers_count < min_follower_count_for_reply || event.user.followers_count > max_follower_count_for_reply) {
        logthis("Not tweeting follower count needs to be between " + min_follower_count_for_reply + " and " + max_follower_count_for_reply, event);
        return;
    }

    var rando_text = _.sample(invite_array);//invite_array[Math.floor(Math.random() * invite_array.length)];
    var status_text = `@${event.user.screen_name} ${rando_text}`;
    var tweet_reply_id = null;
    if (as_reply) tweet_reply_id = event.id_str;
    client.post('statuses/update', {
        status: status_text,
        in_reply_to_status_id: tweet_reply_id
    }, function (error, tweet_out, response) {
        if (!error) {
            logthis("Invited them. " + invite_count + " done so far.", event);
            fs.writeFileSync("./users.txt", event.user.screen_name + "\n", {
                flag: "a"
            });
            twitter_text_file_users.push(event.user.screen_name);
            if (invite_count > max_invites) throw "Quitting too many invites!";
            invite_count++;
        }
    });
}

function get_list(id) {
    client.get('lists/members', {
        list_id: id,
        skip_status: false
    }, function (error, response) {
        // if (error) throw error;
        // console.log("get_list response ==>", response);  // Raw response object.
        response.users.forEach(user => {
            // like(user.status.id_str);
            if (user.status && !user.status.in_reply_to_screen_name) {
                // console.log("Latest status ====>", user);
                // debugger;
                client.post('favorites/create', {
                    id: user.status.id_str
                }, function (err, response) {
                    if (err) {
                        logthis("User blocked us or we already liked.", response);
                    } else {
                        logthis("Liked their Tweet. " + like_count + " done so far.", response);
                        //setTimeout(invite, 60000, response, true);
                        if (like_count > max_likes) throw "Quitting too many likes!";
                        like_count++;
                    }
                });
            }
        });


    });
}

function get_lists() {
    client.get('lists/list', {
        user_id: '136023366'
    }, function (error, response) {
        // if(error) throw error;
        // console.log("get_lists response ==>",response);  // Raw response object.
        response.forEach(list => {
            get_list(list.id_str);
            // debugger;
        });
    });
}

function get_tweets_by_keyword(keywords, how_many) {
    client.get('search/tweets', {
        q: keywords,
        count: how_many
    }, function (error, tweets, response) {
        if (error) throw error;
        //console.log(tweets);  // The favorites.
        //console.log(response);  // Raw response object.
        var all_tweets = tweets.statuses;
        all_tweets.forEach(tweet => {

            if (twitter_text_file_users.includes(tweet.user.screen_name)) {
                logthis("Not liking or tweeting. On the do not message list.", tweet);
                return;
            }

            if (tweet.user.followers_count < min_follower_count_for_like || tweet.user.followers_count > max_follower_count_for_like) {
                logthis("Not liking or tweeting follower count needs to be between " + min_follower_count_for_like + " and " + max_follower_count_for_like, tweet);
                return;
            }

            like(tweet);
        });
        //debugger;
    });
}



function get_extra_lives() {
    client.get('search/tweets', {
        q: '#trivia #iqtrivia',
        count: 100
    }, function (error, tweets, response) {
        if (error) throw error;
        //console.log(tweets);  // The favorites.
        //console.log(response);  // Raw response object.
        var all_tweets = tweets.statuses;
        all_tweets.forEach(tweet => {
            console.log(tweet.user.screen_name + " posted " + calculateSince(tweet.created_at));
        });
        //debugger;
    });
}

function calculateSince(datetime) {
    var tTime = new Date(datetime);
    var cTime = new Date();
    var sinceMin = Math.round((cTime - tTime) / 60000);
    if (sinceMin == 0) {
        var sinceSec = Math.round((cTime - tTime) / 1000);
        if (sinceSec < 10)
            var since = 'less than 10 seconds ago';
        else if (sinceSec < 20)
            var since = 'less than 20 seconds ago';
        else
            var since = 'half a minute ago';
    } else if (sinceMin == 1) {
        var sinceSec = Math.round((cTime - tTime) / 1000);
        if (sinceSec == 30)
            var since = 'half a minute ago';
        else if (sinceSec < 60)
            var since = 'less than a minute ago';
        else
            var since = '1 minute ago';
    } else if (sinceMin < 45)
        var since = sinceMin + ' minutes ago';
    else if (sinceMin > 44 && sinceMin < 60)
        var since = 'about 1 hour ago';
    else if (sinceMin < 1440) {
        var sinceHr = Math.round(sinceMin / 60);
        if (sinceHr == 1)
            var since = 'about 1 hour ago';
        else
            var since = 'about ' + sinceHr + ' hours ago';
    } else if (sinceMin > 1439 && sinceMin < 2880)
        var since = '1 day ago';
    else {
        var sinceDay = Math.round(sinceMin / 1440);
        var since = sinceDay + ' days ago';
    }
    return since;
};

function get_followers(cursor_in) {
    console.log("Getting followers", cursor_in);
    client.get('followers/list', {
        count: 200,
        cursor: cursor_in
    }, function (error, response) {
        if (error) {
            console.log("Error getting followers", error);
            debugger;
        }
        response.users.forEach(user => {
            var user_obj = {
                followers: user.followers_count,
                username: user.screen_name
            };
            follower_count_array.push(user_obj);
        });
        cursor_in = response.next_cursor;
        if (cursor_in != 0) {
            get_followers(cursor_in);
        } else {
            follower_count_array.sort(dynamicSort("followers"));
            follower_count_array.forEach(person => {
                console.log(person.username + " " + person.followers);
            });
        }
    });
}

function dynamicSort(property) {
    var sortOrder = 1;
    if (property[0] === "-") {
        sortOrder = -1;
        property = property.substr(1);
    }
    return function (a, b) {
        var result = (a[property] < b[property]) ? -1 : (a[property] > b[property]) ? 1 : 0;
        return result * sortOrder;
    }
}

function send_inactive_dm(recipient_id, message) {
    // DM
    params = {
        event: {
            "type": "message_create",
            "message_create": {
                "target": {
                    "recipient_id": recipient_id
                },
                "message_data": {
                    "text": message,
                    // "attachment": { type: "media", media: { id:"1035221309742034947"}}
                    "quick_reply": {
                        "type": "options",
                        "options": [{
                            label: "👍 I'm in",
                            meta_data: 'i_am_in',
                            description: 'Ready to play!'
                        }]
                    }
                },
            }
        }
    }

    twit.post('direct_messages/events/new', params, function (error, tweet_out, response) {
        if (!error) {
            console.log("Sent DM: " + message);
            console.log(invite_count + " DMd done so far.");
            invite_count++;
        } else {
            console.log(error);
        }
    });
}

function send_dm(recipient_id, message) {
    // DM
    params = {
        event: {
            "type": "message_create",
            "message_create": {
                "target": {
                    "recipient_id": recipient_id
                },
                "message_data": {
                    "text": message,
                    // "attachment": { type: "media", media: { id:"1035221309742034947"}}
                },
            }
        }
    }

    twit.post('direct_messages/events/new', params, function (error, tweet_out, response) {
        if (!error) {
            console.log("Sent DM: " + message);
            console.log(invite_count + " DMd done so far.");
            invite_count++;
        } else {
            console.log(error);
        }
    });
}

function dm_winners_to_get_emails(num_qestions) {
    con.query("select * from users where paypal_email IS NULL and twitter_account_id in (select distinct(acting_account_id) from direct_message_events where correct = 1 and quiz_id = (select quiz_id from direct_message_events where receiving_account = 'IQtrivia' order by id desc limit 1) group by acting_account having count(id) = " + num_qestions + ");", function (err, result, fields) {
        if (err) throw err;
        result.forEach(user => {
            var status_text = "Please store your PayPal email so we can pay you for the win. Tap here and press enter to do so. I'll then ask for your email address. https://twitter.com/messages/compose?recipient_id=136023366&text=Store%20my%20PayPal%20email%20to%20get%20paid";
            send_dm(user.twitter_account_id, status_text);
        });
        con.end();
    });
}


function get_all_winners(limit) {
    var last_total = 0;
    con.query("select * from win_events order by id desc limit " + limit + ";", function (err, result, fields) {
        if (err) throw err;
        result.forEach(user => {
            if (last_total != user.amount_won_usd) console.log("\n$" + user.amount_won_usd + " each - " + user.created_at);
            console.log(user.to_email_address);
            last_total = user.amount_won_usd;
        });
        con.end();
    });
}


function cleanse_usernames(ids_in) {
    console.log("Cleansing " + ids_in.length + " people.");
    if (ids_in.length < 120) {
        var ids = ids_in.join();
        client.get('users/lookup', {
            user_id: ids
        }, function (error, response) {
            if (error) throw error;
            message_inactives(response);
        });
    }
}

function inactives(num_days_in) {
    var num_days = (moment().utc() / 1000) - (86400 * num_days_in);
    con.query("select * from users where sub_status != 'stopped' and last_time_interacted <= FROM_UNIXTIME(" + num_days + ") ORDER BY last_time_interacted;", function (err, result, fields) {
        if (err) throw err;
        var counter = 0;
        result.forEach(dbuser => {
            if (!inactives_messaged.includes(dbuser.twitter_account_name)) {
                console.log(dbuser.twitter_account_name + " " + dbuser.last_time_interacted + "  " + dbuser.sub_status);
                counter++;
            }
        });
        console.log("You're about to DM " + counter + " inactives. Are you sure?");
        debugger;
        counter = 0;
        result.forEach(dbuser => {
            if (!inactives_messaged.includes(dbuser.twitter_account_name)) {
                var rando_text = inactive_users_responses[Math.floor(Math.random() * inactive_users_responses.length)];
                // send_inactive_dm(dbuser.twitter_account_id, rando_text);
                var get = setTimeout(send_inactive_dm, counter, dbuser.twitter_account_id, rando_text);
                counter += 1000;
                // add them to do not message
                fs.writeFileSync("./inactives_messaged.txt", dbuser.twitter_account_name + "\n", {
                    flag: "a"
                });
                // give them an extra life
                redisClient.hincrby("Chirpify::IQTrivia::globalextraLives::ExtraLives", dbuser.twitter_account_name.toLowerCase(), 1, redis.print);
            }
        });
        con.end();
    });
}

function test_inactives() {
    var rando_text = inactive_users_responses[Math.floor(Math.random() * inactive_users_responses.length)];
    send_inactive_dm("19081905", rando_text);
    // add them to do not message
    //fs.writeFileSync("./inactives_messaged.txt", dbuser.twitter_account_name + "\n", { flag: "a" });
    //twitter_text_file_users.push(dbuser.twitter_account_name);
    // give them an extra life
    redisClient.hincrby("Chirpify::IQTrivia::GlobalExtraLives::ExtraLives", "christeso", 1, redis.print);
}

function retweet_campaign(keywords) {
    var stream = client.stream('statuses/filter', {
        track: keywords
    });
    stream.on('data', function (event) {

        // console.log(event);
        // debugger;

        if (event.user.screen_name == "IQtrivia") {
            logthis("Not responding becuase we Tweeted it!", event);
            return;
        }

        if (!event.retweeted_status) {
            logthis("Not responding. They used " + keywords + " but its not a retweet.", event);
            return;
        }

        if (do_not_reply.includes(event.user.screen_name)) {
            logthis("Do not reply already replied to them.", event);
            return;
        }

        var rando_text = retweet_responses[Math.floor(Math.random() * hashtag_responses.length)];
        var status_text = "@" + event.user.screen_name + " " + rando_text;

        // logthis("Responded to their retweet. " + invite_count + " done so far.", event);

        client.post('statuses/update', {
            status: status_text,
            in_reply_to_status_id: event.id_str,
            auto_populate_reply_metadata: true
        }, function (error, tweet_out, response) {
            if (!error) {
                logthis("Responded to their retweet. " + invite_count + " done so far.", event);
                do_not_reply.push(event.user.screen_name);
                invite_count++;
            }
        });
    });

    stream.on('error', function (error) {
        throw error;
    });
}

function user_questions(keywords, hashtag) {
    var stream = client.stream('statuses/filter', {
        track: keywords
    });
    stream.on('data', function (event) {
        var question_text = event.text.replace(keywords.toLowerCase(), '');
        question_text = question_text.replace(keywords, '');
        question_text.replace(hashtag.toLowerCase(), '');
        question_text = question_text.replace(hashtag, '');
        var username = event.user.screen_name;
        var user_id = event.user.id_str;
        var timestamp = moment().utc().format();
        var hashtags = event.entities.hashtags;

        var they_used_the_right_hashtag = false;
        hashtags.forEach(hashtag_in => {
            var hashtag_sting = "#" + hashtag_in.text
            console.log("hashtag_in.text ===>", hashtag_in.text);
            console.log("hashtag_sting ===>", hashtag_sting);
            if (hashtag_sting == hashtag || hashtag_sting == hashtag.toLowerCase()) they_used_the_right_hashtag = true;
        });

        if (!they_used_the_right_hashtag) {
            logthis("Not responding becuase they didn't use " + hashtag, event);
            return;
        }

        if (username == "IQtrivia") {
            logthis("Not responding becuase we Tweeted it!", event);
            return;
        }

        var query_statement = "INSERT INTO user_questions (created_at, twitter_account_name, twitter_account_id, question_text) VALUES('" + timestamp + "', '" + username + "', '" + user_id + "', '" + question_text + "');"
        con.query(query_statement, function (err, result, fields) {
            if (err) throw err;
            var rando_text = user_question_responses[Math.floor(Math.random() * user_question_responses.length)];
            var status_text = "@" + username + " " + rando_text;
            client.post('statuses/update', {
                status: status_text,
                in_reply_to_status_id: event.id_str,
                auto_populate_reply_metadata: true
            }, function (error, tweet_out, response) {
                if (!error) {
                    logthis("Responded to their reply post. " + invite_count + " done so far.", event);
                    //if (invite_count > max_invites) throw "Quitting too many invites!";
                    invite_count++;
                }
            });
        });
    });

    stream.on('error', function (error) {
        throw error;
    });
}

function reply_campaign(keywords, require_mentions) {
    var stream = client.stream('statuses/filter', {
        track: keywords
    });
    stream.on('data', function (event) {
        if (event.user.screen_name == "IQtrivia") {
            logthis("Not responding becuase we Tweeted it!", event);
            return;
        }

        if (do_not_reply.includes(event.user.screen_name)) {
            logthis("Do not reply already replied to them.", event);
            return;
        }

        var rando_text = "";

        if (require_mentions) {
            //console.log(event);
            var mentions = event.entities.user_mentions;
            mentions = _.reject(mentions, (name) => {
                return ['iqtrivia', event.user.screen_name.toLowerCase()].includes(name.screen_name.toLowerCase())
            });
            // console.log("mentions ==> ",mentions);
            // they didn't mention anyone
            if (mentions.length == 0) {
                // rando_text = "Sorry, you need to tag people that have not played before to get an extra life! 👀";
                // var status_text = "@" + event.user.screen_name + " " + rando_text;
                // client.post('statuses/update', { status: status_text, in_reply_to_status_id: event.id_str, auto_populate_reply_metadata: true }, function (error, tweet_out, response) {
                //     if (!error) {
                //         logthis("Responded to their reply post. " + invite_count + " done so far.", event);
                //         //if (invite_count > max_invites) throw "Quitting too many invites!";
                //         invite_count++;
                //     }
                // });
            } else {
                var already_tweeted = false;
                //loop through mentions and make sure the mention is someone besides us and themselves
                mentions.forEach(user => {
                    // console.log("user ==> ",user);                
                    // look up each user to see if they've played
                    con.query("select * from users where twitter_account_name = '" + user.screen_name + "';", function (err, result, fields) {
                        if (err) throw err;
                        if (result.length > 0) {
                            rando_text = "Sorry, you need to tag people that have not played before to get an extra life! 👀";
                        } else {
                            rando_text = hashtag_responses[Math.floor(Math.random() * hashtag_responses.length)];

                            if (celebs.includes(user.screen_name)) {
                                rando_text = "Sorry, celebs and brands don't count! 👀";
                            } else {
                                // fs.writeFileSync("./donotreply.txt", event.user.screen_name + "\n", { flag: "a" });
                                do_not_reply.push(event.user.screen_name);
                            }
                        }
                        var status_text = rando_text;
                        if (!already_tweeted) {
                            already_tweeted = true;
                            // console.log(status_text);
                            // debugger;
                            client.post('statuses/update', {
                                status: status_text,
                                in_reply_to_status_id: event.id_str,
                                auto_populate_reply_metadata: true
                            }, function (error, tweet_out, response) {
                                if (!error) {
                                    logthis("Responded to their reply post. " + invite_count + " done so far.", event);
                                    invite_count++;
                                }
                            });
                        }
                    });
                });
            }
        }
    });

    stream.on('error', function (error) {
        throw error;
    });
}

function broadcast_dms(hashtag) {
    var stream = client.stream('statuses/filter', {
        track: hashtag
    });
    stream.on('data', function (event) {
        console.log("Tweet in ==> ", event);
        // debugger;
        // make sure we tweeted it
        if (event.user.screen_name != "IQtrivia") {
            logthis("We didn't tweet " + hashtag, event);
            return;
        }

        if (event.extended_tweet) {
            var dm_text = event.extended_tweet.full_text.replace(hashtag, '');
        } else {
            var dm_text = event.text.replace(hashtag, '');
        }

        dm_text = dm_text.replace(/(?:https?|ftp):\/\/[\n\S]+/g, '');

        // got a tweet, grab all people that are in the game
        redisClient.hkeysAsync("Chirpify::IQTrivia::PlayingQuiz::iqtrivia").then((peopel_playing) => {
            //loop  through people and dm them
            // peopel_playing = ["19081905"];
            peopel_playing.forEach(id => {
                send_dm(id, dm_text);
            });
        });
    });

    stream.on('error', function (error) {
        throw error;
    });

}

function dm_players(message) {
    redisClient.hkeysAsync("Chirpify::IQTrivia::PlayingQuiz::iqtrivia").then((peopel_playing) => {
        //loop  through people and dm them
        // peopel_playing = ["19081905"];
        console.log("You're about to DM " + peopel_playing.length + " people. Are you sure?");
        // debugger;
        peopel_playing.forEach(id => {
            send_dm(id, message);
        });
    });
}

function get_current_players() {
    // got a tweet, grab all people that are in the game
    redisClient.hkeysAsync("Chirpify::IQTrivia::PlayingQuiz::iqtrivia").then((peopel_playing) => {
        console.log(peopel_playing.length + " people registered");
        con.query("select * from users where twitter_account_id IN (" + peopel_playing + ");", function (err, result, fields) {
            console.log((peopel_playing.length - result.length) + " people are newbs");
            if (err) throw err;
            result.forEach(dbuser => {
                console.log("@" + dbuser.twitter_account_name + " - " + dbuser.follower_count + " followers");
            });
        });
    });
}

function get_instagram_followers_step4(username) {
    // username = "christeso";
    var request = require("request");
    var url = "https://www.instagram.com/" + username;
    request.get(url, function (err, response, body) {
        if (body) {
            if (response.body.indexOf(("meta property=\"og:description\" content=\"")) != -1) {
                var followers = response.body.split("meta property=\"og:description\" content=\"")[1].split("Followers")[0];
                console.log(followers);
                fs.writeFileSync("./instagram.txt", username + " - " + followers + "\n", {
                    flag: "a"
                });
            }
        }
    });
}

function get_instagram_followers() {
    // load the instagram usernames
    var usernames = _.compact(readlines.readlinesSync("./insta-usernames.txt"));
    var counter = 0;
    usernames.forEach(username => {
        // go get their follower number
        counter += 1000;
        var get = setTimeout(get_instagram_followers_step4, counter, username);
    });
}

function delete_tweets(num_tweets) {
    // go get out last num_tweets
    client.get('statuses/user_timeline', {
        screen_name: "IQtrivia",
        count: num_tweets
    }, function (error, tweets, response) {
        if (error) throw error;
        // console.log(tweets);  // The favorites.
        //console.log(response);  // Raw response object.
        console.log("You're about to delete " + tweets.length + " tweets. Are you sure?");
        debugger;
        tweets.forEach(tweet => {
            //delete
            console.log("Deleting ", tweet.id_str);
            client.post('statuses/destroy', {
                id: tweet.id_str
            }, function (error, tweetdeleted, responses) {
                console.log("Deleted ", tweetdeleted);
            });
        });
    });
}

//get_extra_lives();
var invite_array = _.compact(readlines.readlinesSync("./scripts/responses/invite.txt"));
// var invite_array = _.compact(readlines.readlinesSync("./trivia-tuesday.txt"));
// var invite_array = _.compact(readlines.readlinesSync("./trending.txt"));
//var invite_array = _.compact(readlines.readlinesSync("./hqwinnings.txt"));

var max_likes = 400;
var max_invites = 400;
var min_follower_count_for_like = 0;
var max_follower_count_for_like = 100000;
var min_follower_count_for_reply = 100;
var max_follower_count_for_reply = 600;

stream("hqtrivia,hqsports,hqtriviauk");
// stream("trivia tuesday");
// stream("#SocialROI");
// get_tweets_by_keyword("I’m playing a game called @hqtrivia!", 100);
// get_tweets_by_keyword("trivia tuesday", 100);

// get_lists();

// user_questions("@iqtrivia", "#WednesdayWisdom");

// delete at 1378 on do not reply list
// reply_campaign("@iqtrivia", true);

// this broadcasts all players a dm based on a tweet
// broadcast_dms("#IQDOYOU");

// this broadcasts all players a dm
// dm_players("⏰ 30 minutes until game time! Want an extra life? Tap here https://twitter.com/IQtrivia/status/1037052870359638017");
// dm_players("☝️ THAT WAS SAVAGE");

// delete at 1378 on do not reply list
// retweet_campaign("#IQLife");

// get_instagram_followers();

// delete_tweets(1);

// con.connect(function(err) {
//     if (err) throw err;
//     // get_leaderboard_html(100, false);
//     // get_all_winners(30);
//     // dm_winners_to_get_emails(12);
//     // inactives(14);
//     // test_inactives();
//     // get_current_players();
// });