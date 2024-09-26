var _ = require("root/lib/underscore")
var Asic = require("undersign/lib/asic")
var Config = require("root").config
var I18n = require("root/lib/i18n")
var {Router} = require("express")
var DateFns = require("date-fns")
var {MobileIdError} = require("undersign/lib/mobile_id")
var {SmartIdError} = require("undersign/lib/smart_id")
var HttpError = require("standard-http-error")
var MediaType = require("medium-type")
var Certificate = require("undersign/lib/certificate")
var ResponseTypeMiddeware =
	require("root/lib/middleware/response_type_middleware")
var demoSignaturesDb = require("root/db/demo_signatures_db")
var dispose = require("content-disposition")
var next = require("co-next")
var {mobileId} = require("root")
var {smartId} = require("root")
var {hades} = require("root")
var reportError = require("root").errorReporter
var {serializeRefreshHeader} = require("root/lib/http")
var {validateSigningCertificate} = require("root/lib/certificate")
var {getCertificatePersonalId} = require("root/lib/certificate")
var parseBody = require("body-parser").raw
var co = require("co")
var sql = require("sqlate")
var {sqlite} = require("root")
var {ENV} = process.env
var {parseSignatureAttrs} = require("./initiatives/signatures_controller")
var {hasSignatureType} = require("./initiatives/signatures_controller")
var {waitForMobileIdSession} = require("./initiatives/signatures_controller")
var {waitForSmartIdSession} = require("./initiatives/signatures_controller")
var {handleEidError} = require("./initiatives/signatures_controller")
var {serializeVerificationCode} = require("./initiatives/signatures_controller")
var {reinstantiateError} = require("./initiatives/signatures_controller")
var {SIGNABLE_TYPE} = require("./initiatives/signatures_controller")
var SIGNABLE_TEXT = I18n.t(Config.language, "demo_signatures_page.signable")
var SIGNABLE_TEXT_SHA256 = _.sha256(SIGNABLE_TEXT)
var EXPIRATION = Config.demoSignaturesExpirationSeconds
var ERROR_TYPE = new MediaType("application/vnd.rahvaalgatus.error+json")

exports.router = Router({mergeParams: true})
exports.router.use(parseBody({type: hasSignatureType}))

exports.router.get("/", function(_req, res) {
	var today = new Date

	var signatureCount = sqlite(sql`
		SELECT COUNT(*) AS count FROM demo_signatures
	`)[0].count

	var signatureCountsByDate = _.mapValues(_.indexBy(sqlite(sql`
		SELECT date(datetime(created_at, 'localtime')) AS date, COUNT(*) AS count
		FROM demo_signatures
		WHERE signed AND timestamped
		AND created_at >= ${DateFns.addDays(today, -7)}
		GROUP BY date(datetime(created_at, 'localtime'))
	`), "date"), (row) => row.count)

	res.render("demo_signatures/index_page.jsx", {
		signatureCount: signatureCount,
		signatureCountsByDate: signatureCountsByDate
	})
})

exports.router.get("/signable", function(_req, res) {
	res.setHeader("Content-Type", "text/plain; charset=utf-8")
	res.setHeader("Content-Disposition", dispose("dokument.txt", "attachment"))
	res.end(SIGNABLE_TEXT)
})

