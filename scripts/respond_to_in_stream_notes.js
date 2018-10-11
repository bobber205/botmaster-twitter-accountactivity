join(quiz_def, (quiz_json_string) => {
  if (!quiz_json_string) {return;}
  console.log(`__processTweetCreateEvent json ${quiz_json_string}`);
  console.log(`in_reply_to_status_id_str ${entry.in_reply_to_status_id_str}`);
  var all_tweet_ids = _.chain(JSON.parse(quiz_json_string).quiz).map((c)=> {return c.tweet_id;}).compact().value();
  let is_response_to_question = _.intersection([entry.in_reply_to_status_id_str], all_tweet_ids).length > 0;
  console.log(`all tweet ids ${all_tweet_ids} ==> ${is_response_to_question}`);
  if (is_response_to_question) {
    console.log(`User ${entry.user.screen_name} is trying to respond to a question tweet!`);
    let to_message_screen_name = entry.user.screen_name;
    let message_to_send = `@${to_message_screen_name} Be sure to answer future questions using the "Send a private message" button!`;
    let bot_owner_name = entry.in_reply_to_screen_name;
    if (process.env.QUIZ_RUNNING == '1') {
      this.__getTwitterClientForHandle(bot_owner_name).post('statuses/update', {status: message_to_send, in_reply_to_status_id: entry.id_str});
    }
  }
});