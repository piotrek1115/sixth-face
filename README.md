# Sixth Face — prototyp gry taktycznej na kościach

**Każda jednostka to fizyczna kość D6. Nie przesuwasz pionka — przetaczasz kość.**
Przetoczenie jednocześnie zmienia pozycję **i** aktywną zdolność, bo na wierzchu
ląduje inna ścianka. To jest cały rdzeń gry i całe źródło decyzji.

To prototyp odpowiadający na jedno pytanie: *czy to daje ciekawą taktykę?*
Nie jest to gotowa gra i nie udaje takiej.

---

## Odpalenie (2 minuty)

Wymagany Node 18+.

```bash
npm install
npm run dev
```

Otwórz adres, który wypisze Vite (domyślnie `http://localhost:5173`).

```bash
npm test          # 58 testów logiki, bez przeglądarki
npm run build     # build produkcyjny do dist/
```

**Na start:** kliknij **▶ Auto-Play** i obejrzyj całą partię AI kontra AI (~20 tur).
Potem **? Rules** — pełna ściąga z rozrysowanymi kostkami. Potem zagraj sam.

### Sterowanie

Kliknij kość, żeby ją wybrać. Wokół niej pojawiają się **cztery fioletowe
zakładki** — po jednej na krawędź — i każda pokazuje **nazwę ścianki, która
wyjdzie na wierzch**, jeśli przewrócisz kość w tę stronę. Podwójne kliknięcie
zakładki wykonuje ten obrót w miejscu (2 AP, kość zostaje na polu).

Pola dostępne do ruchu podświetlają się na turkusowo. Najechanie na pole
pokazuje na nim **`Roll → nazwa`** — ściankę, którą dostaniesz, jeśli tam
dojedziesz rollem. Jedno kliknięcie = **Step** (1 AP, ścianka bez zmian),
podwójne = **Roll** (2 AP, ścianka się zmienia). Przeciągnięcie zawsze robi
Step. Pole ataku jest czerwone.

**Zatrzymaj kursor na sekundę** na czymkolwiek, co nazywa ściankę — na
zakładce, na podświetlonym polu albo na nazwie aktywnej ścianki nad kością —
a pojawi się jedno zdanie, co ta ścianka robi. Panel po prawej ma te same
akcje jako zwykłe przyciski, jeśli wolisz nie zgadywać.

---

## Stan prototypu — co jest udowodnione, a co nie

**Działa i jest przetestowane:**
kompletna pętla rozgrywki od ustawienia do zwycięstwa, fizyka kości jako jedno
źródło prawdy, drabinka obrażeń, wszystkie zdolności ścian, AI grające obie
strony, tryb własnego ustawienia armii.

**Nie jest udowodnione: czy to jest przyjemne.**
Wszystkie decyzje balansowe (2 AP, drabinka, tryb rally) opierają się na
symulacjach AI kontra AI. To świetny detektor zakleszczeń — realnie wyłapał ich
pięć — ale **kiepski miernik frajdy**. Nikt jeszcze nie przegrał tej gry i się
przy tym nie wkurzył. To jest teraz najważniejsza luka.

---

## Mechanika

### Tura

**2 AP na całą stronę na turę.** Nie na jednostkę — na armię. Można wykonać
dwie tanie akcje jedną jednostką, albo po jednej dwiema.

| Akcja | Koszt | Efekt |
|---|---|---|
| **Step** | 1 AP | jedno pole, dowolny kierunek, ścianka **bez zmian** |
| **Roll** | 2 AP | jedno pole, dowolny kierunek, **zmienia ściankę** |
| **Tip in place** | 2 AP | zostaje na polu, **zmienia ściankę** |
| **Face ⟳⟲** | 1 AP | obrót kierunku patrzenia, ścianka bez zmian |
| **Attack** | 1 AP | tylko gdy na wierzchu jest ścianka ataku, prosto przed siebie |

Rozdzielenie **Step / Roll** to sedno ekonomii: ruch jest tani, ale zmiana
zdolności kosztuje. **Tip in place** istnieje, bo bez niego jednostka wciśnięta
w zwarcie nie mogła zmienić ścianki — każdy roll oddawał wywalczone pole.

### Kość

Sześć ścian. Na górze **Guard** na starcie, naprzeciw niego **Wounded**.
Pozostałe cztery to zdolności, różne dla każdej jednostki.

**Zasada przeskoku:** własny roll **nigdy** nie zatrzyma się na Wounded — kość
obraca się o jedno oczko dalej, ale nadal przejeżdża **dokładnie jedno pole**.
Nie da się zranić samego siebie ruchem.

Ta zasada jest konstrukcyjnie kluczowa. Bez niej mieliśmy sprzeczność nie do
rozwiązania: ścianka śmierci **musi** leżeć na osi, wzdłuż której toczy się
walka (inaczej walka czołowa nie może zabić — zmierzone: z północy nigdy), ale
**nie może** tam leżeć (bo marsz dwa pola do przodu sam by cię ranił). Przeskok
rozcina to na pół.

