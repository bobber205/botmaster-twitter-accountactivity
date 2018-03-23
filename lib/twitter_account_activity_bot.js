'use strict';

const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const request = require('request-promise');
const BaseBot = require('botmaster').BaseBot;
const debug = require('debug')('botmaster:messenger');
const securityHelpers = require('./helpers/security');

const redis = require('redis');

const redisClient = redis.createClient(process.env.REDIS_URL);

const Sidekiq = require('sidekiq');

const sidekiqConnection = new Sidekiq(redisClient);
console.log('sidekiqConnection', sidekiqConnection);

const _ = require('lodash');

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
   *   webhookEnpoint: 'someEndpoint'
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
    console.log('Create Mount Points Called', this.app);
    this.app.use(bodyParser.urlencoded({ extended: true }));
    this.app.use(bodyParser.json());

    this.app.get('*', (req, res) => {
      console.log('Get Query', req.query);
      if (req.query.crc_token) {
        this.__doCRCResponse(req, res);
      } else {
        // debugger;
        console.log('not doing CRC');
        res.status(200).send('In Bot');
      }
    });

    this.app.post('*', (req, res) => {
      console.log(req.body);
      // debugger;
      console.log(JSON.parse(JSON.stringify(req.body)));
      this.__logWebhookEvent(req.body);
      // const entries = req.body.entry;
      // this.__emitEvents(entries, req, res);
      res.sendStatus(200);
    });
  }

  __logWebhookEvent(messages) {
    const message_type = _.chain(messages).keys().first().value();
    console.log('Logging to debug log');
    const payload = {
      created_at: '',
      log_message: JSON.stringify(messages, null, '\t'),
      platform: 'twitter-webhook',
      misc: '',
      type: message_type,
    };
    sidekiqConnection.enqueue(
      'Chirpify::Workers::GenericLoggerWorker', ['debug_log', JSON.stringify(payload)], {
        queue: 'default',
      },
    );
  }

  __doCRCResponse(req, res) {
    const secret = process.env.CHRP_TWITTER_CONSUMER_SECRET;
    console.log(secret);
    const token = req.query.crc_token;
    const challenge_token = securityHelpers.get_challenge_response(token, secret);
    console.log(challenge_token);
    res.status(200).send({ response_token: `sha256=${challenge_token}` });
  }

  __emitEvents(messages, request, response) {
    const type = _.keys(message);
    debugger;
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
    const signature = req.headers['x-hub-signature'];
    const signatureHash = signature ? signature.split('=')[1] : undefined;
    const expectedHash = crypto.createHmac('sha1', this.credentials.fbAppSecret)
                        .update(buf)
                        .digest('hex');
    if (signatureHash !== expectedHash) {
      throw new Error('wrong signature');
    }
  }


    // __emitUpdatesFromEntries(entries) {
    //   for (const entry of entries) {
    //     const updates = cloneDeep(entry.messaging);

    //     for (const update of updates) {
    //       this.__setBotIdIfNotSet(update);
    //       update.raw = entry;
    //       this.__emitUpdate(update);
    //     }
    //   }

    // }
  /**
   * @ignore
   * see botmaster's BaseBot #getUserInfo
   *
   * @param {string} userId id of the user whose information is requested
   */
  // __getUserInfo(userId) {
  //   const options = {
  //     method: 'GET',
  //     uri: `${baseURL}/${userId}`,
  //     qs: { access_token: this.credentials.pageToken },
  //     json: true,
  //   };

  //   return request(options);
  // }

}

module.exports = TwitterAccountActivityBot;