exports.router.post("/",
	new ResponseTypeMiddeware([
		"text/html",
		"application/json",
		"application/x-empty",
		SIGNABLE_TYPE
	].map(MediaType)),
	next(function*(req, res) {
	var {t} = req

	let {
		method,
		personalId: untrustedPersonalId,
		phoneNumber
	} = parseSignatureAttrs(req, req.body)

	var err, signature

	switch (method) {
		case "id-card": {
			if (res.contentType.name != SIGNABLE_TYPE) throw new HttpError(406)

			let cert = Certificate.parse(req.body)
			if (err = validateSigningCertificate(req.t, cert)) throw err

			let [country, personalId] = getCertificatePersonalId(cert)
			let xades = newXades(cert)

			let signature = demoSignaturesDb.create({
				country: country,
				personal_id: sanitizePersonalId(personalId),
				method: "id-card",
				created_at: new Date,
				updated_at: new Date,
				xades
			})

			let signatureUrl = req.baseUrl + "/" + signature.token.toString("hex")
			res.setHeader("Location", signatureUrl)
			res.setHeader("Content-Type", SIGNABLE_TYPE)

			res.statusCode = 202
			res.statusMessage = "Signing with ID-card"
			return void res.end(xades.signableHash)
		}

		case "mobile-id": {
			if (untrustedPersonalId == null)
				throw new HttpError(422, "Invalid Personal Id", {
					description: t("eid_view.errors.invalid_personal_id")
				})

			let cert = yield mobileId.certificate(phoneNumber, untrustedPersonalId)
			if (err = validateSigningCertificate(req.t, cert)) throw err

			let [country, personalId] = getCertificatePersonalId(cert)
			let xades = newXades(cert)

			// The Mobile-Id API returns any signing errors only when its status is
			// queried, not when signing is initiated.
			var session = yield mobileId.sign(
				phoneNumber,
				personalId,
				xades.signableHash
			)

			signature = demoSignaturesDb.create({
				country: country,
				personal_id: sanitizePersonalId(personalId),
				method: "mobile-id",
				created_at: new Date,
				updated_at: new Date,
				xades
			})

			res.statusMessage = "Signing with Mobile-ID"
			co(waitForMobileIdSignature(signature, session))
			break
		}

		case "smart-id": {
			if (untrustedPersonalId == null)
				throw new HttpError(422, "Invalid Personal Id", {
					description: t("eid_view.errors.invalid_personal_id")
				})

			let cert = yield smartId.certificate("PNOEE-" + untrustedPersonalId)
			cert = yield waitForSmartIdSession(90, cert)
			if (cert == null) throw new SmartIdError("TIMEOUT")
			if (err = validateSigningCertificate(req.t, cert)) throw err

			let [country, personalId] = getCertificatePersonalId(cert)
			let xades = newXades(cert)

			// The Smart-Id API returns any signing errors only when its status is
			// queried, not when signing is initiated.
			var signSession = yield smartId.sign(cert, xades.signableHash)

			signature = demoSignaturesDb.create({
				country: country,
				personal_id: sanitizePersonalId(personalId),
				method: "smart-id",
				created_at: new Date,
				updated_at: new Date,
				xades
			})

			res.statusMessage = "Signing with Smart-ID"
			co(waitForSmartIdSignature(signature, signSession))
			break
		}

		default: throw new HttpError(422, "Unknown Signing Method")
	}

	res.statusCode = 202

	var waitUrl = serializeWaitPath(req, res, signature)
	res.setHeader("Refresh", serializeRefreshHeader(3, waitUrl))
	var verificationCode = serializeVerificationCode(signature)
	res.setHeader("X-Verification-Code", verificationCode)

	switch (res.contentType.name) {
		case "application/json":
		case "application/x-empty": return void res.end()

		default: res.render("demo_signatures/creating_page.jsx", {
			method,
			verificationCode
		})
	}

	function newXades(cert) {
		return hades.new(cert, [{
			path: "dokument.txt",
			type: "text/plain",
			hash: SIGNABLE_TEXT_SHA256
		}])
	}
}), handleEidError)

exports.router.use("/:token", function(req, _res, next) {
	var signature = demoSignaturesDb.read(sql`
		SELECT * FROM demo_signatures
		WHERE token = ${Buffer.from(req.params.token || "", "hex")}
	`)

	if (signature == null) throw new HttpError(404, "Signature Not Found")
	req.signature = signature
	next()
})

