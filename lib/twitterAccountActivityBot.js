"use_strict";

const crypto = require('crypto');
const path = require("path");
const countdown = require("countdown");
const bodyParser = require('body-parser');

var Bugsnag = require('@bugsnag/js')
var BugsnagPluginExpress = require('@bugsnag/plugin-express');

Bugsnag.start({
  apiKey: process.env.BUGSNAG_API_KEY,
  plugins: [BugsnagPluginExpress]
});

var bugsnag_middleware = Bugsnag.getPlugin('express')


const securityHelpers = require('./helpers/security');
const questionHelpers = require('./helpers/questionHelpers');
const redisHelpers = require('./helpers/redisHelpers');
const configHelpers = require('./helpers/configHelper');
const smsHelpers = require('./helpers/smsHelpers');
const loggingHelpers = require('./helpers/loggingHelpers');
const cipherHelpers = require('./helpers/cipherHelper');

const Promise = require("bluebird");
const join = Promise.join;

const moment = require('moment');
const thize = require('thize');

const redis = require('redis');
const redisClient = redis.createClient(process.env.REDIS_URL);

// Make all redis commands promises 
const bluebird = require('bluebird');
bluebird.promisifyAll(redis.RedisClient.prototype);
bluebird.promisifyAll(redis.Multi.prototype);

const use_realtime = process.env.USE_REALTIME === '1';
// const use_random_handles = process.env.USE_RANDOM_HANDLES === '1';
const reply_answer_status_to_user = process.env.REPLY_ANSWER_STATUS_TO_USER === '1';
// const log_all_dm_messages = process.env.LOG_ALL_DM_MESSAGES === '1';
const Isemail = require("isemail");


const Sidekiq = require('sidekiq');

const sidekiqConnection = new Sidekiq(redisClient);

const _ = require('lodash');

const Twit = require("twit");

const axios = require('axios');

const axios_instance_prod = axios.create({
  baseURL: process.env.CHRP_API_URL,
  timeout: 30000,
  headers: {
    'X-CHIRPIFY-API-KEY': process.env.CHRP_API_KEY,
    'X-CHIRPIFY-API-UID': process.env.CHRP_API_UID
  }
});

const axios_instance_staging = axios.create({
  baseURL: process.env.CHRP_API_URL_STAGING,
  timeout: 30000,
  headers: {
    'X-CHIRPIFY-API-KEY': process.env.CHRP_API_KEY_STAGING,
    'X-CHIRPIFY-API-UID': process.env.CHRP_API_UID_STAGING
  }
});

//export CHRP_URL_API=https://staging-api.chirpify.com

let app_configuration = {};

const valid_bot_handles = ['iqtrivia', 'sadtrebek', 'happytrebek', 'alextest_01', 'koalasocial2'];

const chirpify_bot_handles = {
  'alextest_01':  {
    brand_id: process.env.NODE_ENV === 'production' ? 389 : 2,
    welcome_message_ids: {
      'intro_message': '1248318906890178564',
    },
    required_fields: ['venmo_phone_number'],
    staging: false
  },
  'peakstrails':  {
    brand_id: process.env.NODE_ENV === 'production' ? 297 : 2,
    welcome_message_ids: {
      'intro_message': '1252666763268853764',
    },
    required_fields: ['venmo_phone_number'],
    staging: false
  },
  'chirpify':  {
    brand_id: process.env.NODE_ENV === 'production' ? 107 : 2,
    welcome_message_ids: {
      'intro_message': '1252666763268853764',
    },
    required_fields: ['venmo_phone_number'],
    staging: false
  },
  'koalasocial2':  {
    brand_id: process.env.NODE_ENV === 'production' ? 45 : 45,
    welcome_message_ids: {
      'intro_message': '1252666763268853764',
    },
    required_fields: ['venmo_phone_number'],
    staging: true
  }
}

const valid_extra_life_hashtags = ['iqforlife'];
const valid_broadcast_hashtags = ['iqdoyou'];

const valid_broadcast_handles_for_iq_for_life = ['iqtrivia', 'happytrebek'];
const valid_broadcast_handles_for_iq_do_you = ['iqtrivia', 'happytrebek'];

const extra_life_cutoff_question = process.env.EXTRA_LIFE_CUTOFF;

console.log(`Extra Life Cutoff Question is ${extra_life_cutoff_question}`);

redisClient.on('connect', function (err) {
  console.log(`Redis is connected`);
  // _.each(valid_bot_handles, (handle) => {
  //       console.log(`Getting config for ${handle}`); 
  //       var config_keys = [redisHelpers.getConfigurationKeyForHandle(handle), redisHelpers.getConfigurationKeyForIQScores(handle)];
  //       var config_defs = _.map(config_keys, (key) => {return redisClient.getAsync(key);});
  //       join(...config_defs).then((config_json_array) => {
  //         if (!config_json_array[0]) 
  //           config_json_array[0] = '{}';
  //         if (!config_json_array[1]) 
  //           config_json_array[1] = '[]';

  //         iq_score_configuration[handle] = JSON.parse(config_json_array[1]);

  //         console.log(`${handle} IQ Score Length ${iq_score_configuration[handle].length}`);
  //         var config_json = config_json_array[0];
  //         console.log(config_json);
  //         var config = JSON.parse(config_json);
  //         app_configuration[handle] = config;
  //     });
  // });

  // _.each(valid_bot_handles, (handle) => {
  //     // See if each bot handle has a valid or at least blank quiz object
  //     let master_quiz_object_key = redisHelpers.getMasterQuestionObjectKey(handle);
  //     redisClient.getAsync(master_quiz_object_key).then((result) => {
  //       if (!result) {
  //         console.log(`Creating blank object for ${handle}`);
  //         redisClient.set(master_quiz_object_key, JSON.stringify({}), redis.print);
  //       }
  //     });
  // });
});

console.log(`Starting up V2`);

class TwitterAccountActivityBot {

  constructor(settings, expressApp) {
    this.__createMountPoints(expressApp);
    this.twitterClients = {};
  }

  __getTwitterClientForHandle(handle) {
    handle = handle.toLowerCase();
    if (this.twitterClients[handle]) { return this.twitterClients[handle]; }
    console.log(`Creating new Client for ${handle}`);
    var config = configHelpers.getTwitterConfigurationObjectForHandle(handle);
    var twitCredentials = {
      consumer_key: config.twitter_consumer_key,
      consumer_secret: config.twitter_consumer_secret,
      access_token: config.twitter_bot_access_token,
      access_token_secret: config.twitter_bot_access_token_secret,
    };
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
    this.app.use(bugsnag_middleware.requestHandler);

    this.app.use(bodyParser.urlencoded({ extended: true }));
    this.app.use(bodyParser.json());

    this.app.get('/loaderio-da48e84c9cdd99ef88e7743b1cb3bf5e', (req, res) => {
      res.status('200').send('loaderio-da48e84c9cdd99ef88e7743b1cb3bf5e');
    });

    this.app.get('/', (req, res) => {
      res.status(200).send('In Bot');
    });

    this.app.get('/bitlydirect', (req, res) => {
      res.sendFile(path.join(__dirname + '/templates/detect.html'));
    });

    this.app.get('/twitter/webhook', (req, res) => {
      if (req.query.crc_token) {
        this.__doCRCResponse(req, res);
      } else {
        res.status(200).send('In Bot -- No CRC Token Found');
      }
    });

    this.app.post('/twitter/webhook', (req, res) => {
      this.__processWebhookEvent(req.body, req, res);
      res.sendStatus(200);
    });

    // this.app.post('/twilio', (req, res) => {
    //   loggingHelpers.logTwilioEvents(req.body);
    //   res.sendStatus(200);
    // });

    this.app.post('/instagram/v2', (req, res) => {
      console.log(`Instagram Post Received!`);
      console.log(`${JSON.stringify(req.body)}`);
      this.__processInstagramEvent(req.body);
      res.sendStatus(200);
    });

    this.app.get('/instagram/v2', (req, res) => {
      console.log(req.query);
      if (req.query['hub.verify_token'] === "hellothere1231231231234444") {
        res.status(200).send(req.query["hub.challenge"]);
      } else {
        res.sendStatus(200);
      }
    });

    this.app.use(bugsnag_middleware.errorHandler);
  }

  __processInstagramEvent(instagram_json_payload) {
    console.log(`Processing Instagram Event`, instagram_json_payload);
    sidekiqConnection.enqueue(
      'Chirpify::Workers::InstagramMentionProcessorWorker', [JSON.stringify(instagram_json_payload)], {
        queue: 'default'
      }
    );
  }

  __processFollowEvent(messages) {
    let events_array = messages.follow_events;
    _.each(events_array, entry => {
      let payload = {
        created_at: moment().utc().format(),
        full_object: JSON.stringify(messages, null, '\t'),
        acting_account: entry.source.screen_name,
        acting_account_id: entry.source.id,
        receiving_account: entry.target.screen_name,
        follower_count: entry.source.friends_count
      };
      sidekiqConnection.enqueue(
        "Chirpify::Workers::GenericLoggerWorker",
        ["follow_events", JSON.stringify(payload)],
        {
          queue: "logging"
        }
      );
    });
  }

