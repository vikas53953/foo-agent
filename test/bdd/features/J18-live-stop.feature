# Spec: 07-journeys-1 §J18; features.tsv AT-077
@journey-J18
Feature: J18 — Watching live and stopping a task

  @AT-077
  Scenario: stopping a running helper creates no extra AI turn
    Given foo starts the "J18" flow with the "pretend" AI
    When the user stops the running helper task
    Then the stop command is recorded without another AI turn
