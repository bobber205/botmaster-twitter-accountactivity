const find = require("lodash").find;
const inRange = require("lodash").inRange;

module.exports.determineQuestionAnswered = function(timestamp, master_question_object) {
  console.log("Searching ", timestamp);
  const result = find(master_question_object, (current)=> {
    if (current.stopped == 0) return timestamp > current.started;
    return inRange(timestamp, current.started, current.stopped);
  });
  return result;
};


// example_object = [
//   {
//     question_number: 0,
//     started: 1522106793,
//     stopped: 1522106814
//   },
//   {
//     question_number: 1,
//     started: 1522106837,
//     stopped: 1522106844
//   }
// ];