var Router = require("express").Router
var HttpError = require("standard-http-error")
var next = require("co-next")
var renderContentDisposition = require("content-disposition")
var filesDb = require("root/db/initiative_files_db")

exports.router = Router({mergeParams: true})

exports.router.get("/:fileId", next(function*(req, res) {
	var file = yield filesDb.read(req.params.fileId)
	if (file == null) throw new HttpError(404)

	res.setHeader("Content-Type", file.content_type)
	res.setHeader("Content-Disposition", dispose(file.content_type, file.name))
	res.end(file.content)
}))

function dispose(type, name) {
	return renderContentDisposition(name, {
		type: type == "application/pdf" ? "inline" : "attachment"
	})
}
