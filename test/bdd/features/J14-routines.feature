# Spec: 07-journeys-1 §J14; features.tsv has no direct J14 row, so this remains a representative scheduled-routine smoke.
@journey-J14
Feature: J14 — Creating, editing and pausing a routine

  Scenario: the routine appears in the Scheduled segment
    Given foo starts the "J14" flow with the "pretend" AI
    When the user opens the routine schedule
    Then the routine appears in the Scheduled segment
