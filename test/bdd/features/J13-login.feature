# Spec: 07-journeys-1 §J13; features.tsv AT-056
@journey-J13
Feature: J13 — Login handoff: sign in here, OTP, CAPTCHA, take over

  @AT-056
  Scenario: a sign-in handoff keeps credentials out of the AI
    Given foo starts the "J13" flow with the "pretend" AI
    When the user opens a sign-in handoff card
    Then the sign-in card offers Take over without exposing credentials to the AI
