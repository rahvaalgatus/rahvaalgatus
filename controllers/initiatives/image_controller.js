var _ = require("root/lib/underscore")
var Path = require("path")
var {Router} = require("express")
var HttpError = require("standard-http-error")
var Initiative = require("root/lib/initiative")
var Image = require("root/lib/image")
var imagesDb = require("root/db/initiative_images_db")
var next = require("co-next")
var sql = require("sqlate")
var MEGABYTE = Math.pow(2, 20)

exports.router = Router({mergeParams: true})

exports.router.use(function(req, _res, next) {
	var {user} = req
	if (user == null) throw new HttpError(401)

	var {initiative} = req

	var isAuthor = user && Initiative.isAuthor(user, initiative)
	if (!isAuthor) throw new HttpError(403, "No Permission to Edit")

	req.image = imagesDb.read(sql`
		SELECT initiative_uuid
		FROM initiative_images
		WHERE initiative_uuid = ${initiative.uuid}
	`)

	next()
})

exports.router.put("/", next(function*(req, res) {
	var {user} = req
	var {initiative} = req
	var {image} = req
	var attrs = parse(req.body)
	var imageFile = req.files.image

  if (image == null && imageFile == null) return void respondWithError(
		"Image Missing",
		req.t("INITIATIVE_IMAGE_ERROR_IMAGE_MISSING")
	)

	if (imageFile && imageFile.size > 3 * MEGABYTE) return void respondWithError(
		"Image Larger Than 3MiB",
		req.t("INITIATIVE_IMAGE_ERROR_IMAGE_TOO_LARGE")
	)

	if (
		imageFile && (
			!isValidImageType(imageFile.mimetype) ||
			!isValidImageType(Image.identify(imageFile.buffer))
		)
	) return void respondWithError(
		"Invalid Image Format",
		req.t("INITIATIVE_IMAGE_ERROR_INVALID_FORMAT")
	)

	if (imageFile) {
		attrs.data = imageFile.buffer
		attrs.type = imageFile.mimetype
		attrs.preview = yield Image.resize(1200, 675, imageFile.buffer)
	}

	if (image) imagesDb.update(image, attrs)
	else imagesDb.create(_.assign(attrs, {
		initiative_uuid: initiative.uuid,
		uploaded_by_id: user.id
	}))

	res.flash("notice", imageFile
		? req.t("INITIATIVE_IMAGE_UPLOADED")
		: req.t("INITIATIVE_IMAGE_AUTHOR_UPDATED")
	)

	res.statusMessage = imageFile ? "Image Replaced" : "Image Author Updated"
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

exports.router.delete("/", function(req, res) {
	if (req.image == null) throw new HttpError(404, "No Initiative Image")
	imagesDb.delete(req.image)
	res.flash("notice", "Pilt kustutatud.")
	res.redirect(303, Path.dirname(req.baseUrl))
})

function isValidImageType(type) {
  switch (type) {
    case "image/png":
    case "image/jpeg": return true
    default: return false
  }
}

var validate = require("root/lib/json_schema").new({
	type: "object",
	additionalProperties: false,

	properties: {
		author_name: {type: "string", maxLength: 100},
		author_url: {type: "string", maxLength: 1024}
	}
})

exports.SCHEMA = validate.schema

function parse(obj) {
	var err, attrs = {}

	if ("author_name" in obj) attrs.author_name = String(obj.author_name).trim()
	if ("author_url" in obj) attrs.author_url = String(obj.author_url).trim()

	if (err = validate(attrs)) throw new HttpError(422, "Invalid Attributes", {
		attributes: err
	})

	return attrs
}
