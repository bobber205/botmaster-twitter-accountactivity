const _ = require('lodash');

var user_one = [1,2,3,4,5];

var user_two =  [1,2,4,10];

// This is your array of arrays of user profiles split by " "
var array_of_arrays = [user_one, user_two];

var uniques = _.chain(array_of_arrays).flattenDeep().uniq().compact().value();

var all_flattened = _.flattenDeep(array_of_arrays)

console.log(uniques)

console.log(all_flattened)

var final_result = _.map(uniques, (current) => {
    return {value: current, count: _.filter(all_flattened, (current_other) => {return current == current_other}).length}
});

final_result = _.chain(final_result).sortBy('count').reverse().value();

console.log(final_result)

