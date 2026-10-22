# Spec: 07-journeys-1 §J15; features.tsv AT-281
@journey-J15
Feature: J15 — Creating a helper and handing work between helpers

  @AT-281
  Scenario: helper work appears under In progress
    Given foo starts the "J15" flow with the "pretend" AI
    When the user opens a helper work panel
    Then the panel shows the helper job under In progress