### Walka

```
Guard  ──cios czołowy──▶  rozbrojony  ──cios──▶  Wounded  ──cios──▶  śmierć
Guard  ──cios z flanki──────────────────────▶  Wounded  ──cios──▶  śmierć
```

**Czołowo 3 trafienia, z flanki 2.** Guard chroni tylko od przodu — cios z boku
lub od tyłu przewraca kość i pomija szczebel rozbrojenia.

**Ranny** nie blokuje, nie atakuje, nie rolluje i nie obraca się — dostaje jeden
krok za 1 AP na turę. I co ważne: te ograniczenia **nie wymagają żadnej reguły**.
Skoro Wounded jest na wierzchu, to Guard nie jest (więc nic nie blokuje) i żaden
atak nie jest (więc nic nie uderza). Stan siedzi w samej kości.

**Zero punktów życia, zero żetonów, zero liczników.** Kość *jest* stanem.

### Zdolności ścian

| Ścianka | Efekt |
|---|---|
| **Guard** | cios czołowy pochłonięty — bez rany, ale Guard zostaje strącony |
| **Strike / Chop / Crush / Smash** | zwykły atak, zasięg 1 |
| **Thrust** | atak o zasięgu 2 — jedyna broń z wyciągiem |
| **Bash** | atak + odepchnięcie o pole; atakujący wchodzi w zwolnione miejsce |
| **Advance** | krok przesuwa o 2 pola za to samo 1 AP |
| **Rush** | roll kosztuje 1 AP zamiast 2 |
| **Riposte** | przeżyjesz cios z tym na wierzchu → darmowa kontra |
| **Brace** | wróg **wepchnięty** na pole przed tobą dostaje darmowe trafienie |
| **Stagger** | każde trafienie w ciebie odpycha, nawet takie, które normalnie nie |
| **Roar** | sąsiedni wrogowie tracą blok Guardem |
| **Command / Waaagh** | +1 AP dla armii, ale dowódca sam nie może działać w tej turze |

### Zwycięstwo

Wyeliminuj dowódcę przeciwnika. Nie trzeba wybić armii — jak mat w szachach.

### Frakcje

**Ludzie** — jeden atak, potem mobilność. Na bok wychodzi im `Advance`.
**Orkowie** — atak także na ściance bocznej. W którą stronę się nie przetoczą,
coś uderza.

Kluczowe: różnica frakcji siedzi w **układzie ścian**, nie w statystykach.

---

## Decyzje projektowe i dlaczego

Każda z tych liczb jest zmierzona na symulacjach, nie wyczuta.

**2 AP, nie 3.** Przy 3 AP jedna jednostka dochodzi do dowódcy i zabija go w tej
samej turze (zabicie z flanki to dwa ataki) — przeciwnik nie dostaje okna na
reakcję. Zmierzone: 3 AP → koniec w turze 5, 2 poległych. 2 AP → tura 62,
5 poległych, czyli realna bitwa na wyniszczenie.

**Odpychanie ciągnie atakującego za sobą.** Bez tego 88% ataków rozrywało
zwarcie, atakujący nigdy nie zdążał trafić drugi raz, rany się nie kumulowały
i gra stała w miejscu przez 2456 tur z jednym trupem.

**Rally kosztuje dowódcę jego turę.** Wersja darmowa (+1 AP bez kosztu) skracała
grę z 24 do 7 tur — bo +1 przy bazie 2 to +50% tempa. Wersja „aura dla
sąsiadów" wypadła jeszcze gorzej: przez całą grę zadziałała 3 razy, a przy tym
mierzalnie ciągnęła dowódcę w stronę wroga (średni dystans 3.63 → 3.07). Ryzyko
bez nagrody. Zwiększenie zasięgu aury **pogorszyło** wynik, co wykluczyło
„za mały zasięg" jako przyczynę: zniżka dotyczy tylko rolli, a rolle to
mniejszość akcji.

**Obrót przy trafieniu wybierają reguły, nie kierunek ciosu.** To świadoma
zamiana: obrażenia stały się w pełni przewidywalne (3 czołowo / 2 z flanki)
kosztem tego, że obrót nie jest już czystą fizyką odepchnięcia.

---

## Co jest niepewne — najciekawsze pytania dla oceniającego

1. **Czy zwarcie jest przyjemne czy upierdliwe?** Żeby zmienić ściankę, trzeba
   się ruszyć albo zapłacić 2 AP za obrót w miejscu. To jest sedno gry i
   największa niewiadoma.
2. **Czy zdolności w ogóle są widoczne?** Roar, Brace i Riposte odpalają się
   automatycznie — gracz widzi tylko efekt w logu. Możliwe, że to szum.
3. **Czy 12 przycisków ruchu to nie za dużo** jak na grę o sześciennej kości.
4. **Obrażenia to po cichu 3-punktowe HP** narysowane na sześcianie. Brief
   zakazywał HP. Bez drabinki gra się nie kończyła, więc to była zamiana, nie
   ulepszenie — ale warto wiedzieć, że została zrobiona.

