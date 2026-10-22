# Spec: 07-journeys-1 §J11; features.tsv AT-121 is the shared approval expiry contract.
@journey-J11
Feature: J11 — Bill reminder and payment

  @AT-121
  Scenario: a bill payment remains pending until approval
    Given foo starts the "J11" flow with the "pretend" AI
    When the user opens a bill payment approval
    Then the bill remains pending until the user approves it
