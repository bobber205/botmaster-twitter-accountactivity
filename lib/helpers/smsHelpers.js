const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_ACCOUNT_AUTH_TOKEN;

const client = require('twilio')(accountSid, authToken);

const sid = `MG5cdf85c3fe7b970ccd276ece9bba9d1f`;

const sender_phone_sid = `PN1150a94f14e7074bb3aa2b8fba4728ad`;

module.exports.sendInitialSMSMessage = (number) => {
  console.log(`Sending Initial SMS Message to ${number}`);
  client.messages
    .create({
      body: `Hi it’s IQ! We’ll let you know when the game starts. To unsubscribe from reminders just reply with STOP.`,
      messagingServiceSid: sid,
      to: number
    })
    .then(message => console.log(`Message Sent ${message.sid}`))
    .done();
}