# Spec: 07-journeys-1 §J21; features.tsv AT-093
@journey-J21
Feature: J21 — Settings

  @AT-093
  Scenario: Settings exposes account and connections
    Given foo starts the "J21" flow with the "pretend" AI
    When the user opens Settings
    Then Settings shows the account and connection sections
