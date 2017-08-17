/** @jsx Jsx */
var _ = require("./lib/underscore")
if (Object.assign == null) Object.assign = _.assignOwn
var D3 = require("d3-shape")
var Jsx = require("./lib/jsx")
var View = require("./lib/view")
var indexOf = Function.call.bind(Array.prototype.indexOf)
var map = Function.call.bind(Array.prototype.map)
var floor = Math.floor
var ceil = Math.ceil
var abs = Math.abs
var EMPTY_VNODE = Jsx.EMPTY_VNODE
var ARC_WIDTH = 45
var ARC_RADIUS = 95
var ARC_SQUARE = desqpythagoras(ARC_RADIUS) * 2
var INITIATIVE_RADIUS = ARC_RADIUS + ARC_WIDTH + 40
var INITIATIVE_WIDTH = 130
var INITIATIVE_HEIGHT = 75
var INITIATIVE_MARGIN = 10
var BOX_WIDTH = 300
var BOX_HEIGHT = (INITIATIVE_HEIGHT + INITIATIVE_MARGIN) * 5
var DISABLED_COLOR = "#d7d7d7"
var LOGO_WIDTH = BOX_WIDTH / 2
var LOGO_HEIGHT = BOX_HEIGHT
var arc = D3.arc().innerRadius(40).outerRadius(ARC_RADIUS + ARC_WIDTH)
var donut = D3.arc().innerRadius(ARC_RADIUS).outerRadius(ARC_RADIUS + ARC_WIDTH)
module.exports = Viz

var VISIONS = [{
	title: <Letters spacing="1">Elukvaliteet</Letters>,
	category: "elukvaliteet",
	weight: 12,

	description: <p>
		<strong>Elukvaliteet</strong> eakana sõltub pigem inimese valikutest,
		mitte riigist.
	</p>,
}, {
	title: <Letters spacing="1">Paindlik töö</Letters>,
	category: "paindlik töö",
	weight: 14,

	description: <p>
		70 aastastest <strong>töötab</strong> täis- või osakoormusega 60%
	</p>,
}, {
	title: <Letters spacing="1">Elukestev õpe</Letters>,
	category: "elukestev õpe",
	weight: 15,

	description: <p>
		<strong>Elukestvas</strong> õppes osalejate määr ei sõltu enam vanusest.
	</p>
}, {
	title: <Letters spacing="1">Eluase</Letters>,
	category: "eluase",
	weight: 8,

	description: <p>
		Vanadushaprad eakad valivad ise, kas elavad ühiskodus, kom&shy;muu&shy;nis,
		hoolde&shy;kodus või oma ko&shy;dus, sest abi&shy;vaja&shy;duse kulud on kaetud.
	</p>,
}, {
	title: <Letters spacing="1">Sissetulek</Letters>,
	category: "sissetulek",
	weight: 12,

	description: <p>
		Mittetöötavate eakate <strong>sissetulek</strong> moodus&shy;tab 70% nende
		vara&shy;se&shy;mast sisse&shy;tule&shy;kust, kus&shy;juures riik&shy;liku pen&shy;sioni osa&shy;kaal selles on oluliselt vähenenud.
	</p>
}, {
	title: <Letters spacing="1">Oskused</Letters>,
	category: "oskused",
	weight: 10,

	description: <p>
		Inimestel (sh eakatel) on <strong>mitmekülgsed oskused</strong>, nad
		töötavad mitmel erialal ja kohas ning õpivad veel samaaegselt.
	</p>
}, {
	title: <Letters spacing="1">Kohanemine</Letters>,
	category: "kohanemine",
	weight: 14,

	description: <p>
		Inimesed on teadlikud vananemisest ja selle mõjust ning oskavad
		olukorraga <strong>kohaneda</strong>.
	</p>
}]

var LOGO = <svg
	width={LOGO_WIDTH}
	viewBox="0 0 800 800"
	fill="#339"
