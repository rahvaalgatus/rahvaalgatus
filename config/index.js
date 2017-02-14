var O = require("oolong")

module.exports = O.create(
	require("./index.json"),
	resolve("./" + process.env.ENV) && require("./" + process.env.ENV)
)

function resolve(path) {
	try { return require.resolve(path) } catch (ex) { return null }
}
