# Spec: 07-journeys-1 §J21; AT-093 covers Gmail disconnect and the Using shell, while this scenario only checks Settings navigation.
@journey-J21
Feature: J21 — Settings

  Scenario: Settings exposes account and connections
    Given foo starts the "J21" flow with the "pretend" AI
    When the user opens Settings
    Then Settings shows the account and connection sections
