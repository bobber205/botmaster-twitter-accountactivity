const find = require("lodash").find;
const inRange = require("lodash").inRange;
const compact = require("lodash").compact;
const sample = require("lodash").sample;
const chain = require("lodash").chain;

const readlines = require("readlines");

const right_answer_responses = compact(readlines.readlinesSync("config/right_answer_list.txt"));
const wrong_answer_responses = compact(readlines.readlinesSync("config/wrong_answer_list.txt"));
const wait_answer_responses = compact(readlines.readlinesSync("config/wait_answer_list.txt"));
const avatar_list = compact(readlines.readlinesSync("config/avatar_instructions_list.txt"));

const extra_life_list = compact(readlines.readlinesSync("config/extra_lives.txt"));

module.exports.determineQuestionAnswered = (timestamp, master_question_object) => {
  console.log(`Searching ${timestamp}`);
  let result = find(master_question_object, (current)=> {
    if (current.stopped == 0 && current.started != 0) return timestamp > current.started;
    return inRange(timestamp, current.started, current.stopped);
  });
  return result;
};

module.exports.determineQuestionAnsweredByWelcomeID = (welcome_message_id, master_question_object) => {
  console.log(`Searching Welcome ID ==> ${welcome_message_id}`);
  let result = find(master_question_object, (current)=> {
    return current['welcome_message_id'] == welcome_message_id; //&& current['current'] == '1';
  });
  return result;
};


module.exports.getRightAnswerResponse = (question_number) => {
  var message = chain(right_answer_responses).sample().replace(`QUESTIONNUMBER`, `Q${question_number}`).trim().value();
  console.log("get Right Answer Response", message);
  return message;
};

module.exports.getWrongAnswerResponse = (question_number) => {
  var message = chain(wrong_answer_responses).sample().replace(`QUESTIONNUMBER`, `Q${question_number}`).trim().value();
  console.log("get Wrong Answer Response", message);
  return message;
};

module.exports.getWaitAnswerResponse = (question_number) => {
  var message = chain(wait_answer_responses).sample().replace(`QUESTIONNUMBER`, `Q${question_number}`).trim().value();
  console.log("get wait Answer Response", message);
  return message;
};

module.exports.getAppropriateMediaAsset = (master_config_object, status) => {
  if (!master_config_object) return null;
  var media_id_array = null;
  if (status == "correct") media_id_array = master_config_object.right_media_assets;
  if (status == "wrong") media_id_array = master_config_object.wrong_media_assets;
  if (status == "late") media_id_array = master_config_object.late_media_assets || master_config_object.wrong_media_assets;
  if (status == "wait") media_id_array = master_config_object.wait_media_assets;
  if (status == "extra_life_used") media_id_array = master_config_object.extra_life_used_assets || master_config_object.wrong_media_assets;
  if (!media_id_array) return null;
  return chain(media_id_array).sample().value();
};

module.exports.getAvatarPrompt = (question_number) => {
  return chain(avatar_list).sample().replace(`QUESTIONNUMBER`, `Q${question_number}`).trim().value();
};

module.exports.getExtraLifeConfirmedResponse = () => {
  return chain(extra_life_list).sample().value();
};

module.exports.getAppropriateMediaAssetForIQScore = (iq_image_array, offset) => {
  console.log(offset)
  console.log(iq_image_array)
  console.log(iq_image_array[offset]);
  var media_id_array = iq_image_array;
  if (!media_id_array) return null;
  var result = media_id_array[offset];
  if (result == "0") return null;
  return result;
};

