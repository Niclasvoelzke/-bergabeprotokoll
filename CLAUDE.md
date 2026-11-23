# Immobilien Völzke – Projektkontext für Claude Code

## Was die App heute ist
- Offline-fähige PWA (iPad), gehostet auf GitHub Pages
- Funktionen: Übergabeprotokolle erstellen und verschicken, Mieterselbstauskunft (Link für Interessenten)
- Eigenes Icon und Name „Immobilien Völzke“, klar getrennt von den „Völzke Team Tools“
- Bisher KEIN Backend / keine Datenbank

## Was neu dazukommt: Nebenkostenabrechnung
Nutzerin ist Heike (Büro). Sie soll selbstständig arbeiten können, ohne Niclas.
Prinzip: Belege hochladen → App meldet fehlende Belege → App erzeugt fertige Abrechnung.
Erste echte Abrechnung: Jahr 2026, im Januar 2027.

### Objekte
- Eichensträuche: zwei Bürogebäude plus zwei Mieteinheiten. Gehört Niclas privat.
  Die Büros nutzt Niclas' Einzelunternehmen selbst, ohne Mietvertrag.
  Nach einer geplanten Umfirmierung werden sie an eine GmbH vermietet (Stichtag, wahrscheinlich unterjährig).
- Rheinstraße 14, Rettert
- Künftig: Rheinstraße 11, Rettert (4 Wohneinheiten)

## Architektur-Entscheidungen
- Erweiterung der bestehenden App, KEINE separate App
- Eigenes Supabase-Projekt, getrennt vom Supabase der „Zentrale“ (Heike darf nie an Niclas' Daten kommen)
- Login für Heike (Supabase Auth)
- Belege als Dateien in Supabase Storage, verknüpft mit Gebäude, Jahr, Kostenart
- KI (Anthropic API über Supabase Edge Function, eigener API-Schlüssel mit eigenem Monatslimit) NUR für:
  1. Belege auslesen (Betrag, Zeitraum, Kostenart) → Heike bestätigt
  2. Fehlende Belege gegen die Soll-Liste melden
- Die Berechnung selbst ist feste, nachvollziehbare Logik im Code, NICHT die KI

## Datenstruktur
Objekt (Gebäude)
- Stammdaten, nur EINMAL pflegen, nicht pro Abrechnung:
  Wohn-/Nutzflächen, Umlageschlüssel, Soll-Liste der Kostenarten
- Objektgebundene Unterlagen: Wohnflächenberechnung, Grundrisse usw.
  Werte daraus auslesen, aber immer manuell korrigierbar
- Belege pro Jahr und Kostenart

Einheit (Wohn- oder Gewerbeeinheit)
- Fläche, Zähler (Art + Zählernummer), Status mit Stichtag
  („selbst genutzt bis …“, „vermietet ab …“, „leer“)
- Mietverhältnis
  - aktuell / Archiv (frühere Mieter mit Vertrag, Übergabeprotokollen, Abrechnungen)
  - Mietzeitraum kommt aus dem Mietvertrag, keine manuelle Eingabe

## Eingaben durch Heike
- Netto-Kaltmiete und Nebenkostenvorauszahlung manuell
  - Wahlweise als Jahresbetrag oder Monatsbetrag
  - Intern als „Monatsbetrag gültig ab Datum“ speichern (Änderungen mitten im Jahr)
- Gesamtzahlung eines Mieters kann in Teile aufgeteilt werden (Kaltmiete / NK-Vorauszahlung / Strom)
- Zählerstände: Eingabefelder pro vorhandenem Zähler, Mieter lesen selbst ab
  - optional Foto vom Zähler
  - Plausibilitätsprüfung gegen Vorjahr
  - bei Mieterwechsel Stände aus dem Übergabeprotokoll übernehmen
- Vor jeder Abrechnung Prüffrage: „Ist die Kaltmiete noch aktuell oder wurde sie angepasst?“

## Berechnungsregeln
- Kosten werden pro Gebäude erfasst und dann per Umlageschlüssel auf Einheiten verteilt
- Selbst genutzte Büros und Leerstand bekommen ihren Anteil, werden aber nicht an Mieter abgerechnet
  (sonst landen Gebäudekosten fälschlich auf den Mietern)
- Mieterwechsel / Statuswechsel unterjährig: zeitanteilig
- Heizung/Warmwasser: mindestens 50 % nach Verbrauch (Heizkostenverordnung)
- Ohne Vereinbarung im Mietvertrag: Verteilung nach Fläche, erfasster Verbrauch nach Verbrauch (§ 556a BGB)
- Differenz Hauptzähler vs. Summe Einzelzähler: Standard nach Fläche, pro Gebäude änderbar
- Abrechnung muss formell vollständig sein: Gesamtkosten, Umlageschlüssel, Anteil, abgezogene Vorauszahlungen
- Frist: spätestens 12 Monate nach Ende des Abrechnungszeitraums beim Mieter → Erinnerung in der App

## Sonderfall Strom über Unterzähler
- Betrifft z. B. Mieter Christian, Rheinstraße 14, OG (privater Unterzähler, Preis pro kWh + Grundgebühr + Abschlag)
- Haken am Zähler: „eigene Abrechnung (Unterzähler)“ mit kWh-Preis, Grundgebühr, Abschlag
- Solche Zähler fließen NICHT in die Nebenkostenabrechnung, sondern werden als separates Dokument abgerechnet

## Reihenfolge der Umsetzung
1. Supabase-Projekt + Login für Heike
2. Objekte, Einheiten, Mietverhältnisse, Zähler (Stammdaten)
3. Belege hochladen + KI-Auslesen + Soll-Liste/Fehlmeldungen
4. Vorauszahlungen und Zählerstände
5. Berechnung + PDF-Abrechnung (Nebenkosten und Strom getrennt)

## Arbeitsweise
- Sprache in App und Kommunikation: Deutsch
- Bestehende Funktionen (Übergabeprotokoll, Selbstauskunft) dürfen nicht kaputtgehen, Offline-Fähigkeit beibehalten
- Vor größeren Änderungen kurz den Plan zeigen
