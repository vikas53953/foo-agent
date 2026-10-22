# Spec: 07-journeys-1 §J16; AT-070 covers blocking sends into a WhatsApp mirror, while this scenario only checks group-panel privacy.
@journey-J16
Feature: J16 — Group chat with a helper

  Scenario: a group panel keeps private memory hidden
    Given foo starts the "J16" flow with the "pretend" AI
    When the user opens the helper group chat
    Then the group panel shows members and hides private memory