exports.router.get("/:token",
	new ResponseTypeMiddeware([
		"text/html",
		"application/vnd.etsi.asic-e+zip",
		"application/json"
	].map(MediaType)),
	next(function*(req, res) {
	var {signature} = req

	switch (res.contentType.name) {
		case "text/html":
		case "application/json":
			var signing
			var isAjax = res.contentType.name == "application/json"
			var MAX_WAIT_MS = 120 * 1000

			if (!(signature.timestamped || signature.error)) while (true) {
				signing = demoSignaturesDb.read(sql`
					SELECT signed, timestamped, error
					FROM demo_signatures
					WHERE id = ${signature.id}
				`)

				if (signing == null) throw new HttpError(404, "Signature Not Found")
				if (signing.timestamped || signing.error) break

				var timedout = signature.created_at <= Date.now() - MAX_WAIT_MS

				switch (signature.method) {
					case "mobile-id":
						if (timedout) throw new MobileIdError("TIMEOUT"); break

					case "smart-id":
						if (timedout) throw new SmartIdError("TIMEOUT"); break

					default: throw new HttpError(409, "Cannot Wait for ID-card")
				}

				if (isAjax) yield _.sleep(ENV == "test" ? 100 : 500); else break
			}

			var err = signature.error || signing && signing.error
			if (err) throw reinstantiateError(err)

			if (signature.timestamped || signing && signing.timestamped) {
				res.statusMessage =
					signature.method == "mobile-id" ? "Signed with Mobile-ID" :
					signature.method == "smart-id" ? "Signed with Smart-ID" :
					"Signed"

				switch (res.contentType.name) {
					case "application/json":
						var waitUrl = serializeWaitPath(req, res, signature)
						res.setHeader("Location", waitUrl)
						return void res.json({state: "DONE"})

					default: return void res.render("demo_signatures/created_page.jsx")
				}
			}
			else {
				res.statusCode = 202

				res.statusMessage =
					signature.method == "mobile-id" ? "Waiting for Mobile-ID" :
					signature.method == "smart-id" ? "Waiting for Smart-ID" :
					"Waiting"

				let waitUrl = serializeWaitPath(req, res, signature)
				res.setHeader("Refresh", serializeRefreshHeader(2, waitUrl))
				var verificationCode = serializeVerificationCode(signature)
				res.setHeader("X-Verification-Code", verificationCode)

				switch (res.contentType.name) {
					case "application/json": return void res.json({state: "PENDING"})

					default: res.render("demo_signatures/creating_page.jsx", {
						method: signature.method,
						verificationCode
					})
				}
			}
			break

		case "application/vnd.etsi.asic-e+zip":
			if (!signature.timestamped) throw new HttpError(425, "Not Signed Yet")

			if (signature.xades == null)
				throw new HttpError(410)
			if (new Date >= DateFns.addSeconds(signature.updated_at, EXPIRATION))
				throw new HttpError(410)

			var asic = new Asic
			res.setHeader("Content-Type", asic.type)
			res.setHeader("Content-Disposition",
				dispose("signature.asice", "attachment"))
			asic.pipe(res)

			asic.addSignature(String(signature.xades))
			asic.add("dokument.txt", SIGNABLE_TEXT, "text/plain")
			asic.end()
			break

		default: throw new HttpError(406)
	}
}), handleEidError)

exports.router.put("/:token",
	new ResponseTypeMiddeware([
		"text/html",
		"application/x-empty"
	].map(MediaType)),
	next(function*(req, res) {
	var {signature} = req

	switch (req.contentType && req.contentType.name) {
		case "application/vnd.rahvaalgatus.signature":
			if (signature.signed) throw new HttpError(409, "Already Signed")

			var {xades} = signature

			if (!xades.certificate.hasSigned(xades.signable, req.body))
				throw new HttpError(409, "Invalid Signature")

			xades.setSignature(req.body)

			demoSignaturesDb.update(signature, {
				xades: xades,
				signed: true,
				updated_at: new Date
			})

			xades.setTimestamp(yield hades.timestamp(xades))
			xades.setOcspResponse(yield hades.ocsp(xades.certificate))

			demoSignaturesDb.update(signature, {
				xades: xades,
				timestamped: true,
				updated_at: new Date
			})

			res.statusMessage = "Signed with ID-card"
			var signatureUrl = req.baseUrl + "/" + signature.token.toString("hex")
			res.setHeader("Location", signatureUrl)

			switch (res.contentType.name) {
				case "application/x-empty": return void res.status(204).end()
				default: return void res.status(303).end()
			}

		default: throw new HttpError(415)
	}
}))

