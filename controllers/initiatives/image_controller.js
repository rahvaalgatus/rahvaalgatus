var Path = require("path")
var Router = require("express").Router
var HttpError = require("standard-http-error")
var Image = require("root/lib/image")
var imagesDb = require("root/db/initiative_images_db")
var next = require("co-next")
var sql = require("sqlate")
var MEGABYTE = Math.pow(2, 20)

exports.router = Router({mergeParams: true})

exports.router.use(next(function*(req, _res, next) {
	var user = req.user
	if (user == null) throw new HttpError(401)

	var initiative = req.initiative
	if (user && initiative.user_id == user.id);
	else throw new HttpError(403, "No Permission to Edit")

	req.image = yield imagesDb.read(sql`
		SELECT initiative_uuid
		FROM initiative_images
		WHERE initiative_uuid = ${initiative.uuid}
	`)

	next()
}))

exports.router.put("/", next(function*(req, res) {
	var initiative = req.initiative
	var image = req.files.image

  if (image == null) return void respondWithError(
		"Image Missing",
		req.t("INITIATIVE_IMAGE_ERROR_IMAGE_MISSING")
	)

	if (image.size > 3 * MEGABYTE) return void respondWithError(
		"Image Larger Than 3MiB",
		req.t("INITIATIVE_IMAGE_ERROR_IMAGE_TOO_LARGE")
	)

	if (
		!isValidImageType(image.mimetype) ||
		!isValidImageType(Image.identify(image.buffer))
	) return void respondWithError(
		"Invalid Image Format",
		req.t("INITIATIVE_IMAGE_ERROR_INVALID_FORMAT")
	)

	if (req.image) yield imagesDb.delete(req.image)

	yield imagesDb.create({
		initiative_uuid: initiative.uuid,
		data: image.buffer,
		type: image.mimetype,
		preview: yield Image.resize(1200, 675, image.buffer)
	})

	res.flash("notice", req.t("INITIATIVE_IMAGE_UPLOADED"))
	res.redirect(303, Path.dirname(req.baseUrl))

	function respondWithError(statusMessage, err) {
		res.statusCode = 422
		res.statusMessage = statusMessage

		res.render("error_page.jsx", {
			title: req.t("INITIATIVE_IMAGE_ERROR_TITLE"),
			body: err
		})
	}
}))

exports.router.delete("/", next(function*(req, res) {
	if (req.image == null) throw new HttpError(404, "No Initiative Image")
	yield imagesDb.delete(req.image)
	res.flash("notice", "Pilt kustutatud.")
	res.redirect(303, Path.dirname(req.baseUrl))
}))

function isValidImageType(type) {
  switch (type) {
    case "image/png":
    case "image/jpeg": return true
    default: return false
  }
}
