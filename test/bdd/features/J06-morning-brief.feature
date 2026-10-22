# Spec: 07-journeys-1 §J6; features.tsv has no direct J6 row, so this remains a representative scheduled-routine smoke.
@journey-J6
Feature: J6 — Daily morning brief and feedback

  Scenario: the morning brief is visible in the schedule
    Given foo starts the "J6" flow with the "pretend" AI
    When the user opens the morning brief schedule
    Then the scheduled panel names the morning brief routine
