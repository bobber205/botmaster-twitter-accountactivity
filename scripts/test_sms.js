const accountSid = 'AC78b6ff62f8dda676ef95d1de9f895c9f';
const authToken = '699cdfc1592def18ab7d101336c61618';
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
//         phoneNumberSid: 'PN1150a94f14e7074bb3aa2b8fba4728ad'
//     })
//     .then(phone_number => console.log(phone_number.sid))
//     .done();


client.messaging.services(sid)
    .phoneNumbers
    .each(phoneNumbers => console.log(phoneNumbers.sid));



// const numbers = ['1 541-591-9824', '+1 541-636-7552'];
const numbers = ['1 541-591-9824'];
// const numbers = ['+15415919824'];
// const numbers = ['+15033296310', '+15415919824'];

numbers.forEach((number) => {
        client.messages
            .create({
                body: `GAME STARTING SOON CHRIS! the sequel lol`,
                messagingServiceSid: sid,
                to: number
            })
            .then(message => console.log(message.sid))
            .done();
})
