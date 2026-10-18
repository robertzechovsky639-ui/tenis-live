# Tenis Live

Česká PWA s živými tenisovými výsledky. ATP a WTA jdou z veřejného ESPN, Challenger z veřejného 365scores. Časy jsou v **Europe/Prague**. Na iPhonu: Safari → Sdílet → Přidat na plochu.

## Spuštění

Aplikace je čisté HTML, CSS a ES moduly. Stačí statický server (prohlížeč soubor `file://` moduly nenačte):

```bash
python3 -m http.server 8080
```

Pak otevřete http://127.0.0.1:8080/

Testy bez prohlížeče:

```bash
node --test test/app.test.js
```

## Nasazení na GitHub Pages

1. V repozitáři: Settings → Pages → Build and deployment → **GitHub Actions**.
2. Workflow `.github/workflows/pages.yml` se spustí po pushi do `main` a nasadí kořen repozitáře.
3. Adresa bude `https://<účet>.github.io/tenis-live/`.

Relativní cesty (`./`) fungují na projektových Pages i lokálně. Aplikace si z prohlížeče sama tahá ESPN, 365scores a model. Žádný vlastní server na skóre není potřeba: oba veřejné zdroje posílají `Access-Control-Allow-Origin: *`.

## Zdroje

| Okruh | Zdroj | Klíč |
| --- | --- | --- |
| ATP, WTA zápasy | `site.api.espn.com/.../tennis/{atp,wta}/scoreboard` | ne |
| ATP, WTA žebříček | `site.web.api.espn.com/.../rankings` | ne |
| ATP, WTA i Challenger, body a podání | `webws.365scores.com` | ne |
| Challenger záloha | API-Tennis (`api.api-tennis.com`) | ano, volitelně |
| Předzápasová šance | LightGBM z [tenis](https://github.com/robertzechovsky639-ui/tenis) (`model.js`, `model.json`, stavy hráčů) | ne |
| Živá šance | stejné váhy `state/live_online.json`, přepočet v prohlížeči podle skóre; jinak bodový model | ne |

Když 365scores vypadne a není nastavený klíč, záložka Challenger ukáže českou hlášku. ATP a WTA zůstanou z ESPN.

## Klíč API-Tennis

Klíč se **necommituje**.

- V aplikaci: ozubené kolo → vložit klíč. Uloží se jen do `localStorage` v tom prohlížeči. API-Tennis pouští CORS, takže klíč zůstane v zařízení a do repa se nedostane.
- Pro snímek bez klíče v prohlížeči: v GitHubu Settings → Secrets → Actions přidejte `API_TENNIS_KEY`. Workflow `.github/workflows/challenger.yml` (jednou za hodinu, nebo ručně) zapíše `data/challenger.json`. Bez secretu se přeskočí a nic se nerozbije.

## Predikce

Před zápasem se použije model z veřejného repa tenis (LightGBM v prohlížeči, váhy `online.json`). Hráči se párují podle jména. Kdo v modelu není, dostane šanci z Elo téhož repa, a když chybí i to, z rozdílu žebříčků.

Živá šance se při každém obnovení skóre (asi 25 s, dokud někdo hraje) posune:

1. váhami živého modelu tenis (`live_online.json`, bez tréninkových logů, ty se po prvním stažení ořežou a uloží v prohlížeči),
2. jinak posledním snímkem `live_preds.json`,
3. jinak bodovým modelem gem / set / zápas, ukotveným tak, aby na 0:0 vyšla předzápasová šance.

V řádku je proužek, v detailu i průběh po setech a během otevřené relace.

## Oblíbení

Hvězdička u hráče (v zápasu i v žebříčku) ho uloží v prohlížeči a připne jeho zápasy nahoru.
