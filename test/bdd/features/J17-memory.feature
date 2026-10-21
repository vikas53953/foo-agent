# Spec: 07-journeys-1 §J17; features.tsv AT-072
@journey-J17
Feature: J17 — Viewing, editing and forgetting memory

  @AT-072
  Scenario: memory facts show source and date
    Given foo starts the "J17" flow with the "pretend" AI
    When the user opens Memory from the sidebar menu
    Then every visible fact has its source and date
