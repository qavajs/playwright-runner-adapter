Feature: package smoke

  Scenario: page fixture and expect
    When I set content 'Hello'
    Then page has text 'Hello'

  Scenario: data table
    When I set content from table
      | text  |
      | Table |
    Then page has text 'Table'

  Scenario: template step
    When I greet 'World'
