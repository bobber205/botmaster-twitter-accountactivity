'use strict';

const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const request = require('request-promise');
const BaseBot = require('botmaster').BaseBot;
const debug = require('debug')('botmaster:messenger');

const securityHelpers = require('./helpers/security');
const questionHelpers = require('./helpers/questions');
const redisHelpers = require('./helpers/redisHelpers');
const bluebird = require('bluebird');

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


const Sidekiq = require('sidekiq');

const sidekiqConnection = new Sidekiq(redisClient);

const _ = require('lodash');

const Twit = require("twit");

redisClient.on('connect', function(err) {
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
      
      let redis_key = `Chirpify::Trivia::MasterObject::${receiver_object.screen_name}`;
      let answer_sent_time = parseInt(direct_message_entry['created_timestamp']) / 1000; //get rid of ms

      if (use_realtime) {
        answer_sent_time = moment().format('X'); //utc w/o ms
      }

      redisClient.getAsync(redis_key).then( (err, master_question_object) => {
        console.log("arguments after get async are", arguments);
        if (master_question_object) {
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

          master_question_object = JSON.parse(master_question_object);
          console.log("Answer Sent Time", answer_sent_time);
          let question_matched = questionHelpers.determineQuestionAnswered(answer_sent_time, master_question_object);
          console.log("Question Matched", question_matched);
          if (question_matched) {
            console.log("Writing Answer That Came In On Time!");
            let answer_matched_array = _.intersection(question_matched.answers, [message_text_urls_removed]);
            console.log("Answer Matched Array", answer_matched_array, message_text_urls_removed);
            direct_message_entry['question_number'] = question_matched.question_number;
            let was_correct = answer_matched_array.length > 0 ? "1" : "0";
            direct_message_entry['correct'] = was_correct;
            direct_message_entry['late'] = 0;
            direct_message_entry["answer_value"] = message_text_urls_removed;
            this.__logDirectMessageEvent(users_array, direct_message_entry, messages);
            if (reply_answer_status_to_user) {
              var message_to_user = was_correct == "1" ? questionHelpers.getRightAnswerResponse(question_matched.question_number + 1) : questionHelpers.getWrongAnswerResponse(question_matched.question_number + 1);

              if (was_correct != "1") {
                var already_late_users_key = redisHelpers.getLateUsersRedisKey(receiver_object.screen_name);
                redisClient.hget(already_late_users_key, sender_object.screen_name, (error, result) => {
                  if (result) {
                  } else {
                    redisClient.hset(already_late_users_key, sender_object.screen_name, "1", redis.print);
                    this.__sendDMToUser(sender_id, message_to_user);
                  }
                });
              } else {
                this.__sendDMToUser(sender_id, message_to_user);
              }
            }
          } else {
            // This is where we would send a message back saying you are too late!
            direct_message_entry['correct'] = 0;
            direct_message_entry['late'] = 1;
            if (process.env.LOG_LATE_POSTS == '1') {
              this.__logDirectMessageEvent(users_array, direct_message_entry, messages);
          }
            if (process.env.MESSAGE_LATE_USERS == '1') {
              var message_text = process.env.LATE_MESSAGE || 'Wow this is bad but your message was sent too late!';
              var already_late_users_key = redisHelpers.getLateUsersRedisKey(receiver_object.screen_name);
              redisClient.hget(already_late_users_key, sender_object.screen_name, (error, result) => {
                if (result == '1' && process.env.ALWAYS_MESSAGE_USERS != '1') {
                  // do nothing
                } else {
                  redisClient.hset(already_late_users_key, sender_object.screen_name, '1', redis.print);
                  this.__sendDMToUser(sender_id, `${message_text} ${moment().format("x")}`);
                }
              });
            }
          }
        }

      });
    });
  }

  __sendDMToUser(recipient_id, message_text) {
    console.log(`__sendDMToUser ==> Sending Message to ${recipient_id}`, message_text);
    let dm_payload = {
      event: {
        type: 'message_create',
        message_create: {
          target: {
            recipient_id: `${recipient_id}`
          },
          message_data: {
            text: message_text,
            // attachment: {
            //   type: 'media',
            //   media: {
            //     id: process.env.MEDIA_ID_TEMP
            //   }
            // }
          }
        }
      }
    };
    console.log("DM PAYLOAD")
    console.log(dm_payload)
    this.twitterClient.post('direct_messages/events/new', dm_payload, (response) => {
      console.log(response);
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
      };
      sidekiqConnection.enqueue(
        'Chirpify::Workers::GenericLoggerWorker', ['direct_message_events', JSON.stringify(payload)], {
          queue: 'default'
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
    } else {
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
