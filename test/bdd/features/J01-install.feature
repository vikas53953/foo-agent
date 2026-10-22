# Spec: 07-journeys-1 §J1; features.tsv has no direct J1 row, so this remains a representative welcome smoke.
@journey-J1
Feature: J1 — Install and first launch

  Scenario: the first launch settles on the welcome card
    Given foo starts the "J1" flow with the "pretend" AI
    When the first launch settles on the welcome step
    Then the welcome card has the first launch face and start action
