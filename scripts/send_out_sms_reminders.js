const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_ACCOUNT_AUTH_TOKEN;

const client = require('twilio')(accountSid, authToken);

const sid = `MG5cdf85c3fe7b970ccd276ece9bba9d1f`;

const sender_phone_sid = `PN1150a94f14e7074bb3aa2b8fba4728ad`;

const compact = require("lodash").compact;
const sample = require("lodash").sample;
const chain = require("lodash").chain;

const readlines = require("readlines");
const sms_prompts = compact(readlines.readlinesSync("config/sms_remind_prompts.txt"));

console.log(`Read in ${sms_prompts.length} prompts`);


const numbers = ['+15033296310', '+15415919824'];

numbers.forEach((number) => {
    client.messages
        .create({
            body: sample(sms_prompts),
            messagingServiceSid: sid,
            to: number
        })
        .then(message => console.log(message.sid))
        .done();
})
