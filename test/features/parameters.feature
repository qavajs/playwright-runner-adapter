Feature: step parameters

  Scenario: int parameter
    Given I have 42 items

  Scenario: float parameter
    Given I have 3.14 value

  Scenario: word parameter
    Given I am at step hello

  Scenario Outline: multiple example tables <example>
    Given log '<example>'

    Examples: first batch
      | example |
      | one     |
      | two     |

    Examples: second batch
      | example |
      | three   |
