Feature: test details

  @skip(not-relevant)
  Scenario: skipped scenario
    When fail

  @fixme(JIRA-1)
  Scenario: fixme scenario
    When fail

  @fail()
  Scenario: expected to fail scenario
    When fail

  @slow()
  Scenario: slow scenario
    When test is marked as slow

  @lock(shared-resource) @annotation(issue,JIRA-123)
  Scenario: locked scenario 1
    When annotation 'issue' is 'JIRA-123'

  @lock(shared-resource)
  Scenario: locked scenario 2
    When simple step

  @lock(-exclusive-)
  Scenario: exclusive scenario
    When simple step
