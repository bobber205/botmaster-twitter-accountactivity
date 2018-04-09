const find = require("lodash").find;
const inRange = require("lodash").inRange;
const compact = require("lodash").compact;
const sample = require("lodash").sample;

const readlines = require("readlines");

const right_answer_responses = compact(readlines.readlinesSync("./right_answer_list.txt"));
const wrong_answer_responses = compact(readlines.readlinesSync("./wrong_answer_list.txt"));

module.exports.determineQuestionAnswered = (timestamp, master_question_object) => {
  console.log(`Searching ${timestamp}`);
  let result = find(master_question_object, (current)=> {
    if (current.stopped == 0 && current.started != 0) return timestamp > current.started;
    return inRange(timestamp, current.started, current.stopped);
  });
  return result;
};


module.exports.getRightAnswerResponse = (question_number) => {
  // message_text_urls_removed = _.chain(original_message_text).replace(dm_url.url, '').trim().value();
  var message = _.chain(right_answer_responses).sample().replace('QUESTIONNUMBER', `Q${question_number}`).trim().value();
  console.log("get Right Answer Response", message);
  return message;
};

module.exports.getWrongAnswerResponse = (question_number) => {
  // message_text_urls_removed = _.chain(original_message_text).replace(dm_url.url, '').trim().value();
  var message = _.chain(wrong_answer_responses).sample().replace('QUESTIONNUMBER', `Q${question_number}`).trim().value();
  console.log("get Wrong Answer Response", message);
  return message;
};