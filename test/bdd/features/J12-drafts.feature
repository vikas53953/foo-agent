# Spec: 07-journeys-1 §J12; features.tsv AT-051
@journey-J12
Feature: J12 — Drafting and sending an email or an X post

  @AT-051
  Scenario: a draft is visible before Send email
    Given foo starts the "J12" flow with the "pretend" AI
    When the user prepares an email draft
    Then the draft is visible and no send happens before the Send action
