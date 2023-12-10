var _ = require("root/lib/underscore")
var Url = require("url")
var sql = require("sqlate")
var Headers =	require("fetch-off").Headers
var Response =	require("fetch-off").Response
module.exports = ExternalApi

function ExternalApi(url, fetch, db) {
	this.url = Url.parse(url, true, true)
	this.fetch = fetch
	this.db = db
}

ExternalApi.prototype.read = function(url, opts) {
	url = this.url.resolve(url)

	var cached = this.cached(url)
	var headers = opts && opts.headers && _.clone(opts.headers) || {}
	if (cached && cached.etag) headers["if-none-match"] = cached.etag

	return this.fetch(
		url,
		_.defaults({headers}, opts)
	).then(this.cache.bind(this, new Date, url, cached))
}

ExternalApi.prototype.readCached = function(url) {
	url = this.url.resolve(url)
	var res = this.cached(url)

	return res && _.create(Response.prototype, {
		status: res.status_code,
		statusText: res.status_message,
		ok: res.status_code >= 200 && res.status_code < 300,

		headers: new Headers(_.defaults({
			"Content-Type": res.body_type && String(res.body_type)
		}, res.headers)),

		url,
		bodyUsed: true,
		body: parseBody(res.body_type, res.body)
	})
}

ExternalApi.prototype.cached = function(url) {
	url = Url.parse(url)

	return this.db.read(sql`
		SELECT * FROM ${sql.table(this.db.table)}
		WHERE origin = ${serializeOrigin(url)} AND path = ${url.path}
	`)
}

ExternalApi.prototype.cache = function(requestedAt, url, cachedResponse, res) {
	url = Url.parse(url)
	var duration = (new Date - requestedAt) / 1000
	var updated = res.status != 304

	var attrs = this.db.serialize({
		origin: serializeOrigin(url),
		path: url.path,
		status_code: res.status,
		status_message: res.statusText,
		requested_at: requestedAt,
		updated_at: requestedAt,

		headers: _.omit(serializeHeaders(res.headers), [
			"date",
			"content-type",
			"content-length",
			"etag"
		]),

		etag: res.headers.get("etag"),
		body_type: res.headers.get("content-type"),
		body: serializeBody(res.body),
		duration
	})

	this.db.execute(sql`
		INSERT INTO ${sql.table(this.db.table)}
			${sql.tuple(_.keys(attrs).map(sql.column))}

		VALUES ${sql.tuple(_.values(attrs))}

		ON CONFLICT (origin, path) DO UPDATE SET ${updated ? sql`
			${sql.csv(_.map(attrs, (value, name) => (
				sql`${sql.column(name)} = ${value}`
			)))},

			requested_count = excluded.requested_count + 1,
			updated_count = excluded.updated_count + ${updated ? 1 : 1},
			duration = ${attrs.duration}
		` : sql`
			requested_at = ${attrs.requested_at},
			requested_count = excluded.requested_count + 1,
			duration = ${attrs.duration}
		`}
	`)

	if (updated) return res

	res.body = parseBody(cachedResponse.body_type, cachedResponse.body)
	return res
}

function serializeHeaders(headers) {
	var obj
	if (headers.entries) obj = _.fromEntries(Array.from(headers))
	else if (headers.raw) obj = headers.raw()
	else throw new Error("Cannot serialize headers: " + headers)

	return _.mapValues(obj, (value) => (
		_.isArray(value) && value.length == 1 ? value[0] : value
	))
}

function serializeBody(body) {
	return _.isBuffer(body) ? body : JSON.stringify(body)
}

function serializeOrigin(url) {
	return Url.format(_.pick(url, ["protocol", "host", "username", "password"]))
}

function parseBody(type, body) {
	if (type && isJsony(type)) return JSON.parse(body)
	return body
}

function isJsony(type) {
	return type.name == "application/json" || type.suffix == "json"
}
