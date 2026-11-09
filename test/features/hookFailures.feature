Feature: hook failures

  @allAfterHooksRun @fail()
  Scenario: all After hooks run when one of them fails
    When simple step

  @stepErrorNotMasked @fail()
  Scenario: After hook failure does not replace the step error
    When fail with 'step error'

  @afterStepGetsStepResult
  Scenario: AfterStep hook receives the result of its own step
    When wait 300 ms
    And simple step

  @afterStepRunsWhenBeforeStepFails @fail()
  Scenario: AfterStep hook runs when BeforeStep hook fails
    When simple step

  @beforeSkipStopsBeforeHooks @statusCheck(SKIPPED)
  Scenario: Before hook returning skipped stops remaining Before hooks
    When simple step

  @allUndefinedStepsListed @fail()
  Scenario: undefined step error lists all undefined steps
    When first undefined step
    And simple step
    And second undefined step

  Scenario: executeStep reports undefined nested step with snippet
    When execute undefined step reports snippet

  @hookOrder
  Scenario: Before hooks run in definition order, After hooks in reverse order
    When simple step