>
  <path d="M225.05,483.69a2.1,2.1,0,0,1,2.07,2.07v31.49a25.25,25.25,0,0,1-1.38,8.6,17.66,17.66,0,0,1-4.15,6.6,18.47,18.47,0,0,1-6.91,4.26,31.65,31.65,0,0,1-19.24,0,18.51,18.51,0,0,1-6.87-4.26,17.25,17.25,0,0,1-4.11-6.6,25.93,25.93,0,0,1-1.34-8.6V485.76a2.1,2.1,0,0,1,2.07-2.07h6.22a2.1,2.1,0,0,1,2.07,2.07v31.1a15.18,15.18,0,0,0,.84,5.38A9,9,0,0,0,200.4,528a16,16,0,0,0,4.68.65,16.45,16.45,0,0,0,4.72-.65,9.3,9.3,0,0,0,3.72-2.07,9.78,9.78,0,0,0,2.42-3.65,14.61,14.61,0,0,0,.88-5.38v-31.1a2.1,2.1,0,0,1,2.07-2.07Z" />
  <path d="M237.88,499.58a2.1,2.1,0,0,1,2.07-2.07h5.84a2.1,2.1,0,0,1,2.07,2.07v19.51a12.51,12.51,0,0,0,2,7.37q2,2.76,6.41,2.76a7.41,7.41,0,0,0,6.22-2.76,11.69,11.69,0,0,0,2.15-7.37V499.58a2.1,2.1,0,0,1,2.07-2.07h5.84a2.1,2.1,0,0,1,2.07,2.07v35.79a2.1,2.1,0,0,1-2.07,2.07h-5.84a2.1,2.1,0,0,1-2.07-2.07v-1.77a18.94,18.94,0,0,1-4.38,3.19,13,13,0,0,1-6.3,1.42,18.07,18.07,0,0,1-7.76-1.46,12.92,12.92,0,0,1-4.92-3.92,15.17,15.17,0,0,1-2.61-5.72,29.87,29.87,0,0,1-.77-6.87Z" />
  <path d="M283.34,517.48a24.76,24.76,0,0,1,1.31-8.1,19.48,19.48,0,0,1,3.76-6.6,17.62,17.62,0,0,1,6-4.42,18.38,18.38,0,0,1,7.79-1.61,18.78,18.78,0,0,1,7.79,1.57,18.22,18.22,0,0,1,6,4.22,18.76,18.76,0,0,1,3.8,6.22,21.09,21.09,0,0,1,1.34,7.49v3.46a2.1,2.1,0,0,1-2.07,2.07H293.33a6.41,6.41,0,0,0,.73,3.11,6.92,6.92,0,0,0,2,2.27,8.62,8.62,0,0,0,2.84,1.38,12,12,0,0,0,3.3.46,13.18,13.18,0,0,0,4-.5,8.35,8.35,0,0,0,2.54-1.27,7.74,7.74,0,0,1,1.38-.84,3.78,3.78,0,0,1,1.46-.23h6.14a2.13,2.13,0,0,1,1.5.62,1.71,1.71,0,0,1,.58,1.46,6.32,6.32,0,0,1-1.19,2.76,13.19,13.19,0,0,1-3.34,3.3,21.6,21.6,0,0,1-5.49,2.76,22.71,22.71,0,0,1-7.56,1.15,19.6,19.6,0,0,1-7.79-1.5,16.58,16.58,0,0,1-6-4.26,19.06,19.06,0,0,1-3.76-6.57A25.74,25.74,0,0,1,283.34,517.48ZM302.16,506a9.92,9.92,0,0,0-3.8.65,8.4,8.4,0,0,0-2.65,1.69,7.49,7.49,0,0,0-1.65,2.3,8.61,8.61,0,0,0-.73,2.42h17.36a13.3,13.3,0,0,0-.58-2.42,6.32,6.32,0,0,0-1.38-2.3,7.1,7.1,0,0,0-2.53-1.69A10.64,10.64,0,0,0,302.16,506Z" />
  <path d="M345.32,517.48a24.76,24.76,0,0,1,1.31-8.1,19.48,19.48,0,0,1,3.76-6.6,17.62,17.62,0,0,1,6-4.42,18.38,18.38,0,0,1,7.79-1.61,18.78,18.78,0,0,1,7.79,1.57,18.22,18.22,0,0,1,6,4.22,18.76,18.76,0,0,1,3.8,6.22,21.09,21.09,0,0,1,1.34,7.49v3.46a2.1,2.1,0,0,1-2.07,2.07H355.3a6.41,6.41,0,0,0,.73,3.11,6.92,6.92,0,0,0,2,2.27,8.62,8.62,0,0,0,2.84,1.38,12,12,0,0,0,3.3.46,13.18,13.18,0,0,0,4-.5,8.35,8.35,0,0,0,2.54-1.27,7.74,7.74,0,0,1,1.38-.84,3.78,3.78,0,0,1,1.46-.23h6.14a2.13,2.13,0,0,1,1.5.62,1.71,1.71,0,0,1,.58,1.46,6.32,6.32,0,0,1-1.19,2.76,13.19,13.19,0,0,1-3.34,3.3,21.6,21.6,0,0,1-5.49,2.76,22.71,22.71,0,0,1-7.56,1.15,19.6,19.6,0,0,1-7.79-1.5,16.58,16.58,0,0,1-6-4.26,19.06,19.06,0,0,1-3.76-6.57A25.74,25.74,0,0,1,345.32,517.48ZM364.13,506a9.92,9.92,0,0,0-3.8.65,8.4,8.4,0,0,0-2.65,1.69,7.49,7.49,0,0,0-1.65,2.3,8.61,8.61,0,0,0-.73,2.42h17.36a13.3,13.3,0,0,0-.58-2.42,6.32,6.32,0,0,0-1.38-2.3,7.1,7.1,0,0,0-2.53-1.69A10.64,10.64,0,0,0,364.13,506Z" />
  <path d="M391.63,507.34a10.6,10.6,0,0,1,1.42-3.46,13.11,13.11,0,0,1,3.15-3.46,17,17,0,0,1,5-2.65,20.74,20.74,0,0,1,6.87-1,22.52,22.52,0,0,1,7.07,1,15.33,15.33,0,0,1,5.42,3,13.19,13.19,0,0,1,3.49,5,18.42,18.42,0,0,1,1.23,7v22.58a2.1,2.1,0,0,1-2.07,2.07h-5.84a2.1,2.1,0,0,1-2.07-2.07v-2.54a13,13,0,0,1-4.65,3.8,16.71,16.71,0,0,1-7.72,1.57,18.42,18.42,0,0,1-5.91-.88,12.16,12.16,0,0,1-4.38-2.5,11.14,11.14,0,0,1-2.73-3.8,11.81,11.81,0,0,1-1-4.8,10,10,0,0,1,3.76-8.29,21.78,21.78,0,0,1,10.06-4.07l12.52-2.15q0-3.15-2.07-4.46a9.48,9.48,0,0,0-5.15-1.31,6.82,6.82,0,0,0-3,.54A9,9,0,0,0,403,508a4.51,4.51,0,0,1-1.27.84,3.39,3.39,0,0,1-1.27.23h-7.14a1.93,1.93,0,0,1-1.31-.46A1.19,1.19,0,0,1,391.63,507.34ZM404.45,529a13.71,13.71,0,0,0,4.65-.73,10.32,10.32,0,0,0,3.42-2,8.18,8.18,0,0,0,2.07-2.76,7.6,7.6,0,0,0,.69-3.15v-.77l-10.45,1.84a10.84,10.84,0,0,0-4.53,1.57,3.32,3.32,0,0,0-1.38,2.8,2.51,2.51,0,0,0,1.65,2.38A9.1,9.1,0,0,0,404.45,529Z" />
  <path d="M445.62,522.16v13.21a2.1,2.1,0,0,1-2.07,2.07h-5.84a2.1,2.1,0,0,1-2.07-2.07V485a2.1,2.1,0,0,1,2.07-2.07h5.84a2.1,2.1,0,0,1,2.07,2.07v24.19l12.83-10.37a11.56,11.56,0,0,1,1.19-.84,3.32,3.32,0,0,1,1.8-.46h7.83a1.83,1.83,0,0,1,1.84,1.84,2.28,2.28,0,0,1-.12.73,2,2,0,0,1-.73.81l-17.89,14.44L472,534.14a3.35,3.35,0,0,1,.62.77,1.54,1.54,0,0,1,.15.69,1.84,1.84,0,0,1-1.84,1.84h-7.45a3.88,3.88,0,0,1-2-.46,5.68,5.68,0,0,1-1.19-.84Z" />
  <path d="M478.57,499.58a2.1,2.1,0,0,1,2.07-2.07h5.84a2.1,2.1,0,0,1,2.07,2.07v19.51a12.51,12.51,0,0,0,2,7.37q2,2.76,6.41,2.76a7.41,7.41,0,0,0,6.22-2.76,11.69,11.69,0,0,0,2.15-7.37V499.58a2.1,2.1,0,0,1,2.07-2.07h5.84a2.1,2.1,0,0,1,2.07,2.07v35.79a2.1,2.1,0,0,1-2.07,2.07h-5.84a2.1,2.1,0,0,1-2.07-2.07v-1.77a18.94,18.94,0,0,1-4.38,3.19,13,13,0,0,1-6.3,1.42,18.07,18.07,0,0,1-7.76-1.46,12.92,12.92,0,0,1-4.92-3.92,15.17,15.17,0,0,1-2.61-5.72,29.87,29.87,0,0,1-.77-6.87Z" />
  <path d="M547.76,526a1.87,1.87,0,0,0-.54-1.38,5,5,0,0,0-1.88-1,30.5,30.5,0,0,0-3.57-.92q-2.23-.46-5.68-1.23a23.69,23.69,0,0,1-5.61-1.92,12,12,0,0,1-3.57-2.69,8.75,8.75,0,0,1-1.88-3.5,16,16,0,0,1-.54-4.26,10.31,10.31,0,0,1,1.08-4.53,12,12,0,0,1,3.11-4,16.25,16.25,0,0,1,5-2.8,19.27,19.27,0,0,1,6.68-1.08,24.52,24.52,0,0,1,6.72.84,17.9,17.9,0,0,1,5,2.23,10.94,10.94,0,0,1,3.23,3.19,8,8,0,0,1,1.31,3.65,1.71,1.71,0,0,1-.58,1.46,2.12,2.12,0,0,1-1.5.61h-5.91a2.91,2.91,0,0,1-1.73-.42l-1.27-1a6.9,6.9,0,0,0-1.84-1,10.66,10.66,0,0,0-3.46-.42,11.11,11.11,0,0,0-4.07.69,2.48,2.48,0,0,0-1.77,2.46,2.34,2.34,0,0,0,.42,1.42,3.56,3.56,0,0,0,1.61,1,26.12,26.12,0,0,0,3.3,1q2.11.5,5.49,1.19,6.83,1.46,9.64,4.57a11.1,11.1,0,0,1,2.8,7.72,9.53,9.53,0,0,1-1.15,4.49,12.31,12.31,0,0,1-3.34,3.92,17.18,17.18,0,0,1-5.38,2.76,23.16,23.16,0,0,1-7.18,1,24.39,24.39,0,0,1-7.18-1,18.19,18.19,0,0,1-5.26-2.5,11.66,11.66,0,0,1-3.3-3.46,7.94,7.94,0,0,1-1.23-3.76,1.71,1.71,0,0,1,.58-1.46,2.12,2.12,0,0,1,1.5-.61h5.91a2.46,2.46,0,0,1,1.73.54l1.31,1.23a6.56,6.56,0,0,0,2,1.23,10.84,10.84,0,0,0,3.92.54,19,19,0,0,0,2.38-.15,11.73,11.73,0,0,0,2.27-.5,5.27,5.27,0,0,0,1.73-.92A1.78,1.78,0,0,0,547.76,526Z" />
  <path d="M564.2,517.48a24.76,24.76,0,0,1,1.31-8.1,19.5,19.5,0,0,1,3.76-6.6,17.64,17.64,0,0,1,6-4.42,18.38,18.38,0,0,1,7.79-1.61,18.79,18.79,0,0,1,7.8,1.57,18.24,18.24,0,0,1,6,4.22,18.74,18.74,0,0,1,3.8,6.22,21.09,21.09,0,0,1,1.34,7.49v3.46a2.1,2.1,0,0,1-2.07,2.07H574.18a6.41,6.41,0,0,0,.73,3.11,6.92,6.92,0,0,0,2,2.27,8.63,8.63,0,0,0,2.84,1.38,11.94,11.94,0,0,0,3.3.46,13.18,13.18,0,0,0,4-.5,8.35,8.35,0,0,0,2.53-1.27,7.71,7.71,0,0,1,1.38-.84,3.78,3.78,0,0,1,1.46-.23h6.14a2.13,2.13,0,0,1,1.5.62,1.71,1.71,0,0,1,.58,1.46,6.33,6.33,0,0,1-1.19,2.76,13.21,13.21,0,0,1-3.34,3.3,21.6,21.6,0,0,1-5.49,2.76,22.72,22.72,0,0,1-7.57,1.15,19.6,19.6,0,0,1-7.79-1.5,16.59,16.59,0,0,1-6-4.26,19.07,19.07,0,0,1-3.76-6.57A25.74,25.74,0,0,1,564.2,517.48ZM583,506a9.92,9.92,0,0,0-3.8.65,8.4,8.4,0,0,0-2.65,1.69,7.5,7.5,0,0,0-1.65,2.3,8.58,8.58,0,0,0-.73,2.42h17.36a13.31,13.31,0,0,0-.58-2.42,6.32,6.32,0,0,0-1.38-2.3,7.1,7.1,0,0,0-2.53-1.69A10.64,10.64,0,0,0,583,506Z" />
  <path d="M178.74,618.43a5.14,5.14,0,0,1-.84-1.31l-15.44-35.41a1.68,1.68,0,0,1-.08-.54,2.1,2.1,0,0,1,2.07-2.07h5.76a2.13,2.13,0,0,1,1.69.61,5.94,5.94,0,0,1,.84,1.23L183,604.76,193.18,581a5.87,5.87,0,0,1,.84-1.23,2.13,2.13,0,0,1,1.69-.61h5.76a2.1,2.1,0,0,1,2.07,2.07,1.71,1.71,0,0,1-.08.54L188,617.13a5.19,5.19,0,0,1-.84,1.31,2.13,2.13,0,0,1-1.69.61h-5.07A2.13,2.13,0,0,1,178.74,618.43Z" />
  <path d="M219.29,564.52a2.1,2.1,0,0,1,2.07,2.07v6a2.1,2.1,0,0,1-2.07,2.07h-6.61a2.1,2.1,0,0,1-2.07-2.07v-6a2.1,2.1,0,0,1,2.07-2.07ZM221,617a2.1,2.1,0,0,1-2.07,2.07h-5.84A2.1,2.1,0,0,1,211,617V581.18a2.1,2.1,0,0,1,2.07-2.07h5.84a2.1,2.1,0,0,1,2.07,2.07Z" />
  <path d="M253.55,607.6a1.88,1.88,0,0,0-.54-1.38,5,5,0,0,0-1.88-1,30.45,30.45,0,0,0-3.57-.92q-2.23-.46-5.68-1.23a23.67,23.67,0,0,1-5.61-1.92,12,12,0,0,1-3.57-2.69,8.75,8.75,0,0,1-1.88-3.5,16.06,16.06,0,0,1-.54-4.26,10.31,10.31,0,0,1,1.08-4.53,12,12,0,0,1,3.11-4,16.24,16.24,0,0,1,5-2.8,19.28,19.28,0,0,1,6.68-1.08,24.53,24.53,0,0,1,6.72.84,17.93,17.93,0,0,1,5,2.23,11,11,0,0,1,3.23,3.19,8,8,0,0,1,1.31,3.65,1.71,1.71,0,0,1-.58,1.46,2.12,2.12,0,0,1-1.5.61h-5.91a2.91,2.91,0,0,1-1.73-.42l-1.27-1a6.89,6.89,0,0,0-1.84-1,10.65,10.65,0,0,0-3.46-.42,11.11,11.11,0,0,0-4.07.69,2.48,2.48,0,0,0-1.77,2.46,2.33,2.33,0,0,0,.42,1.42,3.56,3.56,0,0,0,1.61,1,26.17,26.17,0,0,0,3.3,1q2.11.5,5.49,1.19,6.83,1.46,9.64,4.57a11.1,11.1,0,0,1,2.8,7.72,9.54,9.54,0,0,1-1.15,4.49A12.32,12.32,0,0,1,259,616a17.19,17.19,0,0,1-5.38,2.76,23.16,23.16,0,0,1-7.18,1,24.4,24.4,0,0,1-7.18-1,18.2,18.2,0,0,1-5.26-2.5,11.66,11.66,0,0,1-3.3-3.46,8,8,0,0,1-1.23-3.76,1.71,1.71,0,0,1,.58-1.46,2.12,2.12,0,0,1,1.5-.61h5.91a2.46,2.46,0,0,1,1.73.54l1.31,1.23a6.55,6.55,0,0,0,2,1.23,10.83,10.83,0,0,0,3.92.54,19,19,0,0,0,2.38-.15,11.71,11.71,0,0,0,2.27-.5,5.28,5.28,0,0,0,1.73-.92A1.78,1.78,0,0,0,253.55,607.6Z" />
  <path d="M280.27,564.52a2.1,2.1,0,0,1,2.07,2.07v6a2.1,2.1,0,0,1-2.07,2.07h-6.61a2.1,2.1,0,0,1-2.07-2.07v-6a2.1,2.1,0,0,1,2.07-2.07ZM282,617a2.1,2.1,0,0,1-2.07,2.07H274A2.1,2.1,0,0,1,272,617V581.18a2.1,2.1,0,0,1,2.07-2.07h5.84a2.1,2.1,0,0,1,2.07,2.07Z" />
  <path d="M310.38,578.34a21.28,21.28,0,0,1,7.64,1.31,18.19,18.19,0,0,1,5.91,3.61,18,18,0,0,1,4,5.38,17.54,17.54,0,0,1,1.73,6.61,16.64,16.64,0,0,1,.08,1.77v4.26a16.21,16.21,0,0,1-.08,1.73,19.14,19.14,0,0,1-1.77,6.6,17,17,0,0,1-4,5.34,18.51,18.51,0,0,1-5.91,3.57,23,23,0,0,1-15.28,0,18.5,18.5,0,0,1-5.91-3.57,17,17,0,0,1-4-5.34,19.1,19.1,0,0,1-1.77-6.6q-.08-.69-.11-1.73c0-.69,0-1.39,0-2.11s0-1.43,0-2.15.06-1.31.11-1.77a17.56,17.56,0,0,1,1.73-6.61,18,18,0,0,1,4-5.38,18.18,18.18,0,0,1,5.91-3.61A21.27,21.27,0,0,1,310.38,578.34Zm9.29,17.28a10,10,0,0,0-1.11-4,7.46,7.46,0,0,0-2.19-2.5,7.9,7.9,0,0,0-2.84-1.27,14.51,14.51,0,0,0-6.3,0,7.88,7.88,0,0,0-2.84,1.27,7.45,7.45,0,0,0-2.19,2.5,10,10,0,0,0-1.11,4q-.08.62-.12,1.54t0,1.92q0,1,0,2t.12,1.5a10,10,0,0,0,1.11,4,7.44,7.44,0,0,0,2.19,2.5,7.88,7.88,0,0,0,2.84,1.27,14.51,14.51,0,0,0,6.3,0,7.9,7.9,0,0,0,2.84-1.27,7.45,7.45,0,0,0,2.19-2.5,10,10,0,0,0,1.11-4,11.48,11.48,0,0,0,.08-1.5v-3.88A13.06,13.06,0,0,0,319.67,595.62Z" />
  <path d="M356.3,578.34a21.28,21.28,0,0,1,7.64,1.31,18.19,18.19,0,0,1,5.91,3.61,18,18,0,0,1,4,5.38,17.52,17.52,0,0,1,1.73,6.61,16.9,16.9,0,0,1,.08,1.77v4.26a16.47,16.47,0,0,1-.08,1.73,19.14,19.14,0,0,1-1.77,6.6,17,17,0,0,1-4,5.34,18.51,18.51,0,0,1-5.91,3.57,23,23,0,0,1-15.28,0,18.49,18.49,0,0,1-5.91-3.57,17,17,0,0,1-4-5.34A19.08,19.08,0,0,1,337,603q-.08-.69-.12-1.73t0-2.11q0-1.07,0-2.15c0-.72.06-1.31.12-1.77a17.54,17.54,0,0,1,1.73-6.61,18,18,0,0,1,4-5.38,18.17,18.17,0,0,1,5.91-3.61A21.27,21.27,0,0,1,356.3,578.34Zm9.29,17.28a10,10,0,0,0-1.11-4,7.47,7.47,0,0,0-2.19-2.5,7.91,7.91,0,0,0-2.84-1.27,14.51,14.51,0,0,0-6.3,0,7.89,7.89,0,0,0-2.84,1.27,7.44,7.44,0,0,0-2.19,2.5,10,10,0,0,0-1.11,4q-.08.62-.12,1.54t0,1.92q0,1,0,2t.12,1.5a10,10,0,0,0,1.11,4,7.43,7.43,0,0,0,2.19,2.5,7.88,7.88,0,0,0,2.84,1.27,14.51,14.51,0,0,0,6.3,0,7.91,7.91,0,0,0,2.84-1.27,7.46,7.46,0,0,0,2.19-2.5,10,10,0,0,0,1.11-4,11.28,11.28,0,0,0,.08-1.5v-3.88A12.82,12.82,0,0,0,365.59,595.62Z" />
  <path d="M422.12,617A2.1,2.1,0,0,1,420,619h-5.84a2.1,2.1,0,0,1-2.07-2.07V597.46a11.69,11.69,0,0,0-2.15-7.37q-2.15-2.77-6.6-2.77a8,8,0,0,0-6.41,2.77,11,11,0,0,0-2.34,7.37V617a2.1,2.1,0,0,1-2.07,2.07h-5.84a2.1,2.1,0,0,1-2.07-2.07V581.18a2.1,2.1,0,0,1,2.07-2.07h5.84a2.1,2.1,0,0,1,2.07,2.07v1.77a17.19,17.19,0,0,1,4.68-3.3,14.46,14.46,0,0,1,6.38-1.31,18.63,18.63,0,0,1,7.83,1.46,13.51,13.51,0,0,1,5.07,3.92,15,15,0,0,1,2.73,5.72,28.6,28.6,0,0,1,.81,6.87Z" />
  <path d="M473.34,588.94a8.6,8.6,0,0,0,3-3.76,11.06,11.06,0,0,0,.65-3.53,7.82,7.82,0,0,0-1.92-5.34q-1.92-2.19-6.37-2.19-4.22,0-6.18,2.07a12,12,0,0,0-2.8,5.3,2.44,2.44,0,0,1-.92,1.5,2.34,2.34,0,0,1-1.38.5H451.3a2.19,2.19,0,0,1-1.5-.58,1.7,1.7,0,0,1-.58-1.5,17,17,0,0,1,1.77-6.53,17.9,17.9,0,0,1,4.11-5.38,19.56,19.56,0,0,1,6-3.65,22.19,22.19,0,0,1,15.82.23,17.53,17.53,0,0,1,5.84,4.07,16.48,16.48,0,0,1,3.42,5.53,17.43,17.43,0,0,1,1.11,6,27.49,27.49,0,0,1-.23,3.65,11.22,11.22,0,0,1-1.08,3.46,17.37,17.37,0,0,1-2.46,3.61,32,32,0,0,1-4.3,4l-14.21,13H486.4a2.1,2.1,0,0,1,2.07,2.07V617A2.1,2.1,0,0,1,486.4,619H450.53a2.1,2.1,0,0,1-2.07-2.07v-4.69a3.52,3.52,0,0,1,.77-2.27,7.32,7.32,0,0,1,1.31-1.34Z" />
  <path d="M537.85,585.33q.08,1.46.08,3.23v7.22q0,1.77-.08,3.23a35.9,35.9,0,0,1-1.34,8.26,17.5,17.5,0,0,1-3.53,6.61,16.18,16.18,0,0,1-6.3,4.38,29.48,29.48,0,0,1-19,0,16.21,16.21,0,0,1-6.26-4.38,17.49,17.49,0,0,1-3.53-6.61,35.9,35.9,0,0,1-1.34-8.26q-.15-2.92-.15-6.64t.15-6.64a37.07,37.07,0,0,1,1.34-8.33,17.78,17.78,0,0,1,3.53-6.72,16.75,16.75,0,0,1,6.26-4.49,24.15,24.15,0,0,1,9.52-1.65,25.28,25.28,0,0,1,9.49,1.58,16.2,16.2,0,0,1,6.3,4.38,17.5,17.5,0,0,1,3.53,6.6A35.93,35.93,0,0,1,537.85,585.33Zm-31,13.29q.38,5.53,2.65,8.56t7.64,3q5.38,0,7.64-3t2.65-8.56q.15-2.92.15-6.45t-.15-6.45q-.39-5.53-2.65-8.56t-7.64-3q-5.38,0-7.64,3t-2.65,8.56q-.15,2.92-.15,6.45T506.9,598.62Z" />
  <path d="M550.06,567.36a2.1,2.1,0,0,1,2.07-2.07H581a2.1,2.1,0,0,1,2.07,2.07v5.45a2.1,2.1,0,0,1-2.07,2.07H559.43l-.84,9.83a13.62,13.62,0,0,1,4.11-1q2-.15,3.34-.15a26.67,26.67,0,0,1,8,1.15,18.2,18.2,0,0,1,6.37,3.42,16,16,0,0,1,4.22,5.57,17.84,17.84,0,0,1,1.54,7.6,20.39,20.39,0,0,1-1.57,8.41,15.79,15.79,0,0,1-4.3,5.76,17.17,17.17,0,0,1-6.41,3.3,28.8,28.8,0,0,1-7.83,1,29.79,29.79,0,0,1-9.1-1.23,18.34,18.34,0,0,1-6.3-3.34,14.09,14.09,0,0,1-3.76-4.84,15.32,15.32,0,0,1-1.42-5.72,1.7,1.7,0,0,1,.58-1.5,2.2,2.2,0,0,1,1.5-.58h6.22a2.14,2.14,0,0,1,1.38.5,2.54,2.54,0,0,1,.84,1.34,6.8,6.8,0,0,0,1.46,2.88,7.64,7.64,0,0,0,2.3,1.77,9.46,9.46,0,0,0,2.92.88,23.93,23.93,0,0,0,3.38.23,10.26,10.26,0,0,0,7.07-2.38,8.27,8.27,0,0,0,2.69-6.53,7.28,7.28,0,0,0-2.69-5.76,10.79,10.79,0,0,0-7.07-2.38,15.25,15.25,0,0,0-3.65.35,9.6,9.6,0,0,0-2.19.81q-.85.46-1.54.81a4,4,0,0,1-1.77.35h-7.07a2.1,2.1,0,0,1-2.07-2.07Z" />
  <path d="M635.23,585.33q.08,1.46.08,3.23v7.22q0,1.77-.08,3.23a35.9,35.9,0,0,1-1.34,8.26,17.5,17.5,0,0,1-3.53,6.61,16.18,16.18,0,0,1-6.3,4.38,29.48,29.48,0,0,1-19,0,16.21,16.21,0,0,1-6.26-4.38,17.49,17.49,0,0,1-3.53-6.61,35.9,35.9,0,0,1-1.34-8.26q-.15-2.92-.15-6.64t.15-6.64a37.07,37.07,0,0,1,1.34-8.33,17.78,17.78,0,0,1,3.53-6.72,16.75,16.75,0,0,1,6.26-4.49,24.15,24.15,0,0,1,9.52-1.65,25.28,25.28,0,0,1,9.49,1.58,16.2,16.2,0,0,1,6.3,4.38,17.5,17.5,0,0,1,3.53,6.6A35.93,35.93,0,0,1,635.23,585.33Zm-31,13.29q.38,5.53,2.65,8.56t7.64,3q5.38,0,7.64-3t2.65-8.56q.15-2.92.15-6.45t-.15-6.45q-.39-5.53-2.65-8.56t-7.64-3q-5.38,0-7.64,3t-2.65,8.56q-.15,2.92-.15,6.45T604.28,598.62Z" />
  <path d="M440.48,200a20.33,20.33,0,0,0,40.61,1.46,13.53,13.53,0,0,0,.08-1.46V179.57A13.56,13.56,0,0,0,467.61,166H454a13.57,13.57,0,0,0-13.56,13.56s0,.06,0,.09v20.2s0,.09,0,.14" />
  <path d="M379.45,200a20.33,20.33,0,0,0,40.62,1.46,13.93,13.93,0,0,0,.08-1.46V179.57A13.56,13.56,0,0,0,406.59,166H393a13.57,13.57,0,0,0-13.57,13.56s0,.06,0,.09v20.21s0,.09,0,.14" />
  <path d="M318.42,200A20.33,20.33,0,0,0,359,201.47a13.53,13.53,0,0,0,.08-1.46V179.57A13.56,13.56,0,0,0,345.55,166H332a13.57,13.57,0,0,0-13.56,13.56s0,.06,0,.09v20.2s0,.09,0,.14" />
  <path d="M515.48,349.09a13.56,13.56,0,0,0-.46-3.45L501.92,247.4v0a13.57,13.57,0,0,0-13.56-13.56H458.57a27.42,27.42,0,0,1,9,20c0,.1,0,.2,0,.3V349.1c0,11.44-9.31,21.65-20.74,21.65a20.6,20.6,0,0,1-4.5-.55l4.88,80.62H474.4l11.89-89.16.42-.2,1.65-12.34a13.56,13.56,0,0,0,27.13,0" />
  <path d="M393.42,349.09a13.56,13.56,0,0,0-.46-3.45L379.85,247.4v0a13.57,13.57,0,0,0-13.56-13.56H311.64a13.57,13.57,0,0,0-13.57,13.56v0L285,345.65a13.56,13.56,0,1,0,26.66,3.48l13.56,101.7h27.13l14-101.7a13.56,13.56,0,0,0,27.13,0" />
  <path d="M454.45,349.1V254.16h0a20.35,20.35,0,0,0-20.34-20.34H388A20.64,20.64,0,0,1,393,246.92l13,97.37a20.67,20.67,0,0,1,.58,4.8c0,11.44-9.31,21.65-20.74,21.65a20.53,20.53,0,0,1-7.17-1.3v81.38h48.25l.4-101.72a13.56,13.56,0,1,0,27.13,0" />
