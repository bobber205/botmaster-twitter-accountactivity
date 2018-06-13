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

// const numbers = ['+15033296310', '+15415919824', '+15416367552', '+15038904139', '+18638995697', '+14257707852', '+17044730440', '+14253275541', '+14164711659', '+15084145369', '+14103225254', '+16502388277', '+16302721945', '+19127553543', '+15413316090', '+15039759610', '+15189288101', '+14104635441', '+18186672247', '+18082981108', '+17135170357', '+16466272115', '+15182904874', '+19732021804', '+18042453117', '+18155452302', '+18175253524', '+19186140553', '+14133516849', '+19125990320', '+17066006766', '+18034625489', '+13062910438', '+15415917405', '+971503866979', '+12246221522', '+19846644420', '+447375499325', '+12542652432', '+12052603214', '+12052425376', '+19379719815', '+12175978691', '+15035555656', '+12104103561'];

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
