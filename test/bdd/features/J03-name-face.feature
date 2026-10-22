# Spec: 07-journeys-1 §J3; features.tsv has no direct J3 row, and AT-304 covers living-face behavior rather than this setup smoke.
@journey-J3
Feature: J3 — Naming foo, avatar and vibe

  Scenario: naming advances to the selectable face card
    Given foo starts the "J3" flow with the "pretend" AI
    When the user reaches the name and face setup cards
    Then the name answer opens four selectable face tiles
