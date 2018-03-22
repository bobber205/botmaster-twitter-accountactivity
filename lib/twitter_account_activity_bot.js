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
        audio: true,
        file: true,
        image: true,
        video: true,
        location: true,
        fallback: true,
      },
      echo: true,
      read: true,
      delivery: true,
      postback: true,
      quickReply: true,
    };

    this.sends = {
      text: true,
      quickReply: true,
      locationQuickReply: true,
      senderAction: {
        typingOn: true,
        typingOff: true,
        markSeen: true,
      },
      attachment: {
        audio: true,
        file: true,
        image: true,
        video: true,
      },
    };

    this.retrievesUserInfo = true;
    // this is the id that will be set after the first message is sent to
    // this bot.
    
    // this.id; //why was this here?

    this.__applySettings(settings);
    this.__createMountPoints(expressApp);
  }

  /**
   * @ignore
   * sets up the app. that will be mounetd onto a botmaster object
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

      if (req.body) {
        console.log('Logging to debug log');
        let payload = {
          created_at: '',
          log_message: JSON.stringify(req.body),
          platform: 'twitter-webhook',
          misc: '',
          type: _.keys(req.body)[0]
        }
        sidekiqConnection.enqueue(
          'Chirpify::Workers::GenericLoggerWorker',
          ['debug_log', payload],
          { queue: 'default' },
        );
      }
      // const entries = req.body.entry;
      // this.__emitUpdatesFromEntries(entries);
      res.sendStatus(200);
    });
  }


  __doCRCResponse(req, res) {
    const secret = process.env.CHRP_TWITTER_CONSUMER_SECRET;
    console.log(secret);
    const token = req.query.crc_token;
    const challenge_token = securityHelpers.get_challenge_response(token, secret);
    console.log(challenge_token);
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
    const signature = req.headers['x-hub-signature'];
    const signatureHash = signature ? signature.split('=')[1] : undefined;
    const expectedHash = crypto.createHmac('sha1', this.credentials.fbAppSecret)
                        .update(buf)
                        .digest('hex');
    if (signatureHash !== expectedHash) {
      throw new Error('wrong signature');
    }
  }
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
