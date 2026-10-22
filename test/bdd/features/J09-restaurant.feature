# Spec: 07-journeys-1 §J9; features.tsv AT-036
@journey-J9
Feature: J9 — Restaurant booking

  @AT-036
  Scenario: restaurant options appear before booking approval
    Given foo starts the "J9" flow with the "pretend" AI
    When the user asks for restaurant options before booking
    Then restaurant choices remain unbooked until an explicit booking approval
