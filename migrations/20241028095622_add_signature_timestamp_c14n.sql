UPDATE initiative_signatures SET xades = replace(xades,
	'<xades:SignatureTimeStamp>',
	'<xades:SignatureTimeStamp><ds:CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#" />'
)
WHERE xades IS NOT NULL
AND xades NOT LIKE '%<xades:SignatureTimeStamp><ds:CanonicalizationMethod%';
