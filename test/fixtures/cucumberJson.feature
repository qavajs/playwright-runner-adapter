@featureTag
Feature: cucumber json

  Background:
    Given background step

  @scenarioTag
  Scenario: all statuses
    When step with doc string
      """
      body
      """
    And step with table
      | a | b |
    Then last step

  Scenario Outline: outline <value>
    Given value '<value>'

    Examples:
      | value |
      | one   |
