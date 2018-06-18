const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_ACCOUNT_AUTH_TOKEN;

const client = require('twilio')(accountSid, authToken);

const sid = `MG5cdf85c3fe7b970ccd276ece9bba9d1f`;

const sender_phone_sid = `PN1150a94f14e7074bb3aa2b8fba4728ad`;

var mysql_helper = require('../lib/helpers/mysql_helper');

const compact = require("lodash").compact;
const sample = require("lodash").sample;
const chain = require("lodash").chain;
const map = require("lodash").map;

const readlines = require("readlines");
const sms_prompts = compact(readlines.readlinesSync("config/sms_remind_prompts.txt"));

console.log(`Read in ${sms_prompts.length} prompts`);

mysql_helper.getDBConnection().then(function (conn) {
    var sql_statement = `SELECT distinct(phone_number) from sms_subscribers`;
    conn.query(sql_statement).then((res) => {
        var numbers = map(res, 'phone_number');
        console.log(`Read in ${numbers.length} phone numbers to send out a reminder to.`);
        // var numbers = ['+15033296310', '+15415919824'];
        numbers.forEach((number) => {
            client.messages
                .create({
                    body: sample(sms_prompts),
                    messagingServiceSid: sid,
                    to: number
                })
                .then(message => console.log(`Sent Message to ${number}`))
                .done();
        })
    });

});

// var numbers = ['+15033296310', '+15415919824'];
// numbers.forEach((number) => {
//     client.messages
//         .create({
//             body: sample(sms_prompts),
//             messagingServiceSid: sid,
//             to: number
//         })
//         .then(message => console.log(message.sid))
//         .done();
// })
