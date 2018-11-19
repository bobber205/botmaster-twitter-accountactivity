/*jslint node: true */
/*jshint strict:true */
/*jshint globalstrict: true*/
"use strict";
const crypto = require('crypto');

module.exports.logDirectMessageReadEvent = (twitter_account_name, twitter_account_id, amount_of_lives_to_purchase) => {
  console.log(`logDirectMessageReadEvent was called with ${arguments}`);
  const password = process.env.TWITTER_PARAMETER_CIPHER;
  const cipher = crypto.createCipher('aes192', password);
  var payload = {
      twitter_account_name: twitter_account_name,
      twitter_account_id: twitter_account_id,
      amount: amount_of_lives_to_purchase
  };
  let encrypted = cipher.update(JSON.stringify(payload), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  console.log(encrypted);
  return encrypted;
};