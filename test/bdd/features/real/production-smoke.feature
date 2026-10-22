# Production-only subset. It uses FOO_TEST=0 and a real provider profile; it is not coverage for the 22 pretend journeys.
@real-bdd
Feature: Production AI smoke subset

  @real-chat
  Scenario: a benign chat receives a real response
    Given foo starts the production chat with an idle real profile
    When the user sends a benign production chat message
    Then foo returns a completed production response

  @real-reaction
  Scenario: an idle chat acknowledges thanks with a reaction
    Given foo starts the production chat with an idle real profile
    When the user sends thanks in the idle production chat
    Then foo reacts without posting a production reply
