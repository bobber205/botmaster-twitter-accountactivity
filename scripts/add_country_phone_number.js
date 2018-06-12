const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_ACCOUNT_AUTH_TOKEN;

const client = require('twilio')(accountSid, authToken);

const sid = `MG5cdf85c3fe7b970ccd276ece9bba9d1f`;

const sender_phone_sid = `PN1150a94f14e7074bb3aa2b8fba4728ad`;


client.messaging.services(sid)
    .phoneNumbers
    .create({
        phoneNumberSid: 'PNda2c66298102b5225f9c69f61287a589'
    })
    .then(phone_number => console.log(phone_number.sid))
    .done();

