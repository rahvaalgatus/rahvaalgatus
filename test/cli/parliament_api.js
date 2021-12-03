exports.respondWithNotFound = function(uuid, _req, res) {
	// 500 Internal Server Error is used for 404s...
	// https://github.com/riigikogu-kantselei/api/issues/20
	res.statusCode = 500
	res.setHeader("Content-Type", "application/json")

	res.end(JSON.stringify({
		timestamp: "2015-06-18T13:37:42+0000",
		status: 500,
		error: "Internal Server Error",
		message: `Document not found with UUID: ${uuid}`,
		path: `/api/documents/${uuid}`
	}))
}
