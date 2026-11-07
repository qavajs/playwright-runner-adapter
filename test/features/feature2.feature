Feature: test feature 2

  Background:
    Given simple step

  Scenario: simple scenario
    Given open 'home.html' url

  Scenario Outline: simple scenario <example>
    Given open '<example>' url

    Examples:
      | example                    |
      | wiki.html |
      | shop.html |

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

  Scenario: duplicate
    Given log

  Scenario: duplicate
    Given log
