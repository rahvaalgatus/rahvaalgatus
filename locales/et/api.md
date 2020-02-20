API
===
Rahvaalgatusel on **avalik API**, mida saab kasutada nii serveri kui ka brauseri kaudu. Nii saab soovi korral kuvada algatusi ja kogutud allkirjade arvu ka väljaspool Rahvaalgatust. Nõnda kasutab seda näiteks [Karusloomafarmide keelustamise kampaania](https://www.aitankarusloomi.ee) oma lehel.

Kogu **API dokumentatsioon** on loetav [SwaggerHubis](https://app.swaggerhub.com/apis-docs/rahvaalgatus/rahvaalgatus) ja masinloetavalt OpenAPI v3 formaadis [`openapi.yaml`](https://github.com/rahvaalgatus/rahvaalgatus/blob/master/openapi.yaml) failis.

Kombineerides erinevaid API päringuid saad enda lehel kuvada näiteks koondvaate Rahvaalgatuses toimuvast:

<div id="example-full" class="example">
  <h3>Mis ettepanekuid rahvas Riigikogule saadab?</h3>
  <p>Arutelu käib <strong class="edit-count">…</strong> idee üle ja toetust koguvad <strong class="sign-count">…</strong> algatust.</p>

  <h3>7 päeva jooksul enim toetust kogunud algatused</h3>
  <ol class="signed">
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
        stats.initiativeCountsByPhase.edit
      el.querySelector(".sign-count").textContent =
        stats.initiativeCountsByPhase.sign
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
  }()</script>
</div>

Eelnev näide kasutab Rahvaalgatuse **statistika**, **algatuste** ja **menetlusinfo API**-sid. All leiad kõigi kolme kohta näiteid, viited dokumentatsioonile ning koodijuppe kasutuseks.


Algatuste statistika
--------------------
Kui soovid veebilehele lisada kõikide algatuste koondarvu, saad selle info [`https://rahvaalgatus.ee/statistics`](https://app.swaggerhub.com/apis-docs/rahvaalgatus/rahvaalgatus/1#/Statistics/get_statistics) aadressilt.

<div id="example-statistics" class="example">
  <h3>Mis ettepanekuid rahvas Riigikogule saadab?</h3>
  <p>Arutelu käib <strong class="edit-count">…</strong> idee üle ja toetust koguvad <strong class="sign-count">…</strong> algatust.</p>

  <script>!function() {
    var el = document.getElementById("example-statistics")

    fetch("/statistics", {
      headers: {Accept: "application/vnd.rahvaalgatus.statistics+json; v=1"}
    }).then(getJson).then(function(stats) {
      el.querySelector(".edit-count").textContent =
        stats.initiativeCountsByPhase.edit
      el.querySelector(".sign-count").textContent =
        stats.initiativeCountsByPhase.sign
    })
  }()</script>
</div>

Statistikapäringuga saad teada algatuste arvu faaside lõikes ning allkirjade summa. Ülemise näite saad teha selliselt:

```html
Arutelu käib <strong id="edit-count">…</strong> idee üle ja
toetust koguvad <strong id="sign-count">…</strong> algatust.
```

```javascript
fetch("https://rahvaalgatus.ee/statistics", {
  headers: {Accept: "application/vnd.rahvaalgatus.statistics+json; v=1"}
}).then(function(res) { return res.json() }).then(function(stats) {
  document.getElementById("edit-count").textContent =
    stats.initiativeCountsByPhase.edit
  document.getElementById("sign-count").textContent =
    stats.initiativeCountsByPhase.sign
})
```

Oluline on teha päring `Accept: application/vnd.rahvaalgatus.statistics+json; v=1` päisega. Ilma selleta ei tea server, et soovid teha API päringu, ja tagastab sulle hoopis HTMLi. `v=1` aga määrab API versiooni. See garanteerib, et API muudatuste puhul jääb su leht õigesti tööle.

Kui tahaksid ligipääsu statistikale, mida me hetkel ei väljasta, palun [anna meile sellest GitHubi kaudu teada](https://github.com/rahvaalgatus/rahvaalgatus/issues).


Algatuste loetelu
-----------------
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
    fetch("/initiatives?phase=sign&order=-signatureCount&limit=5", {
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

Algatusi pärides saad ka määrata, kuidas neid järjestada, filtreerida algatuse faasi järgi ning piirata tagastatud algatuste arvu. Määrame, et soovime ainult allkirjastamises olevaid algatusi (`phase=sign`), sorteerida nad allkirjade järgi kasvavas järjekorras (`order=-signatureCount`) ja ainult esimest viite (`limit=5`):

```javascript
var URL = "https://rahvaalgatus.ee"

fetch(URL + "/initiatives?phase=sign&order=-signatureCount&limit=5", {
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

Kui tahaksid ligipääsu infole, mida me hetkel APIs ei väljasta, palun [anna meile sellest GitHubi kaudu teada](https://github.com/rahvaalgatus/rahvaalgatus/issues).


Algatuse allkirjade arv
-----------------------
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

Kui tahaksid ligipääsu infole, mida me hetkel APIs ei väljasta, palun [anna meile sellest GitHubi kaudu teada](https://github.com/rahvaalgatus/rahvaalgatus/issues).