</svg>

var ARC_ANGLE = 2 * Math.PI / _.sum(VISIONS.map(getWeight))

function Viz(attrs) {
	View.call(this, attrs)
	this.point = this.point.bind(this)
	this.select = this.select.bind(this)
	this.expand = this.expand.bind(this)
	this.unexpand = this.unexpand.bind(this)
	this.handleResize = _.debounce(this.handleResize.bind(this), 100)
	window.addEventListener("resize", this.handleResize)
}

Viz.prototype = Object.create(View.prototype, {
	constructor: {value: Viz, configurable: true, writeable: true}
})

Viz.prototype.id = "vision"
Viz.prototype.el = null
Viz.prototype.svg = null
Viz.prototype.pointed = null
Viz.prototype.selected = null
Viz.prototype.expanded = null
Viz.prototype.maxWidth = 960
Viz.prototype.initiatives = Array.prototype

Viz.prototype.template = function() {
	var expanded = this.expanded
	var initiatives = this.initiatives

	return <div id={this.id} onTouchStart={this.unexpand}>
		{this.renderVisions()}

		<div className="initiatives">
			{initiatives.map(this.renderInitiative, this)}
		</div>

		{expanded ? this.renderExpandedInitiative(expanded) : EMPTY_VNODE}
	</div>
}

