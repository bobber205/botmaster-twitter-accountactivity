const Promise = require("bluebird");
const join = Promise.join;
const _ = require('lodash');
const each = require('lodash').each;
const fs = Promise.promisifyAll(require("fs"));

files_read_def = fs.readdirAsync(`images/iq_score`).then((files) => {
    var numbers = _.chain(files).map((file) => {
        console.log(file)
        if (file == '.DS_Store')
            return
        var number = file.split('_')[1].split('.')[0]
        if (number.length == 1) number = `00${number}`
        if (number.length == 2) number = `0${number}`
        // console.log(number)
        return [file, number]
    }).compact().value();

    each(numbers, (pair) => {
        console.log(pair)
        fs.rename(`images/iq_score/${pair[0]}`, `images/iq_score/iq_score_${pair[1]}.gif`, () => {});
    });
    
});