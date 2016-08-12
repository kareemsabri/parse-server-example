if (!Array.prototype.findIndex) {
  Array.prototype.findIndex = function(predicate) {
    if (this === null) {
      throw new TypeError('Array.prototype.findIndex called on null or undefined');
    }
    if (typeof predicate !== 'function') {
      throw new TypeError('predicate must be a function');
    }
    var list = Object(this);
    var length = list.length >>> 0;
    var thisArg = arguments[1];
    var value;

    for (var i = 0; i < length; i++) {
      value = list[i];
      if (predicate.call(thisArg, value, i, list)) {
        return i;
      }
    }
    return -1;
  };
}

Parse.Cloud.beforeSave(Parse.User, function(request, response) {
	var PhotoSet = Parse.Object.extend("PhotoSet");

	if (request.object.isNew()) {
		request.object.set("approved", false);
		request.object.set("distance", 5);
		request.object.set("includeFacebookFriends", true);
		var photoSet = new PhotoSet();
		photoSet.set("photoFiles", []);
		photoSet.save().then(function(photoSet) {
			request.object.set("photoSet", photoSet);
			response.success();
		}, function(error) {
			console.log(error);
			response.error();
		});
	} else {
		response.success();
	}
});

Parse.Cloud.afterSave("Swipe", function(request) {
	var Match = Parse.Object.extend("Match");
	var swipe = request.object;
	if (swipe.get("liked")) {
		var swipeQuery = new Parse.Query("Swipe");
		swipeQuery.equalTo("liked", true);
		swipeQuery.equalTo("swipee", swipe.get("swiper"));
		swipeQuery.equalTo("swiper", swipe.get("swipee"));
		swipeQuery.first().then(function(swipe) {
			if (swipe != null) {
				var match = new Match();
				match.set("user1", swipe.get("swiper"));
				match.set("user2", swipe.get("swipee"));
				match.save();
			}
		});
	}
});

Parse.Cloud.afterSave("Message", function(request) {
	if (request.object.existed()) {
		return;
	}

	var pushQuery = new Parse.Query(Parse.Installation);
	pushQuery.equalTo("user", request.object.get("recipient"));

	Parse.Push.send({
	  where: pushQuery, // Set our Installation query
	  data: {
	    alert: "You have a new message!",
	    title: "You have a new message!",
	    messageId: request.object.id
	  }
	}).then(function() {
	  // Push was successful
	}, function(error) {
	  throw "Got an error " + error.code + " : " + error.message;
	});
});

Parse.Cloud.afterSave("Match", function(request) {
	if (request.object.existed()) {
		return;
	}

	var pushQuery = new Parse.Query(Parse.Installation);
	pushQuery.containedIn("user", [request.object.get("user1"), request.object.get("user2")]);

	Parse.Push.send({
	  where: pushQuery, // Set our Installation query
	  data: {
	    alert: "You have a new match!",
	    title: "You have a new match!",
	    matchId: request.object.id
	  }
	}).then(function() {
	  // Push was successful
	}, function(error) {
	  throw "Got an error " + error.code + " : " + error.message;
	});
});


Parse.Cloud.define("potentialMatches", function(request, response) {
	var result = {"users": null, "swipes": []};
	var user = request.user;
	var swipesByUserQuery = new Parse.Query("Swipe");
	swipesByUserQuery.equalTo("swiper", user);
	swipesByUserQuery.find().then(function(swipes) {
		var idsToExclude = swipes.map(function(swipe) { return swipe.get("swipeee").id; });
		idsToExclude.push(user.id);	
		var usersQuery = new Parse.Query(Parse.User);
		usersQuery.equalTo("approved", true);
		usersQuery.notContainedIn("objectId", idsToExclude);
		usersQuery.include("photoSet");
		usersQuery.find().then(function(users) {
			result["users"] = users;
			var potentialMatchIds = users.map(function(user) { return user.id; });
			var swipesOnUserQuery = new Parse.Query("Swipe");
			swipesOnUserQuery.containedIn("swiper", users);
			swipesOnUserQuery.equalTo("swipeee", user);
			swipesOnUserQuery.find().then(function(swipesOnUser) {
				result["swipes"] = swipesOnUser;
				response.success(result);
			});
		});
	});
});

Parse.Cloud.define("expire", function(request, response) {
	var Message = Parse.Object.extend("Message");
	var Match = Parse.Object.extend("Match");
	var Swipe = Parse.Object.extend("Swipe");
	var user = request.user;
	
	var messagesWhereSenderQuery = new Parse.Query(Message);
	messagesWhereSenderQuery.equalTo("sender", user);
	var messagesWhereRecipientQuery = new Parse.Query(Message);
	messagesWhereRecipientQuery.equalTo("recipient", user);
	var messagesQuery = Parse.Query.or(messagesWhereSenderQuery, messagesWhereRecipientQuery);
	messagesQuery.find().then(function(messages) {
		Parse.Object.destroyAll(messages);
	});

	var matchesWhereUser1Query = new Parse.Query(Match);
	matchesWhereUser1Query.equalTo("user1", user);
	var matchesWhereUser2Query = new Parse.Query(Match);
	matchesWhereUser2Query.equalTo("user2", user);
	var matchesQuery = Parse.Query.or(matchesWhereUser1Query, matchesWhereUser2Query);
	matchesQuery.find().then(function(matches) {
		Parse.Object.destroyAll(matches);
	});

	var swipesWhereSwiperQuery = new Parse.Query(Swipe);
	swipesWhereSwiperQuery.equalTo("swiper", user);
	var swipesWhereSwipeeeQuery = new Parse.Query(Swipe);
	swipesWhereSwipeeeQuery.equalTo("swipeee", user);
	var swipesQuery = Parse.Query.or(swipesWhereSwiperQuery, swipesWhereSwipeeeQuery);
	swipesQuery.find().then(function(swipes) {
		Parse.Object.destroyAll(swipes);
	});
	
	var photoSet = user.get("photoSet");
	photoSet.set("photoFiles", []);
	photoSet.save();
	
	user.unset("tagline");
	user.unset("lastKnownLocation");
	user.unset("userDescription");
	user.unset("seekingUserTypes");
	user.unset("userType");
	user.set("distance", 5);
	user.save().then(function() {
		response.success();
	},
	function() {
		response.error();
	});
});