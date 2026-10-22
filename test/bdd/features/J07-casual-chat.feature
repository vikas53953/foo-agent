# Spec: 07-journeys-1 §J7; features.tsv AT-027
@journey-J7
Feature: J7 — Casual chat, including voice notes in and out

  @AT-027
  Scenario: an acknowledgement gets a reaction only
    Given foo starts the "J7" flow with the "pretend" AI
    When the user sends an acknowledgement
    Then foo adds a thumbs up reaction without posting a reply
