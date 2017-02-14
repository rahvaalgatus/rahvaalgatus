var O = require("oolong")

module.exports = O.create(
	require("./development.json"),
	require("./staging.json")
)
