'use strict';

const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const request = require('request-promise');
const BaseBot = require('botmaster').BaseBot;
const debug = require('debug')('botmaster:messenger');

const securityHelpers = require('./helpers/security');
const questionHelpers = require('./helpers/questionHelpers');
const redisHelpers = require('./helpers/redisHelpers');
const configHelpers = require('./helpers/configHelper');

var Promise = require("bluebird");
var join = Promise.join;

const moment = require('moment');
const randomstring = require("randomstring");
const thize = require('thize');

const redis = require('redis');
const redisClient = redis.createClient(process.env.REDIS_URL);

// Make all redis commands promises 
const bluebird = require('bluebird');
bluebird.promisifyAll(redis.RedisClient.prototype);
bluebird.promisifyAll(redis.Multi.prototype);

const use_realtime = process.env.USE_REALTIME == '1';
const use_random_handles = process.env.USE_RANDOM_HANDLES == '1';
const reply_answer_status_to_user = process.env.REPLY_ANSWER_STATUS_TO_USER == '1';
const log_all_dm_messages = process.env.LOG_ALL_DM_MESSAGES == '1';


const Sidekiq = require('sidekiq');

const sidekiqConnection = new Sidekiq(redisClient);

const _ = require('lodash');

const Twit = require("twit");

let app_configuration = {};
let iq_score_configuration = {};

const valid_bot_handles = ['iqtrivia', 'sadtrebek', 'happytrebek'];

redisClient.on('connect', function(err) {

  _.each(valid_bot_handles, (handle) => {
        console.log(`Getting config for ${handle}`); 
        var config_keys = [redisHelpers.getConfigurationKeyForHandle(handle), redisHelpers.getConfigurationKeyForIQScores(handle)]
        var config_defs = _.map(config_keys, (key) => {return redisClient.getAsync(key);});
        join(...config_defs).then((config_json_array) => {
          if (!config_json_array[0]) config_json_array[0] = '{}';
          if (!config_json_array[1]) config_json_array[1] = '[]';

          iq_score_configuration[handle] = JSON.parse(config_json_array[1]);

          console.log(`IQ Score Length ${iq_score_configuration.length}`);
          var config_json = config_json_array[0];
          console.log(config_json);
          var config = JSON.parse(config_json);
          app_configuration[handle] = config;
      });
  });

  // var config_keys = [redisHelpers.getConfigurationKeyForHandle(process.env.BOT_HANDLE), redisHelpers.getConfigurationKeyForIQScores(process.env.BOT_HANDLE)]
  // var config_defs = _.map(config_keys, (key) => {return redisClient.getAsync(key);});
  // join(...config_defs).then((config_json_array) => {
  //   if (!config_json_array[0]) config_json_array[0] = '{}';
  //   if (!config_json_array[1]) config_json_array[1] = '{}';

  //   iq_score_configuration = JSON.parse(config_json_array[1]);

  //   console.log(`IQ Score Length ${iq_score_configuration.length}`);
  //   var config_json = config_json_array[0];
  //   console.log(config_json);
  //   var config = JSON.parse(config_json);
  //   app_configuration = config;
  // });
  redisClient.hgetallAsync(redisHelpers.getExtraLifeHashKey(process.env.BOT_HANDLE)).then((whole_hash) => {
    console.log("All of the extra life hash");
    console.log(whole_hash);
  });
});

class TwitterAccountActivityBot {

  constructor(settings, expressApp) {
    // this.__applySettings(settings);
    this.__createMountPoints(expressApp);

    // const twitCredentials = {
    //   consumer_key: settings.credentials.consumerKey,
    //   consumer_secret: settings.credentials.consumerSecret,
    //   access_token: settings.credentials.accessToken,
    //   access_token_secret: settings.credentials.accessTokenSecret,
    // };
    // this.twitterClient = new Twit(twitCredentials);
    this.twitterClients = {};
  }

  __getTwitterClientForHandle(handle) {
    handle = handle.toLowerCase();
    if (this.twitterClients[handle]) return this.twitterClients[handle];
    console.log(`Creating new Client for ${handle}`);
    var config = configHelpers.getTwitterConfigurationObjectForHandle(handle);
    var twitCredentials = {
      consumer_key: config.twitter_consumer_key,
      consumer_secret: config.twitter_consumer_secret,
      access_token: config.twitter_bot_access_token,
      access_token_secret: config.twitter_bot_access_token_secret,
    }
    var result = new Twit(twitCredentials);
    this.twitterClients[handle] = result;
    return this.__getTwitterClientForHandle(handle);
  }

