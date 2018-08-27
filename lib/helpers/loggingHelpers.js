/*jslint node: true */
/*jshint strict:true */
/*jshint globalstrict: true*/
"use strict";
const _ = require("lodash");
const Sidekiq = require('sidekiq');
const moment = require('moment');

const redis = require('redis');
const redisClient = redis.createClient(process.env.REDIS_URL);
const sidekiqConnection = new Sidekiq(redisClient);

module.exports.logDirectMessageReadEvent = (messages) => {
  console.log(`logging direct message event ${messages}`)
    "use strict";
    _.each(messages.direct_message_mark_read_events, entry => {
      let payload = {
        created_at: moment(parseInt(entry.created_timestamp)).utc().format(),
        received_at: moment().utc().format(),
        twitter_account_name: '',
        twitter_account_id: entry.sender_id,
        receiving_account_id: entry.target.recipient_id,
        dm_id: entry.last_read_event_id,
      };
      sidekiqConnection.enqueue(
        'Chirpify::Workers::GenericLoggerWorker', ['dm_read_events', JSON.stringify(payload)], {
          queue: 'default'
        }
      );
    });
};

module.exports.logFavoriteEvents = (messages) => {
    "use strict";
    _.each(messages.favorite_events, entry => {
      let payload = {
        created_at: moment().utc().format(),
        full_object: JSON.stringify(messages, null, '\t'),
        favorited_status: entry.favorited_status.id_str,
        acting_account: entry.user.screen_name,
        receiving_account: entry.favorited_status.user.screen_name
      };
      sidekiqConnection.enqueue(
        'Chirpify::Workers::GenericLoggerWorker', ['favorite_events', JSON.stringify(payload)], {
          queue: 'default'
        }
      );
    });
};

module.exports.logTwilioEvents = (message) => {
    "use strict";
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