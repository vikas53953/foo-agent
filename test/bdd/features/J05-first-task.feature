# Spec: 07-journeys-1 §J5; features.tsv AT-019
@journey-J5
Feature: J5 — First real task inside a minute

  @AT-019
  Scenario: the first bills task paints a checklist
    Given foo starts the "J5" flow with the "pretend" AI
    When the user requests the first bills task
    Then the first task renders a live checklist in the chat
