# Spec: 07-journeys-1 §J2; features.tsv AT-005
@journey-J2
Feature: J2 — Finding and connecting the user's AI

  @AT-005
  Scenario: both signed-in helpers are tested and Claude is selected
    Given foo starts the "J2" flow with the "pretend" AI
    When the AI finder runs detection for the two signed-in helpers
    Then Claude is pre-selected and both helper tests are real requests
