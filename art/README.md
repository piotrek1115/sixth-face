# Grafika ścian kostek

## Co malujesz

**24 obrazki, nie 60.** W grze jest 60 ścian (10 kostek × 6), ale tylko
**12 różnych na frakcję** — Guard, Wounded, Advance i Stagger siedzą na
kilku kostkach naraz. Kluczem jest **zdolność**, nie kostka.

I tak ma być: gracz musi umieć przeczytać planszę z drugiej strony stołu, a to
znaczy, że ta sama zdolność ma wyglądać wszędzie tak samo.

Listy do odhaczenia: [`uv/_paintlist-humans.png`](uv/_paintlist-humans.png)
i [`uv/_paintlist-orcs.png`](uv/_paintlist-orcs.png) — z liczbą kostek, na
których każda zdolność występuje (czyli co się najbardziej opłaca zrobić
najpierw).

## Gdzie wrzucasz

```
public/art/faces/humans/guard.jpg
public/art/faces/orcs/crush.jpg
```

Nazwa pliku = nazwa zdolności małymi literami. `.jpg` albo `.png`, kwadratowe,
512×512 lub więcej. Brak pliku **nie jest błędem** — gra chodzi dalej na
starej grafice frakcji, więc możesz dokładać po jednym i patrzeć, jak przybywa.

Jeśli jedna kostka ma mieć inny wariant niż reszta frakcji:

```
public/art/faces/humans/captain-guard.jpg     ← tylko Kapitan
```

Kolejność szukania, od szczegółu do ogółu, pierwszy trafiony wygrywa:
`<jednostka>-<zdolność>` → `<zdolność>` → grafika frakcji → płaski kolor.

## Jak orientować obrazek

**Maluj każdy kwadrat normalnie, pionowo. Nic nie obracaj ani nie odbijaj.**

Zmierzone wprost z UV geometrii, nie zgadnięte:

| ściana | góra obrazka wskazuje | prawo obrazka |
|---|---|---|
| PÓŁNOC / POŁUDNIE / WSCHÓD / ZACHÓD | górę kostki | wzdłuż krawędzi |
| GÓRA | północ planszy (w głąb, od gracza) | wschód |
| SPÓD | południe planszy | wschód |

GÓRA zachowuje się jak mapa oglądana z lotu ptaka, więc „pionowo" znaczy to,
co myślisz.

Uwaga: ściana, która akurat jest na wierzchu, rysuje się **bez paska
z nazwą** — nazwę niesie tabliczka unosząca się nad kostką. Czyli na górnej
ścianie widać czystą grafikę i to jest ta, którą gracz ogląda najczęściej.

## Siatki per kostka

[`uv/<jednostka>.png`](uv/) — rozłożony sześcian (krzyż) dla każdej z dziesięciu
kostek: która zdolność na której ścianie, jaka nazwa pliku, co wypada po
przechyle w każdą stronę. Przydaje się, żeby widzieć **sąsiedztwo** ścian —
w tej grze projekt jednostki to układ ścian, nie lista cech, więc to, co z czym
sąsiaduje, jest samą treścią projektu.

Generowane z kodu gry: `node tools/uv-template.mjs` (SVG), potem rasteryzacja
przez headless Chrome. Zmienisz kostkę w `units.js` — przegeneruj, a szablon
sam się zgodzi.

## Sprawdzone

Cały łańcuch przeszedł test na żywo: wrzucona tarcza jako `humans/guard.png`
pojawiła się na górnej ścianie Miecznika (próbka piksela `rgb(232,226,208)` =
dokładnie kolor z pliku), Strike bez pliku został na starej grafice frakcji,
a orkowy Guard nie drgnął.
