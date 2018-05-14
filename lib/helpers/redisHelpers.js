module.exports.getMasterQuestionObjectKey = (handle) => {
  return `Chirpify::Trivia::MasterObject::${handle.toLowerCase()}`;
};

module.exports.getLateUsersRedisKey = (handle) => {
  return `Chirpify::IQTrivia::${handle.toLowerCase()}::LateUsers`;
};

module.exports.getAnsweredUserStatusKey = (question_number, handle) => {
  return `Chirpify::IQTrivia::${handle.toLowerCase()}::AnsweredUsersStatus::${question_number}`;
};

module.exports.getExtraLifeHashKey = (handle) => {
  return `Chirpify::IQTrivia::${handle.toLowerCase()}::ExtraLives`;
};

module.exports.getRespondedAnswerKey = (handle, question_number) => {
  return `Chirpify::IQTrivia::${handle.toLowerCase()}::QuestionRespondedTo::${question_number}`;
};

module.exports.getRespondedByStatusKey = (handle, status) => {
  return `Chirpify::IQTrivia::${handle.toLowerCase()}::QuestionRespondedToByStatus::${status}`;
};

module.exports.alreadyLoggedAnswerKey = (handle, question_number) => {
  return `Chirpify::IQTrivia::${handle.toLowerCase()}::AlreadyLoggedAnswerKey::${question_number}`;
};

module.exports.getConfigurationKeyForHandle = (handle) => {
  return `Chirpify::IQTrivia::Configuration::${handle.toLowerCase()}`;
};

module.exports.getIQStatsKey = () => {
  return `Chirpify::MasterPercentileHash`;
}
