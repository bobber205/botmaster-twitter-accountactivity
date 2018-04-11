module.exports.getLateUsersRedisKey = (handle) => {
  return `Chirpify::IQTrivia::${handle}::LateUsers`;
};