---

## Pomysł na rozwój

### Armie zmieniają mechanikę, nie tylko grafikę

To jest cała teza produktu. Nowa armia to **inny układ sześciu ścian**, a nie ta
sama kość w innym kolorze. Ponieważ toczenie w jedną stronę odwiedza tylko
cztery z sześciu ścian, **sąsiedztwo ścian jest projektem**: kość z `Strike` obok
`Advance` gra zupełnie inaczej niż taka, gdzie `Strike` leży naprzeciw.

Kierunki, które trzymają rdzeń, a zmieniają grę:

| Armia | Co łamie w rdzeniu |
|---|---|
| **Ludzie** | formacja i reakcja — nagradzają wzajemne wsparcie *(jest)* |
| **Orkowie** | napór — atak także na boku, zawsze grożą *(jest)* |
| **Krasnoludy** | **nie da się ich odepchnąć.** Roll kosztuje 3 AP, ale Guard blokuje też z flanki. Mur, który trzeba obejść, a nie przewrócić |
| **Elfy** | **dwie ścianki ruchu zamiast jednej.** Roll za 1 AP, ale giną od 2 ciosów czołowo. Szybkie i kruche |
| **Nieumarli** | **nie mają ścianki Wounded.** Zamiast tego `Rise` — trafione znikają na turę i wracają. Zabicie ich wymaga innego rytmu |
| **Ogry** | **jedna kość zajmuje 2×2 pola.** Cztery ścianki zamiast sześciu, każdy atak pcha |
| **Kult** | ścianki **zmieniają się w trakcie partii** — kość ma nadruki, które się odsłaniają |

Każda z tych armii to inny zestaw fizycznych kości. **Kupując armię, kupujesz
inną maszynę, nie skórkę** — i to jest odpowiedź na „czemu ktoś miałby dokupić
drugi zestaw".

### Estetyka

Kość jako jednostka daje coś, czego figurki nie mają: **cały stan armii widać
jednym spojrzeniem na stół.** Nie ma kart, żetonów, liczników ran ani kostek
obok jednostek. Plansza jest czysta, a mimo to pełna informacji.

Obecny kierunek wizualny — rzeźbiona rama, kamień i drewno, twarz frakcji na
każdej ściance — celowo idzie w stronę **fizycznego przedmiotu**, nie ikonek z
gry mobilnej. Docelowo: kości jako realny produkt, aplikacja jako sposób na
naukę i granie zdalnie.

### Dlaczego ktoś miałby to kupić

- **Zerowy setup.** Wysypujesz kości, ustawiasz, grasz. Bez tabelek i kart.
- **Zasady mieszczą się na kartce**, a decyzje nie są proste. To rzadkie połączenie.
- **Kolekcjonerskie z natury.** Kość jest ładna sama w sobie i jest jednocześnie
  całą zasadą jednostki. Nowa armia to nowe kości — namacalny zakup.
- **Skalowalne.** Ten sam rdzeń obsługuje potyczkę 2 kości i bitwę na 20.
- **Cyfrowo i fizycznie z tego samego rdzenia.** Reguły są w pełni
  deterministyczne (poza własnymi decyzjami nie ma losowości), więc wersja
  cyfrowa i papierowa nie rozjadą się.

---

## Architektura

Twardy podział: **rdzeń nie wie nic o renderowaniu.**

```
src/core/     czysta logika, zero Three.js — cała testowalna bez przeglądarki
  orientation.js  kwaternion kości = jedyne źródło prawdy o orientacji
  units.js        układ ścian każdej jednostki
  unit.js         ruch, obrót, trafienia
  game.js         tura, AP, walka, zwycięstwo, faza ustawiania
  ai.js           heurystyka oceniająca ruchy (tylko decyduje, nic nie zmienia)

src/render/   Three.js, czyta stan rdzenia
src/ui/       HUD, ściąga
tests/        58 testów, Node runner, zero zależności
```

**Jedno źródło prawdy o orientacji** — brief wymagał tego wprost i to była
najczęstsza przyczyna błędów. Nie ma osobnego „obrotu wizualnego": renderer
odtwarza dokładnie te obroty, które wykonały reguły, a po każdej animacji stan
kości jest sprawdzany i w razie rozjazdu dociągany. To złapało realny błąd,
przez który **każde niezabijające trafienie zostawiało narysowaną kość
zamrożoną na starej ściance**.

## Testy

```bash
npm test
```

58 testów bez zależności zewnętrznych. Pokrywają: fizykę obrotów, zasadę
przeskoku, drabinkę obrażeń dla wszystkich 8 jednostek, każdą zdolność ścianki,
zasięg i blokowanie linii ataku, ekonomię AP, tryb własnego ustawienia oraz
regresje — m.in. test przechodzący całą partię AI i sprawdzający, że każda
proponowana akcja jest legalna i że wszystkie typy akcji realnie padają.
Ten ostatni powstał po tym, jak autoplay po cichu wyłączał się na akcji, której
brakowało w jego dyspozytorze.
