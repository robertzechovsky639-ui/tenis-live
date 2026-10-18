#!/usr/bin/env python3
"""Stáhne Challenger z API-Tennis do data/challenger.json. Klíč jen z prostředí."""

import json
import os
import urllib.parse
import urllib.request
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'data', 'challenger.json')
API = 'https://api.api-tennis.com/tennis/'


def call(method, **params):
    key = os.environ['API_TENNIS_KEY']
    query = {'method': method, 'APIkey': key, 'timezone': 'Europe/Prague', **params}
    url = API + '?' + urllib.parse.urlencode(query)
    req = urllib.request.Request(url, headers={'User-Agent': 'tenis-live'})
    with urllib.request.urlopen(req, timeout=40) as response:
        payload = json.loads(response.read().decode())
    if payload.get('success') == 0:
        raise SystemExit(payload.get('error') or 'API-Tennis vrátilo chybu')
    return payload.get('result') or []


def main():
    zone = ZoneInfo('Europe/Prague')
    today = datetime.now(zone).date()
    start = (today - timedelta(days=1)).isoformat()
    stop = (today + timedelta(days=1)).isoformat()
    fixtures = call('get_fixtures', date_start=start, date_stop=stop)
    try:
        live = call('get_livescore')
    except Exception as error:
        print('livescore', error)
        live = []
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as handle:
        json.dump({
            'updated': datetime.now(zone).strftime('%Y-%m-%d %H:%M %Z'),
            'source': 'api-tennis',
            'fixtures': fixtures,
            'live': live,
        }, handle, ensure_ascii=False)
    print(f'zapsáno {OUT}, fixtures {len(fixtures)}, live {len(live)}')


if __name__ == '__main__':
    main()
