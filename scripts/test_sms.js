const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_ACCOUNT_AUTH_TOKEN;

const client = require('twilio')(accountSid, authToken);

const sid = `MG5cdf85c3fe7b970ccd276ece9bba9d1f`;

const sender_phone_sid = `PN1150a94f14e7074bb3aa2b8fba4728ad`;

// client.messaging.services
//     .create({
//         statusCallback: 'https://chirpify-twitter-webhook-bot.herokuapp.com/twilio',
//         friendlyName: 'Main IQTrivia CoPilot Service'
//     })
//     .then(service => console.log(service))
//     .done();



// client.messaging.services(sid)
//     .phoneNumbers
//     .create({
//         phoneNumberSid: 'PN09404858448eed8b094b021f150abe56'
//     })
//     .then(phone_number => console.log(phone_number.sid))
//     .done();


// client.messaging.services(sid)
//     .phoneNumbers
//     .each(phoneNumbers => console.log(phoneNumbers.sid));



// // const numbers = ['1 541-591-9824', '+1 541-636-7552'];
// const numbers = ['1 541-591-9824'];
// // const numbers = ['+15415919824'];
// // const numbers = ['+15033296310', '+15415919824'];

numbers.forEach((number) => {
    client.messages
        .create({
            body: ``,
            messagingServiceSid: sid,
            to: number
        })
        .then(message => console.log(message.sid))
        .done();
})