  /**
   * @ignore
   * sets up the app. that will be mounted onto a botmaster object
   * Note how neither of the declared routes uses webhookEndpoint.
   * This is because I can now count on botmaster to make sure that requests
   * meant to go to this bot are indeed routed to this bot. Otherwise,
   * I can also use the full path: i.e. `${this.type}/${this.webhookEndpoing}`.
   */
  __createMountPoints(expressApp) {
    this.app = expressApp; //express();
    // so that botmaster can mount this bot object onto its server
    this.requestListener = this.app;
    this.app.use(bodyParser.urlencoded({ extended: true }));
    this.app.use(bodyParser.json());

    this.app.get('/loaderio-da48e84c9cdd99ef88e7743b1cb3bf5e', (req, res) => {
      res.status('200').send('loaderio-da48e84c9cdd99ef88e7743b1cb3bf5e');
    });

    this.app.get('/', (req, res) => {
      res.status(200).send('In Bot');
    });

    this.app.get('/twitter/webhook', (req, res) => {
      if (req.query.crc_token) {
        this.__doCRCResponse(req, res);
      } else {
        res.status(200).send('In Bot -- No CRC Token Found');
      }
    });

    this.app.post('/twitter/webhook', (req, res) => {
      console.log("In twitter post")
      // console.log("Post Call received");
      // console.log(req.headers);
      // console.log(req.body);
      this.__processWebhookEvent(req.body, req, res);
      res.sendStatus(200);
    });
  }

  __logFavoriteEvents(messages) {
    let users_array = messages['users'];
    _.each(messages['favorite_events'], entry => {
      let payload = { 
        created_at: moment().utc().format(), full_object: JSON.stringify(messages, null, '\t'), 
        favorited_status: entry.favorited_status.id_str, 
        acting_account: entry.user.screen_name, 
        receiving_account: entry.favorited_status.user.screen_name 
      };
      sidekiqConnection.enqueue(
        'Chirpify::Workers::GenericLoggerWorker',
        ['favorite_events', JSON.stringify(payload)],
        {
          queue: 'default'
        }
      );
    });
  }

