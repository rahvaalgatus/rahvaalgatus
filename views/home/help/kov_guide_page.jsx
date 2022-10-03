/** @jsx Jsx */
var Jsx = require("j6pack")
var Page = require("../../page")

module.exports = function(attrs) {
	var {req} = attrs

	return <Page page="kov-guide" title="KOV juhend" req={req}>
		<section id="intro" class="primary-section"><center>
			<h1>Kollektiivsete algatuste menetlemise juhend kohalikule omavalitsusele</h1>

			<aside id="toc">
				<img src="/help/kov-guide/house.svg" alt="" />

				<ul>
					<li>
						<a href="#process-visualization">Protsessi illustreeriv juhend</a>
					</li>

					<li>
						<a href="#process-description">Menetlusprotsessi kirjeldus ja järjekord</a>
					</li>

					<li>
						<a href="#validation-guide">Digiallkirjade kontrollimise juhend</a>
					</li>

					<li>
						<a href="#examples">Head näited</a>
					</li>

					<li>
						<a href="#law">Seaduse muutmise eelnõu</a>
					</li>
				</ul>
			</aside>

			<p>Rahvaalgatus.ee on Eesti Koostöö Kogu hallatav arutelude pidamise ja ettepanekute koostamise platvorm, mille kaudu saab kohalikule omavalitsusele esitada kollektiivseid algatusi. Nii saavad kodanikud ning huvikaitse- ja katusorganisatsioonid kohalikus valitsemises kaasa rääkida, samuti võimaldab see kohalikul omavalitsusel olla teadlik kogukonda kõnetavatest teemadest ja probleemidest.</p>

			<p><span class="tagline">Kohaliku rahva kaasamine, ärakuulamine ja teavitamine on avatud valitsemise alustalad.</span></p>

			<p>Kohaliku omavalitsuse korralduse seaduse (KOKS) §-s 32 on kirjas praegu ainus seadusega tagatud kodanikuõigus, mille alusel saavad omavalitsuse hääle­õiguslikud elanikud juhtida kollektiivselt tähelepanu kohaliku elu probleemidele ja teha nende lahendamiseks ettepanekuid.</p>

			<p>Aina rohkem kodanikke rakendab seda õigust platvormi Rahvaalgatus.ee abil.</p>
		</center></section>

		<section id="tagline" class="secondary-section"><center>
			<img src="/help/kov-guide/smiles.svg" alt="" />

			<p>Ärksate kodanike kaasamine otsustamisse näitab kohaliku omavalitsuse head tahet ning avatud valitsemise põhimõtete hindamist. Aktiivsed kohalikud on väärt ressurss, kellega koos elu paremaks muuta!</p>
		</center></section>

		<section id="process-visualization" class="primary-section"><center>
			<h2>Protsessi illustreeriv juhend</h2>

			<ol>
				<li>
					<img src="/help/kov-guide/phase-collect.svg" alt="" />
					<span>Ettepanekule allkirjade kogumine</span>
				</li>

				<li>
					<img src="/help/kov-guide/phase-sending.svg" alt="" />
					<span>1% allkirjade kokkusaamisel algatuse edastamine KOV-ile</span>
				</li>

				<li>
					<img src="/help/kov-guide/phase-validation.svg" alt="" />
					<span>Allkirjade hääleõiguslikkuse kontroll KOV-is</span>
				</li>

				<li>
					<img src="/help/kov-guide/phase-representative.svg" alt="" />
					<span>Algatuse esindajate kaasamine</span>
				</li>

				<li>
					<img src="/help/kov-guide/phase-discussion.svg" alt="" />
					<span>Arutelu kohalikus omavalitsuses või volikogus</span>
				</li>

				<li>
					<img src="/help/kov-guide/phase-feedback.svg" alt="" />
					<span>Tagasiside andmine</span>
				</li>
			</ol>
		</center></section>

		<section id="process-description" class="secondary-section"><center>
			<h2>Menetlusprotsessi kirjeldus ja järjekord</h2>

			<ol>
				<li>
					<img src="/help/kov-guide/1.svg" alt="1." />

					<aside>
						<p>Hoolimata praegu kehtiva seaduse sõnastusest ei peaks elanikud kohaliku elu küsimuses arvamuse avaldamise eeltingimusena omama õigusaktide vormistamise ja koostamise pädevust. Avatud valitsemise üks peamine juhtmõte on, et kogukond saab kaasa rääkida ning see on tervitatav.</p>
					</aside>

					<p>Kui kodanikud on portaalis Rahvaalgatus.ee loonud algatuse, võtab portaali esindaja ühendust kohaliku omavalitsusega, et neid sellest teavitada, ning küsib volitatud registripidaja isikukoodi.</p>
				</li>

				<li>
					<img src="/help/kov-guide/2.svg" alt="2." />

					<p>Kui algatus on kogunud vähemalt 1% omavalitsuse elanike allkirjadest ning algatuse esindaja on otsustanud selle KOV-ile esitada, edastatakse meiliaadressilt <a href="mailto:info@rahvaalgatus.ee">info@rahvaalgatus.ee</a> KOV-ile algatuse tekst koos digiallkirjadega.</p>
				</li>

				<li>
					<img src="/help/kov-guide/3.svg" alt="3." />

					<p>KOV kontrollib algatusele digiallkirja andnud inimeste hääleõiguslikkust, tehes päringu rahvastikuregistrisse.</p>
				</li>

				<li>
					<img src="/help/kov-guide/4.svg" alt="4." />

					<p>KOV annab aadressile <a href="mailto:info@rahvaalgatus.ee">info@rahvaalgatus.ee</a> märku digiallkirjade kontrolli lõpetamisest ning isikuandmed anonüümitakse ja kustutatakse portaali andmebaasist.</p>
				</li>

				<li>
					<img src="/help/kov-guide/5.svg" alt="5." />

					<aside>
						<p>Kogukonnaga arutamine enne lõplikke otsuseid näitab KOV-i head tahet.</p>
					</aside>

					<p>Algatus võetakse KOV-is kolme kuu jooksul arutlusele, kaasates valitsuse või volikogu istungile <strong>algatuse esindajad</strong> (KOKS § 32 p 3). Kui algatatud küsimus kuulub volikogu pädevusse, peab kohalik omavalitsus esitama selle ühe kuu jooksul koos omapoolse seisukohaga volikogule lahendamiseks.</p>
				</li>

				<li>
					<img src="/help/kov-guide/6.svg" alt="6." />

					<aside>
						<p>Oluline on anda kodanikele tagasisidet ka siis, kui nende ettepanekuid ei ole võimalik arvesse võtta. Laiema avaliku huviga algatuste puhul on hea tava koostada lisaks avalik teavitus või pressiteade.</p>
					</aside>

					<p>Pärast menetluse lõppu koostatakse vastuskiri, mis sisaldab arutelu tulemusi ning KOV-i seisukohti algatuse suhtes. Kiri laaditakse üles avalikku dokumendiregistrisse <strong>ilma juurdepääsupiiranguteta</strong> ning edastatakse nii algatuse esitajatele kui ka aadressile <a href="mailto:info@rahvaalgatus.ee">info@rahvaalgatus.ee</a>. Õigusliku tõlgenduse kohaselt loetakse KOKS-i §-i 32 alusel algatuse esitajateks peale koostaja või esindaja ka kõik need isikud, kes on algatusele oma allkirja andnud. Rahvaalgatus.ee hoiab menetlus­käiguga kursis kõiki selleks soovi avaldanud allkirjastajaid.</p>
				</li>
			</ol>
		</center></section>

		<section id="validation-guide" class="primary-section"><center>
			<h2>Digiallkirjade kontrollimise juhend</h2>

			<ol>
				<li>
					<img src="/help/kov-guide/1.svg" alt="1." />

					<p>Kui algatusele on kogunenud vähemalt 1% omavalitsuse elanike allkirjadest, võib algatuse esindaja saata KOV-ile automaatkirja, mis sisaldab linke failidele, mis näitavad digiallkirjade kehtivust (.asice) ning rahvastikuregistrist hääleõiguslikkuse kontrollimist (.csv).</p>
				</li>

				<li>
					<img src="/help/kov-guide/2.svg" alt="2." />

					<p>Dokumendi sisu nägemiseks ja allalaadimiseks on vajalik portaali sisse logida, kasutades selleks kas ID-kaarti, Mobiil-ID-d või Smart-ID-d. <strong>Failidele pääseb ligi vaid volitatud registripidaja, kelle isikukood on edastatud portaalile Rahvaalgatus.ee!</strong></p>
				</li>
			</ol>
		</center></section>

		<section id="examples" class="secondary-section"><center>
			<h2>
				<img src="/help/kov-guide/check.svg" alt="" />

				Head näited Rahvaalgatus.ee praktikast
			</h2>

			<h3>Loo veoautovabaks</h3>

			<img src="/help/kov-guide/loo-initiative.png" class="initiative-image" alt="" />

			<p>Jõelähtme valla elanikud moodustasid Loo veoautovabaks töögrupi ning 2021. aasta mais koostasid Rahvaalgatus.ee portaalis algatuse "<a href="https://kohalik.rahvaalgatus.ee/initiatives/a5e7bc12-7f50-426e-9175-01b3aab4c62a">Loo veoautovabaks!</a>". Allkirju koguti lisaks portaalile ka paberil ning 1. juulil edastati see menetlemiseks kohalikule omavalitsusele.</p>

			<p>Pöördumine võeti arutlusele <a href="https://kohalik.rahvaalgatus.ee/initiatives/a5e7bc12-7f50-426e-9175-01b3aab4c62a/files/1791">Jõelähtme vallavolikogu 19.08.2021 istungil</a>, kuhu olid kutsutud ka algatuse esitajate esindajad. Koos tõdeti, et tegemist on teemaga, mis väärib põhjalikumat käsitlemist. Vallavalitsusele tehti ülesandeks tõstatatud probleemidega tegelemise, sh teha koostööd kodanike töögrupiga, et leida piirkonna raske- ja transiitliikluse suunamiseks elanikkonda kõige vähem häirivamaid lahendusi.</p>

			<p><strong>Märkimist väärib</strong> see, et algatuse puhul ei järgitud vaid seadusest tulenevaid miinimumnõudeid, vaid probleemi teadvustati ning otsustati lahenduse leidmise osas teha kohaliku kogukonnaga ka edaspidi koostööd.</p>

			<h3>Nõuame Valga Vallavalitsuse kiiret tegutsemist, tagamaks Valga Linna lasteaedade kvaliteetne ja nõuetekohane toitlustamine</h3>

			<p>2021. aasta septembris koostasid Valga linna lapsevanemad algatuse "<a href="https://kohalik.rahvaalgatus.ee/initiatives/3450ea34-c43e-4d7d-99d7-79166b2024e6">Nõuame Valga Vallavalitsuse kiiret tegutsemist, tagamaks Valga Linna lasteaedade kvaliteetne ja nõuetekohane toitlustamine</a>", et juhtida tähelepanu lasteaedade toitlustamisteenusega seotud probleemkohtadele. Algatus saadeti kohalikule omavalitsusele menetlemiseks 22. septembril 2021. Valga vallavalitsus võttis toitlustusettevõte töö kõrgendatud tähelepanu alla ning korraldas kõikide osapoolte vahel mitmeid koosolekuid, et lasteaedade hoolekogude liikmetel ja lasteaedade töötajatel oleks võimalik märkused ja tähelepanekud OÜ Gurmanni juhatajale edasi anda. Oktoobri lõpus toimunud koosolekul selgus lasteaedade esindajate hinnangutest, et olukord on oluliselt paranenud ja osapooled on teenusega rahul. Probleeme kontrollis ka Terviseamet, kes tegi omalt poolt ettepanekud menüüde korrigeerimiseks. Valga Vallavalitsus saatis olukorra selgitamiseks välja avaliku pressiteate.</p>

			<p><strong>Märkimist väärib</strong> see, et vallavalitsus soosis kõikide osapoolte vahelist avatud suhtlust. Samuti saadeti välja pressiteade, mille koostamine on laiema avaliku huviga algatuste puhul heaks tavaks.</p>

			<h3>Kehra linna, Mulla tn 6 metsatuka säilitamine</h3>

			<p>Kui Anija vallavalitsus algatas 2021. aasta kevadel detailplaneeringu Mulla tänav 6 kinnistu kruntideks jagamiseks, koostasid kohalikud elanikud roheala ja metsatuka kaitsmiseks Rahvaalgatus.ee portaalis algatuse "<a href="https://kohalik.rahvaalgatus.ee/initiatives/72f98fe9-39d6-45c3-9169-75e7a14a729d">Kehra linna, Mulla tn 6 metsatuka säilitamine</a>". 18. mail edastati algatus menetlemiseks kohalikule omavalitsusele. Vallavanem Riivo Noore eestvedamisel asuti kiiret otsima kompromissi, mille tulemusel oleks võimalik vallal suurendada elamufondi ja seeläbi ka elanike arvu, kuid siiski arvestada ka praeguste elanike soove säilitada roheala. Vallavalitsuse tellimusel koostas arhitektuuribüroo neli eskiislahendust ning juulis toimus kokkusaamine, kus valiti välja kohalikele elanikele sobiv lahendus. Lisaks kohtumisele saadeti vallavalitsuse poolt teated ka meediasse ja kõikidele naaberkinnistute omanikele. Kuigi esialgu olid vallavalitsuse soovid suuremad, siis lõpptulemusena kavandatakse kinnistule 10 elamukrunti, mille vahele jääb 1 ha suurune metsatükk. Ka algatuse koostajad olid rahul, kuna nende häält võeti kuulda. Lisaks on kohalikel elanikel plaan luua mittetulundusühing, mis hakkab sälitatava metsatüki parkmetsaks kujundamisega tegelema.</p>

			<p><strong>Märkimist väärib see</strong>, et vallavalitsus näitas üles suurt aktiivsust kogukonna vajadusi ja soove arvestava kompromisslahenduse leidmisel.</p>

			<h3>Säästame elusid Randvere teel</h3>

			<p>Tammneeme elaniku algatusel paluti Viimsi vallavalitsusel pöörata tähelepanu tihedatele liiklusõnnetustele Randvere teel. Nii edastati üle 300 allkirja kokku saanud liikluspiiranguid taotlev algatus "<a href="https://kohalik.rahvaalgatus.ee/initiatives/04caa4f8-0919-4aba-b399-98a6472b578f">Säästame elusid Randvere teel</a>" märtsikuu lõpus menetlemiseks kohalikule omavalitsusele. Kuna tegemist oli hoopis Transpordiameti haldusalas oleva küsimusega, siis edastas Viimsi Vallavalitsus pöördumise Transpordiametile vastamiseks, lisades kaaskirja ka oma kommentaare seoses metsloomadega seotud lõikude selgema tähistamisega.</p>

			<p><strong>Märkimist väärib see</strong>, et omavalitsus näitas ka nende vastutusalast väljaspool oleva algatuse osas üles aktiivsust ja kaasas lahendusprotsessi Transpordiameti.</p>

			<h3>Soovime säilitada puud Viljandi Uuel tänaval</h3>

			<img src="/help/kov-guide/viljandi-initiative.png" class="initiative-image" alt="" />

			<p>Viljandi linna kodanikud lõid augustis 2021 algatuse "<a href="https://kohalik.rahvaalgatus.ee/initiatives/6d0a29fd-7383-4a45-ab99-daacf11fe94f">Soovime säilitada puud Viljandi Uuel tänaval</a>", et juhtida tähelepanu puude vajalikkusele linnaruumis. Rahvaalgatus.ee portaalis koguti algatusele üle 1300 digiallkirja ning koos lisaks kogutud paberile antud allkirjadega edastati see Viljandi linnavalitsusele menetlemiseks. Uue tänava rekonstrueerimise käigus oli algatuse menetlemise hetkeks juba puud maha võetud, kuid Tartu tänava puude osas saavutas algatus oma eesmärgi. Linnavalitsus tõdes, et ei toimunud piisavalt varajast linnakodanike kaasamist, kuid nägi selles vajadust tulevikus.</p>

			<p><strong>Märkimist väärib see</strong>, et algatuses välja toodud laiemate probleemid osas toimus algatuse esindajatega avatud arutelu. Samuti tuldi algatuses välja toodud ettepanekule vähemalt osaliselt vastu ning tõdeti, et see on märk koostööst linnavalitsuse ja -elanike vahel, mis aitab linnakeskkonda muuta kaunimaks ja paremaks.</p>
		</center></section>

		<section id="law" class="primary-section"><center>
			<h2>Kohaliku omavalitsuse korralduse seaduse (KOKS) muutmise eelnõu</h2>

			<img src="/help/kov-guide/paragraph.svg" class="paragraph-icon" alt="" />

			<p>Kehtiv KOKS-i § 32 sätestab, et elanikud peavad esitama valla- või linnavalitsusele oma ettepaneku eelnõuna, mis jätab KOV-ile õiguse pöördumine tagasi lükata, kui see ei ole kõigile KOV-i õigusakti eelnõule esitatavatele nõuetele vastavana vormistatud.</p>

			<p><a href="https://omavalitsus.fin.ee/koks/">KOKS-i muutmise eelnõu seletuskirjas</a> on rahandusministeerium välja toonud, et valla- või linnaelanikud <strong>ei peaks kohaliku elu küsimuses arvamuse avaldamise eeltingimusena omama õigusaktide vormistamise ja koostamise pädevust</strong>.</p>

			<p>Seega ei saa elanike algatuse arutelu jätta KOV-i otsustusorganites pidamata seetõttu, et algatus ei ole esitatud korrektselt vormistatud eelnõuna. Lõikest kaotatakse eelnõu vastav nõue ning lisatakse selgitus, et <strong>algatuses tuleb teha ettepanek, kuidas kehtivat regulatsiooni muuta või kohalikku elu paremini korraldada, ning lisada põhjendus, miks kehtiv olukord ei rahulda ja kuidas algatuses esitatud ettepanek olukorda parandaks</strong>.</p>

			<p>Eraldi on lõikes välja toodud kohustus kõik esitatud <strong>algatused avalikustada</strong>. Kuna algatuste eesmärk on edendada kogukondlikku koostööd ja arutelukultuuri, peaksid esitatud algatused koos informatsiooniga nende menetluse kohta olema elanikele lihtsasti leitavad.</p>
		</center></section>
	</Page>
}