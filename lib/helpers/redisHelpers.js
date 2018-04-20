module.exports.getMasterQuestionObjectKey = (handle) => {
  return `Chirpify::Trivia::MasterObject::${handle}`;
};

module.exports.getLateUsersRedisKey = (handle) => {
  return `Chirpify::IQTrivia::${handle}::LateUsers`;
};

module.exports.getAnsweredUserStatusKey = (question_number, handle) => {
  return `Chirpify::IQTrivia::${handle}::AnsweredUsersStatus::${question_number}`;
};

module.exports.getExtraLifeHashKey = (handle) => {
  return `Chirpify::IQTrivia::${handle}::ExtraLives`;
};

module.exports.getRespondedAnswerKey = (handle, question_number) => {
  return `Chirpify::IQTrivia::${handle}::QuestionRespondedTo::${question_number}`;
};

module.exports.getRespondedByStatusKey = (handle, status) => {
  return `Chirpify::IQTrivia::${handle}::QuestionRespondedToByStatus::${status}`;
};

module.exports.alreadyLoggedAnswerKey = (handle, question_number) => {
  return `Chirpify::IQTrivia::${handle}::AlreadyLoggedAnswerKey::${question_number}`;
};

module.exports.getConfigurationKey = () => {
  return `Chirpify::IQTrivia::Configuration`;
};

module.exports.getIQStatsKey = () => {
  return `Chirpify::MasterPercentileHash`;
}