  __processDirectMessageEvent(messages, request, response)  {
    let users_array = messages['users'];
    let events = messages['direct_message_events'];
    console.log(`Got ${events.length} messages` );

    _.each(events, (direct_message_entry) => {
      console.log(`direct_message_entry.message_create.source_app_id ${direct_message_entry.message_create.source_app_id}`);
      if (direct_message_entry.message_create.source_app_id == "125311" || direct_message_entry.message_create.source_app_id == "268278") {
        console.log(`Ignoring ${direct_message_entry.message_create.message_data.text}`);
        return; //268278 is twitter's web app id apparently
      }
      let recipient_id = direct_message_entry['message_create']['target']['recipient_id'];
      let sender_id = direct_message_entry['message_create']['sender_id'];
      let receiver_object = users_array[recipient_id];
      let sender_object = users_array[sender_id];
      
      let master_quiz_object_key = redisHelpers.getMasterQuestionObjectKey(receiver_object.screen_name);
      let answer_sent_time = parseInt(direct_message_entry['created_timestamp']) / 1000; //get rid of ms

      if (use_realtime) {
        answer_sent_time = moment().format('X'); //utc w/o ms
      }

      var quiz_def = redisClient.getAsync(master_quiz_object_key);
      var extra_lives_def = redisClient.hgetAsync(redisHelpers.getExtraLifeHashKey(receiver_object.screen_name), sender_object.screen_name);
      var iq_score_def = redisClient.hgetAsync(redisHelpers.getIQStatsKey(), sender_object.screen_name);
      
      var welcome_message_id_found;
      if (!direct_message_entry['initiated_via']) {
        welcome_message_id_found = '0';
      } else {
        welcome_message_id_found = direct_message_entry['initiated_via']['welcome_message_id']
      }
       


      join(quiz_def, extra_lives_def, iq_score_def, (whole_question_object, hash_values, score) => {
        console.log("HASH VALUES", hash_values);
        console.log("SCORE", score);

        let extra_life_status = hash_values;
        let iq_score_object = JSON.parse(score || '{}');


        let user_iq_score = iq_score_object['percentile'] || 0;
        let original_message_text = direct_message_entry.message_create.message_data.text;
        let dm_url = direct_message_entry.message_create.message_data.entities.urls[0];
        let message_text_urls_removed;

        console.log('dm url', dm_url);
        if (dm_url) {
          console.log("removing!", dm_url.url);
          message_text_urls_removed = _.chain(original_message_text).replace(dm_url.url, '').trim().value();
          console.log("message_text_urls_removed ==>  ", message_text_urls_removed);
        } else {
          console.log("Didn't do anything");
          message_text_urls_removed = original_message_text;
        }

        let is_not_bot_entry = _.intersection([message_text_urls_removed.trim().toLowerCase()], ['iq score', 'faq']).length == 0;

        let quick_reply_response_object = direct_message_entry.message_create.message_data.quick_reply_response;

        if (!quick_reply_response_object) is_not_bot_entry = false;

        if (whole_question_object) {
          whole_question_object = JSON.parse(whole_question_object);
          
          let quiz_id = whole_question_object.quiz_id;

          let master_question_object = whole_question_object.quiz;
          
          console.log("Answer Sent Time", answer_sent_time);

          let question_matched = questionHelpers.determineQuestionAnsweredByWelcomeID(welcome_message_id_found, master_question_object);
          // let question_matched = questionHelpers.determineQuestionAnswered(answer_sent_time, master_question_object);
          
          console.log("Question Matched", question_matched);
          
          if (question_matched && is_not_bot_entry && question_matched['current'] == '1') {
            direct_message_entry['quiz_id'] = quiz_id;

            let answer_matched_array = _.intersection(question_matched.answers, [message_text_urls_removed]);

            console.log("Answer Matched Array", answer_matched_array, message_text_urls_removed);

            direct_message_entry['question_number'] = question_matched.question_number;
            
            let was_correct = answer_matched_array.length > 0;
            
            direct_message_entry['correct'] = was_correct ? "1" : "0";
            var extra_life_used = false;

            if (!was_correct && extra_life_status == "1") {
              // user has an extra live so mark it was correct
              direct_message_entry['correct'] = "1";
              direct_message_entry['extra_life_used'] = "1"
              redisClient.hmset(redisHelpers.getExtraLifeHashKey(receiver_object.screen_name), sender_object.screen_name, "0", redis.print);
              was_correct = false //make rest of app behave like the user was right
              extra_life_used = true;
            }

            direct_message_entry['late'] = 0;
            direct_message_entry["answer_value"] = ['A','B','C','D'][_.indexOf(question_matched.all_answers, message_text_urls_removed)]

            if (is_not_bot_entry) {
              redisClient
                .hgetAsync(
                  redisHelpers.alreadyLoggedAnswerKey(
                    receiver_object.screen_name,
                    question_matched.question_number
                  ),
                  sender_object.screen_name
                )
                .then(already_logged_value => {
                  if (already_logged_value != "1") {
                    this.__logDirectMessageEvent(
                      users_array,
                      direct_message_entry,
                      messages
                    );
                    redisClient.hset(
                      redisHelpers.alreadyLoggedAnswerKey(
                        receiver_object.screen_name,
                        question_matched.question_number
                      ),
                      sender_object.screen_name,
                      "1",
                      redis.print
                    );
                  }
                });
            }

            if (reply_answer_status_to_user) {
              var already_late_users_key = redisHelpers.getLateUsersRedisKey(receiver_object.screen_name);
              var message_to_user = was_correct ? questionHelpers.getRightAnswerResponse(question_matched.question_number + 1) : questionHelpers.getWrongAnswerResponse(question_matched.question_number + 1);
              if (extra_life_used) message_to_user = "You got it wrong, but are saved by your extra life. Play on!";
              // redisClient.hgetAsync(already_late_users_key, sender_object.screen_name).then((answered_late_value) => {
              
              var message_value_type = was_correct ? "correct" : "wrong";
              var responded_status_key = redisClient.hgetAsync(redisHelpers.getRespondedAnswerKey(receiver_object.screen_name, question_matched.question_number), sender_object.screen_name);
              var responded_status_key_by_answer_value = redisClient.hgetAsync(redisHelpers.getRespondedByStatusKey(receiver_object.screen_name, message_value_type), sender_object.screen_name);
              join(responded_status_key, responded_status_key_by_answer_value).then((values) => {
                var already_responded_value = values[0];
                var responded_status_value = values[1];
                console.log("fucking values wtf", values);
                console.log('Status Value! ==> ', already_responded_value, responded_status_value, arguments);
                if (is_not_bot_entry) {
                    if (Math.random() > 0.91) {
                      message_value_type = 'wait';
                      message_to_user = questionHelpers.getWaitAnswerResponse(question_matched.question_number + 1);
                    }
                    else if (responded_status_value != "1" && extra_life_used) {
                      message_to_user = `${message_to_user} We'll post the results and next question on our feed in 20 seconds!`;
                    }
                    else if (responded_status_value != "1" && !was_correct) {
                      message_to_user = `${message_to_user} You can't win the prize, but you should keep playing to improve your IQ score, which is currently ${user_iq_score}. We'll post the results and the next question on our feed in 20 seconds!`;
                    } else if (responded_status_value != "1" && was_correct) {
                      message_to_user = `${message_to_user}  We'll post the results and next question on our feed in 20 seconds!`;
                    }
                } else {
                  this.__standardBotMenuResponse(recipient_id, sender_id, receiver_object.screen_name);
                }
                if (already_responded_value != "1" && is_not_bot_entry) {
                  this.__sendDMToUser(sender_id, receiver_object.screen_name, message_to_user, true, message_value_type);
                  redisClient.hset(redisHelpers.getRespondedByStatusKey(receiver_object.screen_name, message_value_type), sender_object.screen_name, "1", redis.print);
                  redisClient.hset(redisHelpers.getRespondedAnswerKey(receiver_object.screen_name, question_matched.question_number), sender_object.screen_name, "1", redis.print);
                } else if (!is_not_bot_entry) {
                  // no op for now
                }
              });
            }
          } else { //no question was matched!
            // This is where we would send a message back saying you are too late!
            console.log('was not a legit answer', message_text_urls_removed);
            direct_message_entry['correct'] = "0";
            direct_message_entry['late'] = "1";
            if (process.env.LOG_LATE_POSTS == '1') {
              this.__logDirectMessageEvent(users_array, direct_message_entry, messages);
           }
           if (message_text_urls_removed.toUpperCase() == 'FAQ') {
             this.__sendFAQLink(sender_id, receiver_object.screen_name);
           } else if (message_text_urls_removed.toUpperCase() == 'IQ SCORE' || message_text_urls_removed.toUpperCase() == 'IQ') {
             console.log("User IQ Score", user_iq_score);
             console.log(iq_score_object);
             this.__sendUserIQScore(sender_id, sender_object.screen_name, receiver_object.screen_name, user_iq_score);
           } else if (message_text_urls_removed.toUpperCase() == 'RANDOMTEST') {
             this.__sendDMToUser(sender_id, receiver_object.screen_name, `some basic message`, false);
           }
           else if (is_not_bot_entry && (question_matched && question_matched['current'] == '0')) {
              this.__sendDMToUser(sender_id, receiver_object.screen_name, `Sorry, you answered too late! You can't win cash, but you should keep playing to improve your IQ score, which is currently ${user_iq_score}.`, true, `late`);
           } else {
             this.__standardBotMenuResponse(recipient_id, sender_id, receiver_object.screen_name);
           }
          }
        }
      });
    });
  }
  
