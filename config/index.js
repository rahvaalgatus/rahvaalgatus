var O = require("oolong")

module.exports = O.create(
	require("./index.json"),
	require("./" + process.env.ENV)
)
