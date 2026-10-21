# Spec: 07-journeys-1 §J22; no direct J22 row exists in features.tsv, so this uses the chat-list search surface and is reported as representative.
@journey-J22
Feature: J22 — Search

  @AT-365
  Scenario: chat search filters to the requested helper
    Given foo starts the "J22" flow with the "pretend" AI
    When the user searches the chat list for Trips
    Then the search result contains Trips and excludes unrelated chats
