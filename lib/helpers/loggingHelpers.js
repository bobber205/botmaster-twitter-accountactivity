/*jslint node: true */
/*jshint strict:true */
/*jshint globalstrict: true*/

const _ = require("lodash");
const Sidekiq = require('sidekiq');

const redis = require('redis');
const redisClient = redis.createClient(process.env.REDIS_URL);
const sidekiqConnection = new Sidekiq(redisClient);

module.exports.logFavoriteEvents = (messages) => {
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