Viz.prototype.renderVisions = function() {
	var selected = this.selected
	var pointed = this.pointed
	var expanded = this.expanded

	return <svg
		id={this.id + "-visions"}
		width={BOX_WIDTH}
		height={BOX_HEIGHT}
		viewBox={"0 0 " + BOX_WIDTH + " " + BOX_HEIGHT}
	>
		<defs>
			<filter id="vision-shadow">
				<feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity="0.40" />
			</filter>
		</defs>

		<g transform={translate(BOX_WIDTH / 2, BOX_HEIGHT / 2)}>
			{VISIONS.map(function(vision, i, visions) {
				var startAngle = ARC_ANGLE * _.sum(visions.slice(0, i).map(getWeight))
				var endAngle = startAngle + ARC_ANGLE * vision.weight
				var center = (ARC_RADIUS + ARC_WIDTH) * (endAngle - startAngle) / 2
				var flip = startAngle > Math.PI / 2 && endAngle < Math.PI * 1.5

				var highlighted = (
					selected === vision ||
					selected == null && pointed === vision ||
					expanded && hasCategory(expanded, vision.category)
				)

				return <g
					class={"vision-arc" + (highlighted ? " highlighted" : "")}
					onMouseEnter={this.point}
					onMouseLeave={this.point}
					onClick={this.select}
				>
					<path
						id={"vision-arc-path-" + i}
						class="fillable"
						d={(
							flip
							? donut({startAngle: endAngle, endAngle: startAngle})
							: donut({startAngle: startAngle, endAngle: endAngle})
						)}
					/>

					<path
						d={arc({startAngle: startAngle, endAngle: endAngle})}
						fill="transparent"
					/>

					<text
						text-anchor="middle"
						dy={flip ? -17 : ARC_WIDTH - 15}
					>
						<textPath
							startOffset={center}
							{...({"xlink:href": "#vision-arc-path-" + i})}
						>
							{vision.title}
						</textPath>
					</text>
				</g>
			}, this)}

			{pointed || selected ? <foreignObject
				class="vision-description unpointable"
				x={-ARC_SQUARE / 2}
				y={-ARC_SQUARE / 2}
				width={ARC_SQUARE}
				height={ARC_SQUARE}
			>
				{(pointed || selected).description}
			</foreignObject> :

			<g
				transform={translate(-LOGO_WIDTH / 2, -LOGO_HEIGHT / 2)}
				class="unpointable"
			>
				{LOGO}
			</g>}
		</g>
	</svg>
}

