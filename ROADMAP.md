# Sixth Face — roadmapa przebudowy na skirmish

Stan wyjściowy (sierpień 2026): działający silnik 7×7, stały roster 8v8,
85 testów, AI heurystyczne, turniej rozstawień. Decyzja: odejście od
symetrycznej gry „szachowej" na rzecz skirmisha z budowaną warbandą.

## Zasada kolejności

Fazy są ułożone według **zależności, nie atrakcyjności**. Każda następna
potrzebuje liczby, którą ustala poprzednia. Nie projektujemy jednostek,
zanim nie wiemy, ile jest warta akcja; nie wyceniamy, zanim nie wiemy,
o co się gra.

Jedno zdanie, które trzeba pamiętać przez całą przebudowę:
**AI jest naszym przyrządem pomiarowym i jest słabe.** Każdy wynik z fazy
1–2 czytamy jako „nie wykryto problemu", nie jako „jest dobrze".

---

## Faza 0 — porządki (0,5 dnia)

Cel: nie budować na niezsynchronizowanym stanie.

- `git push` czterech niewypchniętych commitów (7×7, teren, strzelcy, Sweep)
- tag `v1-chess` na obecnym stanie — punkt odniesienia do porównań
- usunąć PDF-y, które wpadły do repo (`Sixth-Face-*.pdf`, `tools-gen-*.mjs`)
- opublikowany prototyp i handoff opisują starszą wersję → oznaczyć jako
  archiwalne, nie aktualizować (i tak je przepiszemy w fazie 7)

**Zrobione, gdy:** `main` == lokalne, tag stoi, repo czyste.

---

## Faza 1 — KAMIEŃ WĘGIELNY: darmowy Krok (1–2 dni)

Cel: sprawdzić, czy liczebność może w ogóle istnieć.

Zmiana: **każda kość dostaje jedną darmową akcję na rundę — Krok albo
Obrót. AP kupuje wyłącznie przekręcanie i ataki.**

Testujemy A/B na **istniejącym** rosterze 8v8 na 7×7 — ta sama plansza, te
same jednostki, tylko inna ekonomia. Czysty eksperyment.

Mierzymy:
- ile różnych kości wykonuje coś w partii (dziś: garstka)
- czy reguła wyczerpania odpala się częściej czy rzadziej
- długość partii, liczba strat
- czy napięcie „chodzić vs przezbroić się" nadal jest widoczne w decyzjach

**Zrobione, gdy:** więcej niż połowa warbandy uczestniczy w partii, a
przekręcanie nadal wygląda na drogie. **Jeśli rdzeń się rozmywa — cofamy
i szukamy innego rozwiązania na hordę.** To jest faza z prawem weta.

### WYNIK (120 sparowanych rozstawień, `tools/ab-economy.mjs`)

| metryka | pool | freestep |
|---|---|---|
| udział kości w partii | 0,75 | **1,00** |
| AP wydane na tipy | 48% | **63%** |
| wykorzystanie puli AP | 94% | 94% |
| tipy / turę | 0,88 | 1,19 |
| ataki / turę | 0,77 | 1,09 |
| długość partii | 22,6 | 15,2 |
| % z wyczerpania | 3,3 | 9,2 |

**Zdane.** Cała warbanda uczestniczy w partii zamiast trzech czwartych, a
przezbrojenie zjada *większą* część rzadkiego zasobu niż wcześniej — bo AP
przestało wyciekać na chodzenie. Pula jest wykorzystana w 94% w obu
ekonomiach, więc AP nadal wiąże.

