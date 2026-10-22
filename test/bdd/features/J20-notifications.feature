# Spec: 07-journeys-1 §J20; AT-089 covers saved WAITING jobs and resume, while this scenario only checks the reopened chat shell.
@journey-J20
Feature: J20 — Notifications when the window is closed

  Scenario: reopening keeps the chat shell available after a running job
    Given foo starts the "J20" flow with the "pretend" AI
    When the user reopens foo after a running job was seeded
    Then the reopened app exposes the saved job state in the chat shell
