# Spec: 07-journeys-1 §J14; no direct J14 row exists in features.tsv, so this uses the scheduled routine surface AT-281 and is reported as representative.
@journey-J14
Feature: J14 — Creating, editing and pausing a routine

  @AT-281
  Scenario: the routine appears in the Scheduled segment
    Given foo starts the "J14" flow with the "pretend" AI
    When the user opens the routine schedule
    Then the routine appears in the Scheduled segment
