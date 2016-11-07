var LANGS = {
	et: require("root/public/assets/et"),
	en: require("root/public/assets/en"),
	ru: require("root/public/assets/ru")
}

exports.t = function(lang, key, props) {
	var text = LANGS[lang][key]
	return props == null ? text : interpolate(text, props)
}

function interpolate(string, props) {
	return string.replace(/\{\{(\w+)\}\}/g, function(match, key) {
		return props[key]
	})
}
