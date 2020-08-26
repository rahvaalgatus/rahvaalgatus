var Leaflet = require("leaflet/dist/leaflet.js")
var GEOJSON = require("../tmp/local_governments.geojson.json")
var GREY = "#ccc"
var DARK_GREY = "#aaa"
var SECONDARY_BACKGROUND = "#f2f2f2"
var BLUE = "#124267"

exports.newMap = function(el, initiativeCounts) {
	var map = Leaflet.map(el, {
		layers: [],
		zoomSnap: 0.1,
		maxZoom: 11,
		scrollWheelZoom: false,
		attributionControl: false,
		tap: !Leaflet.Browser.mobile,
		dragging: !Leaflet.Browser.mobile
	})

	var kompassMarkers = Leaflet.layerGroup()

	var group = Leaflet.geoJSON(GEOJSON, {
		style: function getStyle(gov) {
			return {
				weight: 1,
				color: SECONDARY_BACKGROUND,
				fillColor: hasInitiatives(gov.properties) ? BLUE : GREY,
				fillOpacity: 1
			}
		},

		onEachFeature: function(gov, layer) {
			layer.on({
				mouseover: function(ev) {
					var props = ev.target.feature.properties
					var layer = ev.target
					if (!hasInitiatives(props)) layer.setStyle({fillColor: DARK_GREY})
				},

				click: function() {
					this.unbindTooltip()
				},

				mouseout: function(ev) { group.resetStyle(ev.target) }
			})

			var name = gov.properties.name

			layer.on("mouseover", function() {
				if (this.isPopupOpen()) return

				var gov = layer.feature.properties
				var html = "<h2>" + name + "</h2>"

				html += "<p>"
				html += "<strong>" + gov.population + "</strong> elanikku ja "
				html += "<strong>" + gov.threshold + "</strong> allkirja vajalik algatustele. "
				html += "</p>"

				html += "<ul>"

				if (hasInitiatives(gov)) html += [
					"<li class=\"has-initiatives\"><strong>",
					getInitiativeCount(gov),
					"</strong> algatus(t) Rahvaalgatuses</li>"
				].join("")

				if (gov.kompassUrl)
					html += "<li class=\"kompass\">Rändnäitus \"Kodukoha kompass\"</li>"

				if (gov.rahandusministeeriumUrl) html += [
					"<li class=\"rahandusministeerium\">",
					"Ülevaade teenuste tasemetest",
					"</li>"
				].join("")

				html += "</ul>"

				layer.bindTooltip(html, {
					className: "gov-tooltip",
					permanent: false
				}).openTooltip()
			})

			layer.bindPopup(function(layer) {
				var gov = layer.feature.properties
				var html = "<h2>" + name + "</h2>"

				html += "<p>"
				html += "<strong>" + gov.population + "</strong> elanikku ja "
				html += "<strong>" + gov.threshold + "</strong> allkirja vajalik algatustele. "
				html += "</p>"

				html += "<ul>"

				if (hasInitiatives(gov)) html += [
					"<li class=\"has-initiatives\"><strong>",
					getInitiativeCount(gov),
					"</strong> algatus(t) Rahvaalgatuses</li>"
				].join("")

				if (gov.kompassUrl) html += [
					"<li class=\"kompass\"><a href=\"",
					gov.kompassUrl,
					"\">Rändnäitus \"Kodukoha kompass\"</a></li>"
				].join("")

				if (gov.rahandusministeeriumUrl) html += [
					"<li class=\"rahandusministeerium\"><a href=\"",
					gov.rahandusministeeriumUrl,
					"\">Ülevaade teenuste tasemetest</a></li>"
				].join("")

				html += "</ul>"

				html += "<menu>"

				html += "<a href=\"/initiatives/new\" class=\"new-initiative-button blue-button\">Loo algatus</a>"

				if (hasInitiatives(gov)) html += [
					" või <a href=\"/initiatives?for=",
					gov.id,
					"\" class=\"link-button\">vaata algatusi</a>."
				].join("")

				html += "</menu>"

				return html
			}, {className: "gov-popup"}).openPopup()

			if (gov.properties.kompassUrl) {
				var coords = layer.getBounds().getCenter()

				Leaflet.circleMarker(coords, {
					radius: 9,
					interactive: false,
					className: "kompass-marker-below"
				}).addTo(kompassMarkers)

				Leaflet.circleMarker(coords, {
					radius: 4,
					interactive: false,
					className: "kompass-marker-above"
				}).addTo(kompassMarkers)
			}
		}
	}).addTo(map)

	kompassMarkers.addTo(map)

	var bounds = group.getBounds()
	var padding = [40, 40]
	map.setMinZoom(map.getBoundsZoom(bounds, false, padding))
	map.fitBounds(bounds, {padding: padding})

	// Max bounds prevents the popup from being visible.
	// Using 80% (0.8) padding instead of a few percent because of that.
	// https://github.com/Leaflet/Leaflet/issues/2324
	map.setMaxBounds(bounds.pad(0.8))

	return map

	function getInitiativeCount(gov) {
		return initiativeCounts[gov.id] || 0
	}

	function hasInitiatives(gov) {
		return initiativeCounts[gov.id] > 0
	}
}
