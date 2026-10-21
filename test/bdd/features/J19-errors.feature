# Spec: 07-journeys-1 §J19; features.tsv AT-081
@journey-J19
Feature: J19 — Errors: AI offline, rate limit, spend cap, stuck loop, crash recovery

  @AT-081
  Scenario: going offline shows the saved-jobs banner
    Given foo starts the "J19" flow with the "pretend" AI
    When the network goes offline while the job is running
    Then the offline banner offers Try again and explains that jobs are saved
