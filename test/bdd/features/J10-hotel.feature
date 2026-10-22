# Spec: 07-journeys-1 §J10; features.tsv AT-121 is the shared approval expiry contract.
@journey-J10
Feature: J10 — Hotel booking with payment approval

  @AT-121
  Scenario: a hotel payment approval is pending and timed
    Given foo starts the "J10" flow with the "pretend" AI
    When the user opens a hotel payment approval
    Then the payment approval shows an expiry and a single approval action
