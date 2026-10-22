# Spec: 07-journeys-1 §J4; features.tsv AT-016
@journey-J4
Feature: J4 — Interview and connecting Gmail, Calendar and WhatsApp

  @AT-016
  Scenario: an interview answer collapses to question and answer
    Given foo starts the "J4" flow with the "pretend" AI
    When the user answers the setup interview card
    Then the answered interview card collapses to the question and answer
