Feature: test feature

  Background:
    Given simple step

  Scenario: simple scenario
    Given open 'https://google.com' url

  @tag
  Scenario Outline: simple scenario <example>
    Given open '<example>' url

    Examples:
      | example                    |
      | https://www.wikipedia.org/ |
      | https://www.saucedemo.com/ |

  Scenario: data table
    Given data table step
      | 1 |
      | 2 |

  @oneTag @anotherTag
  Scenario: multiline
    Given multiline step
      """
      first
      second
      """

  Scenario: log
    Given log

  Scenario: attach
    Given attach

  @notTag
  Scenario: duplicate
    Given log

  Scenario: duplicate
    Given log

  Scenario: custom fixture
    Given custom fixture

  Scenario: custom expect
    Given custom expect

  Scenario: support code library
    Given support code library

  Scenario: execute step
    Given execute step