Viz.prototype.renderInitiative = function(initiative, i) {
	var pos = positionInitiative(this.maxWidth, i)
	var selected = this.selected || this.pointed
	var highlighted = selected && hasCategory(initiative, selected.category)
	var enabled = highlighted || selected == null

	var className = "initiative"
	if (highlighted) className += " highlighted"
	else if (!enabled) className += " disabled"
	if (pos == null) className += " inline"

	return <a
		id={this.id + "-initiative-" + i}
		href={initiative.url}
		className={className}
		onClick={enabled ? this.expand : null}
		onMouseEnter={enabled ? this.expand : null}
		onMouseLeave={enabled ? this.expand : null}

		style={_.assign({
			width: INITIATIVE_WIDTH + "px",
			height: INITIATIVE_HEIGHT + "px"
		}, pos && {
			marginLeft: "50%",
			marginTop: (BOX_HEIGHT / 2) + "px",
			left: pos[0] + "px",
			top: pos[1] + "px",
			position: "absolute",
		})}
	>
		<p className="initiative-title">{initiative.title}</p>

		<InitiativeProgress
			initiative={initiative}
			disabled={!enabled}
		/>
	</a>
}

Viz.prototype.renderExpandedInitiative = function(initiative) {
	var i = this.initiatives.indexOf(initiative)
	var el = document.getElementById(this.id + "-initiative-" + i)

	return <div
		className="initiative-details unpointable"
		style={{
			left: (el.offsetLeft + el.offsetWidth / 2) + "px",
			top: (el.offsetTop + el.offsetHeight / 2) + "px",
			position: "absolute",
		}}
	>
		<p className="initiative-title">
			{initiative.title}
			<br />
			<small>{initiative.subtitle}</small>
		</p>
		<InitiativeProgress initiative={initiative} expanded />
	</div>
}

