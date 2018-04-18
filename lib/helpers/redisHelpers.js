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

module.exports.getConfigurationKey = () => {
  return `Chirpify::IQTrivia::Configuration`;
};
