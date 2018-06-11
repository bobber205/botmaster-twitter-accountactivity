const PNF = require('google-libphonenumber').PhoneNumberFormat;

var phoneUtil = require('google-libphonenumber').PhoneNumberUtil.getInstance();


var phone_number_submitted = process.argv[2];

console.log(`Validating ${phone_number_submitted}`);

var number = phoneUtil.parseAndKeepRawInput(phone_number_submitted, 'US');

var is_valid = phoneUtil.isValidNumber(number);

var message = is_valid ? 'That phone number is good to go!' : 'bad number received!';

var phone_output = is_valid ? phoneUtil.format(number, PNF.INTERNATIONAL) : 'not valid!';


console.log(phone_output);

console.log(number.getRawInput());

