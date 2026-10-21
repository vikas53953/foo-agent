# Spec: 07-journeys-1 §J8; features.tsv AT-032
@journey-J8
Feature: J8 — Asking a question with choice chips

  @AT-032
  Scenario: a three-option choice shows Best fit, Something else and Skip
    Given foo starts the "J8" flow with the "pretend" AI
    When the user opens a three-option choice card
    Then the first choice is marked Best fit and the card offers Skip
