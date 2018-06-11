var PhoneNumber = require('awesome-phonenumber');
const PNF = require('google-libphonenumber').PhoneNumberFormat;

var phoneUtil = require('google-libphonenumber').PhoneNumberUtil.getInstance();


var phone_number_submitted = process.argv[2];

console.log(`Validating ${phone_number_submitted}`);

var code = PhoneNumber(phone_number_submitted).getRegionCode();

console.log(code);



// var number = phoneUtil.parseAndKeepRawInput(phone_number_submitted);

// var is_valid = phoneUtil.isValidNumber(number);

// var message = is_valid ? 'That phone number is good to go!' : 'bad number received!';

// var phone_output = is_valid ? phoneUtil.format(number, PNF.INTERNATIONAL) : 'not valid!';


// console.log(phone_output);

// console.log(number.getRawInput());


const accountSid = 'AC78b6ff62f8dda676ef95d1de9f895c9f';
const authToken = process.env.TWILIO_ACCOUNT_AUTH_TOKEN;
const client = require('twilio')(accountSid, authToken);

client.lookups.phoneNumbers(phone_number_submitted)
    .fetch({
    })
    .then(phone_number => console.log(`phone_number.callerName: ${JSON.stringify(phone_number)}`))
    .catch((e) => {console.log(`oops`, e)})
    .done();


var example_result =  {
     "callerName": null,
     "countryCode": "US",
     "phoneNumber": "+15415919824",
     "nationalFormat": "(541) 591-9824",
     "carrier": {
         "mobile_country_code": "310",
         "mobile_network_code": "160",
         "name": "T-Mobile USA, Inc.",
         "type": "mobile",
         "error_code": null
     },
     "addOns": null,
     "url": "https://lookups.twilio.com/v1/PhoneNumbers/+15415919824?Type=carrier"
 }