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
const bluebird = require('bluebird');
var Promise = require("bluebird");
var join = Promise.join;

const moment = require('moment');
const randomstring = require("randomstring");

const redis = require('redis');
const redisClient = redis.createClient(process.env.REDIS_URL);

// Make all redis commands promises 
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

redisClient.on('connect', function(err) {
  redisClient.getAsync(redisHelpers.getConfigurationKey()).then((config_json) => {
    var config = JSON.parse(config_json);
    app_configuration = config;
    console.log("CONFIG JSON IS", app_configuration);
  });
  console.log(`Calling get all on ${redisHelpers.getExtraLifeHashKey("IQtrivia")}`);
  redisClient.hgetallAsync(redisHelpers.getExtraLifeHashKey("IQtrivia")).then((whole_hash) => {
    console.log("All of the extra life hash");
    console.log(whole_hash);
  });
});

class TwitterAccountActivityBot extends BaseBot {

  /**
   * Constructor to the MessengerBot class
   *
   * @param {object} settings - MessengerBot take a settings
   * object as first param.
   * @example
   * const messengerBot = new MessengerBot({ // e.g. MessengerBot
   *   credentials:   credentials: {
   *     verifyToken: 'YOUR verifyToken',
   *     pageToken: 'YOUR pageToken',
   *     fbAppSecret: 'YOUR fbAppSecret',
   *   },
   *   webhookEndpoint: 'someEndpoint'
   * })
   */
  constructor(settings, expressApp) {
    super(settings);
    this.type = 'twitter_account_activity';
    this.requiresWebhook = true;
    this.requiredCredentials = [];

    this.receives = {
      text: true,
      attachment: {
        audio: false,
        file: false,
        image: true,
        video: false,
        location: false,
        fallback: true,
      },
      echo: false,
      read: false,
      delivery: false,
      postback: false,
      quickReply: false,
    };

    this.sends = {
      text: true,
      quickReply: false,
      locationQuickReply: false,
      senderAction: {
        typingOn: false,
        typingOff: false,
        markSeen: false,
      },
      attachment: {
        audio: false,
        file: false,
        image: false,
        video: false,
      },
    };

    this.retrievesUserInfo = false; //maybe enable later?

    // this is the id that will be set after the first message is sent to
    // this bot.

    // this.id; //why was this here?
    this.__applySettings(settings);
    this.__createMountPoints(expressApp);

    const twitCredentials = {
      consumer_key: settings.credentials.consumerKey,
      consumer_secret: settings.credentials.consumerSecret,
      access_token: settings.credentials.accessToken,
      access_token_secret: settings.credentials.accessTokenSecret,
    };
    this.twitterClient = new Twit(twitCredentials);
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

    this.app.get('*', (req, res) => {
      if (req.query.crc_token) {
        this.__doCRCResponse(req, res);
      } else {
        res.status(200).send('In Bot');
      }
    });

    this.app.post('*', (req, res) => {
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
    // this.__emitEvents(events, request, response);

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

      join(quiz_def, extra_lives_def, (whole_question_object, extra_life_status) => {
        console.log("EXTRA_LIVES_HASH", extra_life_status);
        
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

        if (whole_question_object) {
          whole_question_object = JSON.parse(whole_question_object);
          
          let quiz_id = whole_question_object.quiz_id;

          let master_question_object = whole_question_object.quiz;
          
          console.log("Answer Sent Time", answer_sent_time);
          let question_matched = questionHelpers.determineQuestionAnswered(answer_sent_time, master_question_object);
          console.log("Question Matched", question_matched);
          if (question_matched) {
            direct_message_entry['quiz_id'] = quiz_id

            let answer_matched_array = _.intersection(question_matched.answers, [message_text_urls_removed]);

            let is_valid_answer = _.intersection([message_text_urls_removed.trim().toLowerCase()], ['a','b','c','d']).length > 0;

            console.log(`INTERSECTION ${_.intersection([message_text_urls_removed.trim().toLowerCase()], ['a','b','c','d'])}`);

            console.log("Answer Matched Array", answer_matched_array, message_text_urls_removed);

            direct_message_entry['question_number'] = question_matched.question_number;
            
            let was_correct = answer_matched_array.length > 0;
            
            direct_message_entry['correct'] = was_correct ? "1" : "0";
            var extra_life_used = false

            if (!was_correct && extra_life_status == "1") {
              // user has an extra live so mark it was correct
              direct_message_entry['correct'] = "1";
              direct_message_entry['extra_life_used'] = "1"
              redisClient.hmset(redisHelpers.getExtraLifeHashKey(receiver_object.screen_name), sender_object.screen_name, "0", redis.print);
              was_correct = false //make rest of app behave like the user was right
              extra_life_used = true;
            }

            direct_message_entry['late'] = 0;
            direct_message_entry["answer_value"] = message_text_urls_removed;

            if (is_valid_answer) {
              redisClient.hgetAsync(redisHelpers.alreadyLoggedAnswerKey(receiver_object.screen_name, question_matched.question_number), sender_object.screen_name).then((already_logged_value) => {
                  if (already_logged_value != "1") {
                    this.__logDirectMessageEvent(users_array, direct_message_entry, messages);
                    redisClient.hset(redisHelpers.alreadyLoggedAnswerKey(receiver_object.screen_name, question_matched.question_number), sender_object.screen_name, "1", redis.print);
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
              join(responded_status_key, responded_status_key_by_answer_value).then((already_responded_value, status_value) => {
                if (is_valid_answer) {
                    if (status_value != "1" && !was_correct) {
                      message_to_user = `${message_to_user} You can't win the prize, but you should keep playing to improve your IQ score, which is currently X. We'll post the results and next question on our feed in a couple of seconds!`;
                    } else if (status_value != "1" && was_correct) {
                      message_to_user = `${message_to_user}  We'll post the results and next question on our feed in a couple of seconds!`;
                    }
                } else {
                  this.__standardBotMenuResponse(recipient_id, sender_id);
                }
                if (already_responded_value != "1" && is_valid_answer) {
                  this.__sendDMToUser(sender_id, message_to_user, true, message_value_type);
                  redisClient.hset(redisHelpers.getRespondedByStatusKey(receiver_object.screen_name, message_value_type), sender_object.screen_name, "1", redis.print);
                  redisClient.hset(redisHelpers.getRespondedAnswerKey(receiver_object.screen_name, question_matched.question_number), sender_object.screen_name, "1", redis.print);
                } else if (!is_valid_answer) {
                  // no op for now
                }
              });
            }
          } else { //no question was matched!
            // This is where we would send a message back saying you are too late!
            direct_message_entry['correct'] = "0";
            direct_message_entry['late'] = "1";
            if (process.env.LOG_LATE_POSTS == '1') {
              this.__logDirectMessageEvent(users_array, direct_message_entry, messages);
           }
           if (message_text_urls_removed == 'FAQ') {
             this.__sendFAQLink(sender_id);
           } else if (message_text_urls_removed == 'IQ Score' || message_text_urls_removed == 'IQ Score') {
             this.__sendUserIQScore(sender_id, sender_object.screen_name);
           } else {
             this.__standardBotMenuResponse(recipient_id, sender_id);
           }
            // if (process.env.MESSAGE_LATE_USERS == '1') {
            //   var message_text = process.env.LATE_MESSAGE || 'Wow this is bad but your message was sent too late!';
            //   var already_late_users_key = redisHelpers.getLateUsersRedisKey(receiver_object.screen_name);
            //   redisClient.hgetAsync(already_late_users_key, sender_object.screen_name).then((error, result) => {
            //     if (result == '1' && process.env.ALWAYS_MESSAGE_USERS != '1') {
            //       // do nothing
            //     } else {
            //       redisClient.hset(already_late_users_key, sender_object.screen_name, '1', redis.print);
            //       // this.__sendDMToUser(sender_id, `What can I do for Q?`, false);
            //       this.__standardBotMenuResponse(recipient_id,sender_id);
            //       // this.__sendDMToUser(sender_id, `${message_text}`, true, 'wrong');
            //     }
            //   });
            // }
          }
        }
      });
    });
  }
  
  __sendFAQLink(sender_id) {
    this.__sendDMToUser(sender_id, `FAQ Link goes here!`, false);
  }

  __sendUserIQScore(sender_id, sender_handle) {
    console.log(`Looking up IQ score for ${sender_handle}`);
    redisClient.hgetAsync(redisHelpers.getIQStatsKey(), sender_handle).then((result) => {
      if (!result) {
        this.__sendDMToUser(sender_id, `Your IQ Is Not Available Until Your First Quiz Has Ended`, false);
      } else {
        result = JSON.parse(result);
        var percentile  = result["percentile"];
        var total_count = result["total_question_count"];
        var right_count = result["right_answer_count"];
        var wrong_count = result["wrong_answer_count"];
        this.__sendDMToUser(sender_id, `Your IQ score is ${percentile}\nYou've Gotten ${right_count} answers right and ${wrong_count} answers wrong`, false);
      }
    });
  }

  __sendDMToUser(recipient_id, message_text, send_image = true, image_type = 'correct') {
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
    this.twitterClient.post('direct_messages/events/new', dm_payload, (response) => {
      console.log("DM RESPONSE", response);
      console.log("DM RESPONSE", arguments);
    });
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
      sidekiqConnection.enqueue(
        'Chirpify::Workers::GenericLoggerWorker', ['direct_message_events', JSON.stringify(payload)], {
          queue: 'default'
        }
      );
  }

  __standardBotMenuResponse(recipient_id, sender_id) {
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
        },
        // {
        //   label: "Notifications",
        //   description: "Be notified when the next game starts",
        //   meta_data: 'notify'
        // }
    ]

    dm_payload.event.message_create.message_data['quick_reply'] = {
      type: 'options',
      options: options
    }

    this.twitterClient.post(
      "direct_messages/events/new",
      dm_payload,
      response => {
        console.log("dm response for bot menu", response);
        console.log("dm response for bot menu", arguments);
      }
    );
  }

  __processTypingEvent(messages) {
    this.__logAllOtherTypes(messages);
    let events = messages['direct_message_indicate_typing_events'];
    console.log(`Events in Typing ${events.length}`)
    _.each(events, (event) => {
      var recipient_id = event.target.recipient_id;
      var sender_id = event.sender_id;
      //first find the question that the timestamp qualifies for
      var recipient_user = messages.users[recipient_id];
      var sender_object = messages.users[sender_id];

      var timestamp = event.created_timestamp / 1000; //get rid of the ms2
      var redis_key = `Chirpify::Trivia::MasterObject::${recipient_user.screen_name}`;
      console.log('redis_key', redis_key);

      redisClient.get(redis_key, (err, master_question_object) => {
        master_question_object = JSON.parse(master_question_object);
        let question_matched = questionHelpers.determineQuestionAnswered(timestamp, master_question_object);
        console.log("Question Matched in Typing Events", question_matched, timestamp);
        if (!question_matched) return;
        let all_answers = question_matched.all_answers;

        let dm_payload = {
          event: {
            type: 'message_create',
            message_create: {
              target: {
                recipient_id: sender_id
              },
              message_data: {
                text: 'Tap Your Answer Below'
              }
            }
          }
        };
        console.log("DM Payload is", dm_payload);
        let options = _.map(all_answers, (answer, index) => {
          return {
            label: answer,
            description: 'Some Description!',
            meta_data: ['A','B','C','D'][index]
          }
        });
        console.log("Options are", options);
        dm_payload.event.message_create.message_data['quick_reply'] = {
          type: 'options',
          options: options
        }

        this.twitterClient.post('direct_messages/events/new', dm_payload, (response) => {console.log('dm response', response)});
      });
    });
  }

  __processWebhookEvent(messages) {
    let message_type = _.chain(messages).keys().first().value();
    
    if (message_type === 'favorite_events') {
      this.__logFavoriteEvents(messages);
    } else if (message_type == 'direct_message_events') {
      this.__processDirectMessageEvent(messages);
    // } else if (message_type == 'direct_message_indicate_typing_events') {
    //   this.__processTypingEvent(messages);
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

  __emitEvents(messages, request, response) {
    console.log(`Emitting events for ${messages.length}`);
    this.__emitUpdate(messages[0]);
    // debugger;
  }

  __formatOutgoingMessage(message) {
    console.log(`IN FORMAT!`);
    return message;
  }

  __sendMessage(rawMessage) {
    console.log(`In Send Message!`);
    return new Promise((resolve, reject) => {
      this.twit.post('direct_messages/new', rawMessage, (err, data) => {
        if (err) {
          reject(err);
        }
        resolve(data);
      });
    });
  }

  sendDM(rawMessage) {
    console.log("Sending Raw DM Back");

  }

  __createStandardBodyResponseComponents(sentOutgoingMessage, sentRawMessage, rawBody) {
    console.log(`in __createStandardBodyResponseComponents`);
    return sentOutgoingMessage;
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
