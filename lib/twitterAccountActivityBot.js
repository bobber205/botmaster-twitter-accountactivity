"use_strict";

const express = require('express');
const path = require("path");
const bodyParser = require('body-parser');
const crypto = require('crypto');
const request = require('request-promise');
const BaseBot = require('botmaster').BaseBot;
const debug = require('debug')('botmaster:messenger');

const securityHelpers = require('./helpers/security');
const questionHelpers = require('./helpers/questionHelpers');
const redisHelpers = require('./helpers/redisHelpers');
const configHelpers = require('./helpers/configHelper');
const smsHelpers = require('./helpers/smsHelpers');
const loggingHelpers = require('./helpers/loggingHelpers');

var PhoneNumber = require('awesome-phonenumber');

const Promise = require("bluebird");
const join = Promise.join;

const moment = require('moment');
const randomstring = require("randomstring");
const thize = require('thize');

const redis = require('redis');
const redisClient = redis.createClient(process.env.REDIS_URL);

// Make all redis commands promises 
const bluebird = require('bluebird');
bluebird.promisifyAll(redis.RedisClient.prototype);
bluebird.promisifyAll(redis.Multi.prototype);

const use_realtime = process.env.USE_REALTIME === '1';
const use_random_handles = process.env.USE_RANDOM_HANDLES === '1';
const reply_answer_status_to_user = process.env.REPLY_ANSWER_STATUS_TO_USER === '1';
const log_all_dm_messages = process.env.LOG_ALL_DM_MESSAGES === '1';
const Isemail = require("isemail");


const Sidekiq = require('sidekiq');

const sidekiqConnection = new Sidekiq(redisClient);

const _ = require('lodash');

const Twit = require("twit");

let app_configuration = {};
let iq_score_configuration = {};

const valid_bot_handles = ['iqtrivia', 'sadtrebek', 'happytrebek', 'pumpedtrebek'];

const valid_extra_life_hashtags = ['iqforlife'];

var valid_opt_in_message = ['i am ready', 'ready', 'ready!', 'in', 'in!', 'yes'];

// function matches() {
//   var input = "ready";
//   var result = _.some(valid_opt_in_message, (current) => {return input.toLowerCase().indexOf(current.toLowerCase()) > 0 });
// }

redisClient.on('connect', function(err) {

  _.each(valid_bot_handles, (handle) => {
        console.log(`Getting config for ${handle}`); 
        var config_keys = [redisHelpers.getConfigurationKeyForHandle(handle), redisHelpers.getConfigurationKeyForIQScores(handle)];
        var config_defs = _.map(config_keys, (key) => {return redisClient.getAsync(key);});
        join(...config_defs).then((config_json_array) => {
          if (!config_json_array[0]) 
            config_json_array[0] = '{}';
          if (!config_json_array[1]) 
            config_json_array[1] = '[]';

          iq_score_configuration[handle] = JSON.parse(config_json_array[1]);

          console.log(`${handle} IQ Score Length ${iq_score_configuration[handle].length}`);
          var config_json = config_json_array[0];
          console.log(config_json);
          var config = JSON.parse(config_json);
          app_configuration[handle] = config;
      });
  });

  _.each(valid_bot_handles, (handle) => {
      // See if each bot handle has a valid or at least blank quiz object
      let master_quiz_object_key = redisHelpers.getMasterQuestionObjectKey(handle);
      redisClient.getAsync(master_quiz_object_key).then((result) => {
        if (!result) {
          console.log(`Creating blank object for ${handle}`);
          redisClient.set(master_quiz_object_key, JSON.stringify({}), redis.print);
        }
      });
  });
});

console.log(`Starting up V2`);

class TwitterAccountActivityBot {

  constructor(settings, expressApp) {
    this.__createMountPoints(expressApp);
    this.twitterClients = {};
  }

  __getTwitterClientForHandle(handle) {
    handle = handle.toLowerCase();
    if (this.twitterClients[handle]) {return this.twitterClients[handle];}
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

    this.app.post('/twilio', (req, res) => {
      loggingHelpers.logTwilioEvents(req.body);
      res.sendStatus(200);
    });

    this.app.post('/instagram', (req, res) => {
      console.log(`Instagram Post Received!`);
      console.log(`${JSON.stringify(req.body)}`);
      this.__processInstagramEvent(req.body);
      res.sendStatus(200);
    });

    this.app.get('/instagram', (req, res) => {
      console.log(req.query)
      if (req.query['hub.verify_token'] === "hellothere1231231231234444") {
        res.status(200).send(req.query["hub.challenge"]);
      } else {
        res.sendStatus(200);
      }
    });
  }
  
