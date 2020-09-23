var _ = require("root/lib/underscore")
var Db = require("root/lib/db")
var sqlite = require("root").sqlite
exports = module.exports = new Db(Object, sqlite, "news")

exports.parse = function(attrs) {
	return _.defaults({
		published_at: attrs.published_at && new Date(attrs.published_at),
		categories: attrs.categories && JSON.parse(attrs.categories)
	}, attrs)
}

exports.serialize = function(model) {
	var obj = _.clone(model)
	if (model.categories) obj.categories = JSON.stringify(model.categories)
	return obj
}