Viz.prototype.point = function(ev) {
	// Click breaks on iOS when mouseenter does changes.
	if ("ontouchstart" in document) return

	if (ev.type === "mouseenter")
		this.set({pointed: VISIONS[indexOfParent(ev.currentTarget)]})
	else if (ev.relatedTarget == null || !isVisionArc(ev.relatedTarget))
		this.set({pointed: null})
}

Viz.prototype.select = function(ev) {
	ev.preventDefault() // Prevent double-tap to zoom.
	var vision = VISIONS[indexOfParent(ev.currentTarget)]
	this.set({selected: this.selected === vision ? null : vision, expanded: null})
}

Viz.prototype.expand = function(ev) {
	var initiative = this.initiatives[indexOfParent(ev.currentTarget)]

	switch (ev.type) {
		case "mouseenter":
		case "mouseleave":
			if ("ontouchstart" in document) return
			if (ev.type === "mouseenter") this.set({expanded: initiative})
			else this.set({expanded: null})
			break
			
		case "click":
			if (!("ontouchstart" in document)) return
			if (this.expanded === initiative) return // Follow link

			ev.preventDefault()
			this.set({expanded: initiative})
			break
	}
}

Viz.prototype.unexpand = function(ev) {
	// Clear expanded mainly for touch devices that get their mouseenter events
	// stuck.
	if (
		ev.target === ev.currentTarget ||
		ev.target === this.el.childNodes[0] ||
		ev.target === this.el.childNodes[1]
	) this.set({expanded: null})
}

