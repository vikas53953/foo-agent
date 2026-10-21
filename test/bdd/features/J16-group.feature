# Spec: 07-journeys-1 §J16; features.tsv AT-070
@journey-J16
Feature: J16 — Group chat with a helper

  @AT-070
  Scenario: a group panel keeps private memory hidden
    Given foo starts the "J16" flow with the "pretend" AI
    When the user opens the helper group chat
    Then the group panel shows members and hides private memory