exports.router.use(function(err, req, res, next) {
	var {t} = req

	if (err instanceof HttpError) {
		res.statusCode = err.code
		res.statusMessage = err.message

		var type = accepts([
			new MediaType("text/html"),
			ERROR_TYPE,
			new MediaType("application/json")
		])

		switch (type && type.name) {
			case "application/vnd.rahvaalgatus.error+json":
			case "application/json":
				res.setHeader("Content-Type", type)

				return void res.end(JSON.stringify({
					code: err.code,
					message: err.message,
					description: err.description
				}))

			default: res.render("demo_signatures/error_page.jsx", {
				title: t(err.code + "_TITLE") || null,
				description: err.description || t(err.code + "_BODY") || err.message
			})
		}
	}
	else next()

	function accepts(types) {
		if (req.accept) for (var i = 0; i < types.length; ++i) {
			if (req.accept.some(types[i].match.bind(types[i]))) return types[i]
		}

		return null
	}
})

function* waitForMobileIdSignature(signature, session) {
	try {
		var {xades} = signature
		var signatureHash = yield waitForMobileIdSession(120, session)
		if (signatureHash == null) throw new MobileIdError("TIMEOUT")

		if (!xades.certificate.hasSigned(xades.signable, signatureHash))
			throw new MobileIdError("INVALID_SIGNATURE")

		xades.setSignature(signatureHash)

		demoSignaturesDb.update(signature, {
			xades: xades,
			signed: true,
			updated_at: new Date
		})

		xades.setTimestamp(yield hades.timestamp(xades))
		xades.setOcspResponse(yield hades.ocsp(xades.certificate))

		demoSignaturesDb.update(signature, {
			xades: xades,
			timestamped: true,
			updated_at: new Date
		})
	}
	catch (ex) {
		if (!(ex instanceof MobileIdError)) reportError(ex)
		demoSignaturesDb.update(signature, {error: ex, updated_at: new Date})
	}
}

function* waitForSmartIdSignature(signature, session) {
	try {
		var {xades} = signature
		var certAndSignatureHash = yield waitForSmartIdSession(120, session)
		if (certAndSignatureHash == null) throw new SmartIdError("TIMEOUT")

		var [_cert, signatureHash] = certAndSignatureHash
		if (!xades.certificate.hasSigned(xades.signable, signatureHash))
			throw new SmartIdError("INVALID_SIGNATURE")

		xades.setSignature(signatureHash)

		demoSignaturesDb.update(signature, {
			xades: xades,
			signed: true,
			updated_at: new Date
		})

		xades.setTimestamp(yield hades.timestamp(xades))
		xades.setOcspResponse(yield hades.ocsp(xades.certificate))

		demoSignaturesDb.update(signature, {
			xades: xades,
			timestamped: true,
			updated_at: new Date
		})
	}
	catch (ex) {
		if (!(ex instanceof SmartIdError)) reportError(ex)
		demoSignaturesDb.update(signature, {error: ex, updated_at: new Date})
	}
}

function serializeWaitPath(req, res, signature) {
	return req.baseUrl + "/" + signature.token.toString("hex")
		+ (res.contentType.name == "text/html" ? "#verification-code" : "")
}

function sanitizePersonalId(personalId) { return personalId.slice(0, 5) }
