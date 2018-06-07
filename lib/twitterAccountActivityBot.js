"use_strict";

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


const Sidekiq = require('sidekiq');

const sidekiqConnection = new Sidekiq(redisClient);

const _ = require('lodash');

const Twit = require("twit");

let app_configuration = {};
let iq_score_configuration = {};

const valid_bot_handles = ['iqtrivia', 'sadtrebek', 'happytrebek', 'pumpedtrebek'];

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
  // redisClient.hgetallAsync(redisHelpers.getExtraLifeHashKey(process.env.BOT_HANDLE)).then((whole_hash) => {
  //   console.log("All of the extra life hash");
  //   console.log(whole_hash);
  // });
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
      this.__logTwilioEvents(req.body, req, res);
      res.sendStatus(200);
    });
  }

  __logFavoriteEvents(messages) {
    _.each(messages.favorite_events, entry => {
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

  __processFollowEvent(messages) {
    let events_array = messages.follow_events;
    _.each(events_array, entry => {
      let payload = { 
        created_at: moment().utc().format(), 
        full_object: JSON.stringify(messages, null, '\t'), 
        acting_account: entry.source.screen_name,
        receiving_account: entry.target.screen_name
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
      console.log(entry.entities);
      if (!entry.entities.hashtags) {return;}
      let hashtags = entry.entities.hashtags.map((c)=> {return c.text.toLowerCase();});
      let has_right_hashtags = hashtags.includes('iqtrivia') && hashtags.includes('trivia');
      let is_quiz_running = process.env.QUIZ_RUNNING == '1';
      if (!is_quiz_running && has_right_hashtags && !([`iqtrivia`, `sadtrebek`, `happytrebek`, `pumpedtrebek`].includes(entry.user.screen_name.toLowerCase()))) {
      // if (has_right_hashtags && ['bobber205', 'pumpedtrebek', `alextest_01`, `ChrisTeso`].includes(entry.user.screen_name)) {
        var payload = {
          status: `@${entry.user.screen_name} ${questionHelpers.getExtraLifeConfirmedResponse()}`,
          in_reply_to_status_id: entry.id_str
        };
        redisClient.hmset(redisHelpers.getExtraLifeHashKey('IQTrivia'.toLowerCase()), entry.user.screen_name.toLowerCase(), "1", redis.print);
        this.__getTwitterClientForHandle('iqtrivia').post('statuses/update', payload, (response) => {
          console.log("Posting response");
          console.log(response);
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
      let recipient_id = direct_message_entry['message_create']['target']['recipient_id'];
      let sender_id = direct_message_entry['message_create']['sender_id'];
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
      var iq_score_def = redisClient.hgetAsync(redisHelpers.getIQStatsKey(), sender_object.screen_name);
      
      var welcome_message_id_found;
      if (!direct_message_entry.initiated_via) {
        welcome_message_id_found = '0';
      } else {
        welcome_message_id_found = direct_message_entry.initiated_via.welcome_message_id;
      }

      join(quiz_def, extra_lives_def, iq_score_def, user_bot_status_def, (whole_question_object, hash_values, score, bot_status) => {
        console.log(`arguments.length ${arguments.length}`);
        // console.log(whole_question_object, hash_values, score, bot_status);
        // console.log(`whole_question_object ${whole_question_object}`)
        console.log(`hash_values ${hash_values}`)
        console.log(`score ${score}`)
        console.log(`bot_status ${bot_status}`);
        // console.log(`Extra Life Status for ${sender_object.screen_name}`, hash_values);
        // console.log(`>> Score <<`, score);

        let extra_life_status = hash_values;
        let iq_score_object = JSON.parse(score || '{}');


        let user_iq_score = iq_score_object.percentile || 0;
        let original_message_text = direct_message_entry.message_create.message_data.text;
        let dm_url = direct_message_entry.message_create.message_data.entities.urls[0];
        let message_text_urls_removed;

        if (dm_url) {
          message_text_urls_removed = _.chain(original_message_text).replace(dm_url.url, '').trim().value();
          console.log("message_text_urls_removed ==>  ", message_text_urls_removed);
        } else {
          message_text_urls_removed = original_message_text;
        }

        let is_not_bot_entry = _.intersection([message_text_urls_removed.trim().toLowerCase()], ['iq score', 'faq', 'get an extra life', '#protips', 'get an extra life', 'tell me some #protips', 'submit feedback', 'get your iq score and game stats']).length == 0;

        let quick_reply_response_object = direct_message_entry.message_create.message_data.quick_reply_response;

        if (!quick_reply_response_object) {is_not_bot_entry = false;}

        if (whole_question_object) {
          whole_question_object = JSON.parse(whole_question_object);
          
          let quiz_id = whole_question_object.quiz_id;
          
          let master_question_object = whole_question_object.quiz;
          
          console.log("Answer Sent Time", answer_sent_time);

          let question_matched = questionHelpers.determineQuestionAnsweredByWelcomeID(welcome_message_id_found, master_question_object);

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

            if (answered_late_but_its_ok) {was_correct = false;}
            
            direct_message_entry.correct = was_correct ? "1" : "0";
            var extra_life_used = false;

            if (!was_correct && extra_life_status == "1") {
              // user has an extra live so mark it was correct
              direct_message_entry.correct = "1";
              direct_message_entry.extra_life_used = "1";
              redisClient.hmset(redisHelpers.getExtraLifeHashKey(receiver_object.screen_name.toLowerCase()), sender_object.screen_name.toLowerCase(), "0", redis.print);
              was_correct = false; //make rest of app behave like the user was right
              extra_life_used = true;
            }

            direct_message_entry.late = answered_late_but_its_ok ? '1' : '0';

            direct_message_entry.answer_value = ['A','B','C','D'][_.indexOf(question_matched.all_answers, message_text_urls_removed)];

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
              var message_to_user = was_correct ? questionHelpers.getRightAnswerResponse(question_matched.question_number + 1) : questionHelpers.getWrongAnswerResponse(question_matched.question_number + 1);
              if (extra_life_used) {message_to_user = `You got it wrong, but are saved by your extra life. Play on!`;}
              if (answered_late_but_its_ok) {message_to_user = `Sorry you're too late to answer Q${question_matched.question_number + 1}. You're saved by your extra life though, so play on!`;}
              
              var message_value_type = was_correct ? "correct" : "wrong";
              var responded_status_key = redisClient.hgetAsync(redisHelpers.getRespondedAnswerKey(receiver_object.screen_name, question_matched.question_number), sender_object.screen_name);
              var responded_status_key_by_answer_value = redisClient.hgetAsync(redisHelpers.getRespondedByStatusKey(receiver_object.screen_name, message_value_type), sender_object.screen_name);

              join(responded_status_key, responded_status_key_by_answer_value).then((values) => {
                var already_responded_value = values[0];
                var responded_status_value = values[1];
                console.log('Status Value! ==> ', already_responded_value, responded_status_value, arguments);
                if (is_not_bot_entry) {
                    if (Math.random() <= 0.80 && !extra_life_used) {
                      message_value_type = 'wait';
                      message_to_user = questionHelpers.getWaitAnswerResponse(question_matched.question_number + 1);
                    }
                    else if (responded_status_value != "1" && extra_life_used) {
                      message_to_user = `${message_to_user}`;
                    }
                    else if (responded_status_value != "1" && !was_correct) {
                      message_to_user = `${message_to_user} You can't win the prize, but you should keep playing to improve your IQ score, which is currently ${user_iq_score}.`;
                    } else if (responded_status_value != "1" && was_correct) {
                      message_to_user = `${message_to_user}`;
                    }
                } else {
                  this.__standardBotMenuResponse(recipient_id, sender_id, receiver_object.screen_name);
                }
                if (already_responded_value != "1" && is_not_bot_entry) {
                  message_to_user = `${message_to_user} ${questionHelpers.getAvatarPrompt(question_matched.question_number + 1)}`;
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
           if (message_text_urls_removed.toUpperCase() == 'FAQ' || message_text_urls_removed.toUpperCase() == 'SHOW ME SOME FAQS') {
             this.__sendFAQLink(sender_id, receiver_object.screen_name);
           
           } else if (message_text_urls_removed.toUpperCase() == 'IQ SCORE' || message_text_urls_removed.toUpperCase() == 'IQ' || message_text_urls_removed.toUpperCase() == 'GET YOUR IQ SCORE AND GAME STATS') {
             console.log("User IQ Score", user_iq_score);
             console.log(iq_score_object);
             this.__sendUserIQScore(sender_id, sender_object.screen_name, receiver_object.screen_name, user_iq_score);
           
           } else if (message_text_urls_removed.toUpperCase() == 'RANDOMTEST') {
             this.__sendDMToUser(sender_id, receiver_object.screen_name, `some basic message`, false);
           
           } else if (message_text_urls_removed.toUpperCase() == 'SUBMIT FEEDBACK') {
             this.__sendDMToUser(sender_id, receiver_object.screen_name, `We appreciate constructive feedback! Let us know your thoughts here feedback@iqtrivia.live`, false, '', true);
           
           } else if (message_text_urls_removed.toUpperCase() === '#PROTIPS' || message_text_urls_removed.toUpperCase() === 'TELL ME SOME #PROTIPS') {
             this.__sendDMToUser(sender_id, receiver_object.screen_name, `You can use any Twitter owned application to play, however we’ve found the best way to play is using Twitter’s mobile app and turning on tweet notifications for our account. That way you’ll catch every question without having to manually refresh your feed. Tap here to see how to turn on notifications. https://cdn-images-1.medium.com/max/800/1*mzIh1uTgmErcDz8bg0XtWg.gif`, false, '', true);
           
           } else if (message_text_urls_removed.toUpperCase() === 'GET AN EXTRA LIFE' || message_text_urls_removed.toUpperCase() === 'EXTRA' || message_text_urls_removed.toUpperCase() === 'EXTRA LIFE') {
             
             var link = "https://twitter.com/intent/tweet?url=https%3A%2F%2Fpic.twitter.com%2FoCaCam3Rhf&text=Come%20play%20@IQtrivia%20with%20me%21%20It%27s%20a%20trivia%20game%20played%20for%20cash%20money%20right%20here%20on%20Twitter.&hashtags=Trivia%2CIQtrivia";
             this.__sendDMToUser(sender_id, receiver_object.screen_name, `To get an extra life all you need to do is share the game here. ${link}`, false, '', true);
           } else if (message_text_urls_removed.toUpperCase() === 'NOTIFY ME WHEN THE NEXT GAME STARTS') {
             
             redisClient.set(redisHelpers.getUserBotStateKey(sender_object.screen_name), 'entering_phone_number', 'EX', 86400);
             this.__sendDMToUser(sender_id, receiver_object.screen_name, `Enter your USA based phone number`, false, '', false);
           }
           else if (is_not_bot_entry && (question_matched && question_matched.current == '0')) {
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
    this.__sendDMToUser(sender_id, bot_owner_name, `Go here for frequently asked questions. Where we answer your questions for a change… https://medium.com/iqtrivia/faq-ff29c1d9b06b`, false, 'noop', true);
  }

  __parseUserNumber(sender_object, receiver_object, phone_number_submitted) {

  }

  __sendUserIQScore(sender_id, sender_handle, bot_owner_name, user_iq_score) {
    console.log(`Looking up IQ score for ${sender_handle}`);
    redisClient.hgetAsync(redisHelpers.getIQStatsKey(), sender_handle).then((result) => {
      if (!result) {
        this.__sendDMToUser(sender_id, bot_owner_name, `Your IQ score isn't available until you've played your first game.\n\nCome play weekdays at 12:30 PST!`, false);
      } else {
        result = JSON.parse(result);
        var percentile  = result.percentile;
        // var total_count = result.total_question_count;
        var right_count = result.right_answer_count;
        var wrong_count = result.wrong_answer_count;
        var quizzes_count = result.quizzes_count;
        var rank = thize(result.leaderboard_rank);
        if (percentile == 0) {
          this.__sendDMToUser(sender_id, bot_owner_name, `Sorry but your IQ score is currently 0. Play more quizzes to increase your score!`, false);
        } else {
          var dynamic_intent = `https://twitter.com/intent/tweet?url=https%3A%2F%2Fpic.twitter.com/hUKXWZjFxs&text=My%20%40IQtrivia%20IQ%20score%20is%20${percentile}.%0AI%27ve%20played%20${quizzes_count}%20games.%0A${right_count}%20questions%20right%20and%20${wrong_count}%20wrong.%0AI%27m%20in%20${rank}%20place%20overall%21%0A`;
          this.__sendIQDMToUser(sender_id, bot_owner_name, `Your IQ score is ${percentile}.\nYou've played ${quizzes_count} games.\n${right_count} questions right.\n${wrong_count} questions wrong.\nYou are in ${rank} place!\n\nBrag about your stats here ${dynamic_intent}`, user_iq_score);
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

  __sendDMToUser(recipient_id, bot_owner_name, message_text, send_image = true, image_type = 'correct', send_bot_menu = false) {
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
    if (send_bot_menu) {
        dm_payload.event.message_create.message_data.quick_reply = {
          type: 'options',
          options: this.__getStandardBotMenuOptionsObject(recipient_id)
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

  __getStandardBotMenuOptionsObject(acting_handle_id = 'whocares') {
      var options = [
      {
        label: "Get your IQ score and game stats",
        meta_data: "IQ"
      },
      {
        label: 'Get an extra life',
        meta_data: 'ExtraLife'
      },
      {
        label: 'Tell me some #ProTips',
        meta_data: 'ProTips'
      },
      {
        label: 'Submit feedback',
        meta_data: 'Feedback'
      },
      {
        label: 'Show me some FAQs',
        meta_data: 'FAQ'
      }, 
    ];

      if (['15588742', '19081905'].includes(acting_handle_id)) {
        options.push({
          label: "Notify me when the next game starts",
          meta_data: "Notifications!"
        })
      }
      return options;
  }

  __processWebhookEvent(messages) {
    // console.log([messages["for_user_id"]], _.intersection([messages["for_user_id"]], ["136023366", "4749662233", "498326257", "415839284"]).length)
    // if (_.intersection([messages["for_user_id"]], ["136023366", "4749662233", "498326257", "415839284"]).length > 0) return;
    let message_type = _.chain(messages).keys().drop(1).first().value();
    console.log(`Message Type Received ==> ${message_type}`);
    if (message_type === 'favorite_events') {
      this.__logFavoriteEvents(messages);
    } else if (message_type == 'direct_message_events') {
      this.__processDirectMessageEvent(messages);
    } else if (message_type == 'follow_events') {
      this.__processFollowEvent(messages);
    } else if (message_type == 'tweet_create_events') {
      this.__logTweetCreateEvent(messages);
      this.__processTweetCreateEvent(messages);
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

  __logTwilioEvents(message) {
    var payload = {
      created_at: moment().utc().format(),
      sms_id: message.SmsSid,
      message_sent: "",
      message_status: message.MessageStatus,
      message_sid: message.MessageSid,
      acting_phone_number: message.From,
      receiving_phone_number: message.To,
      account_sid: message.AccountSid,
      messaging_service_sid: message.MessagingServiceSid
    };
    sidekiqConnection.enqueue(
      'Chirpify::Workers::GenericLoggerWorker', ['sms_events', JSON.stringify(payload)], {
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
