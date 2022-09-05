var JsonSchema = require("root/lib/json_schema")
var demand = require("must")

describe("JsonSchema", function() {
	describe("new", function() {
		it("must return a validator", function() {
			var validate = JsonSchema.new({type: "string"})
			validate.must.be.a.function()
		})
	})

	describe("when validating", function() {
		var PERSON_SCHEMA = {
			type: "object",

			properties: {
				name: {type: "string", minLength: 3},
				age: {type: "integer"}
			},

			required: ["name"],
			additionalProperties: false
		}

		it("must return null given valid object", function() {
			var validate = JsonSchema.new(PERSON_SCHEMA)
			demand(validate({name: "John", age: 42})).be.null()
		})

		it("must return errors given too short text value", function() {
			var validate = JsonSchema.new(PERSON_SCHEMA)

			validate({name: "Yo"}).must.eql([{
				keywordLocation: "#/properties/name/minLength",
				instanceLocation: "#/name"
			}])
		})

		it("must return errors given missing property", function() {
			var validate = JsonSchema.new(PERSON_SCHEMA)

			validate({age: 42}).must.eql([{
				keywordLocation: "#/required",
				instanceLocation: "#/name"
			}])
		})

		it("must return errors given mismatching type", function() {
			var validate = JsonSchema.new(PERSON_SCHEMA)

			validate({name: "John", age: "42"}).must.eql([{
				keywordLocation: "#/properties/age/type",
				instanceLocation: "#/age"
			}])
		})

		it("must return errors given one additional property", function() {
			var validate = JsonSchema.new(PERSON_SCHEMA)

			validate({name: "John", age: 42, sex: true}).must.eql([{
				keywordLocation: "#/additionalProperties",
				instanceLocation: "#/sex"
			}])
		})

		it("must return errors given two additional properties", function() {
			var validate = JsonSchema.new(PERSON_SCHEMA)

			validate({name: "John", age: 42, sex: true, car: "Lada"}).must.eql([{
				keywordLocation: "#/additionalProperties",
				instanceLocation: "#/sex"
			}, {
				keywordLocation: "#/additionalProperties",
				instanceLocation: "#/car"
			}])
		})

		it("must not mutate errors when validating again", function() {
			var validate = JsonSchema.new(PERSON_SCHEMA)
			var errors = validate({name: "Yo"})
			demand(validate({name: "John", age: 42})).be.null()

			errors.must.eql([{
				keywordLocation: "#/properties/name/minLength",
				instanceLocation: "#/name"
			}])
		})
	})
})