Viz.prototype.handleResize = function() {
	this.set({maxWidth: this.el.offsetWidth})
}

function InitiativeProgress(props) {
	var initiative = props.initiative
	var disabled = props.disabled
	var progress = initiative.progress
	var text = props.expanded ? initiative.progressText : ""

	var className = disabled ? "initiative-progress disabled" : {
		inProgress: "initiative-progress discussable",
		voting: "initiative-progress votable",
		followUp: "initiative-progress processable"
	}[initiative.status]

	switch (initiative.status) {
		case "inProgress": switch (progress) {
			case "completed":
				return <div className={className + " completed"}>{text}</div>

			default:
				return <div
					className={className}
					style={
						linearBackground(disabled ? DISABLED_COLOR : "#ffb400", progress)
					}
				>{text}</div>
			}

		case "voting": switch (progress) {
			case "completed":
				return <div className={className + " completed"}>{text}</div>

			case "failed":
				return <div className={className + " failed"}>{text}</div>

			default:
				return <div
					className={className}
					style={
						linearBackground(disabled ? DISABLED_COLOR : "#00cb81", progress)
					}
				>{text}</div>
		}

		case "followUp":
			return <div className={className}>{text}</div>

		default: return null
	}
}

function Letters(props, children) {
	var spacing = props.spacing

	return map(children[0], function(letter, i) {
		return <tspan dx={i === 0 ? "" : spacing}>{letter}</tspan>
	})
}

