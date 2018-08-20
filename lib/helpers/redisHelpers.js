"use strict";

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
  "use strict";
  handle = "GlobalExtraLives"; //make extra lives global for now
  return `Chirpify::IQTrivia::${handle.toLowerCase()}::ExtraLives`;
};

module.exports.currentExtraLivesUsedKey = (handle) => {
  return `Chirpify::IQTrivia::${handle.toLowerCase()}::CurrentExtraLivesUsed`;
};

module.exports.getMasterUserList = (handle) => {
  // handle = "GlobalExtraLives"; //make extra lives global for now
  return `Chirpify::IQTrivia::${handle.toLowerCase()}::MasterUserList`;
};

module.exports.getHasRedeemedFreeLifeCodeKey = (handle) => {
  return `Chirpify::IQTrivia::${handle.toLowerCase()}::HasRedeemedFreeLifeCode`;
};

module.exports.getWaitingToReceiveExtraLifeKey = (handle) => {
  return `Chirpify::IQTrivia::${handle.toLowerCase()}::WaitingToReceiveExtraLife`;
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

module.exports.getConfigurationKeyForIQScores = (handle) => {
  return `Chirpify::IQTrivia::Configuration::${handle.toLowerCase()}::IQScoreGifs`;
};

module.exports.getUserBotStateKey = (handle) => {
  return `Chirpify::IQTrivia::Configuration::${handle.toLowerCase()}::BotStateKey`;
};

module.exports.getIQStatsKey = () => {
  return `Chirpify::MasterPercentileHash`;
}

module.exports.getAnswerStatusKey = (handle) => {
  return `Chirpify::IQTrivia::UserAnsweringStatus::${handle.toLowerCase()}`;
}

module.exports.getPlayerListKey = (handle) => {
  return `Chirpify::IQTrivia::PlayingQuiz::${handle.toLowerCase()}`;
}

module.exports.getLatestAnswerValueKey = (handle) => {
  return `Chirpify::IQTrivia::LatestUserAnswerValue::${handle.toLowerCase()}`;
}

module.exports.getQuizRunningKey = (handle) => {
  return `Chirpify::IQTrivia::IsQuizRunningCurrently::${handle.toLowerCase}`;
}