  __sendFAQLink(sender_id, bot_owner_name) {
    this.__sendDMToUser(sender_id, bot_owner_name, `Go here for frequently asked questions. Where we answer your questions for a change…  https://medium.com/iqtrivia/faq-ff29c1d9b06b`, false);
  }

  __sendUserIQScore(sender_id, sender_handle, bot_owner_name, user_iq_score) {
    console.log(`Looking up IQ score for ${sender_handle}`);
    redisClient.hgetAsync(redisHelpers.getIQStatsKey(), sender_handle).then((result) => {
      if (!result) {
        this.__sendDMToUser(sender_id, bot_owner_name, `Your IQ score isn't available until you've played your first game.\n\nCome play weekdays at 12:30 PST!`, false);
      } else {
        result = JSON.parse(result);
        var percentile  = result["percentile"];
        var total_count = result["total_question_count"];
        var right_count = result["right_answer_count"];
        var wrong_count = result["wrong_answer_count"];
        var quizzes_count = result["quizzes_count"];
        var rank = thize(result["leaderboard_rank"]);
        if (percentile == 0) {
          this.__sendDMToUser(sender_id, bot_owner_name, `Sorry but your IQ score is currently 0. Play more quizzes to increase your score!`, false);
        } else {
          this.__sendIQDMToUser(sender_id, bot_owner_name, `Your IQ score is ${percentile}.\nYou've played ${quizzes_count} games.\n${right_count} questions right.\n${wrong_count} questions wrong.\nYou are in ${rank} place!`, user_iq_score);
        }
      }
    });
  }