function positionInitiative(maxWidth, i) {
	var vertical = ceil(
		(2 * INITIATIVE_RADIUS) /
		(INITIATIVE_HEIGHT + INITIATIVE_MARGIN)
	)

	var maxRound = floor(
		((maxWidth / 2) - INITIATIVE_RADIUS)
		/ (INITIATIVE_WIDTH + INITIATIVE_MARGIN)
	)

	var height = INITIATIVE_HEIGHT + INITIATIVE_MARGIN
	var y = height * (i % vertical - floor(vertical / 2))
	var x = depythagoras(INITIATIVE_RADIUS, y)

	if (abs(x) < abs(y)) x *= 1.5 // Ellipsify a little.
	var round = floor(i / (vertical * 2))
	if (round >= maxRound) return null

	x += (INITIATIVE_WIDTH + INITIATIVE_MARGIN) * round
	if (i % (vertical * 2) >= vertical) x = -x - INITIATIVE_WIDTH
	return [x, y - INITIATIVE_HEIGHT / 2]
}

function linearBackground(color, completion) {
	var percent = completion * 100 + "%"

	return "background-image: linear-gradient(" + [
		"to right",
		color + " 0%",
		color + " " + percent,
		"transparent " + percent,
		"transparent 100%"
	].join(", ") + ")"
}

function hasCategory(initiative, category) {
	return initiative.categories.indexOf(category) >= 0
}

function isVisionArc(el) {
	return el.tagName === "path" && el.getAttribute("fill") === "transparent"
}

function translate(x, y) { return "translate(" + x + ", " + y + ")" }
function depythagoras(c, a) { return Math.sqrt(c * c - a * a) }
function desqpythagoras(c) { return Math.sqrt(c * c / 2) }
function indexOfParent(el) { return indexOf(el.parentNode.childNodes, el) }
function getWeight(v) { return v.weight }
