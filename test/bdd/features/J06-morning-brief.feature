# Spec: 07-journeys-1 §J6; the ledger has no direct J6 row, so this uses the scheduled routine contract AT-281 and is reported as representative.
@journey-J6
Feature: J6 — Daily morning brief and feedback

  @AT-281
  Scenario: the morning brief is visible in the schedule
    Given foo starts the "J6" flow with the "pretend" AI
    When the user opens the morning brief schedule
    Then the scheduled panel names the morning brief routine