  __sendIQDMToUser(recipient_id, bot_owner_name, message_text, user_iq_score) {
    // if (!user_iq_score) user_iq_score = "1";
    let dm_payload = {
      event: {
        type: 'message_create',
        message_create: {
          target: {
            recipient_id: `${recipient_id}`
          },
          message_data: {
            text: message_text
          }
        }
      }
    };

    var media_id_to_send = questionHelpers.getAppropriateMediaAssetForIQScore(iq_score_configuration, (parseInt(user_iq_score) - 1));

    if (media_id_to_send) {
      dm_payload.event.message_create.message_data.attachment = {
        type: `media`,
        media: {
          id: media_id_to_send
        }
      }
    }

    console.log("media id to send", media_id_to_send, parseInt(user_iq_score));
    this.__getTwitterClientForHandle(bot_owner_name).post('direct_messages/events/new', dm_payload, (response) => {
      console.log("DM RESPONSE", response);
      this.__logErrorEvent(recipient_id, response);
    });
  }

  __sendDMToUser(recipient_id, bot_owner_name, message_text, send_image = true, image_type = 'correct') {
    console.log(`__sendDMToUser ==> Sending Message to ${recipient_id}`, message_text);
    let dm_payload = {
      event: {
        type: 'message_create',
        message_create: {
          target: {
            recipient_id: `${recipient_id}`
          },
          message_data: {
            text: message_text
          }
        }
      }
    };
    if (send_image) {
      var media_id_to_send = questionHelpers.getAppropriateMediaAsset(app_configuration, image_type);
      dm_payload.event.message_create.message_data.attachment = {
        type: "media",
        media: {
          id: media_id_to_send
        }
      }
    }
    console.log("DM PAYLOAD");
    console.log(dm_payload);
    this.__getTwitterClientForHandle(bot_owner_name).post('direct_messages/events/new', dm_payload, (response) => {
      console.log("DM RESPONSE", response);
      this.__logErrorEvent(recipient_id, response);
    });
  }

  __logErrorEvent(recipient_id, error_object) {
    let payload = { receiving_account: recipient_id, full_object: JSON.stringify(error_object, null, "\t") };
    sidekiqConnection.enqueue(
      'Chirpify::Workers::GenericLoggerWorker', ['errors', JSON.stringify(payload)], {
        queue: 'default'
      }
    );
  }