  __processTweetCreateEvent(messages) {
    let tweet_events = messages.tweet_create_events;
    _.each(tweet_events, (entry) => {
      let master_quiz_object_key = redisHelpers.getMasterQuestionObjectKey(entry.user.screen_name || entry.in_reply_to_screen_name);

      if (!(valid_bot_handles.includes(entry.user.screen_name.toLowerCase() || entry.in_reply_to_screen_name.toLowerCase()))) {
        console.log(`${entry.user.screen_name || entry.in_reply_to_screen_name} isn't a bot handle...`);
        return;
      }

      var quiz_def = redisClient.getAsync(master_quiz_object_key);
      console.log(`Getting ${master_quiz_object_key}`);
      join(quiz_def, (quiz_json_string) => {
        if (!entry.entities.hashtags || !quiz_json_string) {
          return;
        } //GOTTA HAVE A HASHTAG
        let users_mentioned = entry.entities.user_mentions.map((c) => {
          return [c.screen_name, c.id_str];
        });

        let hashtags = entry.entities.hashtags.map((c) => {
          return c.text.toLowerCase();
        });
        let hashtags_extended = [];
        if (entry.extended_tweet) {
          hashtags_extended = entry.extended_tweet.entities.hashtags.map((c) => {
            return c.text.toLowerCase();
          });
          if (entry.extended_tweet.user_mentions) {
            users_mentioned = entry.extended_tweet.user_mentions.map((c) => {
              return [c.screen_name, c.id_str];
            });
          }
        }
        hashtags = _.chain(hashtags).concat(hashtags_extended).uniq().value();

        let has_extra_life_hashtags = _.intersection(hashtags, valid_extra_life_hashtags).length >= valid_extra_life_hashtags.length;
        let has_broadcast_hashtags = _.intersection(hashtags, valid_broadcast_hashtags).length >= valid_broadcast_hashtags.length;
        let is_valid_broadcast_handle_for_extra_life = valid_broadcast_handles_for_iq_for_life.includes(entry.user.screen_name.toLowerCase());
        let is_valid_broadcast_handle_for_broadcasting = valid_broadcast_handles_for_iq_do_you.includes(entry.user.screen_name.toLowerCase());
        let is_valid_bot_handle = valid_bot_handles.includes(entry.user.screen_name.toLowerCase());

        console.log(`${hashtags} valid hashtags for EL? ${valid_extra_life_hashtags} has_extra_life_hashtags ${has_extra_life_hashtags} is_valid_broadcast_handle ${is_valid_broadcast_handle_for_broadcasting}`);

        if (is_valid_bot_handle && has_broadcast_hashtags && is_valid_broadcast_handle_for_broadcasting) {
          var to_replace = `#${valid_broadcast_hashtags[0].toUpperCase()}`;
          let dm_text = entry.text.replace(to_replace, '');
          if (entry.extended_tweet) {
            dm_text = entry.extended_tweet.full_text.replace(to_replace, '');
          }
          // dm_text = dm_text.replace(/(?:https?|ftp):\/\/[\n\S]+/g, '');
          redisClient.hkeysAsync(`Chirpify::IQTrivia::PlayingQuiz::${entry.user.screen_name.toLowerCase()}`).then((twitter_ids) => {
            _.each(twitter_ids, (twitter_id) => {
              console.log(`Sending ${dm_text} to ${twitter_id}`);
              // this.__sendDMToUser(twitter_id, entry.user.screen_name.toLowerCase(), dm_text, false, '', false);
              var dm_params = {
                user_handle_id: twitter_id,
                dm_message: dm_text,
                quiz_id: JSON.parse(quiz_json_string).quiz_id,
                type: 'iq_do_you',
                sending_handle: entry.user.screen_name.toLowerCase(),
              };
              sidekiqConnection.enqueue(
                'Chirpify::Workers::SendDMWorker', [dm_params], {
                  queue: 'default'
                }
              );
            });
          });
        }

        if (is_valid_bot_handle && has_extra_life_hashtags && is_valid_broadcast_handle_for_extra_life) {
          //means a bot tweeted
          _.each(users_mentioned, user_data => {
            let user_screen_name = user_data[0];
            let user_id = user_data[1];
            console.log(`sending message to ${user_id}`);
            redisClient.hincrby(redisHelpers.getExtraLifeHashKey(entry.user.screen_name.toLowerCase()), user_id.toLowerCase(), 1, redis.print);
            this.__sendDMToUser(user_id, entry.user.screen_name.toLowerCase(), `You've been given a bonus extra life! 😎`, false, "", false);
          });
        }
      });

    });
  }

  __logTweetCreateEvent(messages) {
    let tweet_events = messages.tweet_create_events;
    _.each(tweet_events, (entry) => {
      let payload = {
        created_at: moment().utc().format(),
        full_object: JSON.stringify(messages, null, '\t'),
        acting_account: entry.user.screen_name,
        acting_account_id: entry.user.id_str,
        acting_account_follower_count: entry.user.followers_count,
        receiving_account_id: entry.in_reply_to_user_id_str,
        receiving_account_name: entry.in_reply_to_screen_name,
        text_of_tweet: entry.text
      };
      sidekiqConnection.enqueue(
        'Chirpify::Workers::GenericLoggerWorker', ['tweet_create_events', JSON.stringify(payload)], {
          queue: 'logging'
        }
      );
    });
  }

  async __processChirpifyBotMessageEvent(users_array, events) {
    _.each(events, async (direct_message_entry) => {
      let recipient_id = direct_message_entry.message_create.target.recipient_id;
      let sender_id = direct_message_entry.message_create.sender_id;
      let receiver_object = users_array[recipient_id];
      let sender_object = users_array[sender_id];

      let sender_username = sender_object.screen_name;
      let receiver_username = receiver_object.screen_name;

      let chirpify_bot_config = chirpify_bot_handles[receiver_username.toLowerCase()];

      // var welcome_message_id_found;
      // if (!direct_message_entry.initiated_via) {
      //   welcome_message_id_found = 0;
      // } else {
      //   welcome_message_id_found = direct_message_entry.initiated_via.welcome_message_id;
      // }
      var welcome_message_id_found = direct_message_entry.initiated_via ? direct_message_entry.initiated_via.welcome_message_id : 0
      let message_text = direct_message_entry.message_create.message_data.text;

      console.log("User Sent", message_text, "via welcome message", welcome_message_id_found)

      const PhoneNumber = require('awesome-phonenumber');
      var pn = new PhoneNumber(message_text, 'US');
      let number = pn.getNumber();
      let is_valid = pn.isValid();

      console.log("phone number is ", number, is_valid);

      let api_instance = chirpify_bot_config.staging ? axios_instance_staging : axios_instance_prod;

      if (number && is_valid) {
        this.__sendDMToUser(sender_id, receiver_object.screen_name, `Processing...`, false, '', false);
        // await api_instance.get('/v2.0/users/populate').then((response) => {
        //   console.log("test result", response.data);
        // });

        let register_payload = {
          brand_id: chirpify_bot_config.brand_id,
          brand_data_point_name: "venmo_phone_number",
          brand_data_point_value: number,
          platform: "twitter",
          social_handle: sender_username,
          social_user_id: sender_id,
        }

        let register_result = await api_instance.post('/v3.0/registration/via_bot', register_payload);
        console.log('via bot data', register_result.data);
        this.__sendDMToUser(sender_id, receiver_object.screen_name, `Thanks for entering your phone number`, false, '', false);
      }
    });
  }

