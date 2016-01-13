var UsersMap = function() {
  this.map = {};
};

UsersMap.prototype = {
  addUser: function(userId, oauthAccessToken, oauthAccessTokenSecret, expires) {
    this.map[userId] = {
      userId: userId,
      oauthAccessToken: oauthAccessToken,
      oauthAccessTokenSecret: oauthAccessTokenSecret,
      expires: expires
    };
  },

  getInfoForUser: function(userId) {
    return this.map[userId];
  },

  setShardForUser: function(userId, shard) {
    if (!this.map[userId]) {
      this.map[userId] = {};
    }
    this.map[userId].shard = shard;
  },

  setNoteStoreUrlForUser:  function(userId, noteStoreUrl) {
    if (!this.map[userId]) {
      this.map[userId] = {};
    }
    this.map[userId].noteStoreUrl = noteStoreUrl;
  },

  setWebApiUrlPrefixForUser: function(userId, webApiUrlPrefix) {
    if (!this.map[userId]) {
      this.map[userId] = {};
    }
    this.map[userId].webApiUrlPrefix = webApiUrlPrefix;
  },
};

module.exports = UsersMap;
