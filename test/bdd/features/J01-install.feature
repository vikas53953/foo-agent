# Spec: 07-journeys-1 §J1; 10-acceptance-2 AT-313
@journey-J1
Feature: J1 — Install and first launch

  @AT-313
  Scenario: the first launch settles on the welcome card
    Given foo starts the "J1" flow with the "pretend" AI
    When the first launch settles on the welcome step
    Then the welcome card has the first launch face and start action
