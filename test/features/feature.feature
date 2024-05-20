Feature: test feature

  Background:
    Given simple step

  Scenario: simple scenario
    Given open 'https://google.com' url

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
