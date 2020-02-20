API
===
Rahvaalgatusel on **avalik API**, mida saab kasutada nii serveri kui ka brauseri kaudu. Nii saab soovi korral kuvada algatusi ja kogutud allkirjade arvu ka väljaspool Rahvaalgatust. Nõnda kasutab seda näiteks [Karusloomafarmide keelustamise kampaania](https://www.aitankarusloomi.ee) oma lehel.

Kogu **API dokumentatsioon** on loetav [SwaggerHubis](https://app.swaggerhub.com/apis-docs/rahvaalgatus/rahvaalgatus) ja masinloetavalt OpenAPI v3 formaadis [`openapi.yaml`](https://github.com/rahvaalgatus/rahvaalgatus/blob/master/openapi.yaml) failis. All on mõned näited ja koodijupid, kuidas API-t kasutada.

<script>
  function getJson(res) { return res.json() }
</script>

## Algatuse allkirjade arv
Ütleme, et soovid oma algatuse lehel kuvada loendurit, mitu allkirja oled juba kogunud. Umbes selliselt:

<div id="example-initiative" class="example">
  Algatus "<a href="https://rahvaalgatus.ee/initiatives/d400bf12-f212-4df0-88a5-174a113c443a">Lendorava ja metsade kaitseks</a>" on kogunud…<br />
  <output id="example-initiative-count">…</output><br />
  Allkirja

  <script>
    var URL = "https://rahvaalgatus.ee"

    var res = fetch(URL + "/initiatives/d400bf12-f212-4df0-88a5-174a113c443a", {
      headers: {Accept: "application/vnd.rahvaalgatus.initiative+json; v=1"}
    })

    res.then(getJson).then(function(body) {
      var el = document.getElementById("example-initiative-count")
      el.textContent = body.signatureCount
    })
  </script>
</div>

Allkirjade arvu oma algatuse kohta saad kätte [`https://rahvaalgatus.ee/initiatives/{initiativeUuid}`](https://app.swaggerhub.com/apis-docs/rahvaalgatus/rahvaalgatus/1#/Initiatives/get_initiatives__initiativeUuid_) aadressilt.

Kui su algatuse id on `d400bf12-f212-4df0-88a5-174a113c443a` ning soovid allkirjade arvu kuvada loendurina oma veebilehel, näeks HTML ja JavaScript välja umbes selline:

```html
Algatus "Lendorava ja metsade kaitseks" on kogunud <span id="count"></span> allkirja.
```

```js
var URL = "https://rahvaalgatus.ee"

var res = fetch(URL + "/initiatives/d400bf12-f212-4df0-88a5-174a113c443a", {
  headers: {Accept: "application/vnd.rahvaalgatus.initiative+json; v=1"}
})

res.then(function(res) { return res.json() }).then(function(body) {
  document.getElementById("count").textContent = body.signatureCount
})
```

Oluline on teha päring `Accept: application/vnd.rahvaalgatus.initiative+json; v=1` päisega. Ilma selleta ei tea server, et soovid teha API päringu, ja tagastab sulle hoopis HTMLi. `v=1` aga määrab ära API versiooni. See garanteerib, et API muudatuste puhul jääb su leht õigesti tööle.