Uwaga metodologiczna: pierwszy proxy („udział tipów w ruchach", 0,49 → 0,24)
sugerował rozmycie rdzenia i **był mylący** — darmowe kroki dokładają się do
mianownika, nie odbierając nic tipom. Rozstrzyga rachunek AP, nie rachunek
ruchów.

Wzrost wyczerpania (3,3% → 9,2%) to **znany, wcześniejszy tryb awarii**, nie
nowy: partie kończone wyczerpaniem są w obu ekonomiach długie (49 i 27 tur),
mają mało ataków (~0,48/turę) i dużo już poniesionych strat — to niedobitek
uciekający do końca licznika. Darmowy ruch czyni pościg tańszym, więc zdarza
się częściej. Lekarstwem jest **faza 3**: przy celach na planszy ucieczka
przegrywa, bo przeciwnik punktuje. Dziś jedynym warunkiem zwycięstwa jest
dowódca, więc uciekanie się opłaca.

---

## Faza 2 — skala (1 dzień)

Cel: znaleźć rozmiar planszy i warbandy.

- plansza 6×6, teren gęstszy niż dziś
- warbanda 3, 4, 5, 6 kości — przemiatamy
- na razie bez punktów: równe składy, chodzi tylko o gęstość

Mierzymy: obłożenie planszy, zatory, odsetek partii kończonych wyczerpaniem,
ile ruchu jest w bok zamiast do przodu.

**Zrobione, gdy:** jest rozmiar, przy którym partie się rozstrzygają, a
kości mają gdzie manewrować. Podejrzenie: 6×6 przy 4–5 kościach.

### WYNIK (`tools/scale.mjs`, 4 rozmiary × 5 wielkości bandy × 40 map)

Porównanie z wersją szachową, 120 map na wariant:

| wariant | zajętość | tur | akcji/turę | dryf | ataków/turę | wyczerp. |
|---|---|---|---|---|---|---|
| v1-chess 7×7 8v8 pool | 0,33 | 22,6 | 2,6 | **0,36** | 0,77 | 3% |
| 7×7 8v8 freestep | 0,33 | 15,2 | **6,3** | 0,56 | 1,09 | 9% |
| **6×6 5v5 freestep** | 0,28 | 13,5 | 4,6 | **0,64** | 0,95 | 13% |
| 6×6 4v4 freestep | 0,22 | 11,8 | 4,1 | 0,63 | 0,86 | 12% |

**Wybrane: 6×6, warbanda 5 kości na stronę** (docelowo 4–6, bo punkty i tak
zrobią z tego zakres). Dryf — ile kostek w ogóle zmienia kolumnę — idzie
z 0,36 na 0,64, czyli o 78%. Partia skraca się z 23 do 13 tur.

Kluczowe: **to zmniejszenie bandy, nie planszy, trzyma turę w ryzach.** Sam
darmowy Krok rozdmuchał turę do 6,3 akcji (23 minuty przy tym samym tempie);
przy pięciu kościach wraca do 4,6.

Czego faza 2 NIE dała:
- **rozmiar planszy prawie nie rusza dryfu** (0,57–0,75 w całym przemiataniu,
  w granicach szumu). Skok zrobiła ekonomia z fazy 1, nie skala.
- **teren przy 12% gęstości jest obojętny** — ten sam wynik co w wersji
  szachowej. AI nadal nie umie go używać.

Wyczerpanie (3% → 13%) zdiagnozowane: partie kończone wyczerpaniem są długie
(25–27 tur wobec ~12 średnio), mają ~50% strat i ~0,45 ataku na turę — to
pościg za niedobitkiem, nie stand-off. Sprawdziłem też hipotezę, że
`stallLimit=12` przestał pasować do krótszych partii: **nieprawda**, między 8
a 20 wynik się nie rusza. Zostaje faza 3.

---

## Faza 3 — cele (3–4 dni, największy kawałek kodu)

Cel: dać powód, żeby *być gdzieś*. Bez tego mała warbanda to dwa patrole
krążące wokół siebie.

Trzy scenariusze, każdy łamie symetrię inaczej:

1. **Relikwia** — neutralna kość do wyniesienia; **niosąc nie możesz
   przekręcać**. Tragarz zamrożony na ścianie z momentu podniesienia.
2. **Kapliczki** — pole punktuje tylko wtedy, gdy stoisz na nim **nie**
   pokazując ściany ataku. Nie da się trzymać i walczyć jednocześnie.
3. **Atak/obrona** — strony mają strukturalnie różne zadanie.

WYKREŚLONE: przebicie się na drugą stronę planszy. To jest dosłownie
warunek zwycięstwa Dice Valley.

Przy okazji: **znika obowiązkowy dowódca.** W 4-kostkowej bandzie zabicie
dowódcy to 25% sił — partia kończyłaby się na jednym obejściu. Warunek
zwycięstwa: cele + wybicie.

Efekt uboczny, dla nas ważny: cel na planszy to rzecz, którą **AI umie
wycenić**, w odróżnieniu od „trzymaj tę linię". Ta faza naprawia też
przyrząd pomiarowy.

**Zrobione, gdy:** obie strony przestają zbiegać się w centrum — mierzalnie,
w porównaniu z tagiem `v1-chess`.

### WYNIK (`tools/objectives.mjs`, 200 map na scenariusz)

| | leader | **shrines** | relic |
|---|---|---|---|
| dryf | 0,64 | **0,81** | 0,77 |
| tur | 13,1 | 19,9 | 13,9 |
| strat / 10 kości | 4,5 | 6,1 | 4,7 |
| koniec na punkty | 0% | **50%** | 87% |
| koniec przez wybicie | 0% | **48%** | 12% |
| wyczerpanie | 13% | **3%** | 2% |
| ludzie : orkowie | 50:50 | **52:48** | **67:34** |

**Kapliczki zdane, i to najlepszym wynikiem w całej przebudowie.** Dryf idzie
z 0,64 na 0,81 — wobec 0,36 w wersji szachowej to ponad dwukrotność. Podział
50/48 między wygraną na punkty a wybiciem warbandy znaczy, że obie drogi są
żywe: ani rzeź, ani siedzenie na polach nie dominuje. Strony 52:48, czyli
uczciwie. Wyczerpanie spada 13% → 3%.

Dwie poprawki po drodze, obie wykryte pomiarem:
- **Licznik „nic się nie dzieje" liczył wyłącznie ciosy.** Przy celach to błąd
  kategorii: partia, w której ktoś co turę zdobywa punkt, POSTĘPUJE, tylko
  bezkrwawo. Zdobycie punktu zeruje licznik tak samo jak trafienie. To samo
  ścięło wyczerpanie z 13% na 3%.
- **AI musiało dostać cele do wyceny** (`objectivePull` w ai.js), inaczej
  chodziłoby dokładnie jak przedtem i pomiar mierzyłby szum.

### RELIKWIA — nie działa, cztery zmierzone tryby awarii

| konfiguracja | co się stało |
|---|---|
| 2 relikwie, „przynieś jedną" | 88–91% na punkty, 3,1 strat — dwa równoległe pasjanse, strony się nie spotykają |
| 2 relikwie, „przynieś obie" | 43% wyczerpania — kurier nie może się przekręcać, więc jest wolny i kruchy |
| 1 relikwia po środku | 39:59 dla orków — na planszy o parzystym boku żadne pole nie leży w równej odległości od obu krawędzi, a pierwszy ruch tego nie kompensuje |
| łup punktujący co turę | 67:34 dla ludzi — kto zaczyna, ten chwyta pierwszy i przewaga narasta liniowo |

Wniosek nie jest liczbowy tylko konstrukcyjny: **cel przenośny w grze z ruchem
naprzemiennym premiuje pierwszego gracza w sposób, którego nie da się
wystroić progiem punktowym.** Zostaje w kodzie jako scenariusz oznaczony
„niezbalansowany". Wraca dopiero z jakąś formą kompensaty dla drugiego gracza.

**Atak/obrona odłożony** — wymaga AI, które rozumie „trzymaj i czekaj", a tego
nie ma. Nie chcę go udawać.

---

## Faza 4 — słownik ścian (2 dni, głównie projekt na papierze)

Cel: zamknięta lista czasowników, z których buduje się każdą kostkę w grze.

Dziś mamy ~18 słów. Celujemy w ~25–30, w tym nowe czasowniki hero-skalowe:

- **Ukrycie** — w terenie, dopóki na wierzchu, nie można cię obrać za cel.
  (Dowód, że to działa: nie da się ukrywać i strzelać jednocześnie, bo jedno
  i drugie to ściana. Charakter postaci z czystej geometrii, zero zasad.)
- **Czujka / Overwatch** — atak poza swoją turą, w reakcji
- **Skok** — ruch omijający zajęte pole
- **Prowokacja** — wymusza na przeciwniku obrót
- **Zagrzanie** — działa na sąsiada, nie na siebie

Każde słowo: jedna linia zasady, implementowalna, bez wyjątków pod
konkretną jednostkę.

**Zrobione, gdy:** lista jest zamknięta i każde słowo ma test.

---

## Faza 5 — frakcje i kostki (2–3 dni)

Cel: 5 frakcji × 6–8 kości = 30–40 kostek.

To jest **wybieranie i układanie**, nie wynalazek: wybierz 6 słów ze
słownika i ułóż je na sześcianie. Cały projekt siedzi w tym, która ściana
sąsiaduje z którą.

| Frakcja | Tożsamość strukturalna |
|---|---|
| Ludzie | formacja i drugi szereg; nagradzają ustawienie |
| Orkowie | groźni również w bok — jak się nie potoczą, coś w ciebie celuje |
| Gobliny | najtańsze, najliczniejsze, giną od jednego trafienia |
| Leśne elfy | teren i ukrycie, zmiana stanu bez utraty tempa, szkło |
| Krasnoludy | nie do zepchnięcia, garda kryje flankę, wolne — i monstrum |

**Potwory** (troll górski i spółka) robimy przez siatkę, nie przez wyjątek:
dwie ściany Guard i dwie Wounded na dwóch osiach. Cztery trafienia do
zabicia, trudno złapać z opuszczoną gardą — ale zostają tylko dwie ściany
na umiejętności. Odporny i **głupi**. Uczciwy handel.

**Zrobione, gdy:** 30–40 kostek istnieje jako dane, każda przechodzi
walidator siatki.

---

## Faza 6 — wycena (2 dni maszyny, 1 dzień analizy)

Cel: cena w punktach za każdą kostkę.

**Problem, który trzeba obejść:** nie da się przemieść wszystkich warband
przeciw wszystkim — kombinatoryka wybucha. I gra jest **deterministyczna**,
więc ta sama banda przeciw tej samej zawsze gra identycznie; powtarzanie
partii nic nie daje.

**Metoda: banda kontrolna + podmiana jednej kostki.** Ustalamy referencyjną
warbandę. Podmieniamy dokładnie jedną kość na kandydata za te same punkty.
Gramy przeciw stałemu panelowi przeciwników. Zmienność bierze się z **map,
rozstawień, układu celów i tego, kto zaczyna** — nie z losowości w grze.
Koszt: O(liczba kostek), nie O(liczba warband). ~40 kostek × ~40 map =
1600 partii, czyli nic.

Jeśli podmiana rusza win rate powyżej progu — kostka jest źle wyceniona.

**Zrobione, gdy:** żadna pojedyncza podmiana nie daje więcej niż ±X% i
żadna banda nie wygrywa z całym panelem.

---

## Faza 7 — produkt (1 tydzień)

- przepisany treatment i instrukcja pod nowy hak (skirmish, nie „szachy na
  kościach") — po Dice Valley to i tak było konieczne
- nowy pitch: pojedyncza kostka jako SKU dodatku, mieszanie frakcji
- fizyczny prototyp: kartonowe kostki + siatka na papierze
- dopiero teraz pokazywanie wydawcy

---

## Tor B — równoległy, może ruszyć od zaraz

**Test na papierze z żywym człowiekiem.** Kartonowe kostki, siatka
narysowana na kartce, cztery jednostki na stronę.

Nie czeka na żadną fazę, bo sprawdza to, czego przebudowa **nie rusza**:
czy stanie obok wroga z niewłaściwą ścianą na wierzchu czyta się jako
napięcie czy jako upierdliwość, i czy obracanie kostki w palcach jest
przyjemne. To jest jedyne pytanie, na które komputer nie odpowie, i jest
warte więcej niż którakolwiek faza wyżej.

---

## Co ginie w przebudowie

- rozstawienie dwuszeregowe (61% win rate) — nie ma stałych formacji
- stały roster 8v8
- dowódca jako jedyny warunek zwycięstwa
- instrukcje i treatment w obecnej postaci
- **silnik zostaje prawie w całości**: AP, tip, facing, rana-jako-ściana,
  teren, zasięgi, Sweep, popchnięcia — wszystko to jest niezależne od rosteru

## Trzy największe ryzyka

1. **Darmowy Krok rozmywa rdzeń.** Faza 1 ma prawo weta — jeśli napięcie
   „chodzić vs przezbroić się" zniknie, cofamy.
2. **AI nie umie oceniać pozycji.** Faza 3 częściowo to naprawia (cel jest
   punktowalny), ale do fazy 3 czytamy wyniki ostrożnie.
3. **Zakres.** Skirmish zamienia pudełko w linię produktową. Pierwszy autor
   słyszy od wydawcy „za duże". Dlatego faza 7 pokazuje **jedno pudełko
   startowe**, a mieszanie frakcji i dodatki są w prezentacji, nie w
   prototypie.
