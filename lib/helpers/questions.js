const find = require("lodash").find;
const inRange = require("lodash").inRange;

module.exports.determineQuestionAnswered = function(timestamp, master_question_object) {
  console.log("Searching ", timestamp);
  const result = find(master_question_object, (current)=> {
    if (current.stopped == 0 && current.started != 0) return timestamp > current.started;
    return inRange(timestamp, current.started, current.stopped);
  });
  return result;
};