API
===
Rahvaalgatusel on **avalik API**, mida saab kasutada nii serveri kui ka brauseri kaudu. Nii saab soovi korral kuvada algatusi ja kogutud allkirjade arvu ka väljaspool Rahvaalgatust. Näiteks kampaanialehel.

Kogu **API dokumentatsioon** on loetav [SwaggerHubis](https://app.swaggerhub.com/apis-docs/rahvaalgatus/rahvaalgatus) ja masinloetavalt OpenAPI v3 formaadis [`openapi.yaml`](https://github.com/rahvaalgatus/rahvaalgatus/blob/master/openapi.yaml) failis.

Kombineerides erinevaid API päringuid saad enda lehel kuvada näiteks koondvaate Rahvaalgatuses toimuvast:

<div id="example-full" class="example">
  <h3>Mis ettepanekuid rahvas Riigikogule saadab?</h3>
  <p>Arutelu all on <strong class="edit-count">…</strong> ideed ja toetust koguvad <strong class="sign-count">…</strong> algatust.</p>

  <h3>7 päeva jooksul enim toetust kogunud algatused</h3>
  <ol class="signed">
    <li>…</li>
    <li>…</li>
    <li>…</li>
  </ol>

  <h3>Uus info</h3>
  <ol class="events">
    <li>…</li>
    <li>…</li>
    <li>…</li>
    <li>…</li>
    <li>…</li>
  </ol>

  <script>
    function getJson(res) { return res.json() }
  </script>

  <script>!function() {
    var el = document.getElementById("example-full")

    fetch("/statistics", {
      headers: {Accept: "application/vnd.rahvaalgatus.statistics+json; v=1"}
    }).then(getJson).then(function(stats) {
      el.querySelector(".edit-count").textContent =
        stats.activeInitiativeCountsByPhase.edit
      el.querySelector(".sign-count").textContent =
        stats.activeInitiativeCountsByPhase.sign
    })

    var since = new Date
    since.setDate(since.getDate() - 6)

    var path = "/initiatives"
    path += "?signedSince=" + since.toISOString().slice(0, 10)
    path += "&order=-signaturesSinceCount"
    path += "&limit=3"
    fetch(path, {
      headers: {Accept: "application/vnd.rahvaalgatus.initiative+json; v=1"}
    }).then(getJson).then(function(initiatives) {
      var ol = el.querySelector(".signed")

      initiatives.forEach(function(initiative, i) {
        var li = ol.children[i]
        while (li.lastChild) li.removeChild(li.lastChild)

        var a = document.createElement("a")
        a.href = "/initiatives/" + initiative.id
        a.textContent = initiative.title
        li.appendChild(a)

        var added = initiative.signaturesSinceCount
        var total = initiative.signatureCount
        var t = " (+" + added + " allkirja, " + total + " kokku)"
        li.appendChild(document.createTextNode(t))
      })
    })

    var path = "/initiative-events"
    path += "?include=initiative"
    path += "&distinct=initiativeId"
    path += "&order=-occurredAt"
    path += "&limit=5"
    fetch(path, {
      headers: {
        Accept: "application/vnd.rahvaalgatus.initiative-event+json; v=1"
      }
    }).then(getJson).then(function(events) {
      var ol = el.querySelector(".events")

      events.forEach(function(event, i) {
        var li = ol.children[i]
        while (li.lastChild) li.removeChild(li.lastChild)

        var a = document.createElement("a")
        a.href = "/initiatives/" + event.initiativeId + "/events/" + event.id
        a.textContent = event.initiative.title
        li.appendChild(a)
        li.appendChild(document.createTextNode(": " + event.title))
      })
    })
  }()</script>
</div>

Eelnev näide kasutab Rahvaalgatuse **statistika**, **algatuste** ja **menetlusinfo API**-sid. All leiad kõigi kolme kohta näiteid, viited dokumentatsioonile ning koodijuppe kasutuseks.

- [Algatuste statistika](#statistics-api)
- [Algatuste loetelu](#initiatives-api)
  - [Kohalike algatuste loetelu](#local-initiatives-api)
- [Algatuse allkirjade arv](#initiative-signatures-api)
- [Algatuste menetlusinfo](#initiative-events-api)


<a name="statistics-api"></a> Algatuste statistika
--------------------------------------------------
Kui soovid veebilehele lisada kõikide algatuste koondarvu, saad selle info [`https://rahvaalgatus.ee/statistics`](https://app.swaggerhub.com/apis-docs/rahvaalgatus/rahvaalgatus/1#/Statistics/get_statistics) aadressilt.

<div id="example-statistics" class="example">
  <h3>Mis ettepanekuid rahvas Riigikogule saadab?</h3>
  <p>Arutelu all on <strong class="edit-count">…</strong> ideed ja toetust koguvad <strong class="sign-count">…</strong> algatust.</p>

  <script>!function() {
    var el = document.getElementById("example-statistics")

    fetch("/statistics", {
      headers: {Accept: "application/vnd.rahvaalgatus.statistics+json; v=1"}
    }).then(getJson).then(function(stats) {
      el.querySelector(".edit-count").textContent =
        stats.activeInitiativeCountsByPhase.edit
      el.querySelector(".sign-count").textContent =
        stats.activeInitiativeCountsByPhase.sign
    })
  }()</script>
</div>

Statistikapäringuga saad teada aktiivsete algatuste (need, mis pole tähtaega ületanud) arvu faaside lõikes ning allkirjade summa. Ülemise näite saad teha selliselt:

```html
Arutelu all on <strong id="edit-count">…</strong> ideed ja
toetust koguvad <strong id="sign-count">…</strong> algatust.
```

```javascript
fetch("https://rahvaalgatus.ee/statistics", {
  headers: {Accept: "application/vnd.rahvaalgatus.statistics+json; v=1"}
}).then(function(res) { return res.json() }).then(function(stats) {
  document.getElementById("edit-count").textContent =
    stats.activeInitiativeCountsByPhase.edit
  document.getElementById("sign-count").textContent =
    stats.activeInitiativeCountsByPhase.sign
})
```

Oluline on teha päring `Accept: application/vnd.rahvaalgatus.statistics+json; v=1` päisega. Ilma selleta ei tea server, et soovid teha API päringu, ja tagastab sulle hoopis HTMLi. `v=1` aga määrab API versiooni. See garanteerib, et API muudatuste puhul jääb su leht õigesti tööle.

Käsurealt `curl`-iga näeb statistikapärng välja selline:

```sh
curl -H "Accept: application/vnd.rahvaalgatus.statistics+json; v=1" "https://rahvaalgatus.ee/statistics"
```

Kui tahaksid ligipääsu statistikale, mida me hetkel ei väljasta, palun [anna meile sellest GitHubi kaudu teada](https://github.com/rahvaalgatus/rahvaalgatus/issues).


<a name="initiatives-api"></a> Algatuste loetelu
------------------------------------------------
Kui soovid veebilehele loetelu Rahvaalgatuses kajastuvatest algatustest, saad selle info [`https://rahvaalgatus.ee/initiatives`](https://app.swaggerhub.com/apis-docs/rahvaalgatus/rahvaalgatus/1#/Initiatives/get_initiatives) päringuga. Näiteks võid oma lehe küljeribal välja tuua viis aktiivset ja kõige rohkem allkirju kogunud algatust:

<div id="example-initiatives" class="example">
  <h3>5 populaarseimat rahvaalgatust</h3>

  <ol id="example-initiatives-list">
    <li>…</li>
    <li>…</li>
    <li>…</li>
    <li>…</li>
    <li>…</li>
  </ol>

  <script>!function() {
    var path = "/initiatives"
    path += "?phase=sign"
    path += "&signingEndsAt>" + new Date().toISOString()
    path += "&order=-signatureCount"
    path += "&limit=5"

    fetch(path, {
      headers: {Accept: "application/vnd.rahvaalgatus.initiative+json; v=1"}
    }).then(getJson).then(function(initiatives) {
      var ol = document.getElementById("example-initiatives-list")

      initiatives.forEach(function(initiative, i) {
        var li = ol.children[i]
        while (li.lastChild) li.removeChild(li.lastChild)

        var a = document.createElement("a")
        a.href = "/initiatives/" + initiative.id
        a.textContent = initiative.title
        li.appendChild(a)

        var count = initiative.signatureCount
        li.appendChild(document.createTextNode(" (" + count + " allkirja)"))
      })
    })
  }()</script>
</div>

Alustuseks piisab ühest loetelu (`<ol>`) elemendist.

```html
<ol id="initiatives"></ol>
```

Algatusi pärides saad ka määrata, kuidas neid järjestada, filtreerida algatuse faasi järgi ning piirata tagastatud algatuste arvu. Määrame, et soovime ainult allkirjastamises olevaid algatusi (`phase=sign`) tähtajaga tulevikus (`signingEndsAt>` + ajavööndiga praegune kellaaeg), sorteerida nad allkirjade järgi kahanevas järjekorras (`order=-signatureCount`) ja ainult esimest viite (`limit=5`):

```javascript
var URL = "https://rahvaalgatus.ee"

var url = URL + "/initiatives"
url += "?phase=sign"
url += "&signingEndsAt>" + new Date().toISOString()
url += "&order=-signatureCount"
url += "&limit=5"

fetch(url, {
  headers: {Accept: "application/vnd.rahvaalgatus.initiative+json; v=1"}
}).then(function(res) { return res.json() }).then(function(body) {
  var ol = document.getElementById("initiatives")

  initiatives.forEach(function(initiative, i) {
    var li = document.createElement("li")

    var a = document.createElement("a")
    a.href = URL + "/initiatives/" + initiative.id
    a.textContent = initiative.title
    li.appendChild(a)

    var count = initiative.signatureCount
    li.appendChild(document.createTextNode(" (" + count + " allkirja)"))
    ol.appendChild(li)
  })
})
```

Kui soovid filtreerida algatusi allkirjastamisaktiivsuse järgi, lisa juurde `signedSince` parameeter kuupäevaga. See lisab vastusele juurde ka `signaturesSinceCount` välja, kust leiad antud ajavahemikul tehtud allkirjade arvu. Ülal näites nähtud "viimase 7 päeva algatuste" loendi saad luua järgmiselt:

```html
<ol id="initiatives"></ol>
```

```javascript
var URL = "https://rahvaalgatus.ee"

var since = new Date
since.setDate(since.getDate() - 6)

var url = URL + "/initiatives"
url += "?signedSince=" + since.toISOString().slice(0, 10)
url += "&order=-signaturesSinceCount"
url += "&limit=3"
fetch(url, {
  headers: {Accept: "application/vnd.rahvaalgatus.initiative+json; v=1"}
}).then(function(res) { return res.json() }).then(function(initiatives) {
  var ol = document.getElementById("initiatives")

  initiatives.forEach(function(initiative, i) {
    var li = document.createElement("li")

    var a = document.createElement("a")
    a.href = URL + "/initiatives/" + initiative.id
    a.textContent = initiative.title
    li.appendChild(a)

    var added = initiative.signaturesSinceCount
    var total = initiative.signatureCount
    var t = " +" + added + " allkirja (" + total + " kokku)"
    li.appendChild(document.createTextNode(t))
    ol.appendChild(li)
  })
})
```

Oluline on teha päring `Accept: application/vnd.rahvaalgatus.initiative+json; v=1` päisega. Ilma selleta ei tea server, et soovid teha API päringu, ja tagastab sulle hoopis HTMLi. `v=1` aga määrab API versiooni. See garanteerib, et API muudatuste puhul jääb su leht õigesti tööle.

Käsurealt `curl`-iga näeb algatustepäring koos filtri ja sorteerimise välja selline:

```sh
curl -H "Accept: application/vnd.rahvaalgatus.initiative+json; v=1" "https://rahvaalgatus.ee/initiatives?phase=sign&order=-signatureCount&limit=5"
```

Kui tahaksid ligipääsu infole, mida me hetkel APIs ei väljasta, palun [anna meile sellest GitHubi kaudu teada](https://github.com/rahvaalgatus/rahvaalgatus/issues).

### <a name="local-initiatives-api"></a> Kohalike algatuste loetelu
Rahvaalgatuses saab esitada algatusi nii Riigikogule kui ka kohalikele omavalitsustele. Kui tahaksid kuvada vaid oma rajooni või maakonna algatusi, saad päringule lisada soovitud omavalitsuste loendi.

<div id="example-local-initiatives" class="example">
  <h3>Algatused Pärnu maakonnas</h3>

  <ol id="example-local-initiatives-list"></ol>

  <script>!function() {
    var path = "/initiatives"
    path += "?for[]=häädemeeste-vald"
    path += "&for[]=kihnu-vald"
    path += "&for[]=lääneranna-vald"
    path += "&for[]=põhja-pärnumaa-vald"
    path += "&for[]=pärnu-linn"
    path += "&for[]=saarde-vald"
    path += "&for[]=tori-vald"

    fetch(path, {
      headers: {Accept: "application/vnd.rahvaalgatus.initiative+json; v=1"}
    }).then(getJson).then(function(initiatives) {
      var ol = document.getElementById("example-local-initiatives-list")

      initiatives.forEach(function(initiative, i) {
        var li = document.createElement("li")

        var a = document.createElement("a")
        a.href = "/initiatives/" + initiative.id
        a.textContent = initiative.title
        li.appendChild(a)

        ol.appendChild(li)
      })
    })
  }()</script>
</div>

Sihtpunkti järgi filtreerimiseks lisa [`https://rahvaalgatus.ee/initiatives`](https://app.swaggerhub.com/apis-docs/rahvaalgatus/rahvaalgatus/1#/Initiatives/get_initiatives) päringule `for` parameeter.  Näiteks Läneranna valla algatuste jaoks `for=lääneranna-vald`. Riigikokku suunatud algatuste jaoks `for=parliament`. Eesti omavalitsuste identifikaatorid leiad [Rahvaalgatuse kohalike omavalitsuste JSON failist](https://github.com/rahvaalgatus/rahvaalgatus/blob/master/lib/local_governments.json).

Vajadusel saad pärida ka mitme sihtkoha algatusi korraga. Kasuta selleks `for[]=lääneranna-vald&for[]=pärnu-linn` mustrit.

Eelneva näite implementeerimiseks alustame taas loetelu elemendist:

```html
<ol id="initiatives"></ol>
```

Algatuste loeteluks filtreerimiseks lisa [`https://rahvaalgatus.ee/initiatives`](https://app.swaggerhub.com/apis-docs/rahvaalgatus/rahvaalgatus/1#/Initiatives/get_initiatives) päringule maakonna identifikaatorid `for` väljas. Kuna soovime kõikide Pärnu maakonna omavalitsuste algatusi, siis [Rahvaalgatuse kohalike omavalitsuste JSON failist](https://github.com/rahvaalgatus/rahvaalgatus/blob/master/lib/local_governments.json) otsime välja need omavalitsused, kus `county` on "Pärnu", ja lisame nad `for[]` parameetrisse:

```javascript
var URL = "https://rahvaalgatus.ee"
var path = "/initiatives"
path += "?for[]=häädemeeste-vald"
path += "&for[]=kihnu-vald"
path += "&for[]=lääneranna-vald"
path += "&for[]=põhja-pärnumaa-vald"
path += "&for[]=pärnu-linn"
path += "&for[]=saarde-vald"
path += "&for[]=tori-vald"

fetch(URL + path, {
  headers: {Accept: "application/vnd.rahvaalgatus.initiative+json; v=1"}
}).then(function(res) { return res.json() }).then(function(body) {
  var ol = document.getElementById("initiatives")

  initiatives.forEach(function(initiative, i) {
    var li = document.createElement("li")

    var a = document.createElement("a")
    a.href = URL + "/initiatives/" + initiative.id
    a.textContent = initiative.title
    li.appendChild(a)

    ol.appendChild(li)
  })
})
```


Käsurealt `curl`-iga näeb kohalike algatuste päring välja selline:

```sh
curl -H "Accept: application/vnd.rahvaalgatus.initiative+json; v=1" "https://rahvaalgatus.ee/initiatives?for[]=häädemeeste-vald&for[]=kihnu-vald&for[]=lääneranna-vald&for[]=põhja-pärnumaa-vald&for[]=pärnu-linn&for[]=saarde-vald&for[]=tori-vald"
```


<a name="initiative-signatures-api"></a> Algatuse allkirjade arv
----------------------------------------------------------------
Ehk soovid oma algatuse reklaamlehel kuvada loendurit, mitu allkirja oled juba kogunud:

<div id="example-initiative" class="example">
  Algatus "<a href="https://rahvaalgatus.ee/initiatives/d400bf12-f212-4df0-88a5-174a113c443a">Lendorava ja metsade kaitseks</a>" on kogunud…<br />
  <output id="example-initiative-count">…</output><br />
  Allkirja

  <script>!function() {
    var URL = "https://rahvaalgatus.ee"

    fetch(URL + "/initiatives/d400bf12-f212-4df0-88a5-174a113c443a", {
      headers: {Accept: "application/vnd.rahvaalgatus.initiative+json; v=1"}
    }).then(getJson).then(function(body) {
      var el = document.getElementById("example-initiative-count")
      el.textContent = body.signatureCount
    })
  }()</script>
</div>

Oma algatuse allkirjade arvu saad pärida [`https://rahvaalgatus.ee/initiatives/{initiativeUuid}`](https://app.swaggerhub.com/apis-docs/rahvaalgatus/rahvaalgatus/1#/Initiatives/get_initiatives__initiativeUuid_) aadressilt.

Algatuse id `d400bf12-f212-4df0-88a5-174a113c443a` puhul näeks loenduri HTML ja JavaScript välja umbes selliselt:

```html
Algatus "Lendorava ja metsade kaitseks" on kogunud <span id="count"></span> allkirja.
```

```javascript
var URL = "https://rahvaalgatus.ee"

fetch(URL + "/initiatives/d400bf12-f212-4df0-88a5-174a113c443a", {
  headers: {Accept: "application/vnd.rahvaalgatus.initiative+json; v=1"}
}).then(function(res) { return res.json() }).then(function(body) {
  document.getElementById("count").textContent = body.signatureCount
})
```

Oluline on teha päring `Accept: application/vnd.rahvaalgatus.initiative+json; v=1` päisega. Ilma selleta ei tea server, et soovid teha API päringu, ja tagastab sulle hoopis HTMLi. `v=1` aga määrab API versiooni. See garanteerib, et API muudatuste puhul jääb su leht õigesti tööle.

Käsurealt `curl`-iga näeb algatusepäring välja selline:

```sh
curl -H "Accept: application/vnd.rahvaalgatus.initiative+json; v=1" "https://rahvaalgatus.ee/initiatives/d400bf12-f212-4df0-88a5-174a113c443a"
```

Kui tahaksid ligipääsu infole, mida me hetkel APIs ei väljasta, palun [anna meile sellest GitHubi kaudu teada](https://github.com/rahvaalgatus/rahvaalgatus/issues).


<a name="initiative-events-api"></a> Algatuste menetlusinfo
-----------------------------------------------------------
Igal algatusega on seotud ka menetlusinfot, kus kajastuvad sündmused allkirjastamisest ning käekäigust Riigikogus ja valitsusasutustes. Menetlusinfot saab pärida kõikide algatuste kohta [`https://rahvaalgatus.ee/initiative-events`](https://app.swaggerhub.com/apis-docs/rahvaalgatus/rahvaalgatus/1#/Initiatives/get_initiative_events) aadressilt.

Viie viimati uuendatud menetlusinfoga algatuse kuvamine võib välja näha selliselt:

<div id="example-initiative-events" class="example">
  <h3>Värske menetlusinfoga algatused</h3>
  <ol>
    <li>…</li>
    <li>…</li>
    <li>…</li>
    <li>…</li>
    <li>…</li>
  </ol>

  <script>!function() {
    var path = "/initiative-events"
    path += "?include=initiative"
    path += "&distinct=initiativeId"
    path += "&order=-occurredAt"
    path += "&limit=5"
    fetch(path, {
      headers: {
        Accept: "application/vnd.rahvaalgatus.initiative-event+json; v=1"
      }
    }).then(getJson).then(function(events) {
      var el = document.getElementById("example-initiative-events")
      var ol = el.querySelector("ol")

      events.forEach(function(event, i) {
        var li = ol.children[i]
        while (li.lastChild) li.removeChild(li.lastChild)

        var a = document.createElement("a")
        a.href = "/initiatives/" + event.initiativeId
        a.textContent = event.initiative.title
        li.appendChild(a)

        li.appendChild(document.createTextNode(": "))

        a = document.createElement("a")
        a.href = "/initiatives/" + event.initiativeId + "/events/" + event.id
        a.textContent = event.title
        li.appendChild(a)
      })
    })
  }()</script>
</div>

Kõigepealt teeme päringu `https://rahvaalgatus.ee/initiative-events` aadressile, küsides algatuste sündmusi toimumise järjekorras, uuemad enne (`order=-occurredAt`). Piirdume viie tagastatud sündmusega (`limit=5`) ja selleks, et kuvada menetlusinfo pealkirja kõrval ka algatuse pealkirja, palume lisada ka algatuse info (`include=initiative`). Et mitte kuvada sama algatust nimekirjas kaks korda, lisame ka `distinct=initiativeId`, mis eemaldab duplikaadid peale sorteerimist.

```html
<ol id="initiative-events"></ol>
```

```javascript
var URL = "https://rahvaalgatus.ee"
var path = "/initiative-events"
path += "?include=initiative"
path += "&distinct=initiativeId"
path += "&order=-occurredAt"
path += "&limit=5"

fetch(URL + path, {
  headers: {
    Accept: "application/vnd.rahvaalgatus.initiative-event+json; v=1"
  }
}).then(getJson).then(function(events) {
  var ol = document.getElementById("initiative-events")

  events.forEach(function(event, i) {
    var li = document.createElement("li")

    var a = document.createElement("a")
    a.href = URL + "/initiatives/" + event.initiativeId + "/events/" + event.id
    a.textContent = event.initiative.title
    li.appendChild(a)
    li.appendChild(document.createTextNode(": " + event.title))

    ol.appendChild(li)
  })
})
```

Oluline on teha päring `Accept: application/vnd.rahvaalgatus.initiative-event+json; v=1` päisega. Ilma selleta ei tea server, et soovid teha API päringu, ja tagastab sulle hoopis HTMLi. `v=1` aga määrab API versiooni. See garanteerib, et API muudatuste puhul jääb su leht õigesti tööle.

Käsurealt `curl`-iga näeb menetlusinfopäring koos filtri ja sorteerimisega välja selline:

```sh
curl -H "Accept: application/vnd.rahvaalgatus.initiative-event+json; v=1" "https://rahvaalgatus.ee/initiative-events?include=initiative&&order=-occurredAt&limit=5"
```

Kui tahaksid ligipääsu infole, mida me hetkel APIs ei väljasta, palun [anna meile sellest GitHubi kaudu teada](https://github.com/rahvaalgatus/rahvaalgatus/issues).