  __processInstagramEvent(instagram_json_payload) {
    console.log(`Processing Instagram Event`);
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
        'Chirpify::Workers::GenericLoggerWorker',
        ['follow_events', JSON.stringify(payload)],
        {
          queue: 'default'
        }
      );
    });
  }

  __processTweetCreateEvent(messages) {
    let tweet_events = messages.tweet_create_events;



    _.each(tweet_events, (entry) => {
      let master_quiz_object_key = redisHelpers.getMasterQuestionObjectKey(entry.in_reply_to_screen_name || "");
      var quiz_def = redisClient.getAsync(master_quiz_object_key);

      join(quiz_def, (quiz_json_string) => {
        if (!quiz_json_string) {return;}
        console.log(`__processTweetCreateEvent json ${quiz_json_string}`);
        console.log(`in_reply_to_status_id_str ${entry.in_reply_to_status_id_str}`);
        var all_tweet_ids = _.chain(JSON.parse(quiz_json_string).quiz).map((c)=> {return c.tweet_id;}).compact().value();
        let is_response_to_question = _.intersection([entry.in_reply_to_status_id_str], all_tweet_ids).length > 0;
        console.log(`all tweet ids ${all_tweet_ids} ==> ${is_response_to_question}`);
        if (is_response_to_question) {
          console.log(`User ${entry.user.screen_name} is trying to respond to a question tweet!`);
          let to_message_screen_name = entry.user.screen_name;
          let message_to_send = `@${to_message_screen_name} Be sure to answer future questions using the "Send a private message" button!`;
          let bot_owner_name = entry.in_reply_to_screen_name;
          if (process.env.QUIZ_RUNNING == '1') {
            this.__getTwitterClientForHandle(bot_owner_name).post('statuses/update', {status: message_to_send, in_reply_to_status_id: entry.id_str});
          }
        }
      });

      if (!entry.entities.hashtags) {return;} //GOTTA HAVE A HASHTAG
      let users_mentioned = entry.entities.user_mentions.map((c)=> {return [c.screen_name, c.id_str];});

      let hashtags = entry.entities.hashtags.map((c)=> {return c.text.toLowerCase();});
      let hashtags_extended = [];
      if (entry.extended_tweet) {
        hashtags_extended = entry.extended_tweet.entities.hashtags.map((c)=> {return c.text.toLowerCase();});
        if (entry.extended_tweet.user_mentions) {
          users_mentioned = entry.extended_tweet.user_mentions.map((c)=> {return [c.screen_name, c.id_str];});
        }
      }
      hashtags = _.chain(hashtags).concat(hashtags_extended).uniq().value();
      let has_extra_life_hashtags = _.intersection(hashtags, valid_extra_life_hashtags).length >= valid_extra_life_hashtags.length;
      let is_valid_bot_handle = valid_bot_handles.includes(entry.user.screen_name.toLowerCase());
      console.log(`has_extra_life_hashtags ${has_extra_life_hashtags}`);

      if (is_valid_bot_handle && has_extra_life_hashtags) {
        //means a bot tweeted
        _.each(users_mentioned, (user_data) => {
          let user_screen_name = user_data[0];
          let user_id = user_data[1];
          console.log(`sending message to ${user_id}`);
          redisClient.hincrby(redisHelpers.getExtraLifeHashKey(entry.user.screen_name.toLowerCase()), user_screen_name.toLowerCase(), 1, redis.print);
          this.__sendDMToUser(user_id, entry.user.screen_name.toLowerCase(), `You've been given a bonus extra life!`, false, '', false);
        });
      }
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
          queue: 'default'
        }
      );
    });
  }

  __processDirectMessageEvent(messages)  {
    let users_array = messages.users;
    let events = messages.direct_message_events;
    console.log(`Got ${events.length} messages` );

    _.each(events, (direct_message_entry) => {
      console.log(`direct_message_entry.message_create.source_app_id ${direct_message_entry.message_create.source_app_id}`);
      if (direct_message_entry.message_create.source_app_id === "125311" || direct_message_entry.message_create.source_app_id === "268278") {
        console.log(`Ignoring ${direct_message_entry.message_create.message_data.text}`);
        return; //268278 is twitter's web app id apparently
      }
      let recipient_id = direct_message_entry.message_create.target.recipient_id;
      let sender_id = direct_message_entry.message_create.sender_id;
      let receiver_object = users_array[recipient_id];
      let sender_object = users_array[sender_id];
      
      let master_quiz_object_key = redisHelpers.getMasterQuestionObjectKey(receiver_object.screen_name);
      let answer_sent_time = parseInt(direct_message_entry.created_timestamp) / 1000; //get rid of ms

      if (use_realtime) {
        answer_sent_time = moment().format('X'); //utc w/o ms
      }

      var quiz_def = redisClient.getAsync(master_quiz_object_key);
      var user_bot_status_def = redisClient.getAsync(redisHelpers.getUserBotStateKey(sender_object.screen_name));
      
      var extra_lives_def = redisClient.hgetAsync(redisHelpers.getExtraLifeHashKey(receiver_object.screen_name.toLowerCase()), sender_object.screen_name.toLowerCase());
      
      var has_used_extra_life_for_quiz_def = redisClient.hgetAsync(redisHelpers.currentExtraLivesUsedKey(`${receiver_object.screen_name.toLowerCase()}`), `${sender_object.screen_name.toLowerCase()}`);

      var has_extra_life_waiting_to_be_awarded_def = redisClient.hgetAsync(redisHelpers.getWaitingToReceiveExtraLifeKey(`${sender_object.screen_name.toLowerCase()}`), `${sender_object.screen_name.toLowerCase()}`);
      console.log(`has_extra_life_waiting_to_be_awarded_def`, redisHelpers.getWaitingToReceiveExtraLifeKey(`${receiver_object.screen_name.toLowerCase()}`), `${sender_object.screen_name.toLowerCase()}`);
      
      var iq_score_def = redisClient.hgetAsync(redisHelpers.getIQStatsKey(), sender_object.screen_name.toLowerCase());
      
      var welcome_message_id_found;
      if (!direct_message_entry.initiated_via) {
        welcome_message_id_found = 0;
      } else {
        welcome_message_id_found = direct_message_entry.initiated_via.welcome_message_id;
      }

      var get_answer_status_key_def = redisClient.getAsync(redisHelpers.getAnswerStatusKey(sender_object.id));

      join(quiz_def, extra_lives_def, iq_score_def, user_bot_status_def, has_used_extra_life_for_quiz_def, has_extra_life_waiting_to_be_awarded_def, get_answer_status_key_def,(whole_question_object, extra_life_redis_value, score, bot_state_status, has_used_extra_life_for_quiz, has_extra_life_waiting_to_be_awarded_value, get_answer_status_value) => {

        

        if (!welcome_message_id_found) {
          console.log(`get_answer_status_value Not Welcome Message ID Found in Payload, using ${get_answer_status_value} instead`);
          welcome_message_id_found = get_answer_status_value;
        }

        let extra_life_status = parseInt(extra_life_redis_value || `0`);
        let iq_score_object = JSON.parse(score || '{}');

        console.log(`has_used_extra_life_for_quiz ===> ${has_used_extra_life_for_quiz}`);
        has_used_extra_life_for_quiz = has_used_extra_life_for_quiz || 0;


        has_used_extra_life_for_quiz = has_used_extra_life_for_quiz == "1" ? true : false; //translate to a boolean
        console.log(`has_used_extra_life_for_quiz ==> ${has_used_extra_life_for_quiz}`);

        if (has_used_extra_life_for_quiz) {
          extra_life_status = "0";
        }
        
        let user_iq_score = iq_score_object.percentile || 0;
        let original_message_text = direct_message_entry.message_create.message_data.text;
        let dm_url = direct_message_entry.message_create.message_data.entities.urls[0];
        let message_text_urls_removed;
        
        message_text_urls_removed = _.chain(original_message_text).replace('A. ', '').replace('B. ', '').replace('C. ', '').replace('D. ', '').trim().value();

        if (dm_url) {
          message_text_urls_removed = _.chain(message_text_urls_removed).replace(dm_url.url, '').trim().value();
        } else {
          message_text_urls_removed = message_text_urls_removed;
        }
        console.log("message_text_urls_removed ==>  ", message_text_urls_removed);

        let is_not_bot_entry = _.intersection([message_text_urls_removed.trim().toLowerCase()], ['iq score', 'faq', 'get an extra life', '#protips', 'get an extra life', 'tell me some #protips', 'submit feedback', 'get my iq score and game stats', 'get your iq score and game stats', '💰 Paypal', '📧 Contact', '🧠 FAQs', '⏰ Reminders', '😎 Extra Lives', '🤟 Redeem', '📈 Stats']).length == 0;

        let quick_reply_response_object = direct_message_entry.message_create.message_data.quick_reply_response;

        if (!quick_reply_response_object && ['A','B','C','D'].includes(message_text_urls_removed.trim().toUpperCase()) === false) {is_not_bot_entry = false;}

        if (whole_question_object) {
          whole_question_object = JSON.parse(whole_question_object);
          
          let quiz_id = whole_question_object.quiz_id;
          
          let master_question_object = whole_question_object.quiz;
          let user_was_warned_about_type = false;
          
          console.log("Answer Sent Time", answer_sent_time);

          let question_matched = questionHelpers.determineQuestionAnsweredByWelcomeID(welcome_message_id_found, master_question_object);

          if (question_matched && has_extra_life_waiting_to_be_awarded_value) {
            var user_who_had_code_redeemed = _.split(has_extra_life_waiting_to_be_awarded_value, '@@@')[0];
            var user_who_had_code_redeemed_id = _.split(has_extra_life_waiting_to_be_awarded_value, '@@@')[1];

            redisClient.hincrby(redisHelpers.getExtraLifeHashKey(receiver_object.screen_name.toLowerCase()), user_who_had_code_redeemed.toLowerCase(), 1, redis.print);
            redisClient.hset(redisHelpers.getWaitingToReceiveExtraLifeKey(`${sender_object.screen_name.toLowerCase()}`), `${sender_object.screen_name.toLowerCase()}`, '');
            var redeemer_name = sender_object.screen_name;
            
            // this.__sendDMToUser(user_who_had_code_redeemed_id, receiver_object.screen_name, `@${redeemer_name} just redeemed your invite -- you just got an extra life! Go and invite more!`, false, '', false);
            
            // _.each(people_to_award_to, (handle) => {
            //   console.log(`!!!! Giving Extra Life to ${handle} !!!!`);
            //   redisClient.hincrby(redisHelpers.getExtraLifeHashKey(receiver_object.screen_name.toLowerCase()), handle.toLowerCase(), 1, redis.print);
            //   redisClient.hset(redisHelpers.getWaitingToReceiveExtraLifeKey(`${sender_object.screen_name.toLowerCase()}`), `${sender_object.screen_name.toLowerCase()}`, '');
            // });
            var payload = {
              created_at: moment().utc().format(),
              code_redeemed: user_who_had_code_redeemed,
              code_redeemed_account_id: user_who_had_code_redeemed_id,
              redeemer: sender_object.screen_name,
              redeemer_id: sender_object.id
            }
            sidekiqConnection.enqueue(
              'Chirpify::Workers::GenericLoggerWorker', ['extra_life_redeemed_events', JSON.stringify(payload)], {
                queue: 'default'
              }
            );
          }

          // if (!question_matched) {
          //   question_matched = questionHelpers.determineQuestionAnswered(answer_sent_time, master_question_object);
          //   if (question_matched) {
          //     question_matched.current = '1';
          //     question_matched.special_late_case = '1';
          //   }
          // }
          
          let answered_on_time = question_matched && is_not_bot_entry && question_matched.current == '1';
          let answered_late_and_not_bot_entry = question_matched && is_not_bot_entry &&  question_matched.current == '0';

          let answered_late_but_its_ok = answered_late_and_not_bot_entry && extra_life_status == "1";
          if (answered_late_and_not_bot_entry || answered_on_time) { direct_message_entry.quiz_id = quiz_id;}

          if (answered_on_time || answered_late_but_its_ok) {
            let answer_matched_array = _.intersection(question_matched.answers, [message_text_urls_removed]);

            console.log("Answer Matched Array", answer_matched_array, message_text_urls_removed);

            direct_message_entry.question_number = question_matched.question_number;
            
            let was_correct = answer_matched_array.length > 0;

            // if (answered_late_but_its_ok) {was_correct = false;}
            
            direct_message_entry.correct = was_correct ? "1" : "0";
            var extra_life_used = false;

            if (!was_correct && extra_life_status >= 1) {
              // user has an extra live so mark it was correct
              direct_message_entry.correct = "1";
              direct_message_entry.extra_life_used = "1";
              if (extra_life_status != 0) {
                redisClient.hincrby(redisHelpers.getExtraLifeHashKey(receiver_object.screen_name.toLowerCase()), sender_object.screen_name.toLowerCase(), -1, redis.print);
              }
              was_correct = false; //make rest of app behave like the user was right
              extra_life_used = true;
              redisClient.hset(redisHelpers.currentExtraLivesUsedKey(`${receiver_object.screen_name.toLowerCase()}`), `${sender_object.screen_name.toLowerCase()}`, '1');
            }

            direct_message_entry.late = answered_late_but_its_ok ? '1' : '0';

            direct_message_entry.answer_value = ['A','B','C','D'][_.indexOf(question_matched.all_answers, message_text_urls_removed)];
            
            if (!direct_message_entry.answer_value && ['A', 'B', 'C', 'D'].includes(message_text_urls_removed.trim().toUpperCase()) === true) {
              direct_message_entry.answer_value = message_text_urls_removed.trim().toUpperCase();
            }

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

            if (reply_answer_status_to_user) {
              // var message_to_user = was_correct ? questionHelpers.getRightAnswerResponse(question_matched.question_number + 1) : questionHelpers.getWrongAnswerResponse(question_matched.question_number + 1);
              var message_to_user = questionHelpers.getWeGotItResponse(question_matched.question_number + 1);
              if (extra_life_used) {message_to_user = `You got it wrong, but are saved by your extra life. Play on!`;}
              // if (answered_late_but_its_ok) {message_to_user = `Sorry you're too late to answer Q${question_matched.question_number + 1}. You're saved by your extra life though, so play on!`;}
              if (answered_late_but_its_ok) {message_to_user = questionHelpers.getYourAreLateResponse(question_matched.question_number + 1);}
              
              var message_value_type = was_correct ? "correct" : "wrong";
              var responded_status_key = redisClient.hgetAsync(redisHelpers.getRespondedAnswerKey(receiver_object.screen_name, question_matched.question_number), sender_object.screen_name);
              var responded_status_key_by_answer_value = redisClient.hgetAsync(redisHelpers.getRespondedByStatusKey(receiver_object.screen_name, message_value_type), sender_object.screen_name);

              join(responded_status_key, responded_status_key_by_answer_value).then((values) => {
                var already_responded_value = values[0];
                var responded_status_value = values[1];
                console.log('Status Value! ==> ', already_responded_value, responded_status_value, arguments);
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
                  message_to_user = `${message_to_user}`;
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
            console.log('was not a legit answer', message_text_urls_removed);
            direct_message_entry.correct = "0";
            direct_message_entry.late = "1";
            if (process.env.LOG_LATE_POSTS == '1') {
              this.__logDirectMessageEvent(users_array, direct_message_entry, messages);
           }
           if (message_text_urls_removed.toUpperCase()  == '🧠 FAQS' || message_text_urls_removed.toUpperCase() == 'FAQ' || message_text_urls_removed.toUpperCase() == 'SHOW ME SOME FAQS') {
             this.__sendFAQLink(sender_id, receiver_object.screen_name);
           
           } else if (message_text_urls_removed.toUpperCase() == '📈 STATS'|| message_text_urls_removed.toUpperCase() == 'IQ SCORE' || message_text_urls_removed.toUpperCase() == 'IQ' || message_text_urls_removed.toUpperCase() == 'GET MY IQ SCORE AND GAME STATS' || message_text_urls_removed.toUpperCase() == 'GET YOUR IQ SCORE AND GAME STATS') {
             console.log("User IQ Score", user_iq_score);
             console.log(iq_score_object);
             this.__sendUserIQScore(sender_id, sender_object.screen_name, receiver_object.screen_name, user_iq_score);
           
           } else if (message_text_urls_removed.toUpperCase() == 'RANDOMTEST') {
             this.__sendDMToUser(sender_id, receiver_object.screen_name, `some basic message`, false);
           
           } else if (message_text_urls_removed.toUpperCase() == '📧 CONTACT' || message_text_urls_removed.toUpperCase() == 'SUBMIT FEEDBACK') {
             this.__sendDMToUser(sender_id, receiver_object.screen_name, `We appreciate constructive feedback! Let us know your thoughts here feedback@iqtrivia.live`, false, '', true);
           
           } else if (message_text_urls_removed.toUpperCase() === '#PROTIPS' || message_text_urls_removed.toUpperCase() === 'TELL ME SOME #PROTIPS') {
             this.__sendDMToUser(sender_id, receiver_object.screen_name, `#Protips: Best way to play is using the Twitter app on your phone.\n\nTurn notifications on for our account.\nIf you miss a notification be ready to manually refresh our feed for questions.\n\nHere’s how to turn on notifications.. https://cdn-images-1.medium.com/max/800/1*mzIh1uTgmErcDz8bg0XtWg.gif`, false, '', true);
           
           } else if (message_text_urls_removed.toUpperCase() == '😎 EXTRA LIVES OLD' || message_text_urls_removed.toUpperCase() === 'GET AN EXTRA LIFE OLD' || message_text_urls_removed.toUpperCase() === 'EXTRA OLD' || message_text_urls_removed.toUpperCase() === 'EXTRA LIFE OLD') {
             
             var link_with_time_to_spare = "https://twitter.com/intent/tweet?url=https%3A%2F%2Fpic.twitter.com/ElXxlKGyJA&text=Come%20play%20@IQtrivia%20with%20me%21%20It%27s%20a%20trivia%20game%20played%20for%20cash%20money%20right%20here%20on%20Twitter.%20%23Trivia%20%23IQtrivia";
             var right_before_game_link = "https://twitter.com/intent/tweet?url=https%3A%2F%2Fpic.twitter.com/WxrK5fQyLb&text=Come%20play%20%40IQtrivia%20with%20me%20and%20win%20%F0%9F%92%B0.%20The%20game%20is%20starting%20right%20now%21%20%23Trivia%20%23IQtrivia";
             
             this.__sendDMToUser(sender_id, receiver_object.screen_name, `To get an extra life all you need to do is share the game here. ${link_with_time_to_spare}`, false, "", true);
           } else if (message_text_urls_removed.toUpperCase() == '😎 EXTRA LIVES' || message_text_urls_removed.toUpperCase() === 'GET AN EXTRA LIFE' || message_text_urls_removed.toUpperCase() === 'EXTRA' || message_text_urls_removed.toUpperCase() === 'EXTRA LIFE') {
             var redemption_code = sender_object.screen_name;
             if (!extra_life_redis_value) {extra_life_redis_value = "0";}
             var code_link = `https://twitter.com/intent/tweet?url=https%3A%2F%2Fmedium.com%2Fiqtrivia%2Fextra-extra-301199b2b27b&text=Come%20play%20%40IQtrivia%20with%20me%21%20Use%20my%20code%20%27${redemption_code}%27%20and%20you%27ll%20get%20an%20extra%20life!%20%23Trivia%20%23IQtrivia`;
             this.__sendDMToUser(sender_id, receiver_object.screen_name, `To get an extra life just tell your friends to come play and enter your code: '${redemption_code}'. When a friend redeems your invite, and answers their first question, you'll get an extra life. Your friend will also get an extra life too! You can get as many extra lives as you want, and you can use one per game. You currently have ${extra_life_redis_value} extra lives.\n\nShare your code to get extra lives: ${code_link}`, false, '', true);
           } else if (message_text_urls_removed.toUpperCase() == '🤟 REDEEM' || message_text_urls_removed.toUpperCase() === 'REDEEM AN INVITE FOR AN EXTRA LIFE') {
             redisClient.set(redisHelpers.getUserBotStateKey(sender_object.screen_name), 'entering_free_life_code', 'EX', 60 * 1);
             this.__sendDMToUser(sender_id, receiver_object.screen_name, `I see you were invited by a friend! What was their code?`, false, '', false);
           } else if (message_text_urls_removed.toUpperCase() == '💰 PAYPAL' || message_text_urls_removed.toUpperCase() === 'STORE MY PAYPAL EMAIL TO GET PAID') {
             redisClient.set(redisHelpers.getUserBotStateKey(sender_object.screen_name), 'entering_paypal_email', 'EX', 60 * 1);
             this.__sendDMToUser(sender_id, receiver_object.screen_name, `What’s your PayPal email address? We’ll store it so when you win we can get you paid real quick!`, false, "", false);
           } else if (message_text_urls_removed.toUpperCase() == '⏰ REMINDERS' || message_text_urls_removed.toUpperCase() === 'REMIND ME WHEN THE NEXT GAME STARTS') {
             redisClient.set(redisHelpers.getUserBotStateKey(sender_object.screen_name), 'entering_phone_number', 'EX', 60 * 5);
             this.__sendDMToUser(sender_id, receiver_object.screen_name, `Just reply with your full phone number and we’ll text you when the game is about to start. Don’t worry, we only text you once on game days, and you can unsubscribe any time.\n\nU.S. example: 503.555.5656\n\nNon U.S. example: +44 20 7234 3456 (include your country code)`, false, '', false);
           }
           else if (_.intersection(["👍 i'm in", "ready"], message_text_urls_removed.toLowerCase()).length >= 1) {
          //  else if (_.some(valid_opt_in_message, (current) => {return current.toLowerCase().indexOf(message_text_urls_removed.toLowerCase()) > -1 || message_text_urls_removed.toLowerCase().indexOf(current.toLowerCase()) > -1 })) {
            console.log(`SENT READY MESSAGE ${message_text_urls_removed} ${valid_opt_in_message}`);
            this.__processUserHasOptedInEvent(sender_object, receiver_object);
           }
           else if (is_not_bot_entry && message_text_urls_removed.toLowerCase() === 'i\'m done') {
             this.__sendDMToUser(sender_id, receiver_object.screen_name, `Redirecting you back to the main menu 😎`, false, '', true);
           }
           else if (bot_state_status == 'entering_phone_number') {
             this.__parseUserNumber(sender_object, receiver_object, message_text_urls_removed);
           }
           else if (bot_state_status == 'entering_free_life_code') {
             this.__parseFreeLifeCode(sender_object, receiver_object, message_text_urls_removed);
           }
           else if (bot_state_status == 'entering_paypal_email') {
             this.__validatePaypalEmailAddress(sender_object, receiver_object, message_text_urls_removed);
           }
           else if (is_not_bot_entry && (question_matched && question_matched.current == '0')) {
              this.__sendDMToUser(sender_id, receiver_object.screen_name, `Sorry, you answered too late! You can't win cash, but you should keep playing to improve your IQ score, which is currently ${user_iq_score}.`, true, `late`);
           } else if (!user_was_warned_about_type) {
             this.__standardBotMenuResponse(recipient_id, sender_id, receiver_object.screen_name);
           }
          }
        }
      });
    });
  }

  __processUserHasOptedInEvent(sender_object, receiver_object) {
    console.log(`${sender_object.screen_name} (${sender_object.id}) has opted in!`);
    var sender_handle = sender_object.screen_name.toLowerCase();
    redisClient.hset(redisHelpers.getPlayerListKey(receiver_object.screen_name), sender_object.id.toLowerCase(), '1');
    var extra_lives_def = redisClient.hgetAsync(redisHelpers.getExtraLifeHashKey('notused'), sender_handle);
    var get_stats_object_def = redisClient.hgetAsync(redisHelpers.getIQStatsKey(), sender_handle);
    var get_player_count_def = redisClient.hlenAsync(redisHelpers.getPlayerListKey(receiver_object.screen_name.toLowerCase()));
    console.log(redisHelpers.getPlayerListKey(receiver_object.screen_name.toLowerCase()));

    join(get_stats_object_def, extra_lives_def, get_player_count_def).then((stats_object) => {
      var extra_life_count = stats_object[1];
      var player_count = stats_object[2];
      stats_object = JSON.parse(stats_object[0]);
      console.log(stats_object);
      console.log(extra_life_count);
      console.log(player_count);
      var message = `
        Welcome @${sender_object.screen_name}, this is your ${thize(stats_object.quizzes_count + 1)} game! You're the ${thize(player_count)} in. Your IQ Score is ${stats_object.percentile} and you've got ${extra_life_count} extra lives. We will be firing up the Questionator soon and you'll receive the first question here in your DMs!
      `;
      if (stats_object.quizzes_count == 0) {
        message = `
          Welcome ${sender_object.screen_name}, we’re glad you decided to play your first game! You’re the ${thize(player_count)} player in.
          We will be firing up the Questionator soon and you 'll receive the first question here in your DMs
        `;
      }
      this.__sendDMToUser(sender_object.id, receiver_object.screen_name.toLowerCase(), message, false, 'noop', false);
    });
  }
  
  __sendFAQLink(sender_id, bot_owner_name) {
    this.__sendDMToUser(sender_id, bot_owner_name, `Go here for frequently asked questions. Where we answer your questions for a change… https://medium.com/iqtrivia/faq-ff29c1d9b06b`, false, 'noop', true);
  }

  __validatePaypalEmailAddress(sender_object, receiver_object, email_address) {
    console.log(`Validating ${email_address}`);
    var is_email_address = Isemail.validate(email_address);
    if (is_email_address) {
      this.__sendDMToUser(sender_object.id, receiver_object.screen_name, `Thanks, I got it!`, false, "", true);
      sidekiqConnection.enqueue(
        'Chirpify::Workers::ProcessUserUpdateWorker', [{
          sender_object: sender_object,
          paypal_email: email_address
        }], {
          queue: 'default'
        }
      );
    } else {
      this.__sendDMToUser(sender_object.id, receiver_object.screen_name, `Sorry, that doesn't look like a valid email address. Try again or press the I'm done button.`, false, "", "done_with_this_state");
      redisClient.set(redisHelpers.getUserBotStateKey(sender_object.screen_name), "entering_paypal_email", "EX", 60 * 1);
    }
  }

  __parseFreeLifeCode(sender_object, receiver_object, code_submitted) {
    console.log(`Code SUBMITTED ==> ${code_submitted}`);
    var is_valid_code_def = redisClient.hgetAsync(redisHelpers.getMasterUserList(receiver_object.screen_name), code_submitted.toLowerCase());
    var has_redeemed_code_already_def = redisClient.hgetAsync(redisHelpers.getHasRedeemedFreeLifeCodeKey(receiver_object.screen_name), sender_object.screen_name.toLowerCase());
    var sender_id = sender_object.id;
    
    join(is_valid_code_def, has_redeemed_code_already_def, (is_valid_code_value, has_redeemed_code_already_value) => {
      console.log(`is_valid_code_value --> ${is_valid_code_value}`);
      console.log(`has_redeemed_code_already_value --> ${has_redeemed_code_already_value}`);
      if (code_submitted.toLowerCase() == sender_object.screen_name.toLowerCase()) {
        this.__sendDMToUser(sender_id, receiver_object.screen_name, `Nice try, you can't redeem your own code. 💩`, false, '', true);
        redisClient.set(redisHelpers.getUserBotStateKey(sender_object.screen_name), 'default', 'EX', 86400);
      }
      else if (is_valid_code_value && (has_redeemed_code_already_value == "0" || !has_redeemed_code_already_value)) {
        var code_value = `${code_submitted.toLowerCase()}@@@${is_valid_code_value}`; //@ can't be in twitter usernames
        console.log(`CODE VALUE ${code_value}`);
        redisClient.hincrby(redisHelpers.getExtraLifeHashKey(receiver_object.screen_name.toLowerCase()), sender_object.screen_name.toLowerCase(), 1, redis.print);
        redisClient.hset(redisHelpers.getWaitingToReceiveExtraLifeKey(sender_object.screen_name), sender_object.screen_name.toLowerCase(), code_value);
        redisClient.hset(redisHelpers.getHasRedeemedFreeLifeCodeKey(receiver_object.screen_name), sender_object.screen_name.toLowerCase(), `1`);
        redisClient.set(redisHelpers.getUserBotStateKey(sender_object.screen_name), 'default', 'EX', 86400);
        this.__sendDMToUser(sender_id, receiver_object.screen_name, `Thanks! You now have an extra life!`, false, '', true);
        var redeemer_name = sender_object.screen_name;
        this.__sendDMToUser(is_valid_code_value, receiver_object.screen_name, `@${redeemer_name} just redeemed your code! You’ll get your extra life when they answer their first question. Want more lives? Invite more friends!`, false, '', false);

      } else if (has_redeemed_code_already_value == "1") {
        this.__sendDMToUser(sender_id, receiver_object.screen_name, `Oops! It looks like you already redeemed your invite. To get more extra lives invite some friends of your own!`, false, '', true);
        redisClient.set(redisHelpers.getUserBotStateKey(sender_object.screen_name), 'default', 'EX', 86400);
      } else if (is_valid_code_value == "0" || !is_valid_code_value) {
        this.__sendDMToUser(sender_id, receiver_object.screen_name, `Sorry, it looks like that’s an invalid code. Tell me again what your friend’s code is?`, false, '', 'done_with_this_state');
        redisClient.set(redisHelpers.getUserBotStateKey(sender_object.screen_name), 'entering_free_life_code', 'EX', 60 * 1);
      }
    });
  }

  __parseUserNumber(sender_object, receiver_object, phone_number_submitted) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_ACCOUNT_AUTH_TOKEN;
    const client = require('twilio')(accountSid, authToken);

    client.lookups.phoneNumbers(phone_number_submitted)
      .fetch({
      })
      .then((phone_number_object) => {
        console.log(`phone_number.callerName: ${JSON.stringify(phone_number_object)}`);
        var code_found = true;
        if (code_found) {
          redisClient.set(redisHelpers.getUserBotStateKey(sender_object.screen_name), 'default', 'EX', 86400);
          sidekiqConnection.enqueue(
            'Chirpify::Workers::ProcessSMSSubEvent', [{
              sender_object: sender_object,
              phone_number: phone_number_object.phoneNumber,
              raw_phone_number: phone_number_submitted,
              country_code: phone_number_object.countryCode
            }], {
              queue: 'default'
            }
          );
          this.__sendDMToUser(sender_object.id, receiver_object.screen_name, `Thanks! We sent you a text message. If you didn’t receive it tap below to try again.`, false, '', true);
          smsHelpers.sendInitialSMSMessage(phone_number_object.phoneNumber);
        } else {
          this.__sendDMToUser(sender_object.id, receiver_object.screen_name, `Invalid phone number. Please try again.`, false, '', true);
        }
      })
      .catch((e) => {
        console.log(`Twilio Error Occurred ==>`, e);
        this.__sendDMToUser(sender_object.id, receiver_object.screen_name, `Invalid phone number. Please try again.`, false, '', true);
      })
      .done(()=>{console.log(`done!!`);});
  }

  __sendUserIQScore(sender_id, sender_handle, bot_owner_name, user_iq_score) {
    console.log(`Looking up IQ score for ${sender_handle}`);
    var extra_lives_def = redisClient.hgetAsync(redisHelpers.getExtraLifeHashKey('notused'), sender_handle.toLowerCase());
    var get_stats_object_def = redisClient.hgetAsync(redisHelpers.getIQStatsKey(), sender_handle.toLowerCase());
    join(get_stats_object_def, extra_lives_def).then((stats_object) => {
      console.log(`stats_object ${stats_object}`);
      var extra_lives_count = stats_object[1];
      console.log(`extra_lives_count ${extra_lives_count}`);
      if (!extra_lives_count) {extra_lives_count = "0";}
      var extra_life_prompt = " extra lives";
      if (extra_lives_count == "0") {extra_lives_count = ''; extra_life_prompt = "no extra lives";}
      
      if (!stats_object[0]) {
        this.__sendDMToUser(sender_id, bot_owner_name, `Your IQ score isn't available until you've played your first game.\n\nCome play weekdays at 12:30 PDT!\n\nYou currently have ${extra_lives_count}${extra_life_prompt}.`, false, '', true);
      } else {
        console.log(typeof stats_object, stats_object);
        stats_object = JSON.parse(stats_object[0]);
        console.log(typeof stats_object, stats_object);
        // stats_object = JSON.parse(stats_object);
        var percentile  = stats_object.percentile;
        var right_count = stats_object.right_answer_count;
        var wrong_count = stats_object.wrong_answer_count;
        var quizzes_count = stats_object.quizzes_count;
        var rank = thize(stats_object.leaderboard_rank);
        if (percentile == 0) {
          this.__sendDMToUser(sender_id, bot_owner_name, `Sorry but your IQ score is currently 0. Play more quizzes to increase your score!\nYou currently have ${extra_lives_count}${extra_life_prompt}.`, false);
        } else {
          var dynamic_intent = `https://twitter.com/intent/tweet?url=https%3A%2F%2Fpic.twitter.com/hUKXWZjFxs&text=My%20%40IQtrivia%20IQ%20score%20is%20${percentile}.%0AI%27ve%20played%20${quizzes_count}%20games.%0A${right_count}%20questions%20right%20and%20${wrong_count}%20wrong.%0AI%27m%20in%20${rank}%20place%20overall%21%0A`;
          this.__sendIQDMToUser(sender_id, bot_owner_name, `Your IQ score is ${percentile}.\nYou have ${extra_lives_count}${extra_life_prompt}.\nYou've played ${quizzes_count} games.\n${right_count} questions right.\n${wrong_count} questions wrong.\nYou are in ${rank} place!\n\nBrag about your stats here ${dynamic_intent}`, user_iq_score);
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

    var media_id_to_send = questionHelpers.getAppropriateMediaAssetForIQScore(iq_score_configuration[bot_owner_name.toLowerCase()], (parseInt(user_iq_score) - 1));

    if (media_id_to_send) {
      dm_payload.event.message_create.message_data.attachment = {
        type: `media`,
        media: {
          id: media_id_to_send
        }
      };
    }

    dm_payload.event.message_create.message_data.quick_reply = {
      type: 'options',
      options: this.__getStandardBotMenuOptionsObject(recipient_id)
    };

    console.log("media id to send", media_id_to_send, parseInt(user_iq_score));
    this.__getTwitterClientForHandle(bot_owner_name).post('direct_messages/events/new', dm_payload, (response) => {
      console.log("DM RESPONSE", response);
      this.__logErrorEvent(recipient_id, response);
    });
  }

  __sendDMToUser(recipient_id, bot_owner_name, message_text, send_image = true, image_type = 'correct', bot_menu_type = false) {
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
      var media_id_to_send = questionHelpers.getAppropriateMediaAsset(app_configuration[bot_owner_name.toLowerCase()], image_type);
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
        options: this.__getStandardBotMenuOptionsObject(recipient_id)
      };
    }
    if (bot_menu_type === 'done_with_phone_number_bot_menu') {
      dm_payload.event.message_create.message_data.quick_reply = {
        type: 'options',
        options: this.__getStandardBotMenuOptionsObject(recipient_id)
      };
    }
    if (bot_menu_type == 'done_with_this_state') {
        dm_payload.event.message_create.message_data.quick_reply = {
          type: 'options',
          options: this.__getDoneWithStateOptionsObject(recipient_id)
        };
    }
    console.log("DM PAYLOAD", dm_payload);
    this.__getTwitterClientForHandle(bot_owner_name).post('direct_messages/events/new', dm_payload, (response) => {
      console.log("DM RESPONSE", response);
      this.__logErrorEvent(recipient_id, response);
    });
  }

  __logErrorEvent(recipient_id, error_object) {
    if (!error_object || !error_object.message) {return;}
    let payload = { receiving_account: recipient_id, full_object: JSON.stringify(error_object, null, "\t"), error_text: error_object["message"] };
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
        time_received: moment().utc().format(),
        full_object: JSON.stringify(original_object, null, '\t'),
        acting_account: action_account_name,
        acting_account_id: sender_id,
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
      if (payload['late'] == '1' && direct_message_entry['correct'] != '1') {
        table_to_log_to = 'direct_message_events_late'
      }
      sidekiqConnection.enqueue(
        'Chirpify::Workers::GenericLoggerWorker', [table_to_log_to, JSON.stringify(payload)], {
          queue: 'default'
        }
      );
  }

  __standardBotMenuResponse(recipient_id, sender_id, bot_owner_name) {
    var standard_message_text = "What can I do for Q?\nChoose an option below👇";
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
      options: this.__getStandardBotMenuOptionsObject(sender_id)
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

  __getDoneWithStateOptionsObject(acting_handle_id = 'whocares') {
    var options = [
      {
        label: "I'm done",
        meta_data: "done"
      }
    ];
    return options;
  }

  async __getStandardBotMenuOptionsObject(acting_handle_id = 'whocares') {
        var options = [
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
          label: "⏰ Reminders",
          description: 'Remind me when the next game starts',
          meta_data: "Notifications!"
        },
        {
          label: "💰 Paypal",
          description: 'Store my PayPal email to get paid',
          meta_data: "paypal_email_menu_item"
        },
        {
          label: '🧠 FAQs',
          description: 'Show me some FAQs',
          meta_data: 'Show me some FAQs'
        }, 
        {
          label: '📧 Contact',
          description: 'Submit Feedback',
          meta_data: 'Submit Feedback'
        },
      ];
      console.log("LATEST")
      if (['15588742', '19081905', '1375079370'].includes(acting_handle_id) || true) {
        var opt_in_to_quiz_item = {
          label: "👍 I'm in",
          description: "Let's play!",
          meta_data: "opt_into_quiz_item"
        };
        options.splice(0, 0, opt_in_to_quiz_item);
        async function myFunc() {
          console.log(`Options before ${options.length}`);
          const res = await redisClient.getAsync('test');
          console.log(`RES IS ${res}`)
          opt_in_to_quiz_item.description = res;
          console.log(opt_in_to_quiz_item)
          return options;
        }
        console.log(`OPTIONS ARE ${options.length}`);
        options = await myFunc();
        console.log(`OPTIONS ARE ${options.length}`);
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
          label: "Store my PayPal email to get paid",
          meta_data: "paypal_email_menu_item"
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
    console.log(`Message Type Received ==> ${message_type}`);
    if (message_type === 'favorite_events') {
      loggingHelpers.logFavoriteEvents(messages);
    } else if (message_type == 'direct_message_events') {
      this.__processDirectMessageEvent(messages);
    } else if (message_type == 'follow_events') {
      this.__processFollowEvent(messages);
    } else if (message_type == 'tweet_create_events') {
      this.__processTweetCreateEvent(messages);
      this.__logTweetCreateEvent(messages);
    } else if (message_type != 'direct_message_indicate_typing_events' && message_type != 'direct_message_mark_read_events') {
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
