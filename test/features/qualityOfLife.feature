@retries(3)
Feature: quality of life

  @timeout(5000)
  Scenario: timeout tag sets test timeout
    Then test timeout is 5000

  Scenario: typed world helper
    When typed step sets value 'typed'
    Then typed value is 'typed'

  Scenario: custom parameter type
    Then color red is transformed to 'RED'

  Scenario: definition function wrapper
    When wrapped step
    Then wrapper was applied

  @ruleTagScenario
  Rule: tagged rule

    @scenarioTag
    Scenario: rule tags are inherited
      Then scenario has tags '@ruleTagScenario @scenarioTag'
