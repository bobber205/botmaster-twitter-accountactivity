module.exports.getLateUsersRedisKey = (handle) => {
  return `Chirpify::IQTrivia::${handle}::LateUsers`;
};

module.exports.getExtraLifeHashKey = (handle) => {
  return `Chirpify::IQTrivia::${handle}::ExtraLives`;
}

module.exports.getConfigurationKey = () => {
  return `Chirpify::IQTrivia::Configuration`;
}