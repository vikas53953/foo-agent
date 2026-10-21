# Spec: 07-journeys-1 §J20; features.tsv AT-089
@journey-J20
Feature: J20 — Notifications when the window is closed

  @AT-089
  Scenario: reopening keeps the chat shell available after a running job
    Given foo starts the "J20" flow with the "pretend" AI
    When the user reopens foo after a running job was seeded
    Then the reopened app exposes the saved job state in the chat shell
