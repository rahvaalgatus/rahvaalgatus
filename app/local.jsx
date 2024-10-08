/** @jsx Jsx */
var Jsx = require("j6pack")
// Patched out the attributes.for check as I mentioned in
// https://github.com/Leaflet/Leaflet/issues/8225#issuecomment-1705539766
// and vendored Leaflet.
var Leaflet = require("./vendor/leaflet")
var each = Function.call.bind(Array.prototype.forEach)
var GEOJSON = require("../tmp/local_governments.geojson.json")

var PHASE_COLORS = {
	edit: "#F2BF3C",
	sign: "#1D9967",
	government: "#1C71A2",
	archive: "#8B8B8B"
}

exports.newMap = function(mapElement, initiativeCounts, location, legend) {
	var map = Leaflet.map(mapElement, {
		layers: [],
		zoomSnap: 0.1,
		maxZoom: 11,
		scrollWheelZoom: false,
		attributionControl: false,
		tap: !Leaflet.Browser.mobile,
		dragging: !Leaflet.Browser.mobile
	})

	var dtvMarkers = Leaflet.layerGroup()
	var dialogMarkers = Leaflet.layerGroup()

	var visibilities = {
		edit: true,
		sign: true,
		government: true,
		archive: true,
	}

	var governmentLayers = {}

	var layerGroup = Leaflet.geoJSON(GEOJSON, {
		style: function getStyle(layer) {
			var counts = getInitiativeCounts(layer.properties)

			var color = (
				visibilities.edit && counts.edit ? PHASE_COLORS.edit :
				visibilities.sign && counts.sign ? PHASE_COLORS.sign :
				visibilities.government && counts.government ? PHASE_COLORS.government :
				visibilities.archive && counts.archive ? PHASE_COLORS.archive :
				"#ccc"
			)

			return {
				weight: 1,
				// The color property is for edges.
				color: "#f2f2f2",
				fillColor: color,
				fillOpacity: 1
			}
		},

		onEachFeature: function(feature, layer) {
			var gov = feature.properties
			governmentLayers[gov.id] = layer

			layer.on({
				mouseover: function(ev) {
					var layer = ev.target
					layer.setStyle({color: "#2080b8", weight: 2})
					layer.bringToFront()
				},

				mouseout: function(ev) { layerGroup.resetStyle(ev.target) }
			})

			if (gov.dtvSchools.length > 0)
				Leaflet.marker(layer.getBounds().getCenter(), {
					icon: Leaflet.icon({
						iconUrl: "/assets/map-dtv-legend.svg",
						iconSize: [50, 50],
						iconAnchor: [25, 35]
					}),

					interactive: false,
					zIndexOffset: 10
				}).addTo(dtvMarkers)

			if (gov.dialogs.length > 0)
				Leaflet.marker(addLngLat(layer.getBounds().getCenter(), {
					lat: -0.02,
					lng: 0.05
				}), {
					icon: Leaflet.icon({
						iconUrl: "/assets/map-dialog-legend.svg",
						iconSize: [50, 50],
						iconAnchor: [25, 35]
					}),

					interactive: false,
				}).addTo(dialogMarkers)
		}
	})

	layerGroup.bindTooltip(function(layer) {
		var gov = layer.feature.properties
		var counts = getInitiativeCounts(gov)

		return <>
			<h2>{gov.name}</h2>

			<p>
				<strong>{gov.population}</strong>&nbsp;elanikku,{" "}
				<strong>{gov.voterCount}</strong>&nbsp;valimisealist,
				ja <strong>{gov.signatureThreshold}</strong>&nbsp;allkirja
				vajalik algatustele.
			</p>

			<ul>
				{counts.edit ? <li class="edit-phase">
					<strong>{counts.edit}</strong>&nbsp;algatus(t) ühisloomes
				</li> : null}

				{counts.sign ? <li class="sign-phase">
					<strong>{counts.sign}</strong>&nbsp;algatus(t) allkirjatamises
				</li> : null}

				{counts.government ? <li class="government-phase">
					<strong>{counts.government}</strong>&nbsp;algatus(t) menetluses
				</li> : null}

				{counts.archive ? <li class="archive-phase">
					<strong>{counts.archive}</strong>&nbsp;algatus(t) arhiveeritud
				</li> : null}

				{gov.dtvSchools.length > 0 ? <li class="dtv">
					Koolide kaasav eelarve
				</li> : null}

				{gov.dialogs.length > 0 ? <li class="dialog">
					Dialoogikoolitused
				</li> : null}
			</ul>
		</>.join("")
	}, {
		className: "gov-tooltip"
	})

	layerGroup.bindPopup(function(layer) {
		var gov = layer.feature.properties
		var counts = getInitiativeCounts(gov)
		var initiativesUrl = "/initiatives?for=" + encodeURIComponent(gov.id)

		return <>
			<h2>{gov.name}</h2>

			<p>
				<strong>{gov.population}</strong>&nbsp;elanikku,{" "}
				<strong>{gov.voterCount}</strong>&nbsp;valimisealist,
				ja <strong>{gov.signatureThreshold}</strong>&nbsp;allkirja
				vajalik algatustele.

				{gov.rahandusministeeriumUrl ? <>
					<br />
					<a href={gov.rahandusministeeriumUrl}>Ülevaade teenuste tasemetest</a>
				</> : null}
			</p>

			{(
				counts.edit ||
				counts.sign ||
				counts.government ||
				counts.archive
			) ? <>
				<h3>Rahvaalgatused</h3>

				<ul>
					{counts.edit ? <li class="edit-phase">
						<a href={initiativesUrl}>
							<strong>{counts.edit}</strong>&nbsp;algatus(t) ühisloomes
						</a>
					</li> : null}

					{counts.sign ? <li class="sign-phase">
						<a href={initiativesUrl}>
							<strong>{counts.sign}</strong>&nbsp;algatus(t) allkirjatamises
						</a>
					</li> : null}

					{counts.government ? <li class="government-phase">
						<a href={initiativesUrl}>
							<strong>{counts.government}</strong>&nbsp;algatus(t) menetluses
						</a>
					</li> : null}

					{counts.archive ? <li class="archive-phase">
						<a href={initiativesUrl}>
							<strong>{counts.archive}</strong>&nbsp;algatus(t) arhiveeritud
						</a>
					</li> : null}
				</ul>
			</>.join("") : null}

			{gov.dtvSchools.length > 0 ? <>
				<h3>Koolide kaasav eelarve</h3>

				<ul>{gov.dtvSchools.map(function(school) {
					return <li class="dtv">
						<a href={school.url}>{school.name}</a>
					</li>
				})}</ul>
			</>.join("") : null}

			{gov.dialogs.length > 0 ? <>
				<h3>Dialoogikoolitused</h3>

				<ul>{gov.dialogs.map(function(location) {
					return <li class="dialog">
						<a href={location.url}>{location.name}</a>
					</li>
				})}</ul>
			</>.join("") : null}

			<menu>
				<a
					href="/initiatives/new"
					class="new-initiative-button blue-button"
				>Loo algatus</a>

				{hasInitiatives(gov) ? <>
					või <a href={initiativesUrl} class="link-button">
						vaata algatusi
					</a>
				</> : null}
			</menu>
		</>.join("")
	}, {
		autoPanPaddingTopLeft: [0, 40],
		className: "gov-popup"
	})

	layerGroup.on("popupopen", function(ev) {
		var layer = ev.target
		layer.closeTooltip()
	})

	layerGroup.addTo(map)
	dtvMarkers.addTo(map)
	dialogMarkers.addTo(map)

	var worldBounds = layerGroup.getBounds()
	var paddingLeftWithLegend = 240
	var padding = 40

	map.setMinZoom(map.getBoundsZoom(worldBounds, false, [padding, padding]))

	// Max bounds prevents scrolling entirely away from Estonia.
	// Max bounds without padding prevents the popup from being visible.
	// Using 80% (0.8) instead of a few percent because of that.
	// https://github.com/Leaflet/Leaflet/issues/2324
	map.setMaxBounds(worldBounds.pad(0.8))

	function getWorldPadding() {
		var paddingLeft = mapElement.offsetWidth >= 680
			? paddingLeftWithLegend
			: padding

		return {
			paddingTopLeft: [paddingLeft, padding],
			paddingBottomRight: [padding, padding]
		}
	}

	map.fitBounds(worldBounds, getWorldPadding())

	var embeddedLocation = location.cloneNode(true)
	embeddedLocation.id += "-embedded"
	bindLocations([location, embeddedLocation])

	var LocationControl = Leaflet.Control.extend({
		onAdd: function(_map) { return embeddedLocation },
		onRemove: function() {}
	})

	new LocationControl({position: "topleft"}).addTo(map)

	var embeddedLegend = legend.cloneNode(true)
	embeddedLegend.id += "-embedded"
	bindLegends([legend, embeddedLegend])

	var LegendControl = Leaflet.Control.extend({
		onAdd: function(_map) { return embeddedLegend },
		onRemove: function() {}
	})

	new LegendControl({position: "topleft"}).addTo(map)

	return map

	function getInitiativeCounts(gov) { return initiativeCounts[gov.id] || {} }

	function hasInitiatives(gov) {
		var counts = getInitiativeCounts(gov)
		for (var phase in counts) if (counts[phase] > 0) return true
		return false
	}

	function bindLocations(locations) {
		locations.forEach(function(location) {
			var select = location.querySelector("select")

			// Without catching clicks on <select>, the opened popup will be
			// immediately closed.
			select.addEventListener("click", function(ev) {
				ev.stopPropagation()
			})

			select.addEventListener("change", function(ev) {
				var id = ev.target.value
				var layer

				if (id == "all") {
					map.fitBounds(worldBounds, getWorldPadding())
					layerGroup.closePopup()
				}
				else if (layer = governmentLayers[id]) {
					map.panInsideBounds(layer.getBounds(), {
						duration: 0.1,
						padding: [100, 100]
					})

					layer.bindPopup(layerGroup.getPopup()).openPopup()
				}

				locations.forEach(function(otherLocation) {
					if (otherLocation == location) return
					otherLocation.querySelector("select").value = id
				})
			})
		})
	}

	// NOTE: Leaflet has its own double-click detection on browsers that support
	// PointerEvent and double clicking on <input>s/<legend>s keeps invoking it.
	function bindLegends(legends) {
		legends.forEach(function(legend) {
			each(legend.querySelectorAll("label"), function(el) {
				el.addEventListener("dblclick", function(ev) {
					ev.stopPropagation()
				})
			})

			each(legend.querySelectorAll("input"), function(el) {
				el.addEventListener("change", function(ev) {
					var el = ev.target

					if (el.name == "phase") {
						visibilities[el.value] = el.checked
						layerGroup.resetStyle()
					}
					else if (el.name == "event" && el.value == "dtv") {
						if (el.checked) dtvMarkers.addTo(map)
						else dtvMarkers.remove()
					}
					else if (el.name == "event" && el.value == "dialog") {
						if (el.checked) dialogMarkers.addTo(map)
						else dialogMarkers.remove()
					}

					legends.forEach(function(otherLegend) {
						if (otherLegend == legend) return
						var query = "input[name=" + el.name + "][value=" + el.value + "]"
						otherLegend.querySelector(query).checked = el.checked
					})
				})
			})
		})
	}

	function addLngLat(a, b) {
		var lat = (a.lat || 0) + (b.lat || 0)
		var lng = (a.lng || 0) + (b.lng || 0)
		return {lat: lat, lng: lng}
	}
}
