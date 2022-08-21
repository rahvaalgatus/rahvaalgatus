var Certificate = require("undersign/lib/certificate")
var {newCertificate} = require("root/test/fixtures")
var {getCertificatePersonName} = require("root/lib/certificate")

describe("Certificate", function() {
	describe(".getCertificatePersonName", function() {
		function newCertificateWithName(givenName, surname) {
			return new Certificate(newCertificate({
				subject: {
					countryName: "EE",
					organizationName: "ESTEID (MOBIIL-ID)",
					organizationalUnitName: "authentication",
					commonName: `${surname},${givenName},60001019906`,
					surname: surname,
					givenName: givenName,
					serialNumber: "60001019906"
				}
			}))
		}

		it("must return capitalized name", function() {
			var cert = newCertificateWithName("JOHN", "SMITH")
			getCertificatePersonName(cert).must.equal("John Smith")
		})

		it("must return capitalized two-part first name", function() {
			var cert = newCertificateWithName("JOHN MARY", "SMITH")
			getCertificatePersonName(cert).must.equal("John Mary Smith")
		})

		it("must return capitalized name given a dashed first name", function() {
			var cert = newCertificateWithName("JOHNNY-MARY", "SMITH")
			getCertificatePersonName(cert).must.equal("Johnny-Mary Smith")
		})

		it("must return capitalized name given Mobile-Id test name", function() {
			var cer = newCertificateWithName("MARY ÄNN", "O’CONNEŽ-ŠUSLIK TESTNUMBER")
			var name = getCertificatePersonName(cer)
			name.must.equal("Mary Änn O’Connež-Šuslik Testnumber")
		})
	})
})
