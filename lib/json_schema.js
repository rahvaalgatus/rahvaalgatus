var SchemaSafe = require("@exodus/schemasafe")

// Error properties apparently match 2019-09 spec suggestions:
// https://json-schema.org/draft/2019-09/json-schema-core.html#rfc.section.10.4.2
exports.new = function(schema) {
	var validate = SchemaSafe.validator(schema, {
		includeErrors: true,
		allErrors: true,
		$schemaDefault: "https://json-schema.org/draft/2020-12/schema"
	})

	return function(obj) { return validate(obj) ? null : validate.errors }
}