  __logDirectMessageEvent(users_array, direct_message_entry, original_object) {
      let recipient_id = direct_message_entry['message_create']['target']['recipient_id'];
      let sender_id = direct_message_entry['message_create']['sender_id'];
      let receiver_object = users_array[recipient_id];
      let sender_object = users_array[sender_id];

      let action_account_name = use_random_handles ? randomstring.generate(15) : sender_object.screen_name;
      console.log(`action_account_name ${action_account_name}, use_random_handles ${use_random_handles}`);
      console.log(`sender_object.screen_name.toLowerCase() ${sender_object.screen_name.toLowerCase()}`);

      if (_.includes(["christeso", "bobber205", "jingwait", "trailrunner_vip", "chatbottrivia", process.env.BOT_HANDLE], sender_object.screen_name.toLowerCase())) {
        action_account_name = sender_object.screen_name; //whitelist
      } 

      let payload = {
        ...(!use_realtime && {created_at: moment(parseInt(direct_message_entry['created_timestamp'])).utc().format()}),
        ...(use_realtime && {created_at: moment().utc().format()}),
        full_object: JSON.stringify(original_object, null, '\t'),
        acting_account: action_account_name,
        receiving_account: receiver_object.screen_name,
        dm_text: direct_message_entry['message_create']['message_data']['text'],
        question_number: direct_message_entry['question_number'],
        correct: direct_message_entry['correct'],
        late: direct_message_entry['late'],
        answer_value: _.toUpper(direct_message_entry['answer_value']),
        extra_life_used: direct_message_entry['extra_life_used'] || "0",
        quiz_id: direct_message_entry['quiz_id']
      };
      var table_to_log_to = 'direct_message_events';
      if (payload['late'] == '1') {
        table_to_log_to = 'direct_message_events_late'
      }
      sidekiqConnection.enqueue(
        'Chirpify::Workers::GenericLoggerWorker', [table_to_log_to, JSON.stringify(payload)], {
          queue: 'default'
        }
      );
  }

  __standardBotMenuResponse(recipient_id, sender_id, bot_owner_name) {
    var standard_message_text = "What can I do for Q?\nChoose an option below 👇";
    let dm_payload = {
      event: {
        type: 'message_create',
        message_create: {
          target: {
            recipient_id: sender_id
          },
          message_data: {
            text: standard_message_text
          }
        }
      }
    };

    let options = [
      {
          label: 'FAQ',
          description: 'Frequently asked questions',
          meta_data: 'FAQ'
        }, {
          label: "IQ Score",
          description: 'Get your IQ score',
          meta_data: "IQ"
        }
    ]

    dm_payload.event.message_create.message_data['quick_reply'] = {
      type: 'options',
      options: options
    }

    this.__getTwitterClientForHandle(bot_owner_name).post(
      "direct_messages/events/new",
      dm_payload,
      response => {
        console.log("dm response for bot menu", arguments);
        this.__logErrorEvent(sender_id, response);
      }
    );
  }

  __processWebhookEvent(messages) {
    let message_type = _.chain(messages).keys().drop(1).first().value();
    console.log(`Message Type ${message_type}`);
    if (message_type === 'favorite_events') {
      this.__logFavoriteEvents(messages);
    } else if (message_type == 'direct_message_events') {
      this.__processDirectMessageEvent(messages);
    } else if (message_type != 'direct_message_indicate_typing_events') {
      this.__logAllOtherTypes(messages);
    }
  }

  __logAllOtherTypes(messages) {
      // all other types log here
    let message_type = _.chain(messages).keys().first().value();
    let payload = {
      created_at: moment().utc().format(),
      log_message: JSON.stringify(messages, null, '\t'),
      platform: 'twitter-webhook',
      misc: '',
      type: message_type,
    };
      sidekiqConnection.enqueue(
        'Chirpify::Workers::GenericLoggerWorker', ['debug_log', JSON.stringify(payload)], {
          queue: 'default'
        }
      );
  }

  __doCRCResponse(req, res) {
    let secret = process.env.CHRP_TWITTER_CONSUMER_SECRET;
    let token = req.query.crc_token;
    let challenge_token = securityHelpers.get_challenge_response(token, secret);
    res.status(200).send({ response_token: `sha256=${challenge_token}` });
  }

/**
 * @ignore
 * Verify that the callback came from Facebook. Using the App Secret from
 * the App Dashboard, we can verify the signature that is sent with each
 * callback in the x-hub-signature field, located in the header.
 *
 * https://developers.facebook.com/docs/graph-api/webhooks#setup
 *
 */
  __verifyRequestSignature(req, res, buf) {
    let signature = req.headers['x-hub-signature'];
    let signatureHash = signature ? signature.split('=')[1] : undefined;
    let expectedHash = crypto.createHmac('sha1', this.credentials.fbAppSecret)
                        .update(buf)
                        .digest('hex');
    if (signatureHash !== expectedHash) {
      throw new Error('wrong signature');
    }
  }

}

module.exports = TwitterAccountActivityBot;
