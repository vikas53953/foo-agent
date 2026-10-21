# Spec: 07-journeys-1 §J3; features.tsv AT-304 is used as the living-face contract while the direct J3 ledger row is absent.
@journey-J3
Feature: J3 — Naming foo, avatar and vibe

  @AT-304
  Scenario: naming advances to the selectable face card
    Given foo starts the "J3" flow with the "pretend" AI
    When the user reaches the name and face setup cards
    Then the name answer opens four selectable face tiles