  __processDirectMessageEvent(messages) {
    let users_array = messages.users;
    let events = messages.direct_message_events;
    console.log(`Got ${events.length} messages`);

    _.each(events, (direct_message_entry) => {
      console.log(direct_message_entry)
      console.log(`direct_message_entry.message_create.source_app_id ${direct_message_entry.message_create.source_app_id}`);
      if (direct_message_entry.message_create.source_app_id === "125311" || direct_message_entry.message_create.source_app_id === "268278") {
        console.log(`Ignoring ${direct_message_entry.message_create.message_data.text}`);
        return; //268278 is twitter's web app id apparently
      }


      let recipient_id = direct_message_entry.message_create.target.recipient_id;
      let sender_id = direct_message_entry.message_create.sender_id;
      let receiver_object = users_array[recipient_id];
      let sender_object = users_array[sender_id];

      if (chirpify_bot_handles[receiver_object.screen_name.toLowerCase()]) {
        console.log("Processing as a Chirpify Bot", chirpify_bot_handles[receiver_object.screen_name.toLowerCase()])
        this.__processChirpifyBotMessageEvent(users_array, events);
        return;
      }


      let master_quiz_object_key = redisHelpers.getMasterQuestionObjectKey(receiver_object.screen_name);
      let answer_sent_time = parseInt(direct_message_entry.created_timestamp) / 1000; //get rid of ms

      if (use_realtime) {
        answer_sent_time = moment().format('X'); //utc w/o ms
      }

      var quiz_def = redisClient.getAsync(master_quiz_object_key);
      var user_bot_status_def = redisClient.getAsync(redisHelpers.getUserBotStateKey(sender_object.screen_name, receiver_object.screen_name));

      var extra_lives_def = redisClient.hgetAsync(redisHelpers.getExtraLifeHashKey(receiver_object.screen_name.toLowerCase()), sender_object.id.toLowerCase());

      var user_is_still_in_the_quiz_def = redisClient.hgetAsync(redisHelpers.getEligibleForExtraLifeUsageKey(`${receiver_object.screen_name.toLowerCase()}`), `${sender_object.id}`);

      var has_extra_life_waiting_to_be_awarded_def = redisClient.hgetAsync(redisHelpers.getWaitingToReceiveExtraLifeKey(`${sender_object.screen_name.toLowerCase()}`), `${sender_object.screen_name.toLowerCase()}`);



      var iq_score_def = redisClient.hgetAsync(redisHelpers.getIQStatsKey(), sender_object.screen_name.toLowerCase());

      var welcome_message_id_found;
      if (!direct_message_entry.initiated_via) {
        welcome_message_id_found = 0;
      } else {
        welcome_message_id_found = direct_message_entry.initiated_via.welcome_message_id;
      }

      console.log(`AAPI Sent Us DM ID ${direct_message_entry.id} from ${sender_object.screen_name}`);

      var get_answer_status_key_def = redisClient.getAsync(redisHelpers.getAnswerStatusKey(sender_object.id));
      var get_answer_status_key_ttl_def = redisClient.ttlAsync(redisHelpers.getAnswerStatusKey(sender_object.id));

      var get_question_index_key_def = redisClient.getAsync(redisHelpers.getCurrentQuestionIndexKey(receiver_object.screen_name));

      join(quiz_def, extra_lives_def, iq_score_def, user_bot_status_def, user_is_still_in_the_quiz_def, has_extra_life_waiting_to_be_awarded_def, get_answer_status_key_def, get_answer_status_key_ttl_def, get_question_index_key_def, (whole_question_object, extra_life_redis_value, score, bot_state_status, user_is_still_in_the_quiz_value, has_extra_life_waiting_to_be_awarded_value, get_answer_status_value, user_answer_ttl_value, current_question_index_value) => {

        let extra_life_status = parseInt(extra_life_redis_value || `0`);
        let iq_score_object = JSON.parse(score || '{}');

        console.log(`${sender_object.screen_name} user_is_still_in_the_quiz_value ===> ${user_is_still_in_the_quiz_value}`);
        console.log(`${sender_object.screen_name} current_question_index_value ${current_question_index_value}`);
        user_is_still_in_the_quiz_value = user_is_still_in_the_quiz_value || 0;


        user_is_still_in_the_quiz_value = user_is_still_in_the_quiz_value == "1" ? true : false; //translate to a boolean
        console.log(`user_is_still_in_the_quiz_value ==> ${user_is_still_in_the_quiz_value}`);


        if (!user_is_still_in_the_quiz_value) {
          extra_life_status = "0";
        }

        let answered_via_dm = false;
        if (!welcome_message_id_found) {
          console.log(`${sender_object.screen_name} get_answer_status_value Not Welcome Message ID Found in Payload, using ${get_answer_status_value} instead ${redisHelpers.getAnswerStatusKey(sender_object.id)}`);
          welcome_message_id_found = get_answer_status_value;
          answered_via_dm = true;
        }

        let user_iq_score = iq_score_object.percentile || 0;
        let original_message_text = direct_message_entry.message_create.message_data.text;
        let dm_url = direct_message_entry.message_create.message_data.entities.urls[0];
        let message_text_urls_removed;

        let looks_like_menu_answer = original_message_text.includes("A. ") || original_message_text.includes("B. ") || original_message_text.includes("C. ") || original_message_text.includes("D. ");
        let is_abcd = original_message_text.toUpperCase() == 'A' || original_message_text.toUpperCase() == 'B' || original_message_text.toUpperCase() == 'C' || original_message_text.toUpperCase() == 'D';

        console.log(`BEFORE ${original_message_text}`);

        if (original_message_text.toUpperCase() == "A.") {
          original_message_text = 'A';
        }
        if (original_message_text.toUpperCase() == "B.") {
          original_message_text = 'B';
        }
        if (original_message_text.toUpperCase() == "C.") {
          original_message_text = 'C';
        }
        if (original_message_text.toUpperCase() == "D.") {
          original_message_text = 'D';
        }

        message_text_urls_removed = _.chain(original_message_text).replace('A. ', '').replace('B. ', '').replace('C. ', '').replace('D. ', '').trim().value();
        console.log(`AFTER ${message_text_urls_removed}`);

        if (dm_url) {
          message_text_urls_removed = _.chain(message_text_urls_removed).replace(dm_url.url, '').trim().value();
        } else {
          message_text_urls_removed = message_text_urls_removed;
        }
        console.log("message_text_urls_removed ==>  ", message_text_urls_removed);

        let is_not_bot_entry = _.intersection([message_text_urls_removed.trim().toLowerCase()], ['i\'ve had enough', 'iq score', 'faq', 'get an extra life', '#protips', 'get an extra life', 'tell me some #protips', 'submit feedback', 'get my iq score and game stats', 'get your iq score and game stats', '💰 Paypal', '📧 Contact', '🧠 FAQs', '⏰ Reminders', '😎 Extra Lives', '🤟 Redeem', '📈 Stats', 'use a life saver']).length == 0;

        let quick_reply_response_object = direct_message_entry.message_create.message_data.quick_reply_response;

        let was_quick_reply_response = !(_.isEmpty(quick_reply_response_object));

        if (!quick_reply_response_object && ['A', 'B', 'C', 'D'].includes(message_text_urls_removed.trim().toUpperCase()) === false) { is_not_bot_entry = false; }

        if (whole_question_object) {
          whole_question_object = JSON.parse(whole_question_object);

          let quiz_id = whole_question_object.quiz_id;

          let master_question_object = whole_question_object.quiz;
          let user_was_warned_about_type = false;

          console.log("Answer Sent Time", answer_sent_time);

          let question_matched = questionHelpers.determineQuestionAnsweredByWelcomeID(welcome_message_id_found, master_question_object);
          console.log(`(LOG1) has_extra_life_waiting_to_be_awarded_value ${has_extra_life_waiting_to_be_awarded_value}`);
          if (question_matched && has_extra_life_waiting_to_be_awarded_value) {
            var user_who_had_code_redeemed = _.split(has_extra_life_waiting_to_be_awarded_value, '@@@')[0];
            var user_who_had_code_redeemed_id = _.split(has_extra_life_waiting_to_be_awarded_value, '@@@')[1];

            redisClient.hincrby(redisHelpers.getExtraLifeHashKey(receiver_object.screen_name.toLowerCase()), user_who_had_code_redeemed_id, 1, redis.print);
            redisClient.hset(redisHelpers.getWaitingToReceiveExtraLifeKey(`${sender_object.screen_name.toLowerCase()}`), sender_object.screen_name.toLowerCase(), '');

            var payload = {
              created_at: moment().utc().format(),
              code_redeemed: user_who_had_code_redeemed,
              code_redeemed_account_id: user_who_had_code_redeemed_id,
              redeemer: sender_object.screen_name,
              redeemer_id: sender_object.id
            }
            sidekiqConnection.enqueue(
              'Chirpify::Workers::GenericLoggerWorker', ['extra_life_redeemed_events', JSON.stringify(payload)], {
                queue: 'logging'
              }
            );
          }

          let is_answer_to_process = looks_like_menu_answer || is_abcd;

          // var is_last_question = question_matched && question_matched.is_last_question;
          if (question_matched) {
            var is_past_cutoff = question_matched && ((question_matched.question_number + 1) >= extra_life_cutoff_question);
            console.log(`checking for cutoff`, question_matched.question_number + 1, extra_life_cutoff_question);
            if (is_past_cutoff) {
              console.log(`${sender_object.screen_name} is past the extra life cutoff!`);
              extra_life_status = 0;
            }
          }

          let answered_on_time = (question_matched && is_not_bot_entry && question_matched.current == '1') || answered_via_dm;
          // let answered_late_and_not_bot_entry = (question_matched && is_not_bot_entry && question_matched.current == '0') || (user_answer_ttl_value < 0 && is_answer_to_process);
          let answered_late_and_not_bot_entry = question_matched && is_not_bot_entry && question_matched.current == '0';
          if (answered_late_and_not_bot_entry) {
            var still_has_time_due_to_ttl = user_answer_ttl_value >= 0 && is_answer_to_process;
            answered_late_and_not_bot_entry = !still_has_time_due_to_ttl;
          }

          console.log(`${sender_object.screen_name} TTL ==> question_matched == ${JSON.stringify(question_matched)}`);
          console.log(`${sender_object.screen_name} TTL ==> user_answer_ttl_value == ${user_answer_ttl_value}`);
          console.log(`${sender_object.screen_name} TTL ==> is_not_bot_entry == ${is_not_bot_entry}`);
          console.log(`${sender_object.screen_name} TTL ==> (question_matched && is_not_bot_entry && (question_matched.current == '0')) ${question_matched && is_not_bot_entry && question_matched.current == '0'}`);
          console.log(`${sender_object.screen_name} TTL ==> (user_answer_ttl_value < 0 && is_answer_to_process) ${(user_answer_ttl_value < 0 && is_answer_to_process)}`);

          let answered_late_but_its_ok = answered_late_and_not_bot_entry;// && extra_life_status == "1";
          console.log(`${sender_object.screen_name}  answered_late_but_its_ok TTL  ==> ${answered_late_but_its_ok}`);

          if (answered_late_and_not_bot_entry || answered_on_time) { direct_message_entry.quiz_id = quiz_id; }

          if ((answered_on_time || answered_late_but_its_ok) && question_matched) {
            let answer_matched_array = _.intersection(question_matched.answers, [message_text_urls_removed]);

            console.log("Answer Matched Array", answer_matched_array, message_text_urls_removed);

            direct_message_entry.question_number = question_matched.question_number;

            let was_correct = answer_matched_array.length > 0;

            direct_message_entry.correct = was_correct ? "1" : "0";
            var extra_life_used = false;

            if (!was_correct && extra_life_status >= 1) {
              // user has an extra live so mark it was correct
              direct_message_entry.correct = "1";
              direct_message_entry.extra_life_used = "1";
              if (extra_life_status != 0) {
                redisClient.hincrby(redisHelpers.getExtraLifeHashKey(receiver_object.screen_name.toLowerCase()), sender_object.id.toLowerCase(), -1, redis.print);
              }
              was_correct = false; //make rest of app behave like the user was right
              extra_life_used = true;
              redisClient.hset(redisHelpers.getEligibleForExtraLifeUsageKey(`${receiver_object.screen_name.toLowerCase()}`), `${sender_object.id}`, '0');
            }

            direct_message_entry.late = answered_late_but_its_ok ? '1' : '0';

            direct_message_entry.answer_value = ['A', 'B', 'C', 'D'][_.indexOf(question_matched.all_answers, message_text_urls_removed)];

            if (_.intersection(['a', 'b', 'c', 'd'], [message_text_urls_removed.toLowerCase()]).length > 0) {
              direct_message_entry.answer_value = message_text_urls_removed.toUpperCase();
            }

            console.log(`Setting ${sender_object.screen_name} answer value to ${direct_message_entry.answer_value}`);
            if (direct_message_entry.answer_value) {
              if (direct_message_entry.extra_life_used) {
                redisClient.set(redisHelpers.getLatestAnswerValueKey(sender_object.id, direct_message_entry.question_number), `${direct_message_entry.answer_value}_extralifeused`, 'EX', 3600);
              } else {
                redisClient.set(redisHelpers.getLatestAnswerValueKey(sender_object.id, direct_message_entry.question_number), direct_message_entry.answer_value, 'EX', 3600);
              }
              console.log(`TTL Deleting instead ---> ${redisHelpers.getAnswerStatusKey(sender_object.id)}`);
              redisClient.del(redisHelpers.getAnswerStatusKey(sender_object.id));
            } else {
              console.log("was null!");
            }
            redisClient.hset(redisHelpers.getPlayerListKey(receiver_object.screen_name), sender_object.id.toLowerCase(), '1');

            if (!direct_message_entry.answer_value && ['A', 'B', 'C', 'D'].includes(message_text_urls_removed.trim().toUpperCase()) === true) {
              direct_message_entry.answer_value = message_text_urls_removed.trim().toUpperCase();
            }

            direct_message_entry.ttl_on_answer = user_answer_ttl_value;

            direct_message_entry.quick_reply_response = was_quick_reply_response ? '1' : '0';

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
                  if (already_logged_value !== "1") {
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

            if (reply_answer_status_to_user || true) {
              // var message_to_user = was_correct ? questionHelpers.getRightAnswerResponse(question_matched.question_number + 1) : questionHelpers.getWrongAnswerResponse(question_matched.question_number + 1);
              var message_to_user = questionHelpers.getWeGotItResponse(question_matched.question_number + 1);
              // if (extra_life_used) {message_to_user = `You got it wrong, but are saved by your extra life. Play on!`;}
              // if (answered_late_but_its_ok) {message_to_user = `Sorry you're too late to answer Q${question_matched.question_number + 1}. You're saved by your extra life though, so play on!`;}
              console.log(`answered_late_but_its_ok ${answered_late_but_its_ok}`);
              if (answered_late_but_its_ok) { message_to_user = questionHelpers.getYourAreLateResponse(question_matched.question_number + 1); }

              var message_value_type = was_correct ? "correct" : "wrong";
              var responded_status_key = redisClient.hgetAsync(redisHelpers.getRespondedAnswerKey(receiver_object.screen_name, question_matched.question_number), sender_object.screen_name);
              var responded_status_key_by_answer_value = redisClient.hgetAsync(redisHelpers.getRespondedByStatusKey(receiver_object.screen_name, message_value_type), sender_object.screen_name);

              join(responded_status_key, responded_status_key_by_answer_value).then((values) => {
                var already_responded_value = values[0];
                var responded_status_value = values[1];
                if (is_not_bot_entry) {
                  if (Math.random() <= 0.50 && !extra_life_used) {
                    message_value_type = 'wait';
                    // message_to_user = questionHelpers.getWaitAnswerResponse(question_matched.question_number + 1);
                  }
                  else if (responded_status_value != "1" && extra_life_used) {
                    message_to_user = `${message_to_user}`;
                  }
                  else if (responded_status_value != "1" && !was_correct) {
                    message_to_user = `${message_to_user}`;
                    // message_to_user = `${message_to_user} You can't win the prize, but you should keep playing to improve your IQ score, which is currently ${user_iq_score}.`;
                  } else if (responded_status_value != "1" && was_correct) {
                    message_to_user = `${message_to_user}`;
                  }
                } else if (!user_was_warned_about_type) {
                  this.__standardBotMenuResponse(recipient_id, sender_id, receiver_object.screen_name);
                }
                if (already_responded_value != "1" && is_not_bot_entry) {
                  // message_to_user = `${message_to_user} ${questionHelpers.getAvatarPrompt(question_matched.question_number + 1)}`;
                  this.__sendDMToUser(sender_id, receiver_object.screen_name, message_to_user, true, message_value_type);
                  redisClient.hset(redisHelpers.getRespondedByStatusKey(receiver_object.screen_name, message_value_type), sender_object.screen_name, "1", redis.print);
                  redisClient.hset(redisHelpers.getRespondedAnswerKey(receiver_object.screen_name, question_matched.question_number), sender_object.screen_name, "1", redis.print);
                } else if (!is_not_bot_entry) {
                  // no op for now!
                }
              });
            }
          } else { //no question was matched!
            // This is where we would send a message back saying you are too late!
            console.log('Setting was not a legit answer', message_text_urls_removed, is_answer_to_process);
            direct_message_entry.correct = "0";
            direct_message_entry.late = "1";
            direct_message_entry.question_number = question_matched && question_matched.question_number;
            this.__logDirectMessageEvent(users_array, direct_message_entry, messages);
            if (message_text_urls_removed.toUpperCase() == 'TEST') {
              this.__sendDMToUser(sender_id, receiver_object.screen_name, `There are no games currently scheduled. Stay tuned to our feed for updates!`, false, '', true);
            }
            else if (message_text_urls_removed.toUpperCase() == '🧠 FAQS' || message_text_urls_removed.toUpperCase() == 'FAQ' || message_text_urls_removed.toUpperCase() == 'SHOW ME SOME FAQS') {
              this.__sendFAQLink(sender_id, receiver_object.screen_name);
            } else if (message_text_urls_removed.toUpperCase() == '📈 STATS' || message_text_urls_removed.toUpperCase() == 'STATS' || message_text_urls_removed.toUpperCase() == 'CHECK MY STATS' || message_text_urls_removed.toUpperCase() == 'IQ' || message_text_urls_removed.toUpperCase() == 'GET MY IQ SCORE AND GAME STATS' || message_text_urls_removed.toUpperCase() == 'GET YOUR IQ SCORE AND GAME STATS') {
              console.log("User IQ Score", user_iq_score);
              console.log(iq_score_object);
              this.__sendUserIQScore(sender_id, sender_object.screen_name, receiver_object.screen_name, user_iq_score);

            } else if (message_text_urls_removed.toUpperCase() == '📧 CONTACT' || message_text_urls_removed.toUpperCase() == 'SUBMIT FEEDBACK') {
              this.__sendDMToUser(sender_id, receiver_object.screen_name, `We appreciate constructive feedback! Let us know your thoughts here feedback@iqtrivia.live\n\nBe sure to include your twitter handle (${sender_object.screen_name}) in your email so we know who you are!`, false, '', true);

            } else if (message_text_urls_removed.toUpperCase() === '#PROTIPS' || message_text_urls_removed.toUpperCase() === 'TELL ME SOME #PROTIPS') {
              this.__sendDMToUser(sender_id, receiver_object.screen_name, `#Protips: Best way to play is using the Twitter app on your phone.\n\nTurn notifications on for our account.\nIf you miss a notification be ready to manually refresh our feed for questions.\n\nHere’s how to turn on notifications.. https://cdn-images-1.medium.com/max/800/1*mzIh1uTgmErcDz8bg0XtWg.gif`, false, '', true);

            } else if (message_text_urls_removed.toUpperCase() == '😎 EXTRA LIVES OLD' || message_text_urls_removed.toUpperCase() === 'GET AN EXTRA LIFE OLD' || message_text_urls_removed.toUpperCase() === 'EXTRA OLD' || message_text_urls_removed.toUpperCase() === 'EXTRA LIFE OLD') {

              var link_with_time_to_spare = "https://twitter.com/intent/tweet?url=https%3A%2F%2Fpic.twitter.com/ElXxlKGyJA&text=Come%20play%20@IQtrivia%20with%20me%21%20It%27s%20a%20trivia%20game%20played%20for%20cash%20money%20right%20here%20on%20Twitter.%20%23Trivia%20%23IQtrivia";
              this.__sendDMToUser(sender_id, receiver_object.screen_name, `To get an extra life all you need to do is share the game here. ${link_with_time_to_spare}`, false, "", true);
            } else if (message_text_urls_removed.toUpperCase() == '😎 EXTRA LIVES' || message_text_urls_removed.toUpperCase() === 'GET AN EXTRA LIFE' || message_text_urls_removed.toUpperCase() === 'EXTRA' || message_text_urls_removed.toUpperCase() === 'EXTRA LIFE') {
              var redemption_code = sender_object.screen_name;
              if (!extra_life_redis_value) { extra_life_redis_value = "0"; }
              var code_link = `https://twitter.com/intent/tweet?url=https%3A%2F%2Fmedium.com%2Fiqtrivia%2Fextra-extra-301199b2b27b&text=Come%20play%20%40IQtrivia%20with%20me%21%20Use%20my%20code%20%27${redemption_code}%27%20and%20you%27ll%20get%20an%20extra%20life!%20%23Trivia%20%23IQtrivia`;
              this.__sendDMToUser(sender_id, receiver_object.screen_name, `To get an extra life just tell your friends to come play and enter your code: '${redemption_code}'. When a friend redeems your invite, and answers their first question, you'll get an extra life. Your friend will also get an extra life too! You can get as many extra lives as you want, and you can use one per game. You currently have ${extra_life_redis_value} extra lives.\n\nShare your code to get extra lives: ${code_link}`, false, '', true);
            } else if (message_text_urls_removed.toUpperCase() == '🤟 REDEEM' || message_text_urls_removed.toUpperCase() === 'REDEEM AN INVITE FOR AN EXTRA LIFE') {
              redisClient.set(redisHelpers.getUserBotStateKey(sender_object.screen_name, receiver_object.screen_name), 'entering_free_life_code', 'EX', 60 * 1);
              this.__sendDMToUser(sender_id, receiver_object.screen_name, `I see you were invited by a friend! What was their code?`, false, '', false);
            } else if (message_text_urls_removed.toUpperCase() == '💰 PAYPAL' || message_text_urls_removed.toUpperCase() === 'STORE MY PAYPAL EMAIL TO GET PAID') {
              redisClient.set(redisHelpers.getUserBotStateKey(sender_object.screen_name, receiver_object.screen_name), 'entering_paypal_email', 'EX', 60 * 1);
              this.__sendDMToUser(sender_id, receiver_object.screen_name, `What’s your PayPal email address? We’ll store it so when you win we can get you paid real quick!`, false, "", false);
            } else if (message_text_urls_removed.toUpperCase() == '⏰ REMINDERS' || message_text_urls_removed.toUpperCase() === 'REMIND ME WHEN THE NEXT GAME STARTS') {
              this.__processReminderMenu(sender_object, receiver_object);
            }
            else if (_.intersection(["👍 i'm in", "register", "i'm in", "im in", "ready", "i'm down", "ready!", "i’m in", "i’m in!", "in", "ready to play", "i want to play"], [message_text_urls_removed.toLowerCase()]).length >= 1) {
              console.log(`SENT READY MESSAGE ${message_text_urls_removed}`);
              // this.__sendDMToUser(sender_id, receiver_object.screen_name, `There are no games currently scheduled. Stay tuned to our feed for updates!`, false, '', true);
              this.__processUserHasOptedInEvent(sender_object, receiver_object, 'signup_link');
            }
            else if (_.intersection(["👍 i'm still playing", "i’m still playing", "i'm still playing", "still playing", "still playin"], [message_text_urls_removed.toLowerCase()]).length >= 1) {
              console.log(`SENT READY MESSAGE ${message_text_urls_removed}`);
              this.__processUserHasOptedInEvent(sender_object, receiver_object, 'opted_back_in');
            }
            else if (_.intersection(["💊 life savers", "life savers"], [message_text_urls_removed.toLowerCase()]).length >= 1) {
              console.log("Processing Link Request for Life Savers");
              this.__sendDMToUser(sender_id, receiver_object.screen_name, `Life Savers are not currently available.`, false, '', true);
              // this.__processUserRequestedLifeSaverLink(sender_object, receiver_object);
            }
            //  else if (_.intersection(["stop"], [message_text_urls_removed.toLowerCase()]).length >= 1) {
            //    this.__sendDMToUser(sender_id, receiver_object.screen_name, `OK -- We will no longer send you reminders`, false, "", false);
            //  }
            else if (is_not_bot_entry && message_text_urls_removed.toLowerCase() === 'i\'m done') {
              this.__sendDMToUser(sender_id, receiver_object.screen_name, `Redirecting you back to the main menu 😎`, false, '', true);
            }
            else if (message_text_urls_removed.toLowerCase() == '👎 i\'ve had enough' || message_text_urls_removed.toLowerCase() == 'i\'ve had enough') {
              console.log(`${message_text_urls_removed} WAS HAD ENOUGH RELATED`);
              redisClient.hdel(redisHelpers.getPlayerListKey(receiver_object.screen_name), sender_object.id.toLowerCase(), "1");
              this.__sendDMToUser(sender_id, receiver_object.screen_name, ` Ok, see you next game!\nYou can check your stats after the game is over.`, false, '', false);
            }
            else if (is_not_bot_entry && _.intersection(["👎 i'm out", '👎 nah'], [message_text_urls_removed.toLowerCase()]).length >= 1) {
              this.__sendDMToUser(sender_id, receiver_object.screen_name, `Ok, see you next game!`, false, '', false);
            }
            else if (_.intersection(["💊 use a life saver!", "use a life saver!", "use a life saver"], [message_text_urls_removed.toLowerCase()]).length >= 1) {
              this.__processLifeSaverEvent(sender_object, receiver_object);
            }
            else if (_.intersection(["⏰ unsubscribe", "⏰ subscribe", "unsubscribe", "subscribe"], [message_text_urls_removed.toLowerCase()]).length >= 1) {
              this.__processSubscriberMenu(sender_object, receiver_object, message_text_urls_removed);
            }
            else if (_.intersection(["fuck you", "frick you"], [message_text_urls_removed.toLowerCase()]).length >= 1) {
              this.__sendDMToUser(sender_id, receiver_object.screen_name, `Love you too bae`, false, '', true);
            }
            else if (bot_state_status == 'entering_free_life_code') {
              this.__parseFreeLifeCode(sender_object, receiver_object, message_text_urls_removed);
            }
            else if (bot_state_status == 'entering_paypal_email') {
              this.__validatePaypalEmailAddress(sender_object, receiver_object, message_text_urls_removed);
            }
            else if (is_not_bot_entry && (question_matched && question_matched.current == '0')) {
              this.__sendDMToUser(sender_id, receiver_object.screen_name, `Sorry, you answered too late! You can't win cash, but you should keep playing to improve your IQ score, which is currently ${user_iq_score}.`, true, `late`);
            } else if (is_answer_to_process) {
              var responded_status_key_def = redisClient.hgetAsync(redisHelpers.getRespondedAnswerKey(receiver_object.screen_name, current_question_index_value), sender_object.screen_name);
              join(responded_status_key_def).then((responded_status) => {
                responded_status = responded_status[0];
                console.log(`(LOG1) Current Question Index! ${current_question_index_value}`);
                if (responded_status != "1") {
                  redisClient.set(redisHelpers.getLatestAnswerValueKey(sender_object.id, current_question_index_value), "lateanswer", 'EX', 3600);
                  this.__sendDMToUser(sender_id, receiver_object.screen_name, `Your answer came in too late sorry.`, false, '', false);
                  redisClient.hset(redisHelpers.getEligibleForExtraLifeUsageKey(`${receiver_object.screen_name.toLowerCase()}`), `${sender_object.id}`, '0');
                  redisClient.hset(redisHelpers.getRespondedAnswerKey(receiver_object.screen_name, current_question_index_value), sender_object.screen_name, "1", redis.print);
                }
              });
            }
            else if (!user_was_warned_about_type) {
              console.log("didn't match anything!");
              this.__standardBotMenuResponse((recipient_id), sender_id, receiver_object.screen_name);
            }
          }
        }
      });
    });
  }

  __processLifeSaverEvent(sender_object, receiver_object) {
    console.log(`__processLifeSaverEvent called!`);
    const redis_question_key = redisHelpers.getLifeSaverQuestionNumberKey(receiver_object.screen_name.toLowerCase(), sender_object.id);

    var get_question_number_def = redisClient.getAsync(redis_question_key);
    join(get_question_number_def, (question_number) => {
      console.log(`Got get_question_number_def result is ${question_number}`);
      // anytime this menu option appears it means that the user is in a good "state" to user this!
      this.__sendDMToUser(sender_object.id, receiver_object.screen_name, "🙌 Your life has been saved!", false, "", false);
      sidekiqConnection.enqueue(
        'Chirpify::Workers::LifeSaverEventWorker', [{
          sender_object: sender_object,
          question_number: question_number
        }], {
          queue: 'priority'
        }
      );
    });
  }

  __processReminderMenu(sender_object, receiver_object) {
    var sender_id = sender_object.id;
    var sub_status_def = redisClient.hgetAsync(redisHelpers.getSubStatusKey(), sender_id);

    join(sub_status_def).then((sub_status) => {
      sub_status = sub_status[0];
      console.log(`${sender_object.screen_name} (${sender_object.id}) has brought up reminder menu! ${JSON.stringify(sub_status)}`);
      var message;
      if (sub_status != "0" && sub_status) {
        message = "Looks like you are already subscribed. 👍\n\nDon't forget to turn on @ mention notifications in your settings!";
      } else {
        message = 'Tap subscribe below to be reminded when a game is about to start.\n\nYou\'ll have a chance to win an extra life when we remind you!\n\nDon\'t forget to turn on @ mention notifications in your settings!';
      }
      this.__sendDMToUser(sender_id, receiver_object.screen_name, message, false, '', 'subscribe_menu');
    });
  }

  __processSubscriberMenu(sender_object, receiver_object, message_text) {
    var sender_id = sender_object.id;
    var sub_status_def = redisClient.hgetAsync(redisHelpers.getSubStatusKey(), sender_id);
    join(sub_status_def).then((sub_status) => {
      sub_status = sub_status[0];
      console.log(`${sender_object.screen_name} (${sender_object.id}) has brought up sub menu! ${sub_status}`);
      var active = (message_text.toLowerCase() == "⏰ unsubscribe" || message_text.toLowerCase() == "unsubscribe") ? "0" : "1";
      var payload = {
        updated_at: moment().utc().format(),
        twitter_account_name: sender_object.screen_name.toLowerCase(),
        twitter_account_id: sender_object.id,
        active: active,
      };
      var create_or_update = (sub_status != "0" && sub_status) ? "update" : "create";
      if (create_or_update == "update") {
        payload.id = sub_status;
      }
      if (create_or_update == "create") {
        payload.created_at = moment().utc().format();
      }
      var message_back = active == "1" ? "Got it! We’ll tweet you a couple minutes before the game starts." : "You’re now unsubscribed from reminders. We hope you still play!";
      this.__sendDMToUser(sender_id, receiver_object.screen_name, message_back, false, '', true);
      sidekiqConnection.enqueue(
        'Chirpify::Workers::ProcessSMSSubEventWorker', [payload], {
          queue: 'logging'
        }
      );
    });
  }

  __processUserRequestedLifeSaverLink(sender_object, receiver_object) {
    const hash_parameter = cipherHelpers.createCipherHash(sender_object.screen_name, sender_object.id, 1);
    const link = `${process.env.DASHBOARD_BASE_URL}/checkout/${hash_parameter}`;
    console.log(`Sending life saver link to ${sender_object.screen_name} ${link}`);
    const dm_text = `Glad you want to save your life!\n\nJust go here to purchase. ☝️ ${link}`;
    this.__sendDMToUser(sender_object.id, receiver_object.screen_name.toLowerCase(), dm_text, false, '', false);
  }

  __processUserHasOptedInEvent(sender_object, receiver_object, link_state = false) {
    console.log(`${sender_object.screen_name} (${sender_object.id}) has opted in!`);
    var sender_handle = sender_object.screen_name.toLowerCase();

    var extra_lives_def = redisClient.hgetAsync(redisHelpers.getExtraLifeHashKey('notused'), sender_object.id.toLowerCase());
    var get_stats_object_def = redisClient.hgetAsync(redisHelpers.getIQStatsKey(), sender_handle);

    var is_opted_in_already_def = redisClient.hgetAsync(redisHelpers.getPlayerListKey(receiver_object.screen_name), sender_object.id.toLowerCase());

    var get_player_count_def = redisClient.hlenAsync(redisHelpers.getPlayerListKey(receiver_object.screen_name.toLowerCase()));
    var get_time_remaining_def = redisClient.getAsync(redisHelpers.getNextGameTimeKey(receiver_object.screen_name));

    var sub_status_def = redisClient.hgetAsync(redisHelpers.getSubStatusKey(), sender_object.id);
    var life_saver_count_def = redisClient.getAsync(redisHelpers.getLifeSaverCountKey(sender_object.id));

    join(get_stats_object_def, extra_lives_def, get_player_count_def, get_time_remaining_def, is_opted_in_already_def, sub_status_def, life_saver_count_def).then((stats_object) => {
      var extra_life_count = stats_object[1] || 0;
      var player_count = stats_object[2];
      var next_game_time = parseInt(stats_object[3]);
      var opted_in_status = stats_object[4];
      var sub_status = stats_object[5];
      var life_saver_count = stats_object[6];
      console.log(`life_saver_count ${life_saver_count}`);
      life_saver_count = stats_object[6] || 0;
      stats_object = JSON.parse(stats_object[0] || '{}');
      console.log(`${sender_object.screen_name} -- stats_object -- ${JSON.stringify(stats_object)}`);
      console.log(extra_life_count);
      console.log(player_count);
      console.log(next_game_time);

      redisClient.hset(redisHelpers.getPlayerListKey(receiver_object.screen_name), sender_object.id.toLowerCase(), "1");

      if (opted_in_status == 0 || !opted_in_status) {
        player_count += 1;
      }

      var questinator_message = "The Questionator will send you the first question here in your DMs when the game begins!";

      var timespan = countdown(new Date(), new Date(next_game_time * 1000));
      var time_message = timespan.value <= 0 ? 'The game is in progress!' : `The next game starts in ${timespan.toString()}.`;
      if (!sub_status) {
        time_message = `${time_message}\n\nSet a reminder? 👇`;
      }
      var message = '';
      if (link_state === "opted_back_in") {
        message = `Glad you're still with us. 💕`;
        redisClient.set(redisHelpers.getLatestAnswerValueKey(sender_object.id), "optin", 'EX', 3600);
      } else if (link_state === "signup_link") {
        redisClient.set(redisHelpers.getLatestAnswerValueKey(sender_object.id), "z", 'EX', 3600);
        if (opted_in_status == 1) {
          message = `Good luck on the next game -- you're already registered for it!\n\n${questinator_message}\n\nThere are currently ${player_count} players competing!`;
        }
        else if (stats_object.quizzes_count == 0 || !stats_object.quizzes_count) {
          message = `
          Welcome @${sender_object.screen_name}, we’re glad you decided to play your first game! You’re the ${thize(player_count)} player in. ${questinator_message}`;
        } else {
          message = `Welcome @${sender_object.screen_name}, this is your ${thize(stats_object.quizzes_count + 1)} game! You're the ${thize(player_count)} player registered for this next game. Your IQ Score is ${stats_object.percentile} and you've got ${extra_life_count} extra lives along with ${life_saver_count} life savers purchased.\n\n${questinator_message}`;
        }
      }
      if (link_state !== "opted_back_in") {
        message = `${message}\n\n${time_message}`;
        var menu_type = !sub_status ? 'reminder_menu' : false;
        this.__sendDMToUser(sender_object.id, receiver_object.screen_name.toLowerCase(), message, false, 'noop', menu_type);
      } else {
        redisClient.getAsync(redisHelpers.getQuizRunningKey(receiver_object.screen_name)).then((quiz_status) => {
          console.log(`QUIZ STATUS ${quiz_status}`)
          var menu_type = (quiz_status == '1' && !sub_status) ? false : 'reminder_menu';
          message = quiz_status == '1' ? message : 'Awesome! You are now registered for the next game!';
          if (!sub_status) {
            message = `${message}\n\nDo you want to be reminded when it starts? 👇`;
          }
          this.__sendDMToUser(sender_object.id, receiver_object.screen_name.toLowerCase(), message, false, 'noop', menu_type);
        });
      }
    });
  }

  __sendFAQLink(sender_id, bot_owner_name) {
    this.__sendDMToUser(sender_id, bot_owner_name, `Go here for frequently asked questions. Where we answer your questions for a change… https://medium.com/iqtrivia/faq-ff29c1d9b06b`, false, 'noop', true);
  }

  __validatePaypalEmailAddress(sender_object, receiver_object, email_address) {
    email_address = email_address.replace("Store my PayPal email to get paid", "").trim();
    var is_email_address = Isemail.validate(email_address);
    if (is_email_address) {
      this.__sendDMToUser(sender_object.id, receiver_object.screen_name, `Thanks, I got it!`, false, "", true);
      sidekiqConnection.enqueue(
        'Chirpify::Workers::ProcessUserUpdateWorker', [{
          sender_object: sender_object,
          paypal_email: email_address
        }], {
          queue: 'logging'
        }
      );
    } else {
      this.__sendDMToUser(sender_object.id, receiver_object.screen_name, `Sorry, that doesn't look like a valid email address. Try again or press the I'm done button.`, false, "", "done_with_this_state");
      redisClient.set(redisHelpers.getUserBotStateKey(sender_object.screen_name, receiver_object.screen_name), "entering_paypal_email", "EX", 60 * 1);
    }
  }

  __parseFreeLifeCode(sender_object, receiver_object, code_submitted) {
    console.log(`Code SUBMITTED ==> ${code_submitted}`);
    var is_valid_code_def = redisClient.hgetAsync(redisHelpers.getMasterUserList(receiver_object.screen_name), code_submitted.toLowerCase());
    var has_redeemed_code_already_def = redisClient.hgetAsync(redisHelpers.getHasRedeemedFreeLifeCodeKey(receiver_object.screen_name), sender_object.id.toLowerCase());
    var sender_id = sender_object.id;

    join(is_valid_code_def, has_redeemed_code_already_def, (is_valid_code_value, has_redeemed_code_already_value) => {
      console.log(`is_valid_code_value --> ${is_valid_code_value}`);
      console.log(`has_redeemed_code_already_value --> ${has_redeemed_code_already_value}`);
      if (code_submitted.toLowerCase() == sender_object.screen_name.toLowerCase()) {
        this.__sendDMToUser(sender_id, receiver_object.screen_name, `Nice try, you can't redeem your own code. 😘`, false, '', true);
        redisClient.set(redisHelpers.getUserBotStateKey(sender_object.screen_name, receiver_object.screen_name), 'default', 'EX', 86400);
      }
      else if (is_valid_code_value && (has_redeemed_code_already_value == "0" || !has_redeemed_code_already_value)) {
        var code_value = `${code_submitted.toLowerCase()}@@@${is_valid_code_value}`; //@ can't be in twitter usernames
        console.log(`CODE VALUE ${code_value}`);
        redisClient.hincrby(redisHelpers.getExtraLifeHashKey(receiver_object.screen_name.toLowerCase()), sender_object.id.toLowerCase(), 1, redis.print);
        redisClient.hset(redisHelpers.getWaitingToReceiveExtraLifeKey(sender_object.screen_name.toLowerCase()), sender_object.screen_name.toLowerCase(), code_value);
        redisClient.hset(redisHelpers.getHasRedeemedFreeLifeCodeKey(receiver_object.screen_name), sender_object.id.toLowerCase(), '1');
        redisClient.set(redisHelpers.getUserBotStateKey(sender_object.screen_name, receiver_object.screen_name), 'default', 'EX', 86400);
        this.__sendDMToUser(sender_id, receiver_object.screen_name, `Thanks! You now have an extra life!`, false, '', true);
        var redeemer_name = sender_object.screen_name;
        this.__sendDMToUser(is_valid_code_value, receiver_object.screen_name, `@${redeemer_name} just redeemed your code! You’ll get your extra life when they answer their first question. Want more lives? Invite more friends!`, false, '', false);
      } else if (has_redeemed_code_already_value == "1") {
        this.__sendDMToUser(sender_id, receiver_object.screen_name, `Oops! It looks like you already redeemed your invite. To get more extra lives invite some friends of your own!`, false, '', true);
        redisClient.set(redisHelpers.getUserBotStateKey(sender_object.screen_name, receiver_object.screen_name), 'default', 'EX', 86400);
      } else if (is_valid_code_value == "0" || !is_valid_code_value) {
        this.__sendDMToUser(sender_id, receiver_object.screen_name, `Sorry, it looks like that’s an invalid code. Tell me again what your friend’s code is?`, false, '', 'done_with_this_state');
        redisClient.set(redisHelpers.getUserBotStateKey(sender_object.screen_name, receiver_object.screen_name), 'entering_free_life_code', 'EX', 60 * 1);
      }
    });
  }

  // __parseUserNumber(sender_object, receiver_object, phone_number_submitted) {
  //   const accountSid = process.env.TWILIO_ACCOUNT_SID;
  //   const authToken = process.env.TWILIO_ACCOUNT_AUTH_TOKEN;
  //   const client = require('twilio')(accountSid, authToken);

  //   client.lookups.phoneNumbers(phone_number_submitted)
  //     .fetch({
  //     })
  //     .then((phone_number_object) => {
  //       console.log(`phone_number.callerName: ${JSON.stringify(phone_number_object)}`);
  //       var code_found = true;
  //       if (code_found) {
  //         redisClient.set(redisHelpers.getUserBotStateKey(sender_object.screen_name, receiver_object.screen_name), 'default', 'EX', 86400);
  //         sidekiqConnection.enqueue(
  //           'Chirpify::Workers::ProcessSMSSubEvent', [{
  //             sender_object: sender_object,
  //             phone_number: phone_number_object.phoneNumber,
  //             raw_phone_number: phone_number_submitted,
  //             country_code: phone_number_object.countryCode
  //           }], {
  //             queue: 'logging'
  //           }
  //         );
  //         this.__sendDMToUser(sender_object.id, receiver_object.screen_name, `Thanks! We sent you a text message. If you didn’t receive it tap below to try again.`, false, '', true);
  //         smsHelpers.sendInitialSMSMessage(phone_number_object.phoneNumber);
  //       } else {
  //         this.__sendDMToUser(sender_object.id, receiver_object.screen_name, `Invalid phone number. Please try again.`, false, '', 'done_with_this_state');
  //       }
  //     })
  //     .catch((e) => {
  //       console.log(`Twilio Error Occurred ==>`, e);
  //       this.__sendDMToUser(sender_object.id, receiver_object.screen_name, `Invalid phone number. Please try again.`, false, '', 'done_with_this_state');
  //     })
  //     .done(()=>{console.log(`done!!`);});
  // }

  __sendUserIQScore(sender_id, sender_handle, bot_owner_name, user_iq_score) {
    console.log(`Looking up IQ score for ${sender_handle}`);
    var extra_lives_def = redisClient.hgetAsync(redisHelpers.getExtraLifeHashKey('notused'), sender_id.toLowerCase());
    var get_stats_object_def = redisClient.hgetAsync(redisHelpers.getIQStatsKey(), sender_handle.toLowerCase());
    var life_saver_count_def = redisClient.getAsync(redisHelpers.getLifeSaverCountKey(sender_id));
    join(get_stats_object_def, extra_lives_def, life_saver_count_def).then((stats_object) => {
      console.log(`stats_object ${stats_object}`);
      var extra_lives_count = stats_object[1] || 0;
      var life_saver_count = stats_object[2] || 0;
      console.log(`extra_lives_count ${extra_lives_count}`);
      var extra_life_prompt = " extra lives";
      if (extra_lives_count == 0) { extra_lives_count = ''; extra_life_prompt = "no extra lives"; }

      if (!stats_object[0]) {
        this.__sendDMToUser(sender_id, bot_owner_name, `Your IQ score isn't available until you've played your first game.\n\nCome play weekdays at 12:30 PDT!\n\nYou currently have ${extra_lives_count}${extra_life_prompt}.`, false, '', true);
      } else {
        console.log(typeof stats_object, stats_object);
        stats_object = JSON.parse(stats_object[0]);
        console.log(typeof stats_object, stats_object);
        // stats_object = JSON.parse(stats_object);
        var percentile = stats_object.percentile;
        var right_count = stats_object.right_answer_count;
        var wrong_count = stats_object.wrong_answer_count;
        var quizzes_count = stats_object.quizzes_count;
        var rank = thize(stats_object.leaderboard_rank);
        if (percentile == 0) {
          this.__sendDMToUser(sender_id, bot_owner_name, `Sorry but your IQ score is currently 0. Play more quizzes to increase your score!\nYou currently have ${extra_lives_count}${extra_life_prompt}.`, false);
        } else {
          var dynamic_intent = `https://twitter.com/intent/tweet?url=https%3A%2F%2Fpic.twitter.com/hUKXWZjFxs&text=My%20%40IQtrivia%20IQ%20score%20is%20${percentile}.%0AI%27ve%20played%20${quizzes_count}%20games.%0A${right_count}%20questions%20right%20and%20${wrong_count}%20wrong.%0AI%27m%20in%20${rank}%20place%20overall%21%0A`;
          this.__sendIQDMToUser(sender_id, bot_owner_name, `Your IQ score is ${percentile}.\nYou have ${extra_lives_count}${extra_life_prompt}.\nYou have ${life_saver_count} life savers available.\nYou've played ${quizzes_count} games.\n${right_count} questions right.\n${wrong_count} questions wrong.\nYou are in ${rank} place!\n\nBrag about your stats here ${dynamic_intent}`, user_iq_score);
        }
      }
    });
  }

  async __sendIQDMToUser(recipient_id, bot_owner_name, message_text, user_iq_score) {
    console.log(`Sending IQ User DM to ${recipient_id}`);
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

    // var media_id_to_send = questionHelpers.getAppropriateMediaAssetForIQScore(iq_score_configuration[bot_owner_name.toLowerCase()], (parseInt(user_iq_score) - 1));

    // if (media_id_to_send) {
    //   dm_payload.event.message_create.message_data.attachment = {
    //     type: `media`,
    //     media: {
    //       id: media_id_to_send
    //     }
    //   };
    // }

    dm_payload.event.message_create.message_data.quick_reply = {
      type: 'options',
      options: await this.__getStandardBotMenuOptionsObject(recipient_id)
    };

    this.__getTwitterClientForHandle(bot_owner_name).post('direct_messages/events/new', dm_payload, (response) => {
      console.log("DM RESPONSE", response);
      this.__logErrorEvent(recipient_id, response);
    });
  }

  async __sendDMToUser(recipient_id, bot_owner_name, message_text, send_image = true, image_type = 'correct', bot_menu_type = false) {
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
    var media_id_to_send = '';
    if (send_image) {
      media_id_to_send = questionHelpers.getAppropriateMediaAsset(app_configuration[bot_owner_name.toLowerCase()], image_type);
      if (media_id_to_send) {
        dm_payload.event.message_create.message_data.attachment = {
          type: "media",
          media: {
            id: media_id_to_send
          }
        };
      }
    }
    if (bot_menu_type === true) {
      dm_payload.event.message_create.message_data.quick_reply = {
        type: 'options',
        options: await this.__getStandardBotMenuOptionsObject(recipient_id)
      };
    }
    if (bot_menu_type === 'done_with_phone_number_bot_menu') {
      dm_payload.event.message_create.message_data.quick_reply = {
        type: 'options',
        options: await this.__getStandardBotMenuOptionsObject(recipient_id)
      };
    }
    if (bot_menu_type == 'done_with_this_state') {
      dm_payload.event.message_create.message_data.quick_reply = {
        type: 'options',
        options: this.__getDoneWithStateOptionsObject(recipient_id)
      };
    }
    if (bot_menu_type == 'reminder_menu') {
      dm_payload.event.message_create.message_data.quick_reply = {
        type: 'options',
        options: this.__getReminderMenu(recipient_id)
      };
    }
    if (bot_menu_type == 'subscribe_menu') {
      dm_payload.event.message_create.message_data.quick_reply = {
        type: 'options',
        options: this.__getSubscribingMenu(recipient_id)
      };
    }
    console.log("DM PAYLOAD", dm_payload);
    // message_text = "We'll be sure to announce when IQTrivia is live again! In the meantime check out our new app called Legit https://www.getlegit.app"
    var dm_message_payload = {
      user_handle_id: recipient_id,
      dm_message: message_text,
      dm_type: 'bot_message',
      media_id: media_id_to_send,
      sending_handle: bot_owner_name,
      quick_reply_object: dm_payload.event.message_create.message_data.quick_reply && dm_payload.event.message_create.message_data.quick_reply.options,
    };

    sidekiqConnection.enqueue(
      'Chirpify::Workers::SendDMWorker', [dm_message_payload], {
        queue: 'default'
      }
    );

    // this.__getTwitterClientForHandle(bot_owner_name).post('direct_messages/events/new', dm_payload, (response) => {
    //   console.log("DM RESPONSE", response);
    //   this.__logErrorEvent(recipient_id, response);
    // });
  }

  __logErrorEvent(recipient_id, error_object) {
    if (!error_object || !error_object.message) { return; }
    let payload = { receiving_account: recipient_id, full_object: JSON.stringify(error_object, null, "\t"), error_text: error_object["message"] };
    sidekiqConnection.enqueue(
      'Chirpify::Workers::GenericLoggerWorker', ['errors', JSON.stringify(payload)], {
        queue: 'logging'
      }
    );
  }

  __logDirectMessageEvent(users_array, direct_message_entry, original_object) {
    let recipient_id = direct_message_entry['message_create']['target']['recipient_id'];
    let sender_id = direct_message_entry['message_create']['sender_id'];
    let receiver_object = users_array[recipient_id];
    let sender_object = users_array[sender_id];

    // let action_account_name = use_random_handles ? randomstring.generate(15) : sender_object.screen_name;
    // console.log(`action_account_name ${action_account_name}, use_random_handles ${use_random_handles}`);
    // console.log(`sender_object.screen_name.toLowerCase() ${sender_object.screen_name.toLowerCase()}`);

    // if (_.includes(["christeso", "bobber205", "jingwait", "trailrunner_vip", "chatbottrivia", process.env.BOT_HANDLE], sender_object.screen_name.toLowerCase())) {
    //   action_account_name = sender_object.screen_name; //whitelist
    // } 

    let payload = {
      ...(!use_realtime && { created_at: moment(parseInt(direct_message_entry['created_timestamp'])).utc().format() }),
      ...(use_realtime && { created_at: moment().utc().format() }),
      time_received: moment().utc().format(),
      full_object: JSON.stringify(original_object, null, '\t'),
      acting_account: sender_object.screen_name,
      acting_account_id: sender_id,
      receiving_account: receiver_object.screen_name,
      dm_text: direct_message_entry['message_create']['message_data']['text'],
      question_number: direct_message_entry['question_number'],
      correct: direct_message_entry['correct'],
      late: direct_message_entry['late'],
      answer_value: _.toUpper(direct_message_entry['answer_value']),
      extra_life_used: direct_message_entry['extra_life_used'] || "0",
      quiz_id: direct_message_entry['quiz_id'],
      ttl_on_answer: direct_message_entry['ttl_on_answer'],
      quick_reply_response: direct_message_entry['quick_reply_response']
    };
    var table_to_log_to = 'direct_message_events';
    if (payload['late'] == '1' && direct_message_entry['correct'] != '1') {
      table_to_log_to = 'direct_message_events_late'
    }
    sidekiqConnection.enqueue(
      'Chirpify::Workers::GenericLoggerWorker', [table_to_log_to, JSON.stringify(payload)], {
        queue: 'logging'
      }
    );
  }

  async __standardBotMenuResponse(recipient_id, sender_id, bot_owner_name, late_status = false) {
    var standard_message_text = "Can I help Q? Tap or scroll👇";
    let dm_payload = {
      event: {
        type: `message_create`,
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

    dm_payload.event.message_create.message_data.quick_reply = {
      type: 'options',
      options: await this.__getStandardBotMenuOptionsObject(sender_id)
    }

    console.log(`Options list for menu! ${dm_payload.event.message_create.message_data.quick_reply.options.length}`);
    if (dm_payload.event.message_create.message_data.quick_reply.options.length == 2) {
      dm_payload.event.message_create.message_data.text = "There’s a game in progress.\nWant to play?";
      if (late_status) {
        dm_payload.event.message_create.message_data.text = "Looks like your answer was late!\nWant to keep playing?";
      }
    }

    if (dm_payload.event.message_create.message_data.quick_reply.options.length == 2) {

    } else {
      this.__getTwitterClientForHandle(bot_owner_name).post(
        "direct_messages/events/new",
        dm_payload,
        response => {
          console.log("dm response for bot menu", arguments);
          this.__logErrorEvent(sender_id, response);
        }
      );
    }
  }

  __getDoneWithStateOptionsObject(acting_handle_id = 'whocares') {
    var options = [
      {
        label: "I'm done",
        meta_data: "done"
      }
    ];
    return options;
  }


  __getSubscribingMenu() {
    var options = [
      {
        label: "⏰ Subscribe",
        description: 'Remind me when the next game starts',
        meta_data: "Notifications!"
      },
      {
        label: "⏰ Unsubscribe",
        description: 'Stop reminding me',
        meta_data: "Notifications!"
      },
      {
        label: "I'm done",
        description: 'Nevermind',
        meta_data: "Notifications!"
      }
    ];
    return options;
  }

  __getReminderMenu() {
    var options = [
      {
        label: "⏰ Reminders",
        description: 'Remind me when the next game starts',
        meta_data: "Notifications!"
      }
    ];
    return options;
  }

  async __getStandardBotMenuOptionsObject(acting_handle_id = 'whocares') {
    var options = [
      {
        label: "👍 I'm in",
        meta_data: 'i_am_in',
        description: 'Ready to play the next game!'
      },
      {
        label: "⏰ Reminders",
        description: 'Remind me when the next game starts',
        meta_data: "Notifications!"
      },
      {
        label: "📈 Stats",
        description: 'Get my IQ score and game stats',
        meta_data: "Get my IQ score and game stats"
      },
      {
        label: "🤟 Redeem",
        description: 'Redeem an invite for an extra life',
        meta_data: "redeem_code_menu"
      },
      {
        label: "😎 Extra Lives",
        description: 'Get an extra life',
        meta_data: "extra_life_new"
      },
      {
        label: "💰 Paypal",
        description: 'Store my PayPal email to get paid',
        meta_data: "paypal_email_menu_item"
      },
      {
        label: '🧠 FAQs',
        description: 'Show me the FAQs',
        meta_data: 'Show me the FAQs'
      },
      {
        label: '📧 Contact',
        description: 'Submit Feedback',
        meta_data: 'Submit Feedback'
      },
    ];

    if (['15588742', '19081905', '1375079370'].includes(acting_handle_id) || true) { //teso, bobber205 and jingwait
      var test_item = {
        label: "💊 Life Savers",
        description: "Buy Some Life Savers!",
        meta_data: "buy_extra_lives_menu"
      };
      options.splice(1, 0, test_item);
    }

    // if (['15588742', '19081905', '1375079370'].includes(acting_handle_id) || true) {
    if (true) {
      var opt_in_to_quiz_item = {
        label: "👍 Hell yeah",
        description: "Down for fun and cash",
        meta_data: "opt_into_quiz_item"
      };
      var done_with_quiz_option = {
        label: "👍 Nah",
        description: "I'm anti fun and free cash",
        meta_data: "opt_out_quiz_item"
      };
      async function checkToSeeIfQuizRunning() {
        const res = await redisClient.getAsync(redisHelpers.getQuizRunningKey(process.env.BOT_HANDLE));
        // opt_in_to_quiz_item.description = res;
        if (res == "1") {
          options = [done_with_quiz_option]
          options.splice(0, 0, opt_in_to_quiz_item);
        }
      }
      await checkToSeeIfQuizRunning();
      console.log(`Printing out ${JSON.stringify(options)}`);
      return options;
    } else {
      return options;
    }
  }
  __getStandardBotMenuOptionsObjectOLD(acting_handle_id = 'whocares') {
    var options = [
      {
        label: "Get my IQ score and game stats",
        meta_data: "IQ"
      },
      {
        label: "Redeem an invite for an extra life",
        meta_data: "redeem_code_menu"
      },
      {
        label: "Get an extra life",
        meta_data: "extra_life_new"
      },
      {
        label: "Store my PayPal email to get paid",
        meta_data: "paypal_email_menu_item"
      },
      {
        label: "Remind me when the next game starts",
        meta_data: "Notifications!"
      },
      {
        label: 'Show me some FAQs',
        meta_data: 'FAQ'
      },
      {
        label: 'Submit feedback',
        meta_data: 'Feedback'
      },
    ];
    if (['15588742', '19081905', '1375079370'].includes(acting_handle_id) || true) {
      var enter_your_email_item = {
        label: "💊 Life Savers",
        meta_data: "buy_extra_lives_menu"
      };
      options.splice(4, 0, enter_your_email_item);
    }
    return options;
  }

  __getPhoneNumberDoneMenu(acting_handle_id = 'whocares') {
    var options = [
      {
        label: "I'm done",
        meta_data: "I'm done"
      },
      {
        label: "Remind me when the next game starts",
        meta_data: "Remind me when the next game starts"
      }
    ];
    return options;
  }
  __getEmailEnteringDoneMenu(acting_handle_id = 'whocares') {
    var options = [
      {
        label: "I'm done",
        meta_data: "I'm done"
      },
      {
        label: "Store my PayPal email to get paid",
        meta_data: "paypal_email_menu_item"
      }
    ];
    return options;
  }

  __processWebhookEvent(messages) {
    let message_type = _.chain(messages).keys().drop(1).first().value();
    console.log(`Message Type Received ==> ${message_type} ${messages}`);
    // console.log(`Message Object Received ==> ${JSON.stringify(messages)}`);
    if (message_type === 'favorite_events') {
      loggingHelpers.logFavoriteEvents(messages);
    } else if (message_type == 'direct_message_events') {
      this.__processDirectMessageEvent(messages);
    } else if (message_type == 'follow_events') {
      this.__processFollowEvent(messages);
    } else if (message_type == 'tweet_create_events') {
      this.__processTweetCreateEvent(messages);
      this.__logTweetCreateEvent(messages);
    }
    else if (message_type == 'direct_message_mark_read_events') {
      loggingHelpers.logDirectMessageReadEvent(messages);
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
        queue: 'logging'
      }
    );
  }

  __doCRCResponse(req, res) {
    let secret = process.env.CHRP_TWITTER_CONSUMER_SECRET;
    let token = req.query.crc_token;
    let challenge_token = securityHelpers.get_challenge_response(token, secret);
    // console.log("sending back", challenge_token);
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
