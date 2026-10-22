# Spec: 07-journeys-1 §J22; AT-365 is paste-size coverage, not chat-list search, and features.tsv has no direct J22 row.
@journey-J22
Feature: J22 — Search

  Scenario: chat search filters to the requested helper
    Given foo starts the "J22" flow with the "pretend" AI
    When the user searches the chat list for Trips
    Then the search result contains Trips and excludes unrelated